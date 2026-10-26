import 'server-only'
/**
 * Partage avocat : primitives serveur.
 *
 * - Jeton : 32 caractères base64url (crypto.randomBytes(24), 192 bits).
 * - Code d'accès : 6 chiffres tirés par crypto.randomInt, stocké haché en
 *   scrypt (sel aléatoire 16 octets), vérifié en temps constant.
 * - Limitation : 5 échecs de code par jeton sur 15 minutes, en mémoire de
 *   l'instance ET en base (lawyer_share_access_log, partagé entre instances).
 * - Hachage stocké : format exact scrypt$16384$8$1$… uniquement (cf. 0270).
 * - Clé d'accès aux documents : HMAC courte durée remise après déverrouillage.
 * - Démo (sans Supabase) : magasin en mémoire du processus serveur.
 */
import { createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createServiceClient } from '@/lib/supabase/server'
import {
  buildDemoShareContent, type ShareContent, type ShareScope, type ShareSummary, type SharedEvent,
} from '@/lib/partages'

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>

// --- Validation du périmètre ------------------------------------------------

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)

export const scopeSchema = z.object({
  childId: id.nullable(),
  journal: z.object({ from: day, to: day }).refine((p) => p.from <= p.to, 'Période invalide').nullable(),
  documentIds: z.array(id).max(200),
  testimonyIds: z.array(id).max(100),
  messages: z.boolean(),
})

export function parseScope(v: unknown): ShareScope {
  const r = scopeSchema.safeParse(v)
  return r.success
    ? r.data
    : { childId: null, journal: null, documentIds: [], testimonyIds: [], messages: false }
}

// --- Jeton, code, hachage -------------------------------------------------

export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

export function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

export function generateAccessCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 }

export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(code, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

/**
 * Format exact produit par hashAccessCode (miroir de la contrainte SQL
 * chk_lawyer_shares_code_hash_format, 0270) : paramètres figés N=16384, r=8, p=1,
 * sel de 16 octets, hachage de 32 octets. Tout autre paramétrage (coût affaibli,
 * hachage tronqué, coût démesuré = déni de service) est refusé.
 */
const STORED_HASH_RE = /^scrypt\$16384\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/

export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const m = STORED_HASH_RE.exec(stored)
  if (!m) return false
  const salt = Buffer.from(m[1], 'base64url')
  const expected = Buffer.from(m[2], 'base64url')
  if (salt.length !== 16 || expected.length !== SCRYPT.keylen) return false
  const actual = await scrypt(code, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 })
  return timingSafeEqual(expected, actual)
}

// --- Secret serveur (empreintes, clés d'accès) -------------------------------

const g = globalThis as unknown as {
  __lpShareSecret?: Buffer
  __lpShareAttempts?: Map<string, { fails: number; resetAt: number }>
  __lpDemoShares?: Map<string, DemoShare>
}

function secret(): Buffer {
  const env = process.env.LAWYER_SHARE_SECRET || process.env.APP_ENCRYPTION_KEY
  if (env) return Buffer.from(env)
  // Repli : secret propre à l'instance (les clés d'accès expirent au redémarrage).
  if (!g.__lpShareSecret) g.__lpShareSecret = randomBytes(32)
  return g.__lpShareSecret
}

export function uaHash(ua: string | null): string {
  return createHmac('sha256', secret()).update(ua ?? '').digest('hex').slice(0, 32)
}

const ACCESS_KEY_TTL_MS = 30 * 60_000

/** Clé courte durée remise après déverrouillage, exigée pour télécharger un document. */
export function issueAccessKey(token: string): string {
  const exp = Date.now() + ACCESS_KEY_TTL_MS
  const sig = createHmac('sha256', secret()).update(`${token}.${exp}`).digest('base64url')
  return `${exp}.${sig}`
}

