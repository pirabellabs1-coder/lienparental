// Export CSV du tableau de bord (séparateur « ; », UTF-8 avec BOM pour Excel).
// Uniquement des agrégats : aucune donnée nominative (les listes
// « dernières inscriptions / derniers paiements » ne sont pas exportées).
import { bucketize, fillDaily } from './compute'
import type { DashboardData } from './types'

/** Échappe une cellule et neutralise l'injection de formules (=, +, -, @, tabulation). */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return ''
  let s = typeof v === 'number' ? String(v).replace('.', ',') : v
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const line = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(';')

const SOURCE_LABEL = { demo: 'Données de démonstration', base: 'Base de données', 'base+stripe': 'Base de données et Stripe' } as const

export function dashboardCsv(d: DashboardData): string {
  const out: string[] = []
  const blank = () => out.push('')
  out.push(line(['Lien Parental - Tableau de bord administrateur']))
  out.push(line(['Période', d.period.label]))
  out.push(line(['Période précédente', d.period.prevLabel]))
  out.push(line(['Source', SOURCE_LABEL[d.source]]))
  out.push(line(['Généré le', d.generatedAt]))
  blank()

  out.push(line(['Indicateurs']))
  out.push(line(['Indicateur', 'Unité', 'Valeur', 'Valeur de comparaison', 'Variation (% ou points pour un taux)', 'Comparaison']))
  const unit = { count: 'nombre', eur: 'EUR', pct: '%', mb: 'Mo' } as const
  for (const k of d.kpis) {
    let variation: number | null = null
    if (k.value != null && k.previous != null) {
      if (k.unit === 'pct') variation = Math.round((k.value - k.previous) * 10) / 10
      else if (k.previous !== 0) variation = Math.round(((k.value - k.previous) / Math.abs(k.previous)) * 1000) / 10
    }
    out.push(line([k.label, unit[k.unit], k.value, k.previous, variation, k.compareLabel ?? '']))
  }
  blank()

  out.push(line(['Inscriptions par jour']))
  out.push(line(['Jour', 'Inscriptions']))
  for (const p of fillDaily(d.signupsDaily, d.period.fromDay, d.period.toDay)) out.push(line([p.day, p.value]))
  blank()

  out.push(line(['Inscriptions par semaine (lundi)']))
  out.push(line(['Semaine', 'Inscriptions']))
  for (const b of bucketize(fillDaily(d.signupsDaily, d.period.fromDay, d.period.toDay), 'semaine')) out.push(line([b.key, b.value]))
  blank()

  out.push(line(['Revenus par mois']))
  out.push(line(['Mois', 'Abonnements (EUR)', 'Dons (EUR)', 'Total (EUR)']))
  for (const r of d.revenueMonthly) out.push(line([r.month, r.subscriptionsEur, r.donationsEur, Math.round((r.subscriptionsEur + r.donationsEur) * 100) / 100]))
  blank()

  out.push(line(['Répartition des formules']))
  out.push(line(['Formule', 'Utilisateurs']))
  out.push(line(['Gratuit', d.plans.free]))
  out.push(line(['Premium mensuel', d.plans.monthly]))
  out.push(line(['Premium annuel', d.plans.yearly]))
  out.push(line(['Coparentalité+ mensuel', d.plans.coparentaliteMonthly]))
  out.push(line(['Coparentalité+ annuel', d.plans.coparentaliteYearly]))
  blank()

  out.push(line(['Activité par module']))
  out.push(line(['Module', 'Mesure', 'Période', 'Période précédente']))
  for (const m of d.modules) out.push(line([m.label, m.unitLabel, m.current, m.previous]))
  blank()

  out.push(line([d.guide.basis === 'consultations' ? 'Fiches du Guide les plus consultées' : 'Fiches du Guide les plus suivies']))
  out.push(line(['Fiche', 'Territoire', d.guide.basis === 'consultations' ? 'Consultations' : 'Utilisateurs']))
  for (const g of d.guide.items) out.push(line([g.title, g.territoire, g.count]))
  blank()

  out.push(line(["Entonnoir d'inscription"]))
  out.push(line(['Étape', 'Nombre']))
  for (const s of d.funnel) out.push(line([s.label, s.count ?? 'non mesuré']))
  blank()

  out.push(line(['Répartition par territoire']))
  out.push(line(['Territoire', 'Utilisateurs']))
  for (const t of d.territories) out.push(line([t.label, t.users]))

  return '﻿' + out.join('\r\n') + '\r\n'
}
