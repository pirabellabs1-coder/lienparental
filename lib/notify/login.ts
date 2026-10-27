import 'server-only'
/**
 * Détection « connexion depuis un nouvel appareil » (événement login_new_device).
 *
 * Deux voies, idempotentes par session GoTrue (notif_record_sign_in) :
 *  1. Voie rapide, avec cookie d'appareil (identité principale) :
 *     - mot de passe et code 2FA (connexion côté navigateur) : POST /api/auth/login-check ;
 *     - Google et liens e-mail : /auth/callback et /auth/confirm.
 *  2. Filet serveur, sans dépendre du navigateur : le déclencheur 0440 sur
 *     auth.sessions capture agent et IP et dépose une tâche 'login_check' (+2 min).
 *     Session déjà vue par la voie rapide : 'duplicate'. Sinon (session vue
 *     seulement par le serveur, y compris déjà fermée) : alerte. Session en
 *     attente du code 2FA : décision reportée (30 min au plus).
 * L'empreinte navigateur / système / IP n'est qu'informative : seul le cookie
 * d'appareil signé fait reconnaître un appareil.
 *
 * Première connexion du compte (drapeau users.first_sign_in_at) et les 30 min
 * qui suivent : enregistrées sans alerte.
 */
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TypedSupabaseClient } from '@/lib/supabase/server'
import { clientIp, ipHash } from '@/lib/data/server/rate-limit'
import {
  DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, deviceHash, deviceIdHash, deviceSalt, newDeviceId, parseUserAgent, signDeviceId,
  verifyDeviceCookie,
} from './device'
import { notify, serviceDb } from './server'

export type SignInOutcome = 'new' | 'known' | 'first' | 'baseline' | 'duplicate' | 'skipped'

/** session_id du JWT courant (vérifié par getClaims), ou null. */
export async function currentSessionId(supabase: TypedSupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error || !data) return null
    const sid = (data.claims as { session_id?: unknown }).session_id
    return typeof sid === 'string' && /^[0-9a-f-]{8,100}$/i.test(sid) ? sid : null
  } catch {
    return null
  }
}

/**
 * Identifiant d'appareil du navigateur courant (cookie signé), créé s'il manque ou
 * s'il est invalide. À appeler depuis un Route Handler (le cookie est posé sur la réponse).
 */
async function deviceIdFromCookie(salt: string): Promise<string | null> {
  try {
    const jar = await cookies()
    const existing = verifyDeviceCookie(jar.get(DEVICE_COOKIE)?.value, salt)
    if (existing) return existing
    const id = newDeviceId()
    jar.set(DEVICE_COOKIE, signDeviceId(id, salt), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE,
    })
    return id
  } catch {
    return null
  }
}

async function record(db: SupabaseClient, args: {
  userId: string; sessionId: string; ua: string; ip: string; deviceId: string | null; salt: string
}): Promise<SignInOutcome> {
  const hash = deviceHash(args.ua, args.ip, args.salt)
  if (!hash) return 'skipped'
  // Agent inconnu (session capturée sans agent) : appareil non identifié.
  const device = args.ua.trim()
    ? parseUserAgent(args.ua)
    : { kind: 'Appareil non identifié', label: 'Navigateur non identifié', browser: '', os: '' }
  const { data, error } = await db.rpc('notif_record_sign_in', {
    p_user_id: args.userId,
    p_session_id: args.sessionId,
    p_device_id_hash: args.deviceId ? deviceIdHash(args.deviceId, args.salt) : null,
    p_device_hash: hash,
    p_device_label: device.label,
    p_ip_hash: ipHash(args.ip),
    p_user_agent: args.ua.slice(0, 300),
  })
  if (error || typeof data !== 'string') {
    console.warn('[notify] enregistrement de connexion impossible', { code: error?.code })
    return 'skipped'
  }
  const outcome = data as SignInOutcome
  if (outcome === 'new') {
    await notify(args.userId, 'login_new_device', {
      appareil: device.kind, systeme: device.label, date: new Date().toISOString(),
    }, { dedupeKey: `login_new_device:${args.sessionId}` })
  }
  return outcome
}

/** Voie rapide (Route Handler) : session courante + cookie d'appareil. Jamais d'exception. */
export async function recordSignIn(args: { userId: string; sessionId: string; headers: Headers }): Promise<SignInOutcome> {
  try {
    const db = serviceDb()
    const salt = deviceSalt()
    if (!db || !salt) {
      if (!salt) console.warn('[notify] IP_HASH_SALT absent : détection des nouveaux appareils désactivée')
      return 'skipped'
    }
    const deviceId = await deviceIdFromCookie(salt)
    return await record(db, {
      userId: args.userId, sessionId: args.sessionId, salt, deviceId,
      ua: (args.headers.get('user-agent') ?? '').slice(0, 300), ip: clientIp(args.headers),
    })
  } catch {
    return 'skipped'
  }
}

/** Raccourci pour les routes serveur : session courante → recordSignIn. */
export async function recordCurrentSignIn(supabase: TypedSupabaseClient, headers: Headers): Promise<SignInOutcome> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'skipped'
    const sid = await currentSessionId(supabase)
    if (!sid) return 'skipped'
    return recordSignIn({ userId: user.id, sessionId: sid, headers })
  } catch {
    return 'skipped'
  }
}

/** Délai maximal d'attente du code 2FA avant de décider quand même (mot de passe utilisé). */
export const MFA_WAIT_MS = 30 * 60_000

type SessionInfo = {
  user_id?: string; user_agent?: string | null; ip?: string | null
  session_exists?: boolean; aal?: string | null; has_verified_factor?: boolean
}

/**
 * Filet serveur (tâche 'login_check' du cron), sans cookie. Ne saute JAMAIS une session
 * disparue (connexion puis déconnexion immédiate) : agent et IP viennent de la capture
 * faite à la création, sinon « appareil non identifié ». 'defer' : session en aal1 alors
 * que le compte a un facteur 2FA vérifié, depuis moins de 30 min.
 */
export async function recordSessionFromServer(
  db: SupabaseClient, userId: string, sessionId: string, queuedAt: Date,
): Promise<SignInOutcome | 'defer'> {
  const salt = deviceSalt()
  if (!salt) return 'skipped'
  const { data, error } = await db.rpc('notif_session_info', { p_session_id: sessionId })
  if (error) throw new Error(`session_info_${error.code ?? 'error'}`)
  const row = ((Array.isArray(data) ? data[0] : data) ?? {}) as SessionInfo
  if (row.user_id && row.user_id !== userId) return 'skipped'
  if (row.session_exists && row.aal === 'aal1' && row.has_verified_factor && Date.now() - queuedAt.getTime() < MFA_WAIT_MS) {
    return 'defer'
  }
  const outcome = await record(db, { userId, sessionId, salt, deviceId: null, ua: row.user_agent ?? '', ip: row.ip ?? 'unknown' })
  // Agent et IP bruts : effacés dès la décision prise.
  await db.from('auth_session_captures').delete().eq('session_id', sessionId)
  return outcome
}
