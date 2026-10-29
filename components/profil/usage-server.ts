import 'server-only'
import { getRequestTz } from '@/lib/tz-server'
/**
 * Formule et consommation RÉELLES d'un compte (écrans Profil et Stockage), côté serveur.
 *
 * - Formule : plan effectif (lib/billing/entitlements, abonnement propre ou accès famille).
 * - Coach IA : quota de la fenêtre glissante de 30 jours (lib/ai/quota, registre ai_usage).
 * - Stockage : somme des tailles des documents du coffre déposés par l'utilisateur
 *   (public.documents.size_bytes, corbeille comprise tant que la purge n'a pas eu lieu).
 *   Lecture service_role filtrée sur l'identifiant de la session (le verrou du coffre,
 *   0370, ne doit pas faire tomber l'espace utilisé à 0) ; à défaut de clé, client RLS.
 *   Seuls la taille et le type MIME sont lus, jamais le contenu ni les noms.
 * Chaque bloc échoue indépendamment (null = « indisponible » à l'écran, jamais une valeur inventée).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session'
import { getEffectivePlan } from '@/lib/billing/entitlements'
import { BILLING_LIVE } from '@/lib/billing/config'
import { getBillingOverview } from '@/lib/billing/overview'
import { describeStatus, type StatusTone } from '@/lib/billing/ui-state'
import { getLocale, getTranslations } from 'next-intl/server'
import { billingFormat, localizeStatus } from '@/app/app/abonnement/_components/billing-i18n'

/** Statut d'abonnement affiché sur le profil : même libellé que « Mon abonnement ». */
export type ProfileStatus = { label: string; headline: string; tone: StatusTone }
import { getQuotaStatus } from '@/lib/ai/quota'
import { getCreditBalance } from '@/lib/ai/credits'
import type { CreditBalance } from '@/lib/ai/credits-core'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PRICING, type PlanId } from './pricing'
import { GO } from './storage'

export type StorageBreakdown = { documents: number; photos: number; autres: number }
export type StorageUsage = { usedBytes: number; maxBytes: number; breakdown: StorageBreakdown }

export type ProfileUsage = {
  plan: PlanId
  storage: StorageUsage | null
  coach: { used: number; quota: number } | null
  /** Crédits d'analyses du Coach IA achetés (solde, expiration la plus proche). */
  credits: CreditBalance | null
  /** Abonnement Stripe (facturation réelle uniquement). */
  subscription: { periodEnd: string | null; cancelAtPeriodEnd: boolean; status: ProfileStatus } | null
}

export function storageMaxBytes(plan: PlanId): number {
  const go = plan === 'gratuit' ? PRICING.storage.free : PRICING.storage[plan]
  return go * GO
}

type SizeRow = { size_bytes: number | string | null; mime: string | null }

async function loadStorage(user: CurrentUser, plan: PlanId): Promise<StorageUsage | null> {
  try {
    const client = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : await createClient()
    // Client non typé : `documents` n'est que partiellement décrit dans lib/supabase/types.
    const db = client as unknown as SupabaseClient
    const { data, error } = await db.from('documents').select('size_bytes, mime').eq('user_id', user.id).limit(20_000)
    if (error) throw new Error(error.code ?? 'documents_read_failed')
    const breakdown: StorageBreakdown = { documents: 0, photos: 0, autres: 0 }
    for (const r of (data ?? []) as SizeRow[]) {
      const size = Number(r.size_bytes) || 0
      const mime = r.mime ?? ''
      if (mime.startsWith('image/')) breakdown.photos += size
      else if (mime === 'application/pdf' || mime.includes('word')) breakdown.documents += size
      else breakdown.autres += size
    }
    let usedBytes = breakdown.documents + breakdown.photos + breakdown.autres
    // Total compté par la base pour le quota (0560) : inclut les vignettes de l'album.
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data: total } = await db.rpc('storage_used_bytes', { p_user_id: user.id })
      if (total != null && Number(total) > usedBytes) {
        breakdown.photos += Number(total) - usedBytes
        usedBytes = Number(total)
      }
    }
    return { usedBytes, maxBytes: storageMaxBytes(plan), breakdown }
  } catch (err) {
    console.warn('[profil] stockage indisponible', err instanceof Error ? err.message : 'unknown')
    return null
  }
}

async function loadCoach(user: CurrentUser): Promise<ProfileUsage['coach']> {
  try {
    const s = await getQuotaStatus(user)
    return { used: Math.min(s.used, s.quota), quota: s.quota }
  } catch (err) {
    console.warn('[profil] quota Coach indisponible', err instanceof Error ? err.message : 'unknown')
    return null
  }
}

async function loadSubscription(user: CurrentUser): Promise<ProfileUsage['subscription']> {
  if (!BILLING_LIVE) return null
  try {
    const v = await getBillingOverview(user.id)
    // Libellé et phrase dans la langue de l'utilisateur (miroir de describeStatus) ; le ton reste celui de describeStatus.
    const s = localizeStatus(v, billingFormat(await getTranslations('billing'), await getLocale(), await getRequestTz()))
    return { periodEnd: v.periodEnd, cancelAtPeriodEnd: v.cancelAtPeriodEnd, status: { label: s.label, headline: s.headline, tone: describeStatus(v).tone } }
  } catch {
    return null
  }
}

/** `null` : aucune session (la page affiche alors un état d'erreur, pas de données fictives). */
export async function loadProfileUsage(opts: { coach?: boolean; subscription?: boolean } = {}): Promise<ProfileUsage | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const { plan } = await getEffectivePlan(user.id, user.plan)
  const [storage, coach, subscription, credits] = await Promise.all([
    loadStorage(user, plan),
    opts.coach === false ? Promise.resolve(null) : loadCoach(user),
    opts.subscription === false ? Promise.resolve(null) : loadSubscription(user),
    opts.coach === false ? Promise.resolve(null) : getCreditBalance(user),
  ])
  return { plan, storage, coach, subscription, credits }
}
