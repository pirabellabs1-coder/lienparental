// Contenu du tableau de bord (Server Component) : alertes, bandeau du jour,
// indicateurs, graphiques regroupés par thème, listes récentes.
// Reçoit des données déjà agrégées et minimisées.
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { fmtDayKey } from '@/lib/tz'
import { fmtEur, fmtEurExact, fmtInt, fmtDateTime } from '@/lib/admin/stats/format'
import { round2 } from '@/lib/admin/stats/compute'
import type { DashboardData } from '@/lib/admin/stats/types'
import { ChartCard } from './ChartCard'
import { ColumnChart, Donut, Funnel, HBarList, Legend } from './charts'
import { KpiGrid } from './KpiGrid'
import { RecentPayments, RecentSignups } from './RecentLists'
import { SignupsChart } from './SignupsChart'
import { TodayStrip } from './TodayStrip'
import {
  AccountsCard,
  ActiveUsersCard,
  ActivityCard,
  ChurnCard,
  CohortCard,
  DevicesCard,
  MrrCard,
  SubsFlowCard,
  SubscribersCard,
} from './TrendCards'

const pct = (part: number, total: number) => (total > 0 ? `${((part / total) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '0 %')
const eurAxis = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${fmtInt(n)} €`)

const SECTIONS = [
  { id: 'audience', title: 'Audience' },
  { id: 'abonnements', title: 'Abonnements et revenus' },
  { id: 'usage', title: 'Usage' },
  { id: 'retention', title: 'Rétention' },
  { id: 'recent', title: 'Territoires et activité récente' },
] as const

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-6 space-y-4">
      <h2 id={`${id}-titre`} className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-night-600">
        {title}
        <span className="h-px flex-1 bg-night-100" aria-hidden="true" />
      </h2>
      {children}
    </section>
  )
}

/** Remplace un graphique dont la source n'est pas disponible (jamais de chiffre inventé). */
function Unavailable({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`rounded-xl2 border border-dashed border-night-200 bg-white px-5 py-6 ${className ?? ''}`}>
      <h3 className="font-display text-lg font-semibold text-night-900">{title}</h3>
      <p className="mt-1 text-sm text-night-600">Données indisponibles pour ce graphique : la raison est indiquée dans les notes en bas de page.</p>
    </div>
  )
}

