// Jeu de données de démonstration du tableau de bord.
// Déterministe (même date = mêmes chiffres) et cohérent : une seule
// simulation quotidienne depuis le lancement alimente indicateurs,
// graphiques et listes. Aucune personne réelle : prénoms fictifs.
import { addDaysToKey, dayKeyToDate, todayKey, wallTimeToIso } from '@/lib/tz'
import {
  buildAlerts,
  buildKpis,
  fillMonths,
  moduleRows,
  paidTotal,
  revenueStartMonth,
  round2,
  territoryLabel,
  type Pricing,
  type RawOverview,
} from './compute'
import type { DashboardData, GuideTop, ModuleKey, Period, RecentPayment, RecentSignup, RevenueMonth } from './types'

const LAUNCH = '2025-01-06'
const DAY_MS = 86_400_000

/** Pseudo-aléatoire stable dans [0, 1[ (mulberry32 sur une graine entière). */
function rnd(i: number, salt: number): number {
  let t = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0
  t = (t + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const WEEKDAY = [0.65, 1.2, 1.15, 1.1, 1.05, 0.95, 0.75] // dimanche → samedi

type Day = {
  day: string
  signups: number
  total: number
  visits: number
  withChild: number
  cohortPremium: number
  activeM: number
  activeY: number
  churn: number
  subsEur: number
  donEur: number
  ai: number
  documents: number
  docsCumul: number
  testimonies: number
  journal: number
  calendrier: number
  guide: number
  messages: number
}

let cache: { today: string; days: Day[] } | null = null

function simulate(today: string): Day[] {
  if (cache?.today === today) return cache.days
  const days: Day[] = []
  const yearlyBuys: number[] = []
  let total = 0
  let activeM = 0
  let activeY = 0
  let docsCumul = 0
  const acc = { m: 0, y: 0, cm: 0, cy: 0, t: 0, pc: 0 }
  for (let i = 0, d = LAUNCH; d <= today; i++, d = addDaysToKey(d, 1)) {
    const wd = WEEKDAY[dayKeyToDate(d).getUTCDay()]
    const g = Math.min(1.3, 0.3 + i / 480)
    const noise = (s: number) => 0.7 + 0.6 * rnd(i, s)
    const signups = Math.round(6 * g * wd * (0.75 + 0.5 * rnd(i, 1)))
    total += signups
    const free = total - activeM - activeY
    const newPrem = signups * 0.045 + free * 0.00028
    acc.m += newPrem * 0.68 * noise(2)
    acc.y += newPrem * 0.32 * noise(3)
    const nM = Math.floor(acc.m)
    const nY = Math.floor(acc.y)
    acc.m -= nM
    acc.y -= nY
    acc.cm += activeM * 0.0011 * noise(4)
    acc.cy += activeY * 0.00025 * noise(5)
    const cM = Math.floor(acc.cm)
    const cY = Math.floor(acc.cy)
    acc.cm -= cM
    acc.cy -= cY
    activeM = Math.max(0, activeM + nM - cM)
    activeY = Math.max(0, activeY + nY - cY)
    yearlyBuys.push(nY)
    const renewals = i >= 365 ? Math.round(yearlyBuys[i - 365] * 0.82) : 0
    const subsEur = round2((activeM * 11.99) / 30.4 + (nY + renewals) * 99)
    const donEur = rnd(i, 6) < 0.2 ? [5, 10, 10, 15, 20, 30, 50][Math.floor(rnd(i, 7) * 7)] : 0
    const prem = activeM + activeY
    const ai = Math.round((prem * 0.09 + free * 0.0045) * wd * noise(8))
    const documents = Math.round(total * 0.0055 * wd * noise(9))
    docsCumul += documents
    acc.t += total * 0.0005 * noise(10)
    const testimonies = Math.floor(acc.t)
    acc.t -= testimonies
    acc.pc += signups * 0.075 * noise(11)
    const cohortPremium = Math.floor(acc.pc)
    acc.pc -= cohortPremium
    days.push({
      day: d,
      signups,
      total,
      visits: Math.round(signups * (5.5 + 2.5 * rnd(i, 12)) + 40 * g * wd),
      withChild: Math.round(signups * (0.66 + 0.1 * rnd(i, 13))),
      cohortPremium: Math.min(cohortPremium, signups),
      activeM,
      activeY,
      churn: cM + cY,
      subsEur,
      donEur,
      ai,
      documents,
      docsCumul,
      testimonies,
      journal: Math.round(total * 0.018 * wd * noise(14)),
      calendrier: Math.round(total * 0.011 * wd * noise(15)),
      guide: Math.round(total * 0.014 * wd * noise(16)),
      messages: Math.round(total * 0.026 * wd * noise(17)),
    })
  }
  cache = { today, days }
  return days
}

function indexOf(days: Day[], day: string): number {
  return Math.round((dayKeyToDate(day).getTime() - dayKeyToDate(LAUNCH).getTime()) / DAY_MS)
}

/** Ligne du jour (ou du dernier jour connu) ; null avant le lancement. */
function at(days: Day[], day: string): Day | null {
  const i = Math.min(indexOf(days, day), days.length - 1)
  return i >= 0 ? days[i] : null
}

function range(days: Day[], fromDay: string, toDay: string): Day[] {
  const a = Math.max(0, indexOf(days, fromDay))
  const b = Math.min(days.length - 1, indexOf(days, toDay))
  return a <= b ? days.slice(a, b + 1) : []
}

const sum = (rows: Day[], k: keyof Omit<Day, 'day'>) => rows.reduce((s, r) => s + r[k], 0)

function activeAt(days: Day[], day: string, window: 7 | 30): number {
  const row = at(days, day)
  if (!row) return 0
  const i = indexOf(days, day)
  const ratio = window === 7 ? 0.23 + 0.02 * Math.sin(i / 11) : 0.41 + 0.03 * Math.sin(i / 23)
  return Math.round(row.total * ratio)
}

const storageMb = (row: Day | null) => (row ? Math.round(row.docsCumul * 2.4 + row.total * 12) : 0)

const FIRST_NAMES = ['Camille', 'Nassim', 'Sofia', 'Thomas', 'Léa', 'Hugo', 'Yasmine', 'Paul', 'Inès', 'Antoine', 'Claire', 'Mehdi', 'Maëva', 'Kévin', 'Océane', 'Jordan', 'Naïma', 'Loïc', 'Sarah', 'Dylan']
const INITIALS = 'ABCDEFGHJKLMNPRSTV'

function fakeName(seed: number): string {
  return `${FIRST_NAMES[Math.floor(rnd(seed, 30) * FIRST_NAMES.length)]} ${INITIALS[Math.floor(rnd(seed, 31) * INITIALS.length)]}.`
}

const GUIDE_DEMO: { slug: string; title: string; w: number }[] = [
  { slug: 'pension-alimentaire-aripa', title: 'Pension alimentaire : l’ARIPA', w: 1 },
  { slug: 'saisir-juge-affaires-familiales', title: 'Saisir le juge aux affaires familiales', w: 0.86 },
  { slug: 'declarer-separation-caf', title: 'Déclarer sa séparation à la CAF', w: 0.74 },
  { slug: 'allocation-soutien-familial', title: 'Allocation de soutien familial', w: 0.61 },
  { slug: 'mediation-familiale', title: 'La médiation familiale', w: 0.52 },
  { slug: 'inscrire-enfant-ecole', title: 'Inscrire son enfant à l’école', w: 0.47 },
  { slug: 'allocation-rentree-scolaire', title: 'Allocation de rentrée scolaire', w: 0.41 },
  { slug: 'aides-logement-guyane', title: 'Aides au logement en Guyane', w: 0.33 },
]

export function demoDashboard(period: Period, pricing: Pricing, aiBudgetEur: number | null, now: Date = new Date()): DashboardData {
  const today = todayKey(undefined, now)
  const days = simulate(today)
  const cur = range(days, period.fromDay, period.toDay)
  const prev = range(days, period.prevFromDay, period.prevToDay)
  const end = at(days, period.toDay)
  const startRef = at(days, period.prevToDay) // état juste avant la période
  const monthKey = period.toDay.slice(0, 7)
  const monthRows = days.filter((d) => d.day.startsWith(monthKey) && d.day <= period.toDay)
  const [y, m] = monthKey.split('-').map(Number)
  const prevMonthKey = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
  const prevMonthRows = days.filter((d) => d.day.startsWith(prevMonthKey))
  const revenue = (rows: Day[]) => round2(sum(rows, 'subsEur') + sum(rows, 'donEur'))
  const ticketsAt = (day: string) => 5 + Math.round(5 * rnd(indexOf(days, day), 20))

  const copaShare = (n: number | undefined) => Math.round((n ?? 0) * 0.2)
  const raw: RawOverview = {
    usersTotal: end?.total ?? 0,
    usersTotalPrev: startRef?.total ?? 0,
    usersNew: sum(cur, 'signups'),
    usersNewPrev: sum(prev, 'signups'),
    active7: activeAt(days, period.toDay, 7),
    active7Prev: activeAt(days, addDaysToKey(period.toDay, -7), 7),
    active30: activeAt(days, period.toDay, 30),
    active30Prev: activeAt(days, addDaysToKey(period.toDay, -30), 30),
    // Démonstration : ~20 % des abonnés payants en Coparentalité+.
    premiumMonthly: (end?.activeM ?? 0) - copaShare(end?.activeM),
    premiumYearly: (end?.activeY ?? 0) - copaShare(end?.activeY),
    premiumMonthlyPrev: (startRef?.activeM ?? 0) - copaShare(startRef?.activeM),
    premiumYearlyPrev: (startRef?.activeY ?? 0) - copaShare(startRef?.activeY),
    coparentaliteMonthly: copaShare(end?.activeM),
    coparentaliteYearly: copaShare(end?.activeY),
    coparentaliteMonthlyPrev: copaShare(startRef?.activeM),
    coparentaliteYearlyPrev: copaShare(startRef?.activeY),
    churn: sum(cur, 'churn'),
    churnPrev: sum(prev, 'churn'),
    ai: sum(cur, 'ai'),
    aiPrev: sum(prev, 'ai'),
    testimonies: sum(cur, 'testimonies'),
    testimoniesPrev: sum(prev, 'testimonies'),
    documents: sum(cur, 'documents'),
    documentsPrev: sum(prev, 'documents'),
    revenueMonthEur: revenue(monthRows),
    revenueMonthPrevEur: revenue(prevMonthRows),
    revenueCumulEur: revenue(range(days, LAUNCH, period.toDay)),
    revenueCumulPrevEur: revenue(range(days, LAUNCH, period.prevToDay)),
    donationsEur: round2(sum(cur, 'donEur')),
    donationsPrevEur: round2(sum(prev, 'donEur')),
    storageMb: storageMb(end),
    storagePrevMb: storageMb(startRef),
    ticketsOpen: ticketsAt(period.toDay),
    ticketsOpenPrev: ticketsAt(period.prevToDay),
  }

  // Revenus mensuels
  const byMonth = new Map<string, RevenueMonth>()
  for (const d of days) {
    if (d.day > period.toDay) break
    const k = d.day.slice(0, 7)
    const r = byMonth.get(k) ?? { month: k, subscriptionsEur: 0, donationsEur: 0 }
    r.subscriptionsEur = round2(r.subscriptionsEur + d.subsEur)
    r.donationsEur = round2(r.donationsEur + d.donEur)
    byMonth.set(k, r)
  }
  const revenueMonthly = fillMonths([...byMonth.values()], revenueStartMonth(period), monthKey)

  const modSum = (k: ModuleKey): [number, number] => {
    const key = k === 'coach' ? 'ai' : k === 'coffre' ? 'documents' : k
    return [sum(cur, key), sum(prev, key)]
  }

  const guideTotal = sum(cur, 'guide') * 2.3
  const guideItems: GuideTop[] = GUIDE_DEMO.map((g, i) => ({
    slug: g.slug,
    territoire: 'guyane',
    title: g.title,
    count: Math.round(guideTotal * 0.12 * g.w * (0.9 + 0.2 * rnd(indexOf(days, period.toDay), 40 + i))),
  })).sort((a, b) => b.count - a.count)

  const total = raw.usersTotal
  const terr: [string | null, number][] = [['guyane', 0.82], ['france', 0.08], ['martinique', 0.05], ['guadeloupe', 0.03], [null, 0.02]]
  let assigned = 0
  const territories = terr.map(([code, w], i) => {
    const users = i === terr.length - 1 ? Math.max(0, total - assigned) : Math.round(total * w)
    assigned += users
    return { code, label: territoryLabel(code), users }
  })

  // Listes récentes (toujours relatives à aujourd'hui).
  const recentSignups: RecentSignup[] = Array.from({ length: 8 }, (_, k) => {
    const day = addDaysToKey(today, -Math.floor(k / 3))
    const hh = 21 - ((k * 5) % 13)
    const seed = indexOf(days, day) * 10 + k
    return {
      id: `demo-u-${seed}`,
      displayName: fakeName(seed),
      createdAt: wallTimeToIso(day, `${String(hh).padStart(2, '0')}:${String((k * 17) % 60).padStart(2, '0')}`),
      plan: rnd(seed, 32) < 0.03 ? 'coparentalite' : rnd(seed, 32) < 0.12 ? 'premium' : 'gratuit',
      hasChild: rnd(seed, 33) < 0.7,
    }
  })
  const recentPayments: RecentPayment[] = Array.from({ length: 8 }, (_, k) => {
    const day = addDaysToKey(today, -Math.floor(k / 2))
    const seed = indexOf(days, day) * 10 + k + 5
    const r = rnd(seed, 34)
    const kind = r < 0.2 ? 'don' : 'abonnement'
    const yearly = kind === 'abonnement' && rnd(seed, 35) < 0.3
    const copa = kind === 'abonnement' && rnd(seed, 38) < 0.2
    const failed = k === 2 || k === 6
    return {
      id: `demo-p-${seed}`,
      displayName: kind === 'don' && rnd(seed, 36) < 0.5 ? 'Don anonyme' : fakeName(seed),
      amountEur: kind === 'don'
        ? [10, 20, 30][Math.floor(rnd(seed, 37) * 3)]
        : copa ? (yearly ? pricing.coparentaliteYearlyEur : pricing.coparentaliteMonthlyEur)
        : yearly ? pricing.yearlyEur : pricing.monthlyEur,
      kind,
      label: kind === 'don' ? 'Don' : `${copa ? 'Coparentalité+' : 'Premium'} ${yearly ? 'annuel' : 'mensuel'}`,
      status: failed && kind === 'abonnement' ? 'echoue' : 'reussi',
      createdAt: wallTimeToIso(day, `${String(19 - k).padStart(2, '0')}:${String((k * 23) % 60).padStart(2, '0')}`),
    }
  })

  const todayRow = at(days, today)
  const monthAi = sum(days.filter((d) => d.day.startsWith(today.slice(0, 7))), 'ai')
  const alerts = buildAlerts(
    {
      failedPayments7d: 2,
      pastDue: 3,
      stripeUnprocessed: 0,
      errorsMeasured: true,
      errors24h: 41,
      errorsPrev7d: 63,
      aiFreeAtQuota: todayRow ? Math.round((todayRow.total - todayRow.activeM - todayRow.activeY) * 0.014) : 0,
      aiMonthCount: monthAi,
      ticketsUrgent: 2,
    },
    pricing,
    aiBudgetEur ?? 80,
  )

  return {
    source: 'demo',
    generatedAt: now.toISOString(),
    period,
    kpis: buildKpis(raw, pricing, period),
    signupsDaily: cur.map((d) => ({ day: d.day, value: d.signups })),
    revenueMonthly,
    plans: {
      free: Math.max(0, total - paidTotal(raw)),
      monthly: raw.premiumMonthly,
      yearly: raw.premiumYearly,
      coparentaliteMonthly: raw.coparentaliteMonthly,
      coparentaliteYearly: raw.coparentaliteYearly,
    },
    modules: moduleRows({
      journal: modSum('journal'),
      calendrier: modSum('calendrier'),
      coffre: modSum('coffre'),
      coach: modSum('coach'),
      guide: modSum('guide'),
      messages: modSum('messages'),
    }),
    guide: { basis: 'consultations', items: guideItems },
    funnel: [
      { id: 'visite', label: 'Visites', count: sum(cur, 'visits') },
      { id: 'compte', label: 'Comptes créés', count: sum(cur, 'signups') },
      { id: 'enfant', label: 'Enfant ajouté', count: sum(cur, 'withChild') },
      { id: 'premium', label: 'Passage à une offre payante', count: sum(cur, 'cohortPremium') },
    ],
    territories,
    recentSignups,
    recentPayments,
    alerts,
    notes: [],
  }
}
