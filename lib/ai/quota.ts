import 'server-only'
/**
 * Quotas du Coach IA (CDC §6.2).
 * - Analyses : gratuit = 5, premium = 50, coparentalité+ = 100 par fenêtre glissante de 30 jours
 *   (COACH_ANALYSES, components/profil/pricing.ts), selon le plan EFFECTIF : un parent lié à
 *   un abonné Coparentalité+ bénéficie du quota Premium (getEffectivePlan, 0380). Une analyse =
 *   un appel /api/coach/analyze réussi. Les analyses archivées ou supprimées restent
 *   décomptées jusqu'à leur sortie de la fenêtre (sinon archiver « rendrait » du quota).
 * - Supabase : le décompte s'appuie sur public.ai_usage (0270), registre écrit
 *   UNIQUEMENT par le service_role via reserve_ai_usage() (verrou par utilisateur,
 *   comptage + insertion atomiques). Supprimer ou modifier ses analyses ne rend
 *   donc aucun quota. compute_ai_cycle_window (service_role) n'est pas utilisée.
 * - Crédits (0510) : quota atteint → 1 crédit acheté (lot non expiré le plus ancien), consommé dans
 *   la MÊME transaction et sous le MÊME verrou (reserve_ai_analysis) ; rendu si l'analyse échoue
 *   (release_ai_usage). Les analyses payées par crédit (ai_usage.credit_id) ne comptent pas dans le quota.
 * - Démo : comptes de démonstration → profil de démo + cookie lp_demo_ai (lib/ai/credits) ;
 *   autre session sans Supabase → compteur en mémoire (lignes d'analyses du magasin mémoire).
 * - Chat (assistant + questions de suivi) : non décompté du quota d'analyses, limite
 *   douce de 50 messages / jour / utilisateur (compteur en mémoire, par instance).
 */
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session'
import { AI_ENABLED, SUPABASE_ENABLED } from '@/lib/supabase/config'
import { mockCoachCycles, mockCoachLog, mockCoachUsage } from '@/lib/mock-data'
import { getDemoBilling } from '@/lib/billing/demo'
import { demoCoachUsage } from './quota-demo'
import type { PlanId } from '@/components/profil/pricing'
import { getEffectivePlan } from '@/lib/billing/entitlements'
import { ANALYSIS_QUOTA_BY_PLAN } from '@/lib/billing/plans'
import { demoQuotaBase, getCreditBalance, readDemoAi, writeDemoAi } from './credits'
import { demoReserve, type CreditBalance, type ReservationSource } from './credits-core'
import { getLocale, getTranslations } from 'next-intl/server'
import { defaultLocale, intlLocale, isLocale, type Locale } from '@/lib/i18n/config'
import {
  CYCLE_DAYS, aiServiceDb, cancelPending, cycleRows, insertPending, newAnalysisUuid, type CoachKind, type StoredAnalysis,
} from './analyses'

export const ANALYSIS_QUOTA: Record<PlanId, number> = ANALYSIS_QUOTA_BY_PLAN
export const CHAT_DAILY_SOFT_LIMIT = 50

const DAY_MS = 86_400_000

export type QuotaStatus = {
  /** Plan effectif (abonnement propre ou accès partagé de la famille). */
  plan: PlanId
  used: number
  quota: number
  remaining: number
  /** Date à laquelle la plus ancienne analyse décomptée sort de la fenêtre (une place se libère). */
  nextReleaseAt: string | null
}

/** Erreur PostgREST / PostgreSQL « fonction ou colonne absente » (migration 0510 pas encore appliquée). */
function isMissingSchema(error: { code?: string } | null): boolean {
  return !!error && ['PGRST202', 'PGRST204', '42883', '42703'].includes(error.code ?? '')
}

/**
 * Horodatages de consommation (ai_usage en Supabase, magasin mémoire en démo) depuis `since`.
 * `quotaOnly` : seulement les analyses décomptées du quota (hors analyses payées par crédit, 0510).
 */
