'use server'
/**
 * Server Actions liées au compte (Supabase uniquement — en mode démo, les
 * écrans n'appellent pas ces actions).
 *
 * Chaque action :
 *  - revalide l'identité (auth.getUser + niveau MFA) ; l'id vient du jeton, jamais du client ;
 *  - valide l'entrée avec zod ;
 *  - écrit via le client RLS de l'utilisateur (aucune service_role ici) ;
 *  - renvoie un résultat sérialisable avec un message français, sans détail technique.
 *
 * Les appels Auth « interactifs » (signUp, signIn, verifyOtp, resend, reset) restent
 * dans le navigateur : GoTrue applique ainsi ses limites de débit par IP réelle
 * de l'utilisateur, et non par IP du serveur (qui serait partagée par tous).
 */
import { revalidatePath } from 'next/cache'
import type { PreferenceRow } from '@/lib/supabase/types'
import { authErrorMessage, RATE_LIMIT_MESSAGE } from './errors'
import { DENIED_MESSAGES, requireAuthedUser } from './guard'
import {
  accountInfoSchema,
  changePasswordSchema,
  childSchema,
  firstIssue,
  preferencesSchema,
  profileNamesSchema,
  avatarPathSchema,
  type PreferencesInput,
} from './validation'
import { verifyPassword } from './verify-password'

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; reason?: 'unauthenticated' | 'mfa_required' | 'disabled' }

const GENERIC = 'Enregistrement impossible pour le moment. Réessayez dans un instant.'

async function authed() {
  const ctx = await requireAuthedUser()
  if (!ctx.ok) return { denied: { ok: false as const, error: DENIED_MESSAGES[ctx.reason], reason: ctx.reason } }
  return { ctx }
}

function ownsPath(uid: string, path: string | null | undefined) {
  return !path || path.startsWith(`${uid}/`)
}

