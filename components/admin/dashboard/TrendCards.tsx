// Cartes des séries temporelles (0450) : actifs, comptes cumulés, MRR, flux
// d'abonnements, taux de résiliation, appareils, rétention par cohorte.
// Server Components : les regroupements et les phrases de synthèse sont
// calculés ici ; seuls les tracés interactifs (viz.tsx) sont des composants client.
import { fmtDayKey } from '@/lib/tz'
import { fmtEur, fmtEurExact, fmtInt, fmtPct } from '@/lib/admin/stats/format'
import { round2 } from '@/lib/admin/stats/compute'
import {
  bucketRows,
  churnRates,
  cohortGrid,
  deviceShares,
  lineGrain,
  subsTotal,
  type SeriesBucket,
} from '@/lib/admin/stats/trends'
import type { Cohorts, Grain, ModuleActivity, Period, Trends } from '@/lib/admin/stats/types'
import { cn } from '@/lib/cn'
import { ChartCard } from './ChartCard'
import { HBarList } from './charts'
import { ActivityChart } from './ActivityChart'
import { SubscribersChart } from './SubscribersChart'
import { DivergingBars, EmptyChart, LineChart, VizLegend, type XPoint } from './viz'

const UNIT: Record<Grain, string> = { jour: 'jour', semaine: 'semaine', mois: 'mois' }
const DATE_COL: Record<Grain, string> = { jour: 'Jour', semaine: 'Semaine', mois: 'Mois' }