async function usageTimes(user: CurrentUser, since: Date, quotaOnly = true): Promise<number[]> {
  if (SUPABASE_ENABLED) {
    // Lecture service_role bornée à l'utilisateur (la policy select self suffirait,
    // mais on évite une dépendance à la session pour un contrôle d'accès).
    const query = (onlyQuota: boolean) => {
      const q = aiServiceDb()
        .from('ai_usage')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('kind', 'analysis')
        .gt('created_at', since.toISOString())
      return (onlyQuota ? q.is('credit_id', null) : q).order('created_at', { ascending: true }).limit(1000)
    }
    let { data, error } = await query(quotaOnly)
    // Avant 0510 (colonne credit_id absente) : toutes les lignes sont des analyses du quota.
    if (quotaOnly && isMissingSchema(error)) ({ data, error } = await query(false))
    if (error) throw new Error('ai_usage read failed')
    return ((data ?? []) as Array<{ created_at: string }>).map((r) => new Date(r.created_at).getTime())
  }
  return (await cycleRows(user, since)).map((r) => new Date(r.cycle).getTime())
}

/** Plan effectif et quota d'analyses associé. */
async function planQuota(user: CurrentUser): Promise<{ plan: PlanId; quota: number }> {
  const { plan } = await getEffectivePlan(user.id, user.plan)
  return { plan, quota: ANALYSIS_QUOTA[plan] ?? ANALYSIS_QUOTA.gratuit }
}

export async function getQuotaStatus(user: CurrentUser): Promise<QuotaStatus> {
  const since = new Date(Date.now() - CYCLE_DAYS * DAY_MS)
  const [times, { plan, quota }] = await Promise.all([usageTimes(user, since), planQuota(user)])
  const used = times.length
  const oldest = [...times].sort((a, b) => a - b)[0]
  return {
    plan,
    used,
    quota,
    remaining: Math.max(0, quota - used),
    nextReleaseAt: oldest ? new Date(oldest + CYCLE_DAYS * DAY_MS).toISOString() : null,
  }
}

export type Reservation =
  | { ok: true; analysis: StoredAnalysis; status: QuotaStatus; source: ReservationSource }
  | { ok: false; status: QuotaStatus }

/** Réservation en base : quota puis crédit (0510), repli sur le seul quota (0270) avant la migration. */
async function reserveInDb(userId: string, quota: number, id: string): Promise<ReservationSource | null> {
  const db = aiServiceDb()
  const { data, error } = await db.rpc('reserve_ai_analysis', {
    p_user_id: userId, p_limit: quota, p_window_days: CYCLE_DAYS, p_analysis_id: id,
  })
  if (!error) {
    const source = (data as { source?: string } | null)?.source
    return source === 'credit' ? 'credit' : source === 'quota' ? 'quota' : null
  }
  if (!isMissingSchema(error)) throw new Error('reserve_ai_analysis failed')
  const legacy = await db.rpc('reserve_ai_usage', {
    p_user_id: userId, p_kind: 'analysis', p_limit: quota, p_window_days: CYCLE_DAYS, p_analysis_id: id,
  })
  if (legacy.error) throw new Error('reserve_ai_usage failed')
  return legacy.data ? 'quota' : null
}

/**
 * Réservation d'un compte de DÉMONSTRATION (sans Supabase) : profil de démo + cookie lp_demo_ai,
 * même ordre quota → crédits que la base. Null si la session n'est pas un compte de démonstration.
 * À appeler AVANT l'envoi de la réponse (écriture du cookie) : aucun remboursement possible une fois
 * le flux SSE ouvert. Sans clé d'IA, le parcours simulé n'échoue pas ; avec une vraie clé d'IA en
 * démonstration, une analyse échouée reste décomptée du compteur simulé (limite connue, sans paiement).
 */
