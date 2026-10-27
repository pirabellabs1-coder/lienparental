// Calculs partagés par les sources « démo » et « base » : indicateurs,
// alertes, regroupements. Module pur (aucun accès réseau, aucun secret).
import { addDaysToKey, dayKeyToDate, dateToDayKey, fmtDayKey } from '@/lib/tz'
import type {
  DailyPoint,
  DashboardAlert,
  Grain,
  Kpi,
  ModuleActivity,
  ModuleKey,
  Period,
  RevenueMonth,
} from './types'

export type RawOverview = {
  usersTotal: number
  usersTotalPrev: number
  usersNew: number
  usersNewPrev: number
  active7: number
  active7Prev: number
  active30: number
  active30Prev: number
  premiumMonthly: number
  premiumYearly: number
  premiumMonthlyPrev: number
  premiumYearlyPrev: number
  /** Abonnés Coparentalité+ (0380). Comptés à part : jamais inclus dans premium*. */
  coparentaliteMonthly: number
  coparentaliteYearly: number
  coparentaliteMonthlyPrev: number
  coparentaliteYearlyPrev: number
  churn: number
  churnPrev: number
  ai: number
  aiPrev: number
  testimonies: number
  testimoniesPrev: number
  documents: number
  documentsPrev: number
  revenueMonthEur: number
  revenueMonthPrevEur: number
  revenueCumulEur: number
  revenueCumulPrevEur: number
  donationsEur: number
  donationsPrevEur: number
  storageMb: number
  storagePrevMb: number
  ticketsOpen: number
  ticketsOpenPrev: number
}

export type Pricing = {
  /** Premium */
  monthlyEur: number
  yearlyEur: number
  coparentaliteMonthlyEur: number
  coparentaliteYearlyEur: number
  aiCostPerAnalysisEur: number
}

/** Abonnés payants par formule et par cycle. */
export type PaidCounts = { premiumMonthly: number; premiumYearly: number; coparentaliteMonthly: number; coparentaliteYearly: number }

export const round2 = (n: number) => Math.round(n * 100) / 100

/** MRR Premium seul (historique). */
export function mrrEur(monthly: number, yearly: number, p: Pricing): number {
  return round2(monthly * p.monthlyEur + (yearly * p.yearlyEur) / 12)
}

/** MRR toutes formules : mensuels × prix mensuel + annuels × prix annuel / 12, par formule. */
export function mrrAllEur(c: PaidCounts, p: Pricing): number {
  return round2(
    c.premiumMonthly * p.monthlyEur + (c.premiumYearly * p.yearlyEur) / 12
    + c.coparentaliteMonthly * p.coparentaliteMonthlyEur + (c.coparentaliteYearly * p.coparentaliteYearlyEur) / 12,
  )
}

export function paidTotal(c: PaidCounts): number {
  return c.premiumMonthly + c.premiumYearly + c.coparentaliteMonthly + c.coparentaliteYearly
}

const currentCounts = (r: RawOverview): PaidCounts => ({
  premiumMonthly: r.premiumMonthly, premiumYearly: r.premiumYearly,
  coparentaliteMonthly: r.coparentaliteMonthly, coparentaliteYearly: r.coparentaliteYearly,
})
const previousCounts = (r: RawOverview): PaidCounts => ({
  premiumMonthly: r.premiumMonthlyPrev, premiumYearly: r.premiumYearlyPrev,
  coparentaliteMonthly: r.coparentaliteMonthlyPrev, coparentaliteYearly: r.coparentaliteYearlyPrev,
})

function share(part: number, total: number): number | null {
  return total > 0 ? round2((part / total) * 100) : null
}