// --- Onboarding étape 8 : prénom / nom / photo --------------------------
export async function saveOnboardingProfile(input: { prenom: string; nom: string; photoPath?: string | null }): Promise<ActionResult> {
  const { ctx, denied } = await authed()
  if (denied) return denied
  const parsed = profileNamesSchema.extend({ photoPath: avatarPathSchema.nullable().optional() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { prenom, nom, photoPath } = parsed.data
  if (!ownsPath(ctx.user.id, photoPath)) return { ok: false, error: 'Photo invalide.' }

  const patch: { prenom: string; nom: string; photo_url?: string | null } = { prenom, nom }
  if (photoPath !== undefined) patch.photo_url = photoPath

  const { error } = await ctx.supabase.from('users').update(patch).eq('id', ctx.user.id)
  if (error) return { ok: false, error: GENERIC }
  return { ok: true }
}

// --- Onboarding étape 9 : premier enfant --------------------------------
export async function saveOnboardingChild(input: {
  id?: string
  prenom: string
  dateNaissance: string
  classe?: string | null
  photoPath?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const { ctx, denied } = await authed()
  if (denied) return denied
  const parsed = childSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const c = parsed.data
  if (!ownsPath(ctx.user.id, c.photoPath)) return { ok: false, error: 'Photo invalide.' }

  const row = {
    user_id: ctx.user.id,
    prenom: c.prenom,
    date_naissance: c.dateNaissance,
    classe: c.classe || null,
    ...(c.photoPath !== undefined ? { photo_url: c.photoPath } : {}),
  }

  // Id fourni par le client (pour nommer la photo avant insertion) : l'upsert
  // reste borné par la RLS (children_crud_self) — impossible de viser l'enfant d'autrui.
  const query = c.id
    ? ctx.supabase.from('children').upsert({ id: c.id, ...row }, { onConflict: 'id' }).select('id').single()
    : ctx.supabase.from('children').insert(row).select('id').single()

  const { data, error } = await query
  if (error || !data) return { ok: false, error: GENERIC }

  // Premier enfant = enfant actif par défaut (sans écraser un choix existant).
  await ctx.supabase.from('preferences').update({ active_child_id: data.id }).eq('user_id', ctx.user.id).is('active_child_id', null)
  return { ok: true, data: { id: data.id } }
}

export async function removeOnboardingChild(id: string): Promise<ActionResult> {
  const { ctx, denied } = await authed()
  if (denied) return denied
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Enfant introuvable.' }
  const { error } = await ctx.supabase.from('children').delete().eq('id', id).eq('user_id', ctx.user.id)
  if (error) return { ok: false, error: GENERIC }
  return { ok: true }
}

// --- Profil > Informations ------------------------------------------------
export async function saveAccountInfo(
  input: unknown,
  prefs?: { langue?: string; fuseau?: string; formatDate?: string; notifEmail?: boolean; notifPush?: boolean },
): Promise<ActionResult> {
  const { ctx, denied } = await authed()
  if (denied) return denied
  const parsed = accountInfoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const v = parsed.data
  if (!ownsPath(ctx.user.id, v.photoPath)) return { ok: false, error: 'Photo invalide.' }

  const { error } = await ctx.supabase
    .from('users')
    .update({
      prenom: v.prenom,
      nom: v.nom,
      date_naissance: v.dateNaissance ?? null,
      genre: v.genre ?? null,
      situation_familiale: v.situation ?? null,
      telephone: v.telephone ?? null,
      adresse: v.adresse ?? null,
      code_postal: v.cp ?? null,
      ville: v.ville ?? null,
      pays: v.pays ?? null,
      ...(v.photoPath !== undefined ? { photo_url: v.photoPath } : {}),
    })
    .eq('id', ctx.user.id)
  if (error) return { ok: false, error: GENERIC }

  if (prefs) {
    const p = preferencesSchema
      .pick({ langue: true, fuseau: true, formatDate: true, notifEmail: true, notifPush: true })
      .partial()
      .safeParse(prefs)
    if (p.success) {
      const res = await mergePreferences(ctx, p.data)
      if (!res.ok) return res
    }
  }

  revalidatePath('/app/profil')
  return { ok: true }
}

// --- Préférences ------------------------------------------------------------
type Ctx = Extract<Awaited<ReturnType<typeof requireAuthedUser>>, { ok: true }>

const THEME_TO_DB = { clair: 'light', sombre: 'dark', auto: 'system' } as const
const THEME_FROM_DB = { light: 'clair', dark: 'sombre', system: 'auto' } as const
const UI_KEYS = ['fuseau', 'formatDate', 'formatHeure', 'rappelHeure', 'onMessages', 'onGarde', 'onCalendrier', 'onDocuments', 'couleur', 'taille'] as const

function toRow(p: Partial<PreferencesInput>, currentUi: Record<string, unknown>) {
  const row: Partial<Pick<PreferenceRow, 'theme' | 'langue' | 'notif_push' | 'notif_email' | 'notif_rappels' | 'ui'>> = {}
  if (p.theme) row.theme = THEME_TO_DB[p.theme]
  if (p.langue) row.langue = p.langue
  if (p.notifPush !== undefined) row.notif_push = p.notifPush
  if (p.notifEmail !== undefined) row.notif_email = p.notifEmail
  if (p.rappels !== undefined) row.notif_rappels = p.rappels
  const ui: Record<string, unknown> = { ...currentUi }
  let uiChanged = false
  for (const k of UI_KEYS) {
    if (p[k] !== undefined) { ui[k] = p[k]; uiChanged = true }
  }
  if (uiChanged) row.ui = ui
  return row
}

async function mergePreferences(ctx: Ctx, p: Partial<PreferencesInput>): Promise<ActionResult> {
  const { data: current } = await ctx.supabase.from('preferences').select('ui').eq('user_id', ctx.user.id).maybeSingle()
  const row = toRow(p, (current?.ui as Record<string, unknown> | undefined) ?? {})
  const { error } = current
    ? await ctx.supabase.from('preferences').update(row).eq('user_id', ctx.user.id)
    : await ctx.supabase.from('preferences').insert({ user_id: ctx.user.id, ...row })
  if (error) return { ok: false, error: GENERIC }
  return { ok: true }
}

export async function loadPreferences(): Promise<ActionResult<Partial<PreferencesInput>>> {
  const { ctx, denied } = await authed()
  if (denied) return denied
  const { data, error } = await ctx.supabase
    .from('preferences')
    .select('theme, langue, notif_push, notif_email, notif_rappels, ui')
    .eq('user_id', ctx.user.id)
    .maybeSingle()
  if (error) return { ok: false, error: 'Impossible de charger vos préférences.' }
  if (!data) return { ok: true, data: {} }

  // On revalide ce qui sort de la base (jsonb libre) avant de le renvoyer à l'UI.
  const raw: Record<string, unknown> = {
    ...(data.ui ?? {}),
    theme: THEME_FROM_DB[data.theme],
    langue: data.langue,
    notifPush: data.notif_push,
    notifEmail: data.notif_email,
    rappels: data.notif_rappels,
  }
  const out: Partial<PreferencesInput> = {}
  const shape = preferencesSchema.shape
  for (const key of Object.keys(shape) as (keyof PreferencesInput)[]) {
    const r = shape[key].safeParse(raw[key])
    if (r.success) (out as Record<string, unknown>)[key] = r.data
  }
  return { ok: true, data: out }
}

export async function savePreferences(input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await authed()
  if (denied) return denied
  const parsed = preferencesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Préférences invalides.' }
  return mergePreferences(ctx, parsed.data)
}

// --- Sécurité > Mot de passe -------------------------------------------------
export async function changePassword(input: { current: string; next: string }): Promise<ActionResult> {
  const { ctx, denied } = await authed()
  if (denied) return denied
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const check = await verifyPassword(ctx.user.email ?? '', parsed.data.current)
  if (check === 'invalid') return { ok: false, error: 'Mot de passe actuel incorrect.' }
  if (check === 'rate_limited') return { ok: false, error: RATE_LIMIT_MESSAGE }
  if (check === 'error') return { ok: false, error: 'Vérification impossible pour le moment. Réessayez dans un instant.' }

  const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data.next })
  if (error) return { ok: false, error: authErrorMessage(error, 'update-password') }

  // Les autres appareils doivent se reconnecter avec le nouveau mot de passe.
  await ctx.supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
  return { ok: true }
}
