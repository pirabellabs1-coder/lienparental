// Formatage fr-FR des valeurs du tableau de bord (module pur).
import { DEFAULT_TZ } from '@/lib/tz'
import type { Kpi, KpiUnit } from './types'

const int = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dec1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const fmtInt = (n: number) => int.format(n)
export const fmtEur = (n: number) => (Math.abs(n) >= 1000 ? eur0.format(n) : eur2.format(n))
export const fmtEurExact = (n: number) => eur2.format(n)
export const fmtPct = (n: number) => `${dec1.format(n)} %`

export function fmtStorage(mb: number): string {
  if (mb >= 1024 * 1024) return `${dec1.format(mb / (1024 * 1024))} To`
  if (mb >= 1024) return `${dec1.format(mb / 1024)} Go`
  return `${int.format(mb)} Mo`
}

export function fmtValue(value: number | null, unit: KpiUnit): string {
  if (value == null) return 'Non disponible'
  switch (unit) {
    case 'eur': return fmtEur(value)
    case 'pct': return fmtPct(value)
    case 'mb': return fmtStorage(value)
    default: return fmtInt(value)
  }
}

export type Delta = {
  direction: 'up' | 'down' | 'flat' | 'none'
  /** Texte court affiché : « +12,4 % », « +0,8 pt », « Nouveau ». */
  text: string
  /** Phrase complète pour les lecteurs d'écran et le CSV. */
  sentence: string
  sentiment: 'good' | 'bad' | 'neutral'
}

export function computeDelta(k: Pick<Kpi, 'value' | 'previous' | 'unit' | 'lowerIsBetter' | 'compareLabel'>): Delta {
  const cmp = k.compareLabel ?? 'vs période précédente'
  if (k.value == null || k.previous == null) return { direction: 'none', text: '', sentence: 'Pas de comparaison disponible', sentiment: 'neutral' }
  const diff = k.value - k.previous
  let text: string
  if (k.unit === 'pct') {
    text = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${dec1.format(Math.abs(diff))} pt`
  } else if (k.previous === 0) {
    text = k.value === 0 ? '0 %' : 'Nouveau'
  } else {
    const pct = (diff / Math.abs(k.previous)) * 100
    text = `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${dec1.format(Math.abs(pct))} %`
  }
  const flat = Math.abs(diff) < 1e-9 || (k.previous !== 0 && Math.abs(diff / k.previous) < 0.0005 && k.unit !== 'pct')
  const direction = flat ? 'flat' : diff > 0 ? 'up' : 'down'
  const good = direction === 'flat' ? 'neutral' : (direction === 'up') !== Boolean(k.lowerIsBetter) ? 'good' : 'bad'
  const verb = direction === 'flat' ? 'Stable' : direction === 'up' ? 'En hausse' : 'En baisse'
  const prevText = fmtValue(k.previous, k.unit)
  return {
    direction,
    text: flat ? 'Stable' : text,
    sentence: `${verb}${flat ? '' : ` (${text})`} ${cmp} : ${prevText}`,
    sentiment: good,
  }
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', { timeZone: DEFAULT_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
