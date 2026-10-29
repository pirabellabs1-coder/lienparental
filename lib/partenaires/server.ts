import 'server-only'
/**
 * Partenaires — côté serveur (migration 0550).
 *
 * - Candidature : ligne `partner_applications` insérée avec la clé service_role (le formulaire est
 *   public : aucune politique d'insertion n'existe pour anon / authenticated), logo dans le bucket
 *   PRIVÉ `partner-submissions/<id>.<ext>`.
 * - Publication : à la validation, le logo est copié dans le bucket PUBLIC `partner-logos` ; la page
 *   publique ne lit que `list_public_partners()` (partenaires validés, colonnes d'affichage).
 * - Administration : lecture et décision avec le client de l'administrateur (RLS is_admin_aal2) ;
 *   la copie du logo utilise service_role APRÈS cette vérification.
 * - Démonstration (Supabase absent) : magasin en mémoire du serveur, perdu au redémarrage.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { createServiceClient } from '@/lib/supabase/server'
import type { AdminCtx } from '@/lib/contenus/repo'
import { logAdminAction } from '@/lib/admin/ops/rpc'
import type { Partner, PartnerCategory } from './catalog'
import { CATEGORY_FOR_PROFILE, LOGO_EXT, type LogoMime, type PartnerApplication } from './types'

export const SUBMISSIONS_BUCKET = 'partner-submissions'
export const LOGOS_BUCKET = 'partner-logos'

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'hidden'
export type ApplicationRow = {
  id: string
  created_at: string
  profil: PartnerApplication['profil']
  structure: string
  contact_name: string
  email: string
  telephone: string | null
  territoire: PartnerApplication['territoire']
  site: string | null
  reseaux: string | null
  presentation: string
  proposition: string
  logo_path: string | null
  logo_public_path: string | null
  status: ApplicationStatus
  category: PartnerCategory
  public_name: string | null
  tagline: string | null
  display_order: number
  decided_at: string | null
}

const COLUMNS = 'id, created_at, profil, structure, contact_name, email, telephone, territoire, site, reseaux, presentation, proposition, logo_path, logo_public_path, status, category, public_name, tagline, display_order, decided_at'

// --- Démonstration -------------------------------------------------------------

type DemoStore = { rows: ApplicationRow[]; logos: Map<string, { mime: LogoMime; bytes: Uint8Array }> }
const g = globalThis as unknown as { __lpPartnerDemo?: DemoStore }
function demo(): DemoStore {
  if (!g.__lpPartnerDemo) g.__lpPartnerDemo = { rows: [], logos: new Map() }
  return g.__lpPartnerDemo
}

// --- Candidature ---------------------------------------------------------------

/** Enregistre une candidature et son logo. Renvoie l'identifiant. Lève une Error en cas d'échec. */
export async function storeApplication(data: PartnerApplication, logo: { mime: LogoMime; bytes: Uint8Array } | null): Promise<string> {
  const id = crypto.randomUUID()
  const logoPath = logo ? `${id}.${LOGO_EXT[logo.mime]}` : null
  const row = {
    id,
    profil: data.profil,
    structure: data.structure,
    contact_name: data.contactName,
    email: data.email,
    telephone: data.telephone ?? null,
    territoire: data.territoire,
    site: data.site ?? null,
    reseaux: data.reseaux ?? null,
    presentation: data.presentation,
    proposition: data.proposition,
    logo_path: logoPath,
    category: CATEGORY_FOR_PROFILE[data.profil],
  }
  if (!SUPABASE_ENABLED) {
    demo().rows.unshift({
      ...row, created_at: new Date().toISOString(), logo_public_path: null, status: 'pending',
      public_name: null, tagline: null, display_order: 100, decided_at: null,
    })
    if (logo && logoPath) demo().logos.set(logoPath, logo)
    return id
  }
  const svc = createServiceClient() as unknown as SupabaseClient
  if (logo && logoPath) {
    const up = await svc.storage.from(SUBMISSIONS_BUCKET).upload(logoPath, logo.bytes, { contentType: logo.mime, upsert: false })
    if (up.error) throw new Error(`logo upload (${up.error.name})`)
  }
  const { error } = await svc.from('partner_applications').insert(row)
  if (error) {
    if (logoPath) await svc.storage.from(SUBMISSIONS_BUCKET).remove([logoPath])
    throw new Error(`insert (${error.code ?? 'unknown'})`)
  }
  return id
}

// --- Public ----------------------------------------------------------------------

let anon: SupabaseClient | null = null
function publicClient(): SupabaseClient {
  if (!anon) {
    anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    })
  }
  return anon
}

export function publicLogoUrl(path: string): string {
  return SUPABASE_ENABLED ? `${SUPABASE_URL}/storage/v1/object/public/${LOGOS_BUCKET}/${encodeURIComponent(path)}` : `/api/partenaires/logo/${encodeURIComponent(path)}`
}