export async function reserveDemoAnalysis(): Promise<{ ok: true; source: ReservationSource } | { ok: false; status: QuotaStatus } | null> {
  const demo = await readDemoAi()
  if (!demo) return null
  const base = await demoQuotaBase()
  const r = demoReserve(demo.state, base.baseUsed, base.quota)
  if (!r) {
    const used = Math.min(base.quota, base.baseUsed + demo.state.extraUsed)
    return { ok: false, status: { plan: base.plan, used, quota: base.quota, remaining: 0, nextReleaseAt: null } }
  }
  await writeDemoAi(demo.account, r.next)
  return { ok: true, source: r.source }
}

/**
 * Réserve une analyse AVANT l'appel au modèle : deux requêtes simultanées ne peuvent dépasser ni le
 * quota ni le solde de crédits (Supabase : reserve_ai_analysis sous verrou, 0510 ; démo : cookie ou
 * insertion puis recomptage). En cas d'échec, appeler releaseAnalysis (rend le quota ou le crédit).
 * Sans service_role : erreur (fail-closed).
 */
export async function reserveAnalysis(
  user: CurrentUser,
  meta: { kind: CoachKind; title: string },
): Promise<Reservation> {
  const { quota } = await planQuota(user)
  if (SUPABASE_ENABLED) {
    // Réservation atomique côté base (service_role) AVANT de créer la ligne d'analyse :
    // quota de la formule, sinon 1 crédit acheté (même transaction, même verrou).
    const id = newAnalysisUuid()
    const source = await reserveInDb(user.id, quota, id)
    if (!source) {
      const status = await getQuotaStatus(user)
      return { ok: false, status: { ...status, used: Math.min(status.used, status.quota), remaining: 0 } }
    }
    let analysis: StoredAnalysis
    try {
      analysis = await insertPending(user, { ...meta, id })
    } catch (e) {
      await cancelPending(user, id).catch(() => undefined) // rembourse la réservation orpheline (quota ou crédit)
      throw e
    }
    return { ok: true, analysis, status: await getQuotaStatus(user), source }
  }

  // Compte de démonstration : même règle que la base (profil de démo + crédits simulés).
  // Compteur simulé (cookie non signé) seulement sans vraie clé d'IA : avec une clé, le compteur
  // serveur ci-dessous s'applique (effacer le cookie ne doit pas ouvrir des appels illimités).
  const demo = AI_ENABLED ? null : await reserveDemoAnalysis()
  if (demo) {
    if (!demo.ok) return demo
    const analysis = await insertPending(user, meta)
    return { ok: true, analysis, status: await getQuotaStatus(user), source: demo.source }
  }

  const before = await getQuotaStatus(user)
  if (before.remaining <= 0) return { ok: false, status: before }
  const analysis = await insertPending(user, meta)
  const after = await getQuotaStatus(user)
  if (after.used > after.quota) {
    await cancelPending(user, analysis.id)
    return { ok: false, status: { ...after, used: after.quota, remaining: 0 } }
  }
  return { ok: true, analysis, status: after, source: 'quota' }
}

export async function releaseAnalysis(user: CurrentUser, id: string): Promise<void> {
  await cancelPending(user, id).catch((err) => {
    // Quota ou crédit payé non rendu : trace exploitable (identifiant tronqué, aucune donnée personnelle).
    console.error('[ai-credits] remboursement de réservation impossible', { analysis: id.slice(-8), msg: err instanceof Error ? err.message : 'unknown' })
  })
}

// --- Limite douce du chat ------------------------------------------------------------

const g = globalThis as unknown as { __lpCoachChat?: Map<string, number> }
const chatCounters: Map<string, number> = (g.__lpCoachChat ??= new Map())

const parisDay = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Cayenne', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Incrémente et vérifie le compteur du jour. */
export function consumeChatMessage(userId: string): { ok: boolean; used: number; limit: number } {
  const key = `${userId}:${parisDay.format(new Date())}`
  if (chatCounters.size > 5000) chatCounters.clear()
  const used = (chatCounters.get(key) ?? 0) + 1
  if (used > CHAT_DAILY_SOFT_LIMIT) return { ok: false, used: CHAT_DAILY_SOFT_LIMIT, limit: CHAT_DAILY_SOFT_LIMIT }
  chatCounters.set(key, used)
  return { ok: true, used, limit: CHAT_DAILY_SOFT_LIMIT }
}

