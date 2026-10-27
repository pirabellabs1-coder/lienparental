import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireAuthedUser } from '@/lib/auth/guard'
import { jsonError, jsonOk, secureToken32 } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { requireVaultUnlocked, vaultDeniedResponse } from '@/lib/vault-lock'

// POST /api/temoignages — crée une demande de témoignage pour le parent connecté.
// Le jeton public (32 caractères base64url, 192 bits) est généré ICI avec
// crypto.randomBytes : jamais par le navigateur. user_id = session (jamais le corps).

export const dynamic = 'force-dynamic'

const EXPIRY_DAYS = 30

const bodySchema = z.object({
  subject: z.string().trim().min(1).max(90),
  context: z.string().trim().max(600).optional(),
  parents: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
  enfants: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
}).strict()

export async function POST(req: Request) {
  const t = await getTranslations('server.temoignages')
  const tc = await getTranslations('server.common')
  // Coffre-fort verrouillé : ces données en proviennent (chantier D).
  const vault = await requireVaultUnlocked()
  if (!vault.ok) return vaultDeniedResponse(vault)
  if (!SUPABASE_ENABLED) return jsonError(503, 'not_configured', t('storageNotConfigured'))

  const auth = await requireAuthedUser()
  if (!auth.ok) {
    return auth.reason === 'mfa_required'
      ? jsonError(403, 'mfa_required', tc('denied.mfa_required'))
      : jsonError(401, 'unauthenticated', tc('denied.unauthenticated'))
  }
  const { supabase, user } = auth

  const rl = await rateLimit(userKey('temoignages:create', user.id), 20, 60 * 60 * 1000)
  if (!rl.ok) return jsonError(429, 'rate_limited', t('tooManyCreated'), { 'Retry-After': String(rl.retryAfter) })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(422, 'invalid', t('invalidPayload'))
  const v = parsed.data

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000).toISOString()
  // Collision de jeton astronomiquement improbable ; on retente une fois sur violation d'unicité.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = secureToken32()
    const { data, error } = await supabase
      .from('testimony_requests')
      .insert({
        user_id: user.id,
        token,
        // Le titre et le contexte restent privés : rien n'est exposé au témoin hormis les
        // noms des parents/enfants concernés (get_testimony_request_people).
        temoin_nom_pref: null,
        message_parent: v.context || null,
        questions: [],
        expires_at: expiresAt,
        // Colonnes ajoutées par 0210 (absentes des types générés).
        ...({ subject: v.subject, parents: v.parents, enfants: v.enfants } as Record<string, unknown>),
      })
      .select('id, token, created_at')
      .single()
    if (!error && data) {
      const row = data as { id: string; token: string; created_at: string }
      return jsonOk({ id: row.id, token: row.token, created_at: row.created_at, expires_at: expiresAt }, 201)
    }
    if ((error as { code?: string } | null)?.code !== '23505') {
      console.warn('[api/temoignages] insert échoué', (error as { code?: string } | null)?.code ?? 'unknown')
      return jsonError(500, 'db_error', t('createFailed'))
    }
  }
  return jsonError(500, 'db_error', t('createFailed'))
}