/** Partenaires validés (page Partenaires, accueil). Base indisponible : liste vide (la page reste servie). */
export async function listPublishedPartners(): Promise<Partner[]> {
  type Pub = { id: string; name: string; category: PartnerCategory; tagline: string | null; site: string | null; logo_public_path: string }
  let rows: Pub[] = []
  if (!SUPABASE_ENABLED) {
    rows = demo().rows
      .filter((r) => r.status === 'approved' && r.public_name && r.logo_public_path)
      .sort((a, b) => a.display_order - b.display_order)
      .map((r) => ({ id: r.id, name: r.public_name!, category: r.category, tagline: r.tagline, site: r.site, logo_public_path: r.logo_public_path! }))
  } else {
    try {
      const { data, error } = await publicClient().rpc('list_public_partners')
      if (error) throw error
      rows = (data ?? []) as Pub[]
    } catch (e) {
      console.warn('[partenaires] liste publique indisponible :', e instanceof Error ? e.message : e)
      return []
    }
  }
  return rows.map((r) => ({
    name: r.name,
    category: r.category,
    image: publicLogoUrl(r.logo_public_path),
    ...(r.tagline ? { tagline: r.tagline } : {}),
    ...(r.site ? { href: r.site } : {}),
  }))
}

/** Démo : logo servi par /api/partenaires/logo/[path] (validés seulement). */
export function demoPublishedLogo(path: string): { mime: LogoMime; bytes: Uint8Array } | null {
  if (SUPABASE_ENABLED) return null
  const row = demo().rows.find((r) => r.logo_public_path === path && r.status === 'approved')
  return row && row.logo_path ? demo().logos.get(row.logo_path) ?? null : null
}

// --- Administration ------------------------------------------------------------------

export async function listApplications(ctx: AdminCtx, status?: ApplicationStatus): Promise<ApplicationRow[]> {
  if (ctx.mode === 'demo') return demo().rows.filter((r) => !status || r.status === status)
  let q = ctx.db.from('partner_applications').select(COLUMNS).order('created_at', { ascending: false }).limit(500)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw new Error(`list (${error.code ?? 'unknown'})`)
  return (data ?? []) as ApplicationRow[]
}

export async function getApplication(ctx: AdminCtx, id: string): Promise<ApplicationRow | null> {
  if (ctx.mode === 'demo') return demo().rows.find((r) => r.id === id) ?? null
  const { data, error } = await ctx.db.from('partner_applications').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`get (${error.code ?? 'unknown'})`)
  return (data as ApplicationRow | null) ?? null
}

/** Aperçu du logo reçu pour l'administrateur (URL signée 5 min, ou data: URL en démo). */
export async function submittedLogoUrl(ctx: AdminCtx, row: ApplicationRow): Promise<string | null> {
  if (!row.logo_path) return null
  if (ctx.mode === 'demo') {
    const l = demo().logos.get(row.logo_path)
    return l ? `data:${l.mime};base64,${Buffer.from(l.bytes).toString('base64')}` : null
  }
  const { data } = await ctx.db.storage.from(SUBMISSIONS_BUCKET).createSignedUrl(row.logo_path, 300)
  return data?.signedUrl ?? null
}

export type Decision =
  | { action: 'approve'; category: PartnerCategory; publicName: string; tagline?: string; displayOrder: number }
  | { action: 'reject' }
  | { action: 'hide' }

/** Décision de l'administrateur. Validation : copie du logo vers le bucket public puis publication. */
export async function decideApplication(ctx: AdminCtx, id: string, d: Decision): Promise<ApplicationRow> {
  const row = await getApplication(ctx, id)
  if (!row) throw new Error('not_found')
  const now = new Date().toISOString()
  let patch: Record<string, unknown>
  if (d.action === 'approve') {
    if (!row.logo_path) throw new Error('no_logo')
    patch = {
      status: 'approved', category: d.category, public_name: d.publicName, tagline: d.tagline || null,
      display_order: d.displayOrder, logo_public_path: row.logo_path, decided_at: now,
    }
    if (ctx.mode === 'live') {
      // Seule étape en service_role : l'accès admin vient d'être vérifié par la RLS (getApplication).
      const svc = createServiceClient() as unknown as SupabaseClient
      const file = await svc.storage.from(SUBMISSIONS_BUCKET).download(row.logo_path)
      if (file.error || !file.data) throw new Error('logo_read')
      const ext = row.logo_path.split('.').pop()
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const up = await svc.storage.from(LOGOS_BUCKET).upload(row.logo_path, await file.data.arrayBuffer(), { contentType: mime, upsert: true, cacheControl: '3600' })
      if (up.error) throw new Error('logo_publish')
    }
  } else {
    patch = { status: d.action === 'reject' ? 'rejected' : 'hidden', decided_at: now }
  }
  if (ctx.mode === 'demo') {
    Object.assign(row, patch)
    return row
  }
  const { data, error } = await ctx.db
    .from('partner_applications')
    .update({ ...patch, decided_by: ctx.userId })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`update (${error.code ?? 'unknown'})`)
  // Journal d'audit de l'administration (aucune donnée personnelle du candidat).
  await logAdminAction(ctx, `admin.partner.${d.action}`, { entity: 'partner_applications', entityId: id, metadata: d.action === 'approve' ? { category: d.category } : {} })
  // Retrait du logo public quand le partenaire n'est plus affiché.
  if (d.action !== 'approve' && row.logo_public_path) {
    const svc = createServiceClient() as unknown as SupabaseClient
    await svc.storage.from(LOGOS_BUCKET).remove([row.logo_public_path])
  }
  return data as ApplicationRow
}
