import 'server-only'
/**
 * Socle des routes API du back-office contenus (app/api/admin/contenus/**).
 *
 * - Garde admin : démo = cookie `lp_demo=admin` (recette uniquement) ; réel = session
 *   Supabase revalidée (auth.getUser) puis RPC is_admin() et session aal2 OBLIGATOIRE
 *   (M7, audit v3 : un admin sans facteur TOTP est refusé ; fail-closed).
 * - Anti-CSRF : toute écriture exige un en-tête Origin identique à l'hôte servi.
 * - Erreurs : enveloppe { error: { code, message, correlation_id, issues? } }.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEMO_COOKIE, DEMO_MODE } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireAuthedUser } from '@/lib/auth/guard'
import { RepoError, type AdminCtx } from './repo'
import { CONTENT_STATUSES, type ContentKind } from './types'

const isoDateTime = z.string().datetime({ offset: true })

export const createBodySchema = z.object({
  data: z.unknown(),
  statut: z.enum(CONTENT_STATUSES).optional(),
  /** Articles uniquement : date de publication (programmation). */
  publishedAt: isoDateTime.nullable().optional(),
})

export const patchBodySchema = z.object({
  version: z.number().int().positive(),
  data: z.unknown().optional(),
  statut: z.enum(CONTENT_STATUSES).optional(),
  publishedAt: isoDateTime.nullable().optional(),
})

export const versionBodySchema = z.object({ version: z.number().int().positive() })

export function apiError(status: number, code: string, message: string, issues?: { path: string; message: string }[]) {
  const correlation_id = `req_${randomBytes(6).toString('hex')}`
  return NextResponse.json(
    { error: { code, message, correlation_id, ...(issues?.length ? { issues } : {}) } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export function apiOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export type AdminGate = { ok: true; ctx: AdminCtx } | { ok: false; response: NextResponse }

export async function requireAdmin(): Promise<AdminGate> {
  if (DEMO_MODE) {
    if ((await cookies()).get(DEMO_COOKIE)?.value === 'admin') return { ok: true, ctx: { mode: 'demo', actor: 'Admin (démo)' } }
    return { ok: false, response: apiError(401, 'unauthenticated', 'Connectez-vous avec le compte administrateur.') }
  }
  if (!SUPABASE_ENABLED) return { ok: false, response: apiError(503, 'not_configured', 'Le back-office n’est pas configuré.') }
  const auth = await requireAuthedUser()
  if (!auth.ok) {
    const status = auth.reason === 'mfa_required' ? 403 : auth.reason === 'disabled' ? 503 : 401
    return { ok: false, response: apiError(status, auth.reason, 'Session administrateur requise.') }
  }
  const { data: isAdmin, error } = await auth.supabase.rpc('is_admin')
  if (error || isAdmin !== true) return { ok: false, response: apiError(403, 'forbidden', 'Accès réservé aux administrateurs.') }
  return {
    ok: true,
    ctx: { mode: 'live', db: auth.supabase as unknown as SupabaseClient, userId: auth.user.id, actor: auth.user.email ?? auth.user.id },
  }
}

/** Contexte admin pour une page du back-office (le layout a déjà filtré ; la RLS reste le garde-fou). */
export async function pageAdminCtx(): Promise<AdminCtx> {
  const gate = await requireAdmin()
  if (!gate.ok) redirect('/')
  return gate.ctx
}

/** Refuse les écritures cross-site (le cookie SameSite=Lax ne protège pas tous les cas). */
export function sameOrigin(req: Pick<Request, 'headers'>): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

const MAX_BODY = 512 * 1024

/** Corps JSON borné (512 Ko) ; null si absent, trop gros ou illisible. */
export async function readJson(req: NextRequest): Promise<unknown | null> {
  const cl = Number(req.headers.get('content-length') ?? '0')
  if (cl > MAX_BODY) return null
  try {
    const text = await req.text()
    if (text.length > MAX_BODY) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

const STATUS: Record<RepoError['code'], number> = {
  not_found: 404, conflict: 409, slug_taken: 409, in_use: 409, invalid: 422, forbidden: 403, unavailable: 503,
}

/** Exécute un traitement admin : garde, origine, conversion des erreurs métier. */
export async function adminRoute(req: NextRequest, fn: (ctx: AdminCtx) => Promise<NextResponse>): Promise<NextResponse> {
  if (req.method !== 'GET' && !sameOrigin(req)) return apiError(403, 'bad_origin', 'Requête refusée (origine inattendue).')
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  try {
    return await fn(gate.ctx)
  } catch (e) {
    if (e instanceof RepoError) return apiError(STATUS[e.code], e.code, e.message, e.issues)
    console.error('[contenus] erreur inattendue', e instanceof Error ? e.message : e)
    return apiError(500, 'internal', 'Une erreur inattendue est survenue.')
  }
}

/** Invalide les pages publiques qui affichent ce type de contenu. */
export function revalidateFor(kind: ContentKind, slug?: string) {
  try {
    if (kind === 'fiche' || kind === 'parcours' || kind === 'partenaire') revalidatePath('/app/guide', 'layout')
    if (kind === 'modele') revalidatePath('/app/modeles', 'layout')
    if (kind === 'article') {
      revalidatePath('/blog')
      if (slug) revalidatePath(`/blog/${slug}`)
      revalidatePath('/sitemap.xml')
    }
    if (kind === 'faq' || kind === 'tutoriel') revalidatePath('/app/aide', 'layout')
    if (kind === 'faq') revalidatePath('/aide')
    if (kind === 'conseil') revalidatePath('/app')
  } catch {
    /* hors contexte de requête (tests) : sans effet */
  }
}