export function Dashboard({ data }: { data: DashboardData }) {
  const { period, trends } = data
  const inPeriod = period.label
  const kpiPrev = (id: string) => data.kpis.find((k) => k.id === id)?.previous ?? 0
  const subsStart = kpiPrev('premium-mensuel') + kpiPrev('premium-annuel') + kpiPrev('coparentalite-mensuel') + kpiPrev('coparentalite-annuel')

  // Revenus
  const rev = data.revenueMonthly
  const revSubs = round2(rev.reduce((s, r) => s + r.subscriptionsEur, 0))
  const revDons = round2(rev.reduce((s, r) => s + r.donationsEur, 0))
  const revFirst = rev[0]?.month
  const revLast = rev[rev.length - 1]?.month
  const revRange = revFirst && revLast
    ? `de ${fmtDayKey(`${revFirst}-01`, { month: 'long', year: 'numeric' })} à ${fmtDayKey(`${revLast}-01`, { month: 'long', year: 'numeric' })}`
    : ''
  const revBest = rev.reduce<(typeof rev)[number] | null>((b, r) => (!b || r.subscriptionsEur + r.donationsEur > b.subscriptionsEur + b.donationsEur ? r : b), null)
  const revDesc = revSubs + revDons === 0
    ? `Aucun revenu ${revRange}.`
    : `${fmtEur(revSubs + revDons)} encaissés ${revRange} : ${fmtEur(revSubs)} d’abonnements et ${fmtEur(revDons)} de dons. Meilleur mois : ${revBest ? fmtDayKey(`${revBest.month}-01`, { month: 'long', year: 'numeric' }) : ''}.`

  // Formules
  const pl = data.plans
  const plansTotal = pl.free + pl.monthly + pl.yearly + pl.coparentaliteMonthly + pl.coparentaliteYearly
  const paidTotal = plansTotal - pl.free
  const planParts = [
    { label: 'Gratuit', value: pl.free, color: 'slate' as const },
    { label: 'Premium mensuel', value: pl.monthly, color: 'gold' as const },
    { label: 'Premium annuel', value: pl.yearly, color: 'goldDark' as const },
    { label: 'Coparentalité+ mensuel', value: pl.coparentaliteMonthly, color: 'night' as const },
    { label: 'Coparentalité+ annuel', value: pl.coparentaliteYearly, color: 'leaf' as const },
  ]
  const plansDesc = `${fmtInt(plansTotal)} comptes : ${planParts.map(p => `${fmtInt(p.value)} en ${p.label} (${pct(p.value, plansTotal)})`).join(', ')}.`

  // Modules
  const modTop = [...data.modules].sort((a, b) => b.current - a.current)[0]
  const modDesc = modTop && modTop.current > 0
    ? `Actions enregistrées ${inPeriod}, par module. Le plus utilisé : ${modTop.label} (${fmtInt(modTop.current)} ${modTop.unitLabel}).`
    : `Aucune activité enregistrée ${inPeriod}.`

  // Guide
  const guideWord = data.guide.basis === 'consultations' ? 'consultations' : 'utilisateurs'
  const guideTop = data.guide.items[0]
  const guideDesc = guideTop
    ? `${data.guide.basis === 'consultations' ? 'Fiches les plus consultées' : 'Fiches les plus suivies (progression)'} ${inPeriod}. En tête : « ${guideTop.title} » (${fmtInt(guideTop.count)} ${guideWord}).`
    : `Aucune consultation de fiche ${inPeriod}.`

  // Entonnoir
  const [visite, compte, enfant, premium] = data.funnel
  const funnelDesc = compte.count
    ? `Parcours des personnes inscrites ${inPeriod} : ${visite.count != null ? `${fmtInt(visite.count)} visites, ` : ''}${fmtInt(compte.count)} comptes, ${fmtInt(enfant.count ?? 0)} avec un enfant ajouté (${pct(enfant.count ?? 0, compte.count)}), ${fmtInt(premium.count ?? 0)} passés à une offre payante (${pct(premium.count ?? 0, compte.count)}).`
    : `Aucune inscription ${inPeriod}.`

  // Territoires
  const terrTotal = data.territories.reduce((s, t) => s + t.users, 0)
  const terrTop = data.territories[0]
  const terrDesc = terrTop
    ? `Territoire principal des ${fmtInt(terrTotal)} comptes, d’après leur usage du Guide. ${terrTop.label} : ${pct(terrTop.users, terrTotal)}.`
    : 'Aucun compte.'

  return (
    <div className="space-y-8">
      <TodayStrip today={data.today} />

      <KpiGrid kpis={data.kpis} />

      <nav aria-label="Sections des graphiques" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full border border-night-200 bg-white px-4 text-sm font-semibold text-night-800 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
            {s.title}
          </a>
        ))}
      </nav>

      <Section id="audience" title="Audience">
        <div className="grid gap-4 xl:grid-cols-3">
          {trends ? <ActiveUsersCard className="xl:col-span-2" trends={trends} period={period} /> : <Unavailable className="xl:col-span-2" title="Utilisateurs actifs" />}
          {trends ? <DevicesCard trends={trends} period={period} /> : <Unavailable title="Appareils" />}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SignupsChart
            points={data.signupsDaily}
            fromDay={period.fromDay}
            toDay={period.toDay}
            defaultGrain={period.grain}
            periodLabel={inPeriod}
          />
          {trends ? <AccountsCard trends={trends} period={period} startTotal={kpiPrev('inscrits')} /> : <Unavailable title="Inscriptions cumulées" />}
        </div>
      </Section>

      <Section id="abonnements" title="Abonnements et revenus">
        <div className="grid gap-4 xl:grid-cols-3">
          {trends ? <SubscribersCard className="xl:col-span-2" trends={trends} period={period} startTotal={subsStart} /> : <Unavailable className="xl:col-span-2" title="Abonnés payants" />}
          <ChartCard
            id="formules"
            title="Répartition des formules"
            description={plansDesc}
            table={{
              caption: 'Répartition des formules',
              columns: [{ label: 'Formule' }, { label: 'Comptes', numeric: true }, { label: 'Part', numeric: true }],
              rows: planParts.map(p => [p.label, fmtInt(p.value), pct(p.value, plansTotal)]),
              footer: ['Total', fmtInt(plansTotal), '100 %'],
            }}
          >
            <Donut
              summary={`Graphique en anneau. ${plansDesc}`}
              parts={planParts}
              center={
                <>
                  <span className="font-display text-2xl font-bold text-night-900">{pct(paidTotal, plansTotal)}</span>
                  <span className="text-xs text-night-600">en offre payante</span>
                </>
              }
            />
            <div className="mt-4">
              <Legend
                items={planParts.map(p => ({ label: p.label, color: p.color, value: fmtInt(p.value) }))}
              />
            </div>
          </ChartCard>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {trends ? <MrrCard trends={trends} period={period} startMrr={kpiPrev('mrr')} /> : <Unavailable title="Revenu mensuel récurrent (MRR)" />}
          <ChartCard
            id="revenus"
            title="Revenus par mois"
            description={revDesc}
            table={{
              caption: 'Revenus par mois, abonnements et dons',
              columns: [{ label: 'Mois' }, { label: 'Abonnements', numeric: true }, { label: 'Dons', numeric: true }, { label: 'Total', numeric: true }],
              rows: rev.map((r) => [
                fmtDayKey(`${r.month}-01`, { month: 'long', year: 'numeric' }),
                fmtEurExact(r.subscriptionsEur),
                fmtEurExact(r.donationsEur),
                fmtEurExact(round2(r.subscriptionsEur + r.donationsEur)),
              ]),
              footer: ['Total', fmtEurExact(revSubs), fmtEurExact(revDons), fmtEurExact(round2(revSubs + revDons))],
            }}
          >
            <div className="mb-3">
              <Legend items={[{ label: 'Abonnements', color: 'night' }, { label: 'Dons', color: 'leaf' }]} />
            </div>
            <ColumnChart
              data={rev.map((r) => ({
                key: r.month,
                label: fmtDayKey(`${r.month}-01`, { month: 'short' }),
                longLabel: fmtDayKey(`${r.month}-01`, { month: 'long', year: 'numeric' }),
                values: [r.subscriptionsEur, r.donationsEur],
              }))}
              series={[{ label: 'Abonnements', color: 'night' }, { label: 'Dons', color: 'leaf' }]}
              summary={`Histogramme empilé des revenus mensuels. ${revDesc}`}
              format={fmtEurExact}
              formatAxis={eurAxis}
            />
          </ChartCard>

        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {trends ? <SubsFlowCard trends={trends} period={period} /> : <Unavailable title="Nouveaux abonnements et résiliations" />}
          {trends ? <ChurnCard trends={trends} period={period} startTotal={subsStart} /> : <Unavailable title="Taux de résiliation" />}
        </div>
      </Section>

      <Section id="usage" title="Usage">
        <div className="grid gap-4 xl:grid-cols-3">
          {trends ? <ActivityCard className="xl:col-span-2" trends={trends} period={period} modules={data.modules} /> : <Unavailable className="xl:col-span-2" title="Activité dans le temps" />}
          <ChartCard
            id="entonnoir"
            title="Entonnoir d’inscription"
            description={funnelDesc}
            table={{
              caption: 'Entonnoir d’inscription',
              columns: [{ label: 'Étape' }, { label: 'Nombre', numeric: true }, { label: 'Conversion', numeric: true }],
              rows: data.funnel.map((s, i) => {
                const prev = data.funnel.slice(0, i).reverse().find((p) => p.count != null)
                return [s.label, s.count != null ? fmtInt(s.count) : 'Non mesuré', s.count != null && prev?.count ? pct(s.count, prev.count) : '']
              }),
            }}
          >
            <Funnel steps={data.funnel} summary={`Entonnoir. ${funnelDesc}`} />
          </ChartCard>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            id="modules"
            title="Activité par module"
            description={modDesc}
            table={{
              caption: 'Activité par module',
              columns: [{ label: 'Module' }, { label: 'Mesure' }, { label: 'Période', numeric: true }, { label: 'Période précédente', numeric: true }],
              rows: data.modules.map((m) => [m.label, m.unitLabel, fmtInt(m.current), fmtInt(m.previous)]),
            }}
          >
            <HBarList
              summary={`Barres horizontales. ${modDesc}`}
              color="leaf"
              format={fmtInt}
              previousLabel="Période précédente"
              rows={data.modules.map((m) => ({ key: m.module, label: m.label, value: m.current, previous: m.previous, detail: m.unitLabel }))}
            />
          </ChartCard>

          <ChartCard
            id="guide"
            title="Fiches du Guide les plus consultées"
            description={guideDesc}
            table={{
              caption: 'Fiches du Guide les plus consultées',
              columns: [{ label: 'Fiche' }, { label: data.guide.basis === 'consultations' ? 'Consultations' : 'Utilisateurs', numeric: true }],
              rows: data.guide.items.map((g) => [g.title, fmtInt(g.count)]),
            }}
          >
            {data.guide.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-night-200 px-4 py-8 text-center text-sm text-night-600">Aucune fiche consultée sur cette période.</p>
            ) : (
              <HBarList
                summary={`Barres horizontales. ${guideDesc}`}
                color="night"
                format={fmtInt}
                rows={data.guide.items.map((g) => ({ key: `${g.territoire}/${g.slug}`, label: g.title, value: g.count }))}
              />
            )}
          </ChartCard>
        </div>
      </Section>

      <Section id="retention" title="Rétention">
        {data.cohorts ? <CohortCard cohorts={data.cohorts} /> : <Unavailable title="Rétention par cohorte" />}
      </Section>

      <Section id="recent" title="Territoires et activité récente">
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard
            id="territoires"
            title="Répartition par territoire"
            description={terrDesc}
            table={{
              caption: 'Répartition des comptes par territoire',
              columns: [{ label: 'Territoire' }, { label: 'Comptes', numeric: true }, { label: 'Part', numeric: true }],
              rows: data.territories.map((t) => [t.label, fmtInt(t.users), pct(t.users, terrTotal)]),
            }}
          >
            <HBarList
              summary={`Barres horizontales. ${terrDesc}`}
              color="night"
              format={(n) => `${fmtInt(n)} (${pct(n, terrTotal)})`}
              rows={data.territories.map((t) => ({ key: t.code ?? 'aucun', label: t.label, value: t.users }))}
            />
          </ChartCard>
          <RecentSignups rows={data.recentSignups} />
          <RecentPayments rows={data.recentPayments} />
        </div>
      </Section>

      <footer className="space-y-2 border-t border-night-100 pt-4 text-xs text-night-600">
        {data.notes.length > 0 && (
          <ul className="space-y-1">
            {data.notes.map((n) => (
              <li key={n} className="flex gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{n}</li>
            ))}
          </ul>
        )}
        <p>
          Source : {data.source === 'demo' ? 'données de démonstration' : data.source === 'base+stripe' ? 'base de données et Stripe (revenus)' : 'base de données'} · calculé le{' '}
          <time dateTime={data.generatedAt}>{fmtDateTime(data.generatedAt)}</time> (heure de Cayenne).
        </p>
      </footer>
    </div>
  )
}
