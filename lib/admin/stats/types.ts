// Types du tableau de bord administrateur (chantier F).
// Module pur : importable côté serveur comme côté client (aucun secret).

export type PeriodKey = '7j' | '30j' | '90j' | '12m' | 'perso'
export type Grain = 'jour' | 'semaine' | 'mois'

export type Period = {
  key: PeriodKey
  /** Jours inclusifs "yyyy-mm-dd" dans le fuseau de l'application. */
  fromDay: string
  toDay: string
  prevFromDay: string
  prevToDay: string
  days: number
  /** Bornes ISO UTC : [from, to[ et [prevFrom, from[. */
  from: string
  to: string
  prevFrom: string
  label: string
  prevLabel: string
  grain: Grain
}

export type KpiUnit = 'count' | 'eur' | 'pct' | 'mb'
export type KpiTone = 'leaf' | 'gold' | 'iris' | 'night' | 'alert'
export type KpiGroup = 'audience' | 'revenus' | 'premium' | 'usage'

export type Kpi = {
  id: string
  group: KpiGroup
  label: string
  value: number | null
  previous: number | null
  unit: KpiUnit
  tone: KpiTone
  /** Une baisse est une bonne nouvelle (désabonnements, coût, tickets). */
  lowerIsBetter?: boolean
  /** Comparaison propre à l'indicateur (ex. « vs 7 j précédents »). */
  compareLabel?: string
  hint?: string
}

export type DailyPoint = { day: string; value: number }
export type RevenueMonth = { month: string; subscriptionsEur: number; donationsEur: number }
/** Répartition des comptes. monthly / yearly = Premium (historique). */
export type PlanSplit = { free: number; monthly: number; yearly: number; coparentaliteMonthly: number; coparentaliteYearly: number }
export type ModuleKey = 'journal' | 'calendrier' | 'coffre' | 'coach' | 'guide' | 'messages'
export type ModuleActivity = { module: ModuleKey; label: string; unitLabel: string; current: number; previous: number }
export type GuideTop = { slug: string; territoire: string; title: string; count: number }
export type FunnelStep = { id: 'visite' | 'compte' | 'enfant' | 'premium'; label: string; count: number | null }
export type TerritoryShare = { code: string | null; label: string; users: number }

export type RecentSignup = {
  id: string
  displayName: string
  createdAt: string
  plan: 'gratuit' | 'premium' | 'coparentalite'
  hasChild: boolean
}

export type RecentPayment = {
  id: string
  displayName: string
  amountEur: number
  kind: 'abonnement' | 'don'
  label: string
  status: 'reussi' | 'echoue' | 'en_cours' | 'rembourse'
  createdAt: string
}

export type AlertLevel = 'critique' | 'attention' | 'info'
export type DashboardAlert = {
  id: string
  level: AlertLevel
  title: string
  detail: string
  href?: string
  hrefLabel?: string
}

export type DataSource = 'demo' | 'base' | 'base+stripe'

export type DashboardData = {
  source: DataSource
  generatedAt: string
  period: Period
  kpis: Kpi[]
  signupsDaily: DailyPoint[]
  revenueMonthly: RevenueMonth[]
  plans: PlanSplit
  modules: ModuleActivity[]
  guide: { basis: 'consultations' | 'suivis'; items: GuideTop[] }
  funnel: FunnelStep[]
  territories: TerritoryShare[]
  recentSignups: RecentSignup[]
  recentPayments: RecentPayment[]
  alerts: DashboardAlert[]
  /** Limites de mesure à afficher (ex. visites non instrumentées). */
  notes: string[]
}

export type DashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; error: string }
