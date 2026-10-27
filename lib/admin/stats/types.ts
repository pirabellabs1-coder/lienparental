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
  /** Derniers points de la même mesure (mini-courbe), du plus ancien au plus récent. */
  spark?: number[]
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

// --- Séries temporelles (0450) ------------------------------------------------

/** Actifs du jour (DAU) et sur les 7 jours glissants se terminant ce jour (WAU). */
export type ActiveDay = { day: string; dau: number; wau: number }
/** Abonnés payants en fin de journée, par formule et cycle. */
export type SubsDay = { day: string; premiumMonthly: number; premiumYearly: number; coparentaliteMonthly: number; coparentaliteYearly: number }
export type SubsFlowDay = { day: string; started: number; canceled: number }
export type ActivityDay = { day: string; messages: number; ai: number; documents: number }
export type DeviceKey = 'mobile' | 'ordinateur' | 'tablette' | 'inconnu'
export type DeviceCounts = Record<DeviceKey, number>

export type Trends = {
  activeDaily: ActiveDay[]
  /** DAU de la période précédente (même nombre de jours, aligné par rang). */
  activePrevDaily: DailyPoint[]
  /** Comptes existants en fin de journée. */
  accountsDaily: DailyPoint[]
  subsDaily: SubsDay[]
  /** MRR (€) en fin de journée, dérivé de subsDaily et des prix. */
  mrrDaily: DailyPoint[]
  subsFlowDaily: SubsFlowDay[]
  activityDaily: ActivityDay[]
  /** Sessions ouvertes pendant la période, par type d'appareil. */
  devices: { current: DeviceCounts; previous: DeviceCounts; pwaMeasured: boolean }
}

/** Cohorte hebdomadaire d'inscription : active[k] = membres actifs la k-ième semaine (0 = semaine d'inscription). */
export type Cohort = { week: string; size: number; active: number[] }
/** lastDay : dernier jour mesuré (la dernière semaine est complète si c'est un dimanche). */
export type Cohorts = { currentWeek: string; lastDay?: string; cohorts: Cohort[] }

/** Chiffres du jour (depuis minuit) et d'hier à la même heure. */
export type TodayStats = {
  day: string
  signups: number
  signupsPrev: number
  active: number
  activePrev: number
  messages: number
  messagesPrev: number
  ticketsOpen: number
  ticketsNew: number
}

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
  /** Séries temporelles (null : migration 0450 absente). */
  trends: Trends | null
  cohorts: Cohorts | null
  today: TodayStats | null
  /** Limites de mesure à afficher (ex. visites non instrumentées). */
  notes: string[]
}

export type DashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; error: string }