export function buildKpis(r: RawOverview, p: Pricing, period: Period): Kpi[] {
  const cur = currentCounts(r)
  const prevC = previousCounts(r)
  const paid = paidTotal(cur)
  const paidPrev = paidTotal(prevC)
  const vsPrev = 'vs période précédente'
  return [
    // Audience
    { id: 'inscrits', group: 'audience', label: 'Inscrits (total)', value: r.usersTotal, previous: r.usersTotalPrev, unit: 'count', tone: 'night', compareLabel: 'vs début de période' },
    { id: 'nouveaux', group: 'audience', label: 'Nouveaux inscrits', value: r.usersNew, previous: r.usersNewPrev, unit: 'count', tone: 'leaf', compareLabel: vsPrev },
    { id: 'actifs7', group: 'audience', label: 'Utilisateurs actifs (7 j)', value: r.active7, previous: r.active7Prev, unit: 'count', tone: 'leaf', compareLabel: 'vs 7 j précédents', hint: 'Au moins une action ou une connexion sur les 7 derniers jours de la période.' },
    { id: 'actifs30', group: 'audience', label: 'Utilisateurs actifs (30 j)', value: r.active30, previous: r.active30Prev, unit: 'count', tone: 'leaf', compareLabel: 'vs 30 j précédents' },
    // Revenus
    { id: 'mrr', group: 'revenus', label: 'Revenu mensuel récurrent (MRR)', value: mrrAllEur(cur, p), previous: mrrAllEur(prevC, p), unit: 'eur', tone: 'gold', compareLabel: 'vs début de période', hint: 'Par formule (Premium, Coparentalité+) : abonnés mensuels × prix mensuel + abonnés annuels × prix annuel / 12.' },
    { id: 'revenus-mois', group: 'revenus', label: 'Revenus du mois', value: r.revenueMonthEur, previous: r.revenueMonthPrevEur, unit: 'eur', tone: 'gold', compareLabel: 'vs mois précédent', hint: `Mois de la fin de période (${fmtDayKey(period.toDay, { month: 'long', year: 'numeric' })}), abonnements et dons.` },
    { id: 'revenus-cumules', group: 'revenus', label: 'Revenus cumulés', value: r.revenueCumulEur, previous: r.revenueCumulPrevEur, unit: 'eur', tone: 'gold', compareLabel: 'vs début de période', hint: 'Depuis le lancement, abonnements et dons.' },
    { id: 'dons', group: 'revenus', label: 'Dons', value: r.donationsEur, previous: r.donationsPrevEur, unit: 'eur', tone: 'leaf', compareLabel: vsPrev },
    // Premium
    { id: 'premium-mensuel', group: 'premium', label: 'Premium mensuel', value: r.premiumMonthly, previous: r.premiumMonthlyPrev, unit: 'count', tone: 'gold', compareLabel: 'vs début de période' },
    { id: 'premium-annuel', group: 'premium', label: 'Premium annuel', value: r.premiumYearly, previous: r.premiumYearlyPrev, unit: 'count', tone: 'gold', compareLabel: 'vs début de période' },
    { id: 'coparentalite-mensuel', group: 'premium', label: 'Coparentalité+ mensuel', value: r.coparentaliteMonthly, previous: r.coparentaliteMonthlyPrev, unit: 'count', tone: 'night', compareLabel: 'vs début de période' },
    { id: 'coparentalite-annuel', group: 'premium', label: 'Coparentalité+ annuel', value: r.coparentaliteYearly, previous: r.coparentaliteYearlyPrev, unit: 'count', tone: 'night', compareLabel: 'vs début de période' },
    { id: 'conversion', group: 'premium', label: 'Conversion gratuit → payant', value: share(paid, r.usersTotal), previous: share(paidPrev, r.usersTotalPrev), unit: 'pct', tone: 'gold', compareLabel: 'vs début de période', hint: 'Part des inscrits abonnés à une formule payante (Premium ou Coparentalité+).' },
    { id: 'desabonnements', group: 'premium', label: 'Désabonnements', value: r.churn, previous: r.churnPrev, unit: 'count', tone: 'alert', lowerIsBetter: true, compareLabel: vsPrev },
    // Usage
    { id: 'coach', group: 'usage', label: 'Analyses Coach IA', value: r.ai, previous: r.aiPrev, unit: 'count', tone: 'iris', compareLabel: vsPrev },
    { id: 'coach-cout', group: 'usage', label: 'Coût IA estimé', value: round2(r.ai * p.aiCostPerAnalysisEur), previous: round2(r.aiPrev * p.aiCostPerAnalysisEur), unit: 'eur', tone: 'iris', lowerIsBetter: true, compareLabel: vsPrev, hint: `Estimation : ${String(p.aiCostPerAnalysisEur).replace('.', ',')} € par analyse.` },
    { id: 'stockage', group: 'usage', label: 'Stockage utilisé', value: r.storageMb, previous: r.storagePrevMb, unit: 'mb', tone: 'night', compareLabel: 'vs début de période' },
    { id: 'documents', group: 'usage', label: 'Documents déposés', value: r.documents, previous: r.documentsPrev, unit: 'count', tone: 'night', compareLabel: vsPrev },
    { id: 'temoignages', group: 'usage', label: 'Témoignages reçus', value: r.testimonies, previous: r.testimoniesPrev, unit: 'count', tone: 'iris', compareLabel: vsPrev },
    { id: 'tickets', group: 'usage', label: 'Tickets support ouverts', value: r.ticketsOpen, previous: r.ticketsOpenPrev, unit: 'count', tone: 'alert', lowerIsBetter: true, compareLabel: 'vs début de période' },
  ]
}

