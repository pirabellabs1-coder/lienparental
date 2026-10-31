import type { Metadata } from 'next'
import { TrendingUp } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import { getAcquisitionReport, type AcquisitionRow, type AttributionModel } from '@/lib/admin/ops/acquisition'
import { DemoNotice, Empty, ErrorBox, FilterBar, FilterField, KV, Note, OpsHeader, Panel, fieldCls } from '@/components/admin/ops/ui'

export const metadata: Metadata = { title: 'Acquisition' }
export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const PERIODS = [7, 30, 90, 365] as const
const eur = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10} %` : '—')
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// Acquisition : quelles campagnes (UTM des liens publiés par l'agence) amènent des comptes, puis
// des abonnés payants. Le lien d'un contenu doit porter utm_source, utm_medium, utm_campaign et
// utm_content (convention du cahier d'automatisation V5, annexe A3).
export default async function AcquisitionPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const ctx = await pageAdminCtx()
  const days = PERIODS.find((d) => String(d) === one(sp.jours)) ?? 30
  const model: AttributionModel = one(sp.modele) === 'first' ? 'first' : 'last'

  let rows: AcquisitionRow[] | null = null
  let error: string | null = null
  try {
    rows = await getAcquisitionReport(ctx, days, model)
  } catch (e) {
    error = e instanceof RepoError ? e.message : 'Données indisponibles.'
  }
  const total = (rows ?? []).reduce((a, r) => ({ s: a.s + r.signups, p: a.p + r.paying, c: a.c + r.revenue_cents }), { s: 0, p: 0, c: 0 })
  const attributed = (rows ?? []).filter((r) => r.source !== '(direct / non attribué)').reduce((a, r) => a + r.signups, 0)

  return (
    <div className="space-y-5">
      <OpsHeader
        icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
        title="Acquisition"
        description="Comptes créés sur la période, regroupés par campagne (UTM), avec les abonnés payants et les revenus encaissés qu’ils ont générés. Données agrégées : aucun compte individuel n’est affiché."
      />
      <DemoNotice mode={ctx.mode}>Démonstration : aucune donnée d’acquisition n’est disponible hors production.</DemoNotice>

      <FilterBar action="/admin/acquisition" resetHref="/admin/acquisition">
        <FilterField label="Période" htmlFor="acq-jours">
          <select id="acq-jours" name="jours" defaultValue={String(days)} className={fieldCls}>
            {PERIODS.map((d) => <option key={d} value={d}>{d === 365 ? '12 derniers mois' : `${d} derniers jours`}</option>)}
          </select>
        </FilterField>
        <FilterField label="Attribution" htmlFor="acq-modele">
          <select id="acq-modele" name="modele" defaultValue={model} className={fieldCls}>
            <option value="last">Dernier contact avant l’inscription</option>
            <option value="first">Premier contact</option>
          </select>
        </FilterField>
      </FilterBar>

      {error && <ErrorBox message={error} />}

      {rows && (
        <>
          <Panel title="Synthèse">
            <KV items={[
              { k: 'Comptes créés', v: total.s },
              { k: 'Dont attribués à une campagne', v: `${attributed} (${pct(attributed, total.s)})` },
              { k: 'Abonnés payants', v: `${total.p} (${pct(total.p, total.s)})` },
              { k: 'Revenus encaissés', v: eur(total.c) },
            ]} />
          </Panel>

          <Panel title="Par campagne">
            {rows.length === 0 ? (
              <Empty>Aucun compte créé sur la période.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[13px]">
                  <caption className="sr-only">Comptes, abonnés payants et revenus par campagne</caption>
                  <thead className="text-night-600"><tr>
                    <th scope="col" className="py-1 pr-2">Source</th><th scope="col" className="py-1 pr-2">Support</th>
                    <th scope="col" className="py-1 pr-2">Campagne</th><th scope="col" className="py-1 pr-2">Contenu</th>
                    <th scope="col" className="py-1 pr-2 text-right">Comptes</th><th scope="col" className="py-1 pr-2 text-right">Payants</th>
                    <th scope="col" className="py-1 pr-2 text-right">Conversion</th><th scope="col" className="py-1 text-right">Revenus</th>
                  </tr></thead>
                  <tbody className="divide-y divide-night-100">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-2 font-semibold text-night-900">{r.source}</td>
                        <td className="py-1.5 pr-2">{r.medium ?? '—'}</td>
                        <td className="py-1.5 pr-2">{r.campaign ?? '—'}</td>
                        <td className="py-1.5 pr-2">{r.content ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-right">{r.signups}</td>
                        <td className="py-1.5 pr-2 text-right">{r.paying}</td>
                        <td className="py-1.5 pr-2 text-right">{pct(r.paying, r.signups)}</td>
                        <td className="py-1.5 text-right">{eur(r.revenue_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      <Note>
        Convention des liens publiés (cahier V5, annexe A3) : <code>utm_source</code> = réseau (tiktok, instagram, facebook),{' '}
        <code>utm_medium</code> = organic ou paid, <code>utm_campaign</code> = LP_W{'{semaine}'}_{'{thème}'}, <code>utm_content</code> = identifiant du
        contenu (ex. MD-2026-W45-01). Le visiteur garde sa provenance 30 jours ; elle est rattachée au compte à l’inscription,
        puis jointe à ses paiements Stripe. Aucun identifiant publicitaire (gclid, fbclid…) n’est conservé.
      </Note>
    </div>
  )
}