/** Rend un message non servi (erreur fournisseur) au compteur du jour. */
export function refundChatMessage(userId: string): void {
  const key = `${userId}:${parisDay.format(new Date())}`
  const v = chatCounters.get(key)
  if (v && v > 0) chatCounters.set(key, v - 1)
}

// --- Vue « utilisation » -------------------------------------------------------------

export type UsageOverview = QuotaStatus & {
  resetInDays: number | null
  resetDateLabel: string | null
  cycles: Array<{ label: string; startLabel: string; used: number; current: boolean }>
  /**
   * `status` est un CODE stable ('Terminée' | 'Supprimée'), traduit au rendu par l'interface
   * (HistoriqueClient) : il n'est pas localisé ici. `title` et `dateLabel` le sont.
   */
  log: Array<{ id: string; title: string; dateLabel: string; status: 'Terminée' | 'Supprimée' }>
}

const TZ = 'America/Cayenne'
const fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' })
const fmtShort = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: 'short' })
const fmtLog = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Formateurs de dates de la vue « utilisation » ; le français garde exactement le rendu historique. */
function usageFormatters(locale: Locale) {
  if (locale === 'fr') {
    return {
      long: (d: Date) => fmtLong.format(d),
      short: (d: Date) => fmtShort.format(d).replace('.', ''),
      log: (d: Date) => fmtLog.format(d).replace(',', ' •'),
    }
  }
  const intl = intlLocale(locale)
  const long = new Intl.DateTimeFormat(intl, { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' })
  const short = new Intl.DateTimeFormat(intl, { timeZone: TZ, day: '2-digit', month: 'short' })
  const day = new Intl.DateTimeFormat(intl, { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
  const time = new Intl.DateTimeFormat(intl, { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  return {
    long: (d: Date) => long.format(d),
    short: (d: Date) => short.format(d).replace('.', ''),
    log: (d: Date) => `${day.format(d)} • ${time.format(d)}`,
  }
}

/** Locale de la requête en cours (cookie lp_locale) ; français hors requête. */
async function requestLocale(): Promise<Locale> {
  try {
    const l = await getLocale()
    return isLocale(l) ? l : defaultLocale
  } catch {
    return defaultLocale
  }
}

/** Libellés de la vue « utilisation » (français historique si le catalogue est indisponible). */
async function usageLabels(locale: Locale): Promise<{ current: string; cycleN: (n: number) => string; deleted: string }> {
  if (locale !== 'fr') {
    try {
      const t = await getTranslations({ locale, namespace: 'ai.quota' })
      return { current: t('cycleCurrent'), cycleN: (n) => t('cycleN', { n }), deleted: t('deletedTitle') }
    } catch {
      // repli français
    }
  }
  return { current: 'Cycle actuel', cycleN: (n) => `Cycle -${n}`, deleted: 'Analyse supprimée' }
}

/**
 * Vue « utilisation ». `locale` (optionnel) : langue des libellés et dates ; par défaut la
 * langue de la requête en cours (français hors requête).
 */
export async function getUsageOverview(user: CurrentUser, locale?: Locale): Promise<UsageOverview> {
  const loc = locale ?? (await requestLocale())
  const fmt = usageFormatters(loc)
  const labels = await usageLabels(loc)
  const status = await getQuotaStatus(user)
  const now = Date.now()
  const sixCycles = new Date(now - 6 * CYCLE_DAYS * DAY_MS)
  const rows = (await cycleRows(user, sixCycles)).filter((r) => r.status !== 'pending')
  // Consommation réelle (ai_usage) ; le journal ci-dessous reste issu des analyses (titres).
  const usage = await usageTimes(user, sixCycles, false)
  const cycles = Array.from({ length: 6 }, (_, i) => {
    const back = 5 - i
    const end = now - back * CYCLE_DAYS * DAY_MS
    const start = end - CYCLE_DAYS * DAY_MS
    return {
      label: back === 0 ? labels.current : labels.cycleN(back),
      startLabel: fmt.short(new Date(start)),
      used: usage.filter((t) => t > start && t <= end).length,
      current: back === 0,
    }
  })
  const windowStart = now - CYCLE_DAYS * DAY_MS
  const log = rows
    .filter((r) => new Date(r.cycle).getTime() > windowStart)
    .map((r) => ({ id: r.id, title: r.status === 'deleted' ? labels.deleted : r.title, dateLabel: fmt.log(new Date(r.cycle)), status: r.status === 'deleted' ? ('Supprimée' as const) : ('Terminée' as const) }))
  const release = status.nextReleaseAt ? new Date(status.nextReleaseAt) : null
  return {
    ...status,
    resetInDays: release ? Math.max(0, Math.ceil((release.getTime() - now) / DAY_MS)) : null,
    resetDateLabel: release ? fmt.long(release) : null,
    cycles,
    log,
  }
}

/**
 * Données des écrans « Utilisation » : réelles si Supabase est configuré,
 * exemples de démonstration sinon (affichage inchangé).
 */
export type CoachUsageView = {
  used: number
  total: number
  resetInDays: number | null
  resetDateLabel: string | null
  cycles: UsageOverview['cycles']
  log: UsageOverview['log']
  live: boolean
  /** Crédits d'analyses achetés (solde des lots non expirés, expiration la plus proche). */
  credits: CreditBalance
}

export async function loadCoachUsage(locale?: Locale): Promise<CoachUsageView> {
  // Même source que le profil : comptes réels → getQuotaStatus (ai_usage) ; démonstration → les
  // valeurs du Profil de démo. Le compteur « 7/10 » figé contredisait le « 1/3 » du profil gratuit.
  if (!SUPABASE_ENABLED) {
    // Démonstration : même source que le Profil de démo (formule simulée + components/profil/data),
    // plus les analyses lancées pendant la démonstration (cookie lp_demo_ai).
    const loc = locale ?? (await requestLocale())
    const demo = await getDemoBilling()
    const v = demoCoachUsage(demo?.plan ?? 'gratuit', loc, await usageLabels(loc))
    const extra = (await readDemoAi())?.state.extraUsed ?? 0
    const used = Math.min(v.total, v.used + extra)
    const cycles = v.cycles.map((c) => (c.current ? { ...c, used } : c))
    const credits = await getCreditBalance(null) // solde simulé (cookie de démonstration)
    return { ...v, used, cycles, live: false, credits }
  }
  const user = await getCurrentUser()
  if (!user) {
    // Sans session (ne devrait pas arriver sous /app) : exemple de démonstration, date localisée.
    const fmt = usageFormatters(locale ?? (await requestLocale()))
    const reset = mockCoachUsage.resetInDays != null ? new Date(Date.now() + mockCoachUsage.resetInDays * DAY_MS) : null
    return { used: mockCoachUsage.used, total: mockCoachUsage.total, resetInDays: mockCoachUsage.resetInDays, resetDateLabel: reset ? fmt.long(reset) : null, cycles: mockCoachCycles, log: mockCoachLog, live: false, credits: { balance: 0, nextExpiry: null } }
  }
  const credits = await getCreditBalance(user)
  try {
    const o = await getUsageOverview(user, locale)
    return { used: Math.min(o.used, o.quota), total: o.quota, resetInDays: o.resetInDays, resetDateLabel: o.resetDateLabel, cycles: o.cycles, log: o.log, live: true, credits }
  } catch {
    const { quota } = await planQuota(user)
    return { used: 0, total: quota, resetInDays: null, resetDateLabel: null, cycles: [], log: [], live: true, credits }
  }
}
