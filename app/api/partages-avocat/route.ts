/**
 * /api/partages-avocat — partages en lecture seule créés par le parent connecté.
 *   GET  : liste (actifs, expirés, révoqués) + journal des consultations.
 *   POST : création. Jeton 32 caractères et code d'accès générés ICI (serveur).
 * Supabase : client à cookies (RLS « propriétaire uniquement »). Démo : mémoire serveur.
 */
import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth/session'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { EXPIRY_OPTIONS, type CreateShareResult, type ShareSummary } from '@/lib/partages'
import { requireVaultUnlocked, vaultDeniedResponse } from '@/lib/vault-lock'
import {
  demoShares, demoSummary, generateAccessCode, generateToken, hashAccessCode, parseScope, scopeSchema,
} from '@/app/api/partage/_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 32 * 1024

const createSchema = z.object({
  label: z.string().trim().min(1, 'Indiquez le destinataire').max(80),
  expiry: z.enum(['24h', '7j', '30j']),
  withCode: z.boolean(),
  scope: scopeSchema,
})

type ShareRow = {
  id: string
  token: string
  label: string
  scope: unknown
  created_at: string
  expires_at: string
  revoked_at: string | null
  access_code_hash: string | null
  lawyer_share_access_log: Array<{ accessed_at: string; success: boolean }> | null
}

const COLUMNS = 'id, token, label, scope, created_at, expires_at, revoked_at, access_code_hash, lawyer_share_access_log(accessed_at, success)'

function fromRow(r: ShareRow): ShareSummary {
  const ok = (r.lawyer_share_access_log ?? []).filter((l) => l.success).map((l) => l.accessed_at).sort().reverse()
  return {
    id: r.id, label: r.label, path: `/partage/${r.token}`, scope: parseScope(r.scope), createdAt: r.created_at,
    expiresAt: r.expires_at, revokedAt: r.revoked_at, hasCode: Boolean(r.access_code_hash),
    accesses: ok.slice(0, 10), accessCount: ok.length,
  }
}

async function userClient(): Promise<SupabaseClient> {
  // Tables 0230 absentes de lib/supabase/types.ts : client non typé.
  return (await createClient()) as unknown as SupabaseClient
}

export async function GET() {
  // Coffre-fort verrouillé : ces données en proviennent (chantier D).
  const vault = await requireVaultUnlocked()
  if (!vault.ok) return vaultDeniedResponse(vault)
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Session expirée. Reconnectez-vous.')

  if (!SUPABASE_ENABLED) {
    const shares = [...demoShares().values()]
      .filter((s) => s.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(demoSummary)
    return jsonOk({ shares })
  }

  const { data, error } = await (await userClient())
    .from('lawyer_shares').select(COLUMNS)
    .order('created_at', { ascending: false }).limit(50)
  if (error) return jsonError(500, 'list_failed', 'Impossible de charger vos partages.')
  return jsonOk({ shares: ((data ?? []) as ShareRow[]).map(fromRow) })
}

export async function POST(req: NextRequest) {
  // Coffre-fort verrouillé : ces données en proviennent (chantier D).
  const vault = await requireVaultUnlocked()
  if (!vault.ok) return vaultDeniedResponse(vault)
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Session expirée. Reconnectez-vous.')

  const limited = await rateLimit(userKey('partages-avocat:create', user.id), 20, 60 * 60_000)
  if (!limited.ok) {
    return jsonError(429, 'rate_limited', 'Trop de partages créés. Réessayez plus tard.', { 'Retry-After': String(limited.retryAfter) })
  }

  const cl = Number(req.headers.get('content-length') ?? 0)
  if (cl > MAX_BODY_BYTES) return jsonError(413, 'payload_too_large', 'Requête trop volumineuse.')

  const body: unknown = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'invalid_payload', parsed.error.issues[0]?.message ?? 'Informations invalides.')
  }
  const { label, expiry, withCode, scope } = parsed.data
  const hasContent = scope.journal !== null || scope.documentIds.length > 0 || scope.testimonyIds.length > 0 || scope.messages
  if (!hasContent) return jsonError(400, 'empty_scope', 'Choisissez au moins un contenu à partager.')

  const now = new Date()
  const ms = EXPIRY_OPTIONS.find((o) => o.value === expiry)!.ms
  const expiresAt = new Date(now.getTime() + ms).toISOString()
  const token = generateToken()
  const code = withCode ? generateAccessCode() : null
  const accessCodeHash = code ? await hashAccessCode(code) : null

  if (!SUPABASE_ENABLED) {
    const id = randomUUID()
    const share = {
      id, userId: user.id, ownerName: `${user.prenom} ${user.nom}`.trim() || 'Parent', token, label, scope,
      createdAt: now.toISOString(), expiresAt, revokedAt: null, accessCodeHash, log: [],
    }
    demoShares().set(id, share)
    const result: CreateShareResult = { share: demoSummary(share), code }
    return jsonOk(result, 201)
  }

  const { data, error } = await (await userClient())
    .from('lawyer_shares')
    .insert({ user_id: user.id, token, label, scope, expires_at: expiresAt, access_code_hash: accessCodeHash })
    .select(COLUMNS)
    .single()
  if (error || !data) return jsonError(500, 'create_failed', "Le partage n'a pas pu être créé.")
  // Le code n'est renvoyé qu'une seule fois : seul son hachage est conservé.
  const result: CreateShareResult = { share: fromRow(data as ShareRow), code }
  return jsonOk(result, 201)
}