// --- Alertes -----------------------------------------------------------------

export type AlertCounters = {
  failedPayments7d: number
  pastDue: number
  stripeUnprocessed: number
  errorsMeasured: boolean
  errors24h: number
  errorsPrev7d: number
  aiFreeAtQuota: number
  aiMonthCount: number
  ticketsUrgent: number
  /** Échecs de paiement remontés directement par Stripe (si configuré). */
  stripeFailedCharges7d?: number | null
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

export function buildAlerts(c: AlertCounters, p: Pricing, aiBudgetEur: number | null): DashboardAlert[] {
  const out: DashboardAlert[] = []
  const failed = Math.max(c.failedPayments7d, c.stripeFailedCharges7d ?? 0)
  if (failed > 0 || c.pastDue > 0) {
    out.push({
      id: 'paiements',
      level: 'critique',
      title: 'Paiements échoués',
      detail: `${plural(failed, 'paiement échoué', 'paiements échoués')} sur 7 jours, ${plural(c.pastDue, 'abonnement', 'abonnements')} en retard de paiement.`,
      href: '/admin/comptes',
      hrefLabel: 'Voir les comptes',
    })
  }
  if (c.stripeUnprocessed > 0) {
    out.push({
      id: 'webhooks',
      level: 'critique',
      title: 'Événements Stripe non traités',
      detail: `${plural(c.stripeUnprocessed, 'événement reçu', 'événements reçus')} depuis plus de 15 minutes sans traitement. Vérifiez les journaux du webhook.`,
      href: '/admin/journaux',
      hrefLabel: 'Voir les journaux',
    })
  }
  if (c.errorsMeasured) {
    const avg = c.errorsPrev7d / 7
    if (c.errors24h >= 10 && c.errors24h > avg * 3) {
      out.push({
        id: 'erreurs',
        level: 'attention',
        title: "Pic d'erreurs serveur",
        detail: `${plural(c.errors24h, 'erreur', 'erreurs')} sur 24 h (moyenne habituelle : ${Math.round(avg).toLocaleString('fr-FR')} par jour).`,
        href: '/admin/journaux',
        hrefLabel: 'Voir les journaux',
      })
    }
  }
  if (aiBudgetEur && aiBudgetEur > 0) {
    const cost = round2(c.aiMonthCount * p.aiCostPerAnalysisEur)
    const ratio = cost / aiBudgetEur
    if (ratio >= 0.8) {
      out.push({
        id: 'budget-ia',
        level: ratio >= 1 ? 'critique' : 'attention',
        title: ratio >= 1 ? 'Budget IA dépassé' : 'Budget IA bientôt atteint',
        detail: `Coût estimé du mois : ${cost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} pour un budget de ${aiBudgetEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} (${Math.round(ratio * 100)} %).`,
        href: '/admin/parametres',
        hrefLabel: 'Régler les quotas',
      })
    }
  }
  if (c.aiFreeAtQuota > 0) {
    out.push({
      id: 'quota-ia',
      level: 'info',
      title: 'Quotas IA atteints',
      detail: `${plural(c.aiFreeAtQuota, 'utilisateur gratuit a', 'utilisateurs gratuits ont')} épuisé leurs analyses Coach IA sur 30 jours : public prioritaire pour Premium.`,
      href: '/admin/parametres',
      hrefLabel: 'Voir les quotas',
    })
  }
  if (c.ticketsUrgent > 0) {
    out.push({
      id: 'tickets',
      level: 'attention',
      title: 'Tickets prioritaires en attente',
      detail: `${plural(c.ticketsUrgent, 'ticket urgent ou prioritaire', 'tickets urgents ou prioritaires')} sans réponse finale.`,
      href: '/admin/support',
      hrefLabel: 'Ouvrir le support',
    })
  }
  const order = { critique: 0, attention: 1, info: 2 } as const
  return out.sort((a, b) => order[a.level] - order[b.level])
}

// --- Séries -----------------------------------------------------------------

/** Complète une série quotidienne (jours sans valeur = 0) sur [fromDay, toDay]. */
export function fillDaily(points: DailyPoint[], fromDay: string, toDay: string): DailyPoint[] {
  const map = new Map(points.map((p) => [p.day, p.value]))
  const out: DailyPoint[] = []
  for (let d = fromDay; d <= toDay; d = addDaysToKey(d, 1)) out.push({ day: d, value: map.get(d) ?? 0 })
  return out
}

/** Lundi de la semaine ISO d'un jour "yyyy-mm-dd". */
export function weekStart(day: string): string {
  const dow = (dayKeyToDate(day).getUTCDay() + 6) % 7 // 0 = lundi
  return addDaysToKey(day, -dow)
}

export type Bucket = { key: string; label: string; longLabel: string; value: number }

/** Regroupe une série quotidienne par jour, semaine (lundi) ou mois. */
export function bucketize(points: DailyPoint[], grain: Grain): Bucket[] {
  const map = new Map<string, number>()
  for (const p of points) {
    const k = bucketKey(p.day, grain)
    map.set(k, (map.get(k) ?? 0) + p.value)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => ({ key, value, ...bucketLabels(key, grain) }))
}

/** Clé de regroupement d'un jour : le jour, le lundi de sa semaine ou son mois. */
export function bucketKey(day: string, grain: Grain): string {
  return grain === 'jour' ? day : grain === 'semaine' ? weekStart(day) : day.slice(0, 7)
}

/** Libellés court (axe) et long (infobulle, tableau) d'une clé de regroupement. */
export function bucketLabels(key: string, grain: Grain): { label: string; longLabel: string } {
  if (grain === 'mois') return { label: fmtDayKey(`${key}-01`, { month: 'short' }), longLabel: fmtDayKey(`${key}-01`, { month: 'long', year: 'numeric' }) }
  if (grain === 'semaine') return { label: fmtDayKey(key, { day: 'numeric', month: 'short' }), longLabel: `Semaine du ${fmtDayKey(key, { day: 'numeric', month: 'long', year: 'numeric' })}` }
  return { label: fmtDayKey(key, { day: 'numeric', month: 'short' }), longLabel: fmtDayKey(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
}

/** Mois "yyyy-mm" de `fromMonth` à `toMonth` inclus, complétés à 0. */
export function fillMonths(rows: RevenueMonth[], fromMonth: string, toMonth: string): RevenueMonth[] {
  const map = new Map(rows.map((r) => [r.month, r]))
  const out: RevenueMonth[] = []
  let m = fromMonth
  for (let guard = 0; m <= toMonth && guard < 40; guard++) {
    out.push(map.get(m) ?? { month: m, subscriptionsEur: 0, donationsEur: 0 })
    const [y, mm] = m.split('-').map(Number)
    m = dateToDayKey(new Date(Date.UTC(y, mm, 1, 12))).slice(0, 7)
  }
  return out
}

/** Premier mois affiché pour les revenus : au moins 12 mois, plus si la période est plus longue. */
export function revenueStartMonth(period: Period): string {
  const toMonth = period.toDay.slice(0, 7)
  const [y, m] = toMonth.split('-').map(Number)
  const twelve = dateToDayKey(new Date(Date.UTC(y, m - 12, 1, 12))).slice(0, 7)
  const fromMonth = period.fromDay.slice(0, 7)
  return fromMonth < twelve ? fromMonth : twelve
}

// --- Libellés ---------------------------------------------------------------

export const MODULES: { key: ModuleKey; label: string; unitLabel: string }[] = [
  { key: 'journal', label: 'Journal', unitLabel: 'entrées créées' },
  { key: 'calendrier', label: 'Calendrier', unitLabel: 'événements créés' },
  { key: 'coffre', label: 'Coffre-fort', unitLabel: 'documents déposés' },
  { key: 'coach', label: 'Coach IA', unitLabel: 'analyses' },
  { key: 'guide', label: 'Guide', unitLabel: 'étapes suivies' },
  { key: 'messages', label: 'Messages', unitLabel: 'messages envoyés' },
]

export function moduleRows(values: Record<ModuleKey, [number, number]>): ModuleActivity[] {
  return MODULES.map((m) => ({ module: m.key, label: m.label, unitLabel: m.unitLabel, current: values[m.key][0], previous: values[m.key][1] }))
}

const TERRITORY_LABELS: Record<string, string> = {
  guyane: 'Guyane',
  martinique: 'Martinique',
  guadeloupe: 'Guadeloupe',
  reunion: 'La Réunion',
  mayotte: 'Mayotte',
  france: 'France hexagonale',
}

export function territoryLabel(code: string | null): string {
  if (!code) return 'Non renseigné'
  return TERRITORY_LABELS[code] ?? code.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Titre lisible d'un slug quand le contenu n'est pas trouvé. */
export function humanizeSlug(slug: string): string {
  const s = slug.replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