const toPoints = <K extends string>(b: SeriesBucket<K>[]): XPoint[] => b.map(({ key, label, longLabel }) => ({ key, label, longLabel }))
const dec1 = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const signed = (n: number, f: (n: number) => string = fmtInt) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`
const change = (cur: number, prev: number) => (prev > 0 ? `${signed(round2(((cur - prev) / prev) * 100), dec1)} %` : null)
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

// --- Utilisateurs actifs ----------------------------------------------------------

export function ActiveUsersCard({ trends, period, className }: { trends: Trends; period: Period; className?: string }) {
  const g = lineGrain(period.days)
  const b = bucketRows(trends.activeDaily, g, { dau: 'avg', wau: 'last' })
  const pb = bucketRows(trends.activePrevDaily.map((p) => ({ day: p.day, dau: p.value })), g, { dau: 'avg' })
  const daily = trends.activeDaily
  const avg = daily.length ? daily.reduce((s, d) => s + d.dau, 0) / daily.length : 0
  const prevAvg = trends.activePrevDaily.length ? trends.activePrevDaily.reduce((s, d) => s + d.value, 0) / trends.activePrevDaily.length : 0
  const peak = daily.reduce<(typeof daily)[number] | null>((m, d) => (!m || d.dau > m.dau ? d : m), null)
  const lastWau = daily[daily.length - 1]?.wau ?? 0
  const delta = change(avg, prevAvg)
  const weekly = g === 'semaine'
  const dauLabel = weekly ? 'Actifs par jour (moyenne)' : 'Actifs du jour'
  const wauLabel = weekly ? 'Actifs sur 7 jours (fin de semaine)' : 'Actifs sur 7 jours glissants'
  const prevLabel = 'Actifs par jour, période précédente'

  const description = !peak || peak.dau === 0
    ? `Aucune action enregistrée ${period.label}.`
    : `${dec1(avg)} utilisateurs actifs par jour en moyenne ${period.label}${delta ? ` (${delta} par rapport à la période précédente)` : ''}, ${fmtInt(lastWau)} sur les 7 derniers jours. Jour le plus actif : ${lower(fmtDayKey(peak.day, { weekday: 'long', day: 'numeric', month: 'long' }))} (${fmtInt(peak.dau)}).`

  const series = [
    { id: 'prev', label: prevLabel, color: 'muted' as const, values: b.map((_, i) => pb[i]?.values.dau ?? null), kind: 'muted' as const },
    { id: 'dau', label: dauLabel, color: 'blue' as const, values: b.map((x) => x.values.dau), kind: 'area' as const },
    { id: 'wau', label: wauLabel, color: 'green' as const, values: b.map((x) => x.values.wau) },
  ]
  return (
    <ChartCard
      id="actifs"
      className={className}
      title="Utilisateurs actifs"
      description={description}
      note="Actif : au moins une action dans la journée (journal, calendrier, coffre-fort, Coach IA, messages, Guide). Les simples connexions ne sont pas historisées : l’indicateur « Utilisateurs actifs (7 j) » les compte et peut donc être plus élevé."
      table={{
        caption: weekly ? 'Utilisateurs actifs par semaine' : 'Utilisateurs actifs par jour',
        columns: [{ label: DATE_COL[g] }, { label: dauLabel, numeric: true }, { label: wauLabel, numeric: true }, { label: prevLabel, numeric: true }],
        rows: b.map((x, i) => [x.longLabel, dec1(x.values.dau), fmtInt(x.values.wau), pb[i] ? dec1(pb[i].values.dau) : 'Non disponible']),
      }}
    >
      {!peak || peak.dau === 0 ? (
        <EmptyChart>Aucune action enregistrée sur cette période.</EmptyChart>
      ) : (
        <>
          <VizLegend
            className="mb-3"
            items={[
              { label: dauLabel, color: 'blue', kind: 'area' },
              { label: wauLabel, color: 'green', kind: 'line' },
              { label: 'Période précédente', color: 'muted', kind: 'line' },
            ]}
          />
          <LineChart points={toPoints(b)} series={series} unit="count" summary={`Courbes des utilisateurs actifs. ${description}`} />
        </>
      )}
    </ChartCard>
  )
}

// --- Comptes cumulés ---------------------------------------------------------------

export function AccountsCard({ trends, period, startTotal, className }: { trends: Trends; period: Period; startTotal: number; className?: string }) {
  const g = lineGrain(period.days)
  const b = bucketRows(trends.accountsDaily, g, { value: 'last' })
  const end = b[b.length - 1]?.values.value ?? startTotal
  const pct = change(end, startTotal)
  const lastDay = trends.accountsDaily[trends.accountsDaily.length - 1]?.day
  const description = `${fmtInt(end)} comptes${lastDay ? ` au ${fmtDayKey(lastDay, { day: 'numeric', month: 'long' })}` : ''}, ${signed(end - startTotal)} ${period.label}${pct ? ` (${pct})` : ''}.`
  return (
    <ChartCard
      id="comptes"
      className={className}
      title="Inscriptions cumulées"
      description={description}
      note="Comptes existants en fin de journée : comptes supprimés retirés, administrateurs exclus."
      table={{
        caption: 'Comptes existants en fin de période',
        columns: [{ label: DATE_COL[g] }, { label: 'Comptes', numeric: true }],
        rows: b.map((x) => [x.longLabel, fmtInt(x.values.value)]),
      }}
    >
      <LineChart
        points={toPoints(b)}
        series={[{ id: 'comptes', label: 'Comptes', color: 'blue', values: b.map((x) => x.values.value), kind: 'area' }]}
        unit="count"
        summary={`Aire des comptes cumulés. ${description}`}
      />
    </ChartCard>
  )
}

// --- Abonnés, MRR, flux, résiliation ---------------------------------------------------

export function SubscribersCard({ trends, period, startTotal, className }: { trends: Trends; period: Period; startTotal: number; className?: string }) {
  const g = lineGrain(period.days)
  const b = bucketRows(trends.subsDaily, g, { premiumMonthly: 'last', premiumYearly: 'last', coparentaliteMonthly: 'last', coparentaliteYearly: 'last' })
  return <SubscribersChart className={className} points={toPoints(b)} rows={b.map((x) => x.values)} startTotal={startTotal} periodLabel={period.label} />
}

export function MrrCard({ trends, period, startMrr, className }: { trends: Trends; period: Period; startMrr: number; className?: string }) {
  const g = lineGrain(period.days)
  const b = bucketRows(trends.mrrDaily, g, { value: 'last' })
  const end = b[b.length - 1]?.values.value ?? 0
  const pct = change(end, startMrr)
  const description = `${fmtEur(end)} de revenu mensuel récurrent en fin de période, contre ${fmtEur(startMrr)} au début${pct ? ` (${pct})` : ''}.`
  return (
    <ChartCard
      id="mrr"
      className={className}
      title="Revenu mensuel récurrent (MRR)"
      description={description}
      note="Calculé chaque jour avec les prix actuels : abonnés mensuels × prix mensuel + abonnés annuels × prix annuel / 12, par formule."
      table={{
        caption: 'MRR en fin de période',
        columns: [{ label: DATE_COL[g] }, { label: 'MRR', numeric: true }],
        rows: b.map((x) => [x.longLabel, fmtEurExact(x.values.value)]),
      }}
    >
      <LineChart
        points={toPoints(b)}
        series={[{ id: 'mrr', label: 'MRR', color: 'blue', values: b.map((x) => x.values.value), kind: 'area' }]}
        unit="eur"
        summary={`Courbe du MRR. ${description}`}
      />
    </ChartCard>
  )
}

export function SubsFlowCard({ trends, period, className }: { trends: Trends; period: Period; className?: string }) {
  const g = period.grain
  const b = bucketRows(trends.subsFlowDaily, g, { started: 'sum', canceled: 'sum' })
  const started = b.reduce((s, x) => s + x.values.started, 0)
  const canceled = b.reduce((s, x) => s + x.values.canceled, 0)
  const description = started + canceled === 0
    ? `Aucun nouvel abonnement ni fin d’abonnement ${period.label}.`
    : `${fmtInt(started)} nouveaux abonnements et ${fmtInt(canceled)} fins d’abonnement ${period.label}, soit un solde de ${signed(started - canceled)}.`
  return (
    <ChartCard
      id="flux-abonnements"
      className={className}
      title="Nouveaux abonnements et fins d’abonnement"
      description={description}
      note="Une fin d’abonnement compte le jour où l’accès payant s’arrête (fin de la période payée en cas de résiliation en fin de période). L’indicateur « Désabonnements » compte, lui, la date de la demande."
      table={{
        caption: `Nouveaux abonnements et fins d’abonnement par ${UNIT[g]}`,
        columns: [{ label: DATE_COL[g] }, { label: 'Nouveaux', numeric: true }, { label: 'Fins d’abonnement', numeric: true }, { label: 'Solde', numeric: true }],
        rows: b.map((x) => [x.longLabel, fmtInt(x.values.started), fmtInt(x.values.canceled), signed(x.values.started - x.values.canceled)]),
        footer: ['Total', fmtInt(started), fmtInt(canceled), signed(started - canceled)],
      }}
    >
      {started + canceled === 0 ? (
        <EmptyChart height={200}>Aucun mouvement d’abonnement sur cette période.</EmptyChart>
      ) : (
        <>
          <VizLegend
            className="mb-3"
            items={[
              { label: 'Nouveaux abonnements (vers le haut)', color: 'blue', kind: 'bar' },
              { label: 'Fins d’abonnement (vers le bas)', color: 'gold', kind: 'bar' },
            ]}
          />
          <DivergingBars
            points={toPoints(b)}
            up={{ label: 'Nouveaux abonnements', color: 'blue', values: b.map((x) => x.values.started) }}
            down={{ label: 'Fins d’abonnement', color: 'gold', values: b.map((x) => x.values.canceled) }}
            unit="count"
            summary={`Barres divergentes par ${UNIT[g]}. ${description}`}
          />
        </>
      )}
    </ChartCard>
  )
}

/** Un taux quotidien est trop bruité dès que la période dépasse deux semaines : semaine, puis mois. */
const churnGrain = (days: number): Grain => (days <= 14 ? 'jour' : days <= 120 ? 'semaine' : 'mois')

export function ChurnCard({ trends, period, startTotal, className }: { trends: Trends; period: Period; startTotal: number; className?: string }) {
  const g = churnGrain(period.days)
  const subs = bucketRows(trends.subsDaily, g, { premiumMonthly: 'last', premiumYearly: 'last', coparentaliteMonthly: 'last', coparentaliteYearly: 'last' })
  const flow = bucketRows(trends.subsFlowDaily, g, { started: 'sum', canceled: 'sum' })
  const rates = churnRates(subs.map((s, i) => ({ total: subsTotal(s.values), started: flow[i]?.values.started ?? 0, canceled: flow[i]?.values.canceled ?? 0 })))
  const canceled = flow.reduce((s, x) => s + x.values.canceled, 0)
  const overall = startTotal > 0 ? round2((canceled / startTotal) * 100) : null
  let peakI = -1
  rates.forEach((r, i) => { if (r != null && (peakI < 0 || r > (rates[peakI] ?? -1))) peakI = i })
  const description = overall == null
    ? `Aucun abonné payant au début de la période : taux de résiliation non calculable.`
    : `${fmtInt(canceled)} fins d’abonnement ${period.label} pour ${fmtInt(startTotal)} abonnés payants au début, soit ${fmtPct(overall)}.${peakI >= 0 && (rates[peakI] ?? 0) > 0 ? ` Taux le plus élevé : ${fmtPct(rates[peakI]!)} (${lower(subs[peakI].longLabel)}).` : ''}`
  return (
    <ChartCard
      id="resiliation"
      className={className}
      title="Taux de résiliation"
      description={description}
      note={`Par ${UNIT[g]} : fins d’abonnement du ${UNIT[g]} / abonnés payants au début du ${UNIT[g]}. Le taux de la période inclut aussi les abonnements souscrits puis arrêtés pendant la période.`}
      table={{
        caption: `Taux de résiliation par ${UNIT[g]}`,
        columns: [{ label: DATE_COL[g] }, { label: 'Fins d’abonnement', numeric: true }, { label: 'Taux', numeric: true }],
        rows: subs.map((x, i) => [x.longLabel, fmtInt(flow[i]?.values.canceled ?? 0), rates[i] != null ? fmtPct(rates[i]!) : 'Non calculable']),
      }}
    >
      <LineChart
        points={toPoints(subs)}
        series={[{ id: 'churn', label: 'Taux de résiliation', color: 'blue', values: rates }]}
        unit="pct"
        height={200}
        summary={`Courbe du taux de résiliation. ${description}`}
      />
    </ChartCard>
  )
}

// --- Activité -------------------------------------------------------------------------

export function ActivityCard({ trends, period, modules, className }: { trends: Trends; period: Period; modules: ModuleActivity[]; className?: string }) {
  const g = lineGrain(period.days)
  const agg = g === 'jour' ? 'sum' : 'avg'
  const b = bucketRows(trends.activityDaily, g, { messages: agg, ai: agg, documents: agg })
  const tot = (k: 'messages' | 'ai' | 'documents') => trends.activityDaily.reduce((s, d) => s + d[k], 0)
  const msg = modules.find((m) => m.module === 'messages')
  const delta = msg ? change(msg.current, msg.previous) : null
  const description = tot('messages') + tot('ai') + tot('documents') === 0
    ? `Aucune activité enregistrée ${period.label}.`
    : `${fmtInt(tot('messages'))} messages envoyés, ${fmtInt(tot('ai'))} analyses Coach IA et ${fmtInt(tot('documents'))} documents déposés ${period.label}.${delta ? ` Messages : ${delta} par rapport à la période précédente.` : ''}`
  return (
    <ActivityChart
      className={className}
      points={toPoints(b)}
      rows={b.map((x) => x.values)}
      totals={{ messages: tot('messages'), ai: tot('ai'), documents: tot('documents') }}
      dailyAverage={g !== 'jour'}
      description={description}
      unitLabel={UNIT[g]}
    />
  )
}

// --- Appareils ---------------------------------------------------------------------------

export function DevicesCard({ trends, period, className }: { trends: Trends; period: Period; className?: string }) {
  const cur = deviceShares(trends.devices.current)
  const prev = deviceShares(trends.devices.previous)
  const by = (k: string) => cur.rows.find((r) => r.key === k)
  const description = cur.total === 0
    ? `Aucune session ouverte ${period.label}.`
    : `${fmtPct(by('mobile')?.pct ?? 0)} des ${fmtInt(cur.total)} sessions ouvertes ${period.label} l’ont été sur mobile, ${fmtPct(by('ordinateur')?.pct ?? 0)} sur ordinateur et ${fmtPct(by('tablette')?.pct ?? 0)} sur tablette.`
  return (
    <ChartCard
      id="appareils"
      className={className}
      title="Appareils"
      description={description}
      note={
        <>
          {!trends.devices.pwaMeasured && <><strong className="font-semibold text-night-800">Installation de l’application (PWA) non mesurée :</strong> seule la répartition par type d’appareil est disponible. </>}
          Sessions de connexion encore valides, classées d’après le navigateur ; un iPad récent se présente comme un ordinateur.
        </>
      }
      table={{
        caption: 'Sessions par type d’appareil',
        columns: [{ label: 'Appareil' }, { label: 'Sessions', numeric: true }, { label: 'Part', numeric: true }, { label: 'Part, période précédente', numeric: true }],
        rows: cur.rows.map((r) => [r.label, fmtInt(r.count), fmtPct(r.pct), prev.total > 0 ? fmtPct(prev.rows.find((p) => p.key === r.key)?.pct ?? 0) : 'Non disponible']),
        footer: ['Total', fmtInt(cur.total), cur.total > 0 ? '100 %' : '0 %', prev.total > 0 ? '100 %' : 'Non disponible'],
      }}
    >
      {cur.total === 0 ? (
        <EmptyChart height={160}>Aucune session sur cette période.</EmptyChart>
      ) : (
        <HBarList
          summary={`Barres horizontales. ${description}`}
          color="night"
          format={fmtPct}
          previousLabel={prev.total > 0 ? 'Période précédente' : undefined}
          rows={cur.rows.map((r) => ({
            key: r.key,
            label: r.label,
            value: r.pct,
            previous: prev.total > 0 ? prev.rows.find((p) => p.key === r.key)?.pct ?? 0 : undefined,
            detail: `${fmtInt(r.count)} sessions`,
          }))}
        />
      )}
    </ChartCard>
  )
}

// --- Rétention par cohorte ------------------------------------------------------------------

// Rampe séquentielle (une teinte, du clair au foncé) en 7 classes ; texte blanc sur les classes foncées.
const BINS: { min: number; bg: string; dark: boolean }[] = [
  { min: 70, bg: 'bg-night-900', dark: true },
  { min: 50, bg: 'bg-night-700', dark: true },
  { min: 35, bg: 'bg-night-500', dark: true },
  { min: 20, bg: 'bg-night-300', dark: false },
  { min: 10, bg: 'bg-night-200', dark: false },
  { min: 5, bg: 'bg-night-100', dark: false },
  { min: 0, bg: 'bg-night-50', dark: false },
]
const binOf = (pct: number) => BINS.find((b) => pct >= b.min) ?? BINS[BINS.length - 1]
const LEGEND_RANGES = ['0 à 5 %', '5 à 10 %', '10 à 20 %', '20 à 35 %', '35 à 50 %', '50 à 70 %', '70 % et plus']

export function CohortCard({ cohorts, className }: { cohorts: Cohorts; className?: string }) {
  const grid = cohortGrid(cohorts)
  const weekLabel = (w: string) => fmtDayKey(w, { day: 'numeric', month: 'short' })
  const a1 = grid.average[1]
  const a4 = grid.average[4]
  const signups = grid.rows.reduce((s, r) => s + r.size, 0)
  const description = signups === 0
    ? 'Aucune inscription sur les dernières semaines : rétention non calculable.'
    : `${a1 != null ? `En moyenne ${fmtPct(a1)} des inscrits sont revenus la semaine suivant leur inscription` : 'Pas encore de semaine complète après inscription'}${a4 != null ? `, ${fmtPct(a4)} au bout de 4 semaines` : ''}. ${grid.rows.length} cohortes hebdomadaires, ${fmtInt(signups)} inscrits.`
  const cols = Array.from({ length: grid.columns }, (_, k) => k)
  return (
    <ChartCard
      id="cohortes"
      className={className}
      title="Rétention par cohorte"
      description={description}
      note="Cohorte : comptes inscrits la même semaine (du lundi au dimanche). Case : part des inscrits ayant fait au moins une action la k-ième semaine après l’inscription (semaine 0 = semaine d’inscription). Les cases en pointillés concernent la semaine en cours, encore incomplète ; elles sont exclues de la moyenne. Comptes supprimés exclus."
      table={{
        caption: 'Rétention par cohorte : actifs et part des inscrits par semaine écoulée',
        columns: [{ label: 'Cohorte' }, { label: 'Inscrits', numeric: true }, ...cols.map((k) => ({ label: `Semaine ${k}`, numeric: true }))],
        rows: grid.rows.map((r) => [
          `Semaine du ${fmtDayKey(r.week, { day: 'numeric', month: 'long', year: 'numeric' })}`,
          fmtInt(r.size),
          ...cols.map((k) => {
            const c = r.cells[k]
            if (!c) return ''
            return `${fmtInt(c.active)}${c.pct != null ? ` (${fmtPct(c.pct)})` : ''}${c.partial ? ', en cours' : ''}`
          }),
        ]),
        footer: ['Moyenne', '', ...cols.map((k) => (grid.average[k] != null ? fmtPct(grid.average[k]!) : ''))],
      }}
    >
      {/* relative : les textes sr-only (position absolue) restent dans la zone défilante au lieu d'élargir la page. */}
      <div className="relative overflow-x-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500" tabIndex={0} role="region" aria-label="Grille de rétention par cohorte (défilement horizontal)">
        <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">Part des inscrits de chaque cohorte hebdomadaire actifs les semaines suivantes</caption>
          <thead>
            <tr className="text-night-600">
              <th scope="col" className="px-2 py-1 text-left font-semibold">Cohorte</th>
              <th scope="col" className="px-2 py-1 text-right font-semibold">Inscrits</th>
              {cols.map((k) => (
                <th key={k} scope="col" className="px-1 py-1 text-center font-semibold">
                  <abbr title={`Semaine ${k} après l’inscription`} className="no-underline">S{k}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.week}>
                <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal text-night-800">{weekLabel(r.week)}</th>
                <td className="px-2 py-1 text-right tabular-nums text-night-900">{fmtInt(r.size)}</td>
                {cols.map((k) => {
                  const c = r.cells[k]
                  if (!c) return <td key={k} aria-hidden="true" />
                  if (c.pct == null) return <td key={k} className="rounded bg-white px-1 py-1.5 text-center text-night-400 ring-1 ring-inset ring-night-100">·<span className="sr-only">aucun inscrit</span></td>
                  const bin = binOf(c.pct)
                  return (
                    <td
                      key={k}
                      title={`Cohorte du ${weekLabel(r.week)}, semaine ${k} : ${fmtInt(c.active)} actifs sur ${fmtInt(r.size)} (${fmtPct(c.pct)})${c.partial ? ', semaine en cours' : ''}`}
                      className={cn(
                        'rounded px-1 py-1.5 text-center tabular-nums',
                        bin.bg,
                        bin.dark ? 'text-white' : 'text-night-900',
                        c.partial && 'outline-dashed outline-2 -outline-offset-2 outline-night-400',
                      )}
                    >
                      {Math.round(c.pct)} %
                      {c.partial && <span className="sr-only"> (semaine en cours, incomplète)</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="px-2 py-1 text-left font-semibold text-night-900">Moyenne</th>
              <td />
              {cols.map((k) => (
                <td key={k} className="px-1 py-1 text-center font-semibold tabular-nums text-night-900">{grid.average[k] != null ? `${Math.round(grid.average[k]!)} %` : ''}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-night-700" aria-label="Échelle de couleur">
        {[...BINS].reverse().map((b, i) => (
          <li key={b.min} className="inline-flex items-center gap-1">
            <span className={cn('h-3 w-5 rounded-sm ring-1 ring-inset ring-night-100', b.bg)} aria-hidden="true" />
            {LEGEND_RANGES[i]}
          </li>
        ))}
        <li className="inline-flex items-center gap-1">
          <span className="h-3 w-5 rounded-sm outline-dashed outline-2 -outline-offset-2 outline-night-400" aria-hidden="true" />
          Semaine en cours
        </li>
      </ul>
    </ChartCard>
  )
}