export function verifyAccessKey(token: string, key: string | null): boolean {
  if (!key) return false
  const [expStr, sig] = key.split('.')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false
  const expected = createHmac('sha256', secret()).update(`${token}.${exp}`).digest()
  const given = Buffer.from(sig, 'base64url')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// --- Limitation des tentatives de code (5 / 15 min / jeton) ------------------

const MAX_FAILS = 5
const WINDOW_MS = 15 * 60_000

function attempts() {
  if (!g.__lpShareAttempts) g.__lpShareAttempts = new Map()
  return g.__lpShareAttempts
}

/** Secondes restantes de blocage, ou 0 si des tentatives sont encore possibles. */
export function lockedFor(token: string): number {
  const a = attempts().get(token)
  if (!a) return 0
  if (a.resetAt <= Date.now()) { attempts().delete(token); return 0 }
  return a.fails >= MAX_FAILS ? Math.ceil((a.resetAt - Date.now()) / 1000) : 0
}

/** Enregistre un échec ; renvoie le nombre de tentatives restantes. */
export function registerFailure(token: string): number {
  const map = attempts()
  const now = Date.now()
  if (map.size > 10_000) for (const [k, v] of map) if (v.resetAt <= now) map.delete(k)
  const a = map.get(token)
  if (!a || a.resetAt <= now) {
    map.set(token, { fails: 1, resetAt: now + WINDOW_MS })
    return MAX_FAILS - 1
  }
  a.fails += 1
  return Math.max(0, MAX_FAILS - a.fails)
}

export function clearFailures(token: string) {
  attempts().delete(token)
}

export const SHARE_MAX_FAILS = MAX_FAILS
export const SHARE_LOCK_SECONDS = WINDOW_MS / 1000

/**
 * Échecs consécutifs (depuis le dernier succès) des 15 dernières minutes, comptés en base
 * dans lawyer_share_access_log : partagé entre instances et redémarrages, contrairement
 * au verrou mémoire. Supabase uniquement (démo : 0, seul le verrou mémoire s'applique).
 * Erreur de lecture : partage considéré verrouillé (fail-closed).
 */
export async function recentDbFailures(shareId: string): Promise<number> {
  if (!SUPABASE_ENABLED) return 0
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  try {
    const { data, error } = await service()
      .from('lawyer_share_access_log')
      .select('success')
      .eq('share_id', shareId)
      .gte('accessed_at', since)
      .order('accessed_at', { ascending: false })
      .limit(MAX_FAILS + 1)
    if (error) return MAX_FAILS
    let fails = 0
    for (const row of (data ?? []) as Array<{ success: boolean }>) {
      if (row.success) break
      fails++
    }
    return fails
  } catch {
    return MAX_FAILS
  }
}

// --- Magasin de démonstration ------------------------------------------------

export type DemoShare = {
  id: string
  userId: string
  ownerName: string
  token: string
  label: string
  scope: ShareScope
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  accessCodeHash: string | null
  log: { at: string; ua: string; success: boolean }[]
}

export function demoShares(): Map<string, DemoShare> {
  if (!g.__lpDemoShares) g.__lpDemoShares = new Map()
  return g.__lpDemoShares
}

export function demoSummary(s: DemoShare): ShareSummary {
  const ok = s.log.filter((l) => l.success).map((l) => l.at).sort().reverse()
  return {
    id: s.id, label: s.label, path: `/partage/${s.token}`, scope: s.scope, createdAt: s.createdAt,
    expiresAt: s.expiresAt, revokedAt: s.revokedAt, hasCode: Boolean(s.accessCodeHash),
    accesses: ok.slice(0, 10), accessCount: ok.length,
  }
}

// --- Résolution d'un jeton (page publique) -----------------------------------

export type ResolvedShare = {
  id: string
  userId: string
  label: string
  scope: ShareScope
  createdAt: string
  expiresAt: string
  accessCodeHash: string | null
  ownerName: string
}

function service(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}

/** Partage actif (non expiré, non révoqué) ou null. Ne révèle jamais pourquoi. */
export async function resolveShare(token: string): Promise<ResolvedShare | null> {
  if (!TOKEN_RE.test(token)) return null

  if (!SUPABASE_ENABLED) {
    const s = [...demoShares().values()].find((x) => x.token === token)
    if (!s || s.revokedAt || new Date(s.expiresAt).getTime() <= Date.now()) return null
    return {
      id: s.id, userId: s.userId, label: s.label, scope: s.scope, createdAt: s.createdAt,
      expiresAt: s.expiresAt, accessCodeHash: s.accessCodeHash, ownerName: s.ownerName,
    }
  }

  const { data, error } = await service().rpc('get_lawyer_share', { p_token: token })
  if (error) throw new Error('share_lookup_failed')
  const row = (data as Array<{
    id: string; user_id: string; label: string; scope: unknown; expires_at: string; created_at: string
    access_code_hash: string | null; owner_prenom: string; owner_nom: string
  }> | null)?.[0]
  if (!row) return null
  return {
    id: row.id, userId: row.user_id, label: row.label, scope: parseScope(row.scope), createdAt: row.created_at,
    expiresAt: row.expires_at, accessCodeHash: row.access_code_hash,
    ownerName: `${row.owner_prenom} ${row.owner_nom}`.trim() || 'Parent',
  }
}

export async function logAccess(share: ResolvedShare, ua: string | null, success: boolean): Promise<void> {
  const hash = uaHash(ua)
  if (!SUPABASE_ENABLED) {
    demoShares().get(share.id)?.log.push({ at: new Date().toISOString(), ua: hash, success })
    return
  }
  try {
    await service().rpc('log_lawyer_share_access', { p_share_id: share.id, p_ua_hash: hash, p_success: success })
  } catch {
    console.warn('[partage] journalisation de la consultation impossible')
  }
}

// --- Contenu partagé ---------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const JOURNAL_LABELS: Record<string, string> = { visite: 'Visite', appel: 'Appel', message: 'Message', sante: 'Santé', autre: 'Autre' }

const hhmm = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Cayenne' })
const ymdParis = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Cayenne' })

/**
 * Contenu en lecture seule. Toutes les requêtes sont bornées au propriétaire
 * du partage (user_id) ET au périmètre choisi : aucune autre donnée n'est lue.
 */
export async function buildShareContent(share: ResolvedShare): Promise<ShareContent> {
  const meta = { label: share.label, createdAt: share.createdAt, expiresAt: share.expiresAt, owner: share.ownerName }
  if (!SUPABASE_ENABLED) return buildDemoShareContent(share.scope, meta)

  const db = service()
  const { scope } = share
  const uid = share.userId
  const childId = scope.childId && UUID_RE.test(scope.childId) ? scope.childId : null
  const docIds = scope.documentIds.filter((x) => UUID_RE.test(x))
  const tmgIds = scope.testimonyIds.filter((x) => UUID_RE.test(x))
  // Bornes élargies d'un jour (fuseau), puis filtrage exact sur la date de Paris.
  const from = scope.journal ? new Date(Date.parse(`${scope.journal.from}T00:00:00Z`) - 86_400_000).toISOString() : null
  const to = scope.journal ? new Date(Date.parse(`${scope.journal.to}T23:59:59Z`) + 86_400_000).toISOString() : null
  const inPeriod = (iso: string) => !scope.journal || (ymdParis(new Date(iso)) >= scope.journal.from && ymdParis(new Date(iso)) <= scope.journal.to)

  const [childRes, journalRes, docsRes, tmgRes, convRes] = await Promise.all([
    childId ? db.from('children').select('prenom, nom').eq('id', childId).eq('user_id', uid).maybeSingle() : Promise.resolve({ data: null }),
    scope.journal
      ? (() => {
          let q = db.from('journal_entries').select('id, type, titre, description, lieu, occurred_at')
            .eq('user_id', uid).is('deleted_at', null).gte('occurred_at', from!).lte('occurred_at', to!)
          if (childId) q = q.contains('children_ids', [childId])
          return q.order('occurred_at', { ascending: true }).limit(500)
        })()
      : Promise.resolve({ data: [] }),
    docIds.length
      ? db.from('documents').select('id, name, mime, size_bytes, created_at').eq('user_id', uid).in('id', docIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    tmgIds.length
      ? db.from('testimonies').select('id, temoin, texte_envoye, sent_at').eq('user_id', uid).in('id', tmgIds)
      : Promise.resolve({ data: [] }),
    scope.messages
      ? db.from('conversations').select('id, parent_a, parent_b').or(`parent_a.eq.${uid},parent_b.eq.${uid}`).order('created_at').limit(1)
      : Promise.resolve({ data: [] }),
  ])

  const child = childRes.data as { prenom: string; nom: string | null } | null

  const timeline: SharedEvent[] = ((journalRes.data ?? []) as Array<{ id: string; type: string; titre: string; description: string | null; lieu: string | null; occurred_at: string }>)
    .filter((r) => inPeriod(r.occurred_at))
    .map((r) => {
      const d = new Date(r.occurred_at)
      return {
        id: r.id, date: ymdParis(d), heure: hhmm(d), type: JOURNAL_LABELS[r.type] ?? 'Autre', titre: r.titre,
        description: r.description ?? undefined, lieu: r.lieu ?? undefined,
      }
    })

  const documents = ((docsRes.data ?? []) as Array<{ id: string; name: string; mime: string; size_bytes: number; created_at: string }>)
    .map((r) => ({
      id: r.id, name: r.name, ext: (r.name.split('.').pop() ?? '').toUpperCase().slice(0, 5) || (r.mime === 'application/pdf' ? 'PDF' : 'FICHIER'),
      sizeBytes: r.size_bytes, date: r.created_at.slice(0, 10),
    }))

  const testimonies = ((tmgRes.data ?? []) as Array<{ id: string; temoin: { prenom?: string; nom?: string; lien?: string } | null; texte_envoye: string; sent_at: string }>)
    .map((r) => ({
      id: r.id,
      author: `${r.temoin?.prenom ?? ''} ${r.temoin?.nom ? r.temoin.nom.charAt(0) + '.' : ''}`.trim() || 'Témoin',
      relation: r.temoin?.lien ?? '',
      date: r.sent_at.slice(0, 10),
      summary: r.texte_envoye,
      facts: [],
    }))

  let messages: ShareContent['messages'] = []
  const conv = ((convRes.data ?? []) as Array<{ id: string; parent_a: string; parent_b: string }>)[0]
  if (conv) {
    let q = db.from('messages').select('id, sender_id, body, attachment_meta, created_at').eq('conversation_id', conv.id)
    if (from && to) q = q.gte('created_at', from).lte('created_at', to)
    const [msgRes, usersRes] = await Promise.all([
      q.order('created_at', { ascending: true }).limit(2000),
      db.from('users').select('id, prenom, nom').in('id', [conv.parent_a, conv.parent_b]),
    ])
    const names = new Map(((usersRes.data ?? []) as Array<{ id: string; prenom: string | null; nom: string | null }>)
      .map((u) => [u.id, `${u.prenom ?? ''} ${u.nom ?? ''}`.trim() || 'Parent']))
    messages = ((msgRes.data ?? []) as Array<{ id: string; sender_id: string; body: string; attachment_meta: { name?: string } | null; created_at: string }>)
      .filter((m) => inPeriod(m.created_at))
      .map((m) => ({
        id: m.id, sender: names.get(m.sender_id) ?? 'Parent', fromOwner: m.sender_id === uid, body: m.body,
        createdAt: m.created_at, attachmentName: m.attachment_meta?.name,
      }))
  }

  return {
    ...meta,
    child: child ? `${child.prenom}${child.nom ? ' ' + child.nom : ''}` : null,
    periode: scope.journal,
    timeline,
    documents,
    testimonies,
    messages,
  }
}

/**
 * Vrai si `path` est un objet rangé sous le dossier `<ownerId>/` du bucket (convention
 * storage.sql), sans segment de remontée ni séparateur exotique. Garde-fou avant toute
 * signature d'URL par le service_role (contrainte SQL chk_documents_storage_path_owner, 0270).
 */
const hasControlChar = (s: string) => {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x20 || s.charCodeAt(i) === 0x7f) return true
  return false
}

export function isOwnedStoragePath(path: unknown, ownerId: string): path is string {
  return (
    typeof path === 'string' &&
    UUID_RE.test(ownerId) &&
    path.startsWith(`${ownerId}/`) &&
    path.length > ownerId.length + 1 &&
    path.length <= 1024 &&
    !path.includes('..') &&
    !path.includes(String.fromCharCode(92)) && // antislash
    !path.includes('//') &&
    !hasControlChar(path)
  )
}

/** Chemin Storage d'un document du périmètre (null si hors périmètre, introuvable ou chemin non conforme). */
export async function documentForShare(share: ResolvedShare, docId: string): Promise<{ name: string; storagePath: string } | null> {
  if (!share.scope.documentIds.includes(docId)) return null
  if (!SUPABASE_ENABLED || !UUID_RE.test(docId)) return null
  const { data } = await service()
    .from('documents').select('name, storage_path')
    .eq('id', docId).eq('user_id', share.userId).is('deleted_at', null).maybeSingle()
  const row = data as { name: string; storage_path: string } | null
  if (!row) return null
  if (!isOwnedStoragePath(row.storage_path, share.userId)) {
    console.warn('[partage] storage_path hors du dossier propriétaire refusé')
    return null
  }
  return { name: row.name, storagePath: row.storage_path }
}

/** URL signée 60 s. `ownerId` est re-vérifié ici : aucun chemin hors de `<ownerId>/` n'est signé. */
export async function signedDocumentUrl(path: string, name: string, ownerId: string) {
  if (!isOwnedStoragePath(path, ownerId)) return { data: null, error: new Error('forbidden_path') }
  return service().storage.from('documents').createSignedUrl(path, 60, { download: name })
}
