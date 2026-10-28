/**
 * Écrans « Utilisation » du Coach en DÉMONSTRATION (sans Supabase) : module pur, testable.
 *
 * Source unique avec le Profil de démonstration (components/profil/data → `usage[plan]`) :
 * le compte gratuit affiche partout 1 / 3, le compte Premium 7 / 10 (au lieu d'un 7 / 10 figé
 * sur l'écran Utilisation quelle que soit la formule). Dates formatées dans la langue de
 * l'utilisateur (intlLocale, fuseau Guyane) : plus de « 09 novembre 2026 » en anglais.
 */
import { usage as demoProfileUsage } from '@/components/profil/data'
import type { PlanId } from '@/components/profil/pricing'
import { intlLocale, type Locale } from '@/lib/i18n/config'
import { mockCoachLog, mockCoachUsage } from '@/lib/mock-data'

const TZ = 'America/Cayenne'
const DAY_MS = 86_400_000
const COACH_CYCLE_DAYS = 30
const COACH_RESET_IN_DAYS = mockCoachUsage.resetInDays
/** Consommation des cycles précédents (exemple) ; le cycle actuel vaut le compteur du profil. */
const PAST_CYCLES = [9, 4, 7, 6, 5]

export type DemoUsageLabels = { current: string; cycleN: (n: number) => string }

export type DemoCoachUsage = {
  used: number
  total: number
  resetInDays: number
  resetDateLabel: string
  cycles: Array<{ label: string; startLabel: string; used: number; current: boolean }>
  log: Array<{ id: string; title: string; dateLabel: string; status: 'Terminée' }>
}

export function demoCoachUsage(plan: PlanId, locale: Locale, labels: DemoUsageLabels, now = Date.now()): DemoCoachUsage {
  const u = demoProfileUsage[plan] ?? demoProfileUsage.gratuit
  const total = u.coachMax
  const used = Math.min(u.coachUsed, total)
  const intl = intlLocale(locale)
  const long = new Intl.DateTimeFormat(intl, { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' })
  const short = new Intl.DateTimeFormat(intl, { timeZone: TZ, day: '2-digit', month: 'short' })
  const day = new Intl.DateTimeFormat(intl, { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
  const time = new Intl.DateTimeFormat(intl, { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const reset = now + COACH_RESET_IN_DAYS * DAY_MS
  const values = [...PAST_CYCLES.map((v) => Math.min(v, total)), used]
  const cycles = values.map((v, i) => {
    const back = values.length - 1 - i
    const start = reset - COACH_CYCLE_DAYS * DAY_MS * (back + 1)
    return { label: back === 0 ? labels.current : labels.cycleN(back), startLabel: short.format(new Date(start)).replace('.', ''), used: v, current: back === 0 }
  })
  // Journal : autant d'entrées que d'analyses décomptées, datées des derniers jours.
  const log = mockCoachLog.slice(0, used).map((l, i) => {
    const d = new Date(now - (i + 1) * 1.5 * DAY_MS)
    return { id: l.id, title: l.title, dateLabel: `${day.format(d)} • ${time.format(d)}`, status: 'Terminée' as const }
  })
  return { used, total, resetInDays: COACH_RESET_IN_DAYS, resetDateLabel: long.format(new Date(reset)), cycles, log }
}
