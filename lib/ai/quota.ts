import 'server-only'
/**
 * Crédits IA du Coach (cahier V6) : vues et réservations des analyses, au-dessus du portefeuille
 * (lib/ai/wallet.ts, fonctions SQL 0520).
 * - Solde A : crédits mensuels de la formule PROPRE du compte (5 / 60 / 200 par défaut, configuration
 *   active), remis à zéro à chaque période de facturation, sans report. Solde B : crédits achetés.
 * - Coût par action (catalogue versionné) : question au Coach 1, analyse de situation (message,
 *   capture) 2, analyse de document (PDF, texte) 3. Réservé AVANT l'appel, confirmé au succès,
 *   restitué en cas d'échec, de refus ou de délai dépassé. Clé d'idempotence fournie par le client.
 * - Chat : décompté (1 crédit par réponse produite) + anti-abus : limites par minute et par jour
 *   (limiteur partagé en base, `chatPerMinute` / `chatPerDay` de la configuration, route chat).
 */
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { mockCoachCycles, mockCoachLog, mockCoachUsage } from '@/lib/mock-data'
import { getDemoBilling } from '@/lib/billing/demo'
import { demoCoachUsage } from './quota-demo'
import { MONTHLY_CREDITS, type PlanId } from '@/components/profil/pricing'
import { getCreditBalance, readDemoAi } from './credits'
import type { CreditBalance } from './credits-core'
import { getLocale, getTranslations } from 'next-intl/server'
import { defaultLocale, intlLocale, isLocale, type Locale } from '@/lib/i18n/config'
import { CYCLE_DAYS, aiServiceDb, cancelPending, cycleRows, insertPending, newAnalysisUuid, type CoachKind, type StoredAnalysis } from './analyses'
import { actionForKind } from './credit-config'
import { getWallet, releaseCredits, reserveCredits, type Reservation as CreditReservation, type WalletView } from './wallet'

/** Crédits mensuels par défaut (statistiques admin : base du compte gratuit). */
export const ANALYSIS_QUOTA: Record<PlanId, number> = { ...MONTHLY_CREDITS }

const DAY_MS = 86_400_000

export type QuotaStatus = {
  /** Formule propre (base des crédits mensuels). */
  plan: PlanId
  /** Crédits mensuels consommés ou réservés sur la période. */
  used: number
  /** Crédits mensuels de la période. */
  quota: number
  /** Solde A. */
  remaining: number
  /** Fin de la période (prochaine allocation). */
  nextReleaseAt: string | null
}

export function quotaFromWallet(w: WalletView): QuotaStatus {
  return { plan: w.plan, used: Math.min(w.monthlyUsed, w.monthlyQuota), quota: w.monthlyQuota, remaining: w.monthly, nextReleaseAt: w.periodEnd }
}

export async function getQuotaStatus(user: CurrentUser): Promise<QuotaStatus> {
  return quotaFromWallet(await getWallet(user))
}

export type AnalysisReservation =
  | { ok: true; analysis: StoredAnalysis; actionId: string; cost: number; balance: WalletView }
  | Exclude<CreditReservation, { ok: true }>

/**
 * Réserve le coût d'une analyse AVANT l'appel au modèle, puis crée l'analyse « en attente ».
 * Échec de création : réservation restituée. En cas d'échec ultérieur : releaseAnalysis.
 */
export async function reserveAnalysis(user: CurrentUser, meta: { kind: CoachKind; title: string }, key: string): Promise<AnalysisReservation> {
  const id = SUPABASE_ENABLED ? newAnalysisUuid() : undefined
  const r = await reserveCredits(user, actionForKind(meta.kind), key, id)
  if (!r.ok) return r
  try {
    const analysis = await insertPending(user, { ...meta, id })
    return { ok: true, analysis, actionId: r.actionId, cost: r.cost, balance: r.balance }
  } catch (e) {
    await releaseCredits(user, r.actionId, 'failed')
    throw e
  }
}

/** Analyse non aboutie : ligne « en attente » supprimée et crédits restitués (coût de l'appel conservé). */
export async function releaseAnalysis(
  user: CurrentUser,
  analysisId: string,
  actionId: string,
  reason: Parameters<typeof releaseCredits>[2] = 'failed',
  call?: Parameters<typeof releaseCredits>[3],
): Promise<void> {
  await cancelPending(user, analysisId).catch(() => undefined)
  await releaseCredits(user, actionId, reason, call)
}

/** Crédits consommés (actions confirmées) depuis `since` : horodatage et crédits. */
async function consumption(user: CurrentUser, since: Date): Promise<Array<{ at: number; credits: number }>> {
  if (!SUPABASE_ENABLED) return []
  const { data, error } = await aiServiceDb()
    .from('ai_actions')
    .select('credits, reserved_at')
    .eq('user_id', user.id)
    .eq('status', 'succeeded')
    .gt('reserved_at', since.toISOString())
    .order('reserved_at', { ascending: true })
    .limit(2000)
  if (error) throw new Error('ai_actions read failed')
  return ((data ?? []) as Array<{ credits: number; reserved_at: string }>).map((r) => ({ at: Date.parse(r.reserved_at), credits: r.credits }))
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
  // Crédits réellement consommés (ai_actions confirmées) ; le journal reste issu des analyses (titres).
  const usage = await consumption(user, sixCycles)
  const cycles = Array.from({ length: 6 }, (_, i) => {
    const back = 5 - i
    const end = now - back * CYCLE_DAYS * DAY_MS
    const start = end - CYCLE_DAYS * DAY_MS
    return {
      label: back === 0 ? labels.current : labels.cycleN(back),
      startLabel: fmt.short(new Date(start)),
      used: back === 0 ? status.used : usage.filter((u) => u.at > start && u.at <= end).reduce((n, u) => n + u.credits, 0),
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
  /** Crédits achetés (solde B : lots non expirés, expiration la plus proche). */
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
    return { used: 0, total: 0, resetInDays: null, resetDateLabel: null, cycles: [], log: [], live: true, credits }
  }
}
