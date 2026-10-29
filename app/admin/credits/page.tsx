import type { Metadata } from 'next'
import { Coins } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import { getConfigHistory, getCreditDashboard, getUserCredits, type CreditDashboard, type UserCredits } from '@/lib/admin/ops/credits'
import { getCreditConfig } from '@/lib/ai/credit-config-server'
import { DemoNotice, ErrorBox, FilterBar, FilterField, KV, Note, OpsHeader, Panel, Pill, fieldCls, fmtDateTime } from '@/components/admin/ops/ui'
import { ConfigEditor } from '@/components/admin/ops/credits/ConfigEditor'
import { AdjustForm } from '@/components/admin/ops/credits/AdjustForm'
import { PLAN_NAME, formatPrice } from '@/components/profil/pricing'

export const metadata: Metadata = { title: 'Crédits IA' }
export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const ACTION: Record<string, string> = {
  chat_question: 'Question au Coach', situation_analysis: 'Analyse de situation', document_analysis: 'Analyse de document',
  custom_letter: 'Courrier personnalisé', full_dossier: 'Dossier complet',
}
const TYPE: Record<string, string> = {
  allocation: 'Allocation', reservation: 'Réservation', consumption: 'Consommation', release: 'Restitution', purchase: 'Achat',
  revocation: 'Révocation', expiration: 'Expiration', admin_adjustment: 'Ajustement admin',
}
const eur = (x: number, digits = 2) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x)
const int = (x: number) => new Intl.NumberFormat('fr-FR').format(x)

export default async function CreditsAdminPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const ctx = await pageAdminCtx()
  const compte = typeof sp.compte === 'string' ? sp.compte.trim() : ''
  const { config, version } = await getCreditConfig()

  let dash: CreditDashboard | null = null
  let history: Awaited<ReturnType<typeof getConfigHistory>> = []
  let user: UserCredits | null = null
  let error: string | null = null
  try {
    ;[dash, history, user] = await Promise.all([getCreditDashboard(ctx, 30), getConfigHistory(ctx), compte ? getUserCredits(ctx, compte) : Promise.resolve(null)])
  } catch (e) {
    error = e instanceof RepoError ? e.message : 'Données indisponibles.'
  }
  const L = (k: string) => Number(dash?.ledger[k] ?? 0)

  return (
    <div className="space-y-5">
      <OpsHeader icon={<Coins className="h-5 w-5" aria-hidden="true" />} title="Crédits IA" description="Configuration versionnée, consommation, coûts et rentabilité du Coach IA (30 derniers jours). Aucun contenu familial n’est lu." />
      <DemoNotice mode={ctx.mode}>Démonstration : la configuration affichée est celle par défaut et ne peut pas être publiée.</DemoNotice>
      <Note>
        Les prix des ABONNEMENTS (Premium, Coparentalité+) ne se modifient pas ici : un prix Stripe est immuable. Pour les changer, créer
        de nouveaux prix (scripts/stripe-setup.ts), mettre à jour les variables d’environnement et components/profil/pricing.ts, puis déployer
        (docs/STRIPE.md). Les pages publiques et les CGU affichent les crédits mensuels par défaut du code : après un changement ici, les
        mettre à jour au prochain déploiement.
      </Note>
      {error && <ErrorBox message={error} />}

      {dash && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Abonnements et revenus">
            <KV items={[
              { k: 'Abonnés Premium (mensuel / annuel)', v: `${int(dash.subscribers.premium_monthly ?? 0)} / ${int(dash.subscribers.premium_yearly ?? 0)}` },
              { k: 'Abonnés Coparentalité+ (mensuel / annuel)', v: `${int(dash.subscribers.coparentalite_monthly ?? 0)} / ${int(dash.subscribers.coparentalite_yearly ?? 0)}` },
              { k: 'Comptes gratuits', v: int(dash.users_by_plan.gratuit ?? 0) },
              { k: 'MRR (TTC, annuel ramené au mois)', v: eur(dash.mrr) },
              { k: 'ARR', v: eur(dash.arr) },
              { k: 'Paiements échoués', v: <Pill tone={dash.failed_payments ? 'warn' : 'ok'}>{int(dash.failed_payments)}</Pill> },
              { k: 'Recharges (nombre / montant TTC)', v: `${int(dash.recharges.count)} / ${eur(Number(dash.recharges.amount_cents) / 100)}` },
              { k: 'Recharges remboursées ou contestées', v: int(dash.recharges.revoked) },
            ]} />
          </Panel>
          <Panel title="Crédits (30 jours)">
            <KV items={[
              { k: 'Attribués (mensuels)', v: int(L('monthly:allocation')) },
              { k: 'Consommés : mensuels / achetés', v: `${int(L('monthly:consumption'))} / ${int(L('purchased:consumption'))}` },
              { k: 'Achetés', v: int(L('purchased:purchase')) },
              { k: 'Expirés : mensuels (non reportés) / achetés', v: `${int(L('monthly:expiration'))} / ${int(L('purchased:expiration'))}` },
              { k: 'Restitués après échec', v: int(L('monthly:release') + L('purchased:release')) },
              { k: 'Révoqués (remboursement, litige)', v: int(L('purchased:revocation')) },
              { k: 'Ajustements admin', v: int(L('monthly:admin_adjustment') + L('purchased:admin_adjustment')) },
            ]} />
          </Panel>
          <Panel title="Coût IA réel par action et par modèle" className="lg:col-span-2">
            {dash.actions.length === 0 ? <p className="text-[14px] text-night-600">Aucune action sur la période.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[13px]">
                  <thead className="text-night-600"><tr>
                    <th scope="col" className="py-1 pr-2">Action</th><th scope="col" className="py-1 pr-2">Modèle</th><th scope="col" className="py-1 pr-2">Réussies / échouées</th>
                    <th scope="col" className="py-1 pr-2">Crédits</th><th scope="col" className="py-1 pr-2">Coût total</th><th scope="col" className="py-1 pr-2">Moyen</th>
                    <th scope="col" className="py-1 pr-2">P95</th><th scope="col" className="py-1 pr-2">Tokens moy. (entrée / sortie)</th><th scope="col" className="py-1">Latence P95</th>
                  </tr></thead>
                  <tbody>
                    {dash.actions.map((a) => (
                      <tr key={`${a.action}-${a.model}`} className="border-t border-night-100">
                        <th scope="row" className="py-2 pr-2 font-medium">{ACTION[a.action] ?? a.action}</th>
                        <td className="py-2 pr-2 font-mono text-[12px]">{a.model}</td>
                        <td className="py-2 pr-2">{int(a.succeeded)} / {int(a.released)}</td>
                        <td className="py-2 pr-2">{int(a.credits)}</td>
                        <td className="py-2 pr-2">{eur(a.cost_eur)}</td>
                        <td className="py-2 pr-2">{eur(a.avg_cost_eur, 4)}</td>
                        <td className="py-2 pr-2">{eur(a.p95_cost_eur, 4)}</td>
                        <td className="py-2 pr-2">{int(a.avg_input)} / {int(a.avg_output)}</td>
                        <td className="py-2">{(a.p95_latency_ms / 1000).toFixed(1)} s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Marge contributive estimée (par mois)">
            <p className="-mt-1 mb-2 text-[12.5px] text-night-600">Estimation : revenu TTC des abonnements actifs moins le coût IA mesuré, hors taxes, frais de paiement, hébergement et support. Recharges non incluses.</p>
            <KV items={dash.margins.map((m) => ({ k: PLAN_NAME[m.plan], v: `${eur(m.revenue)} − ${eur(m.aiCost)} = ${eur(m.margin)}` }))} />
          </Panel>
          <Panel title="Alertes de dépense IA">
            {dash.alerts.length === 0 ? <p className="text-[14px] text-night-600">Aucun plafond atteint.</p> : (
              <ul className="space-y-1 text-[13px]">
                {dash.alerts.map((a, i) => (
                  <li key={i}><Pill tone="warn">{a.scope === 'global' ? 'Global' : 'Compte'}</Pill> {a.day} : {eur(a.spent_eur)} dépensés pour un plafond de {eur(a.cap_eur)}</li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <Panel title={`Configuration active : version ${version}`}>
        <ConfigEditor initial={config} disabled={ctx.mode !== 'live'} />
      </Panel>

      <Panel title="Historique des versions">
        {history.length === 0 ? <p className="text-[14px] text-night-600">Aucune version.</p> : (
          <ul className="divide-y divide-night-100 text-[13px]">
            {history.map((h) => (
              <li key={h.version} className="py-2">
                <p className="font-semibold text-night-900">Version {h.version} · {fmtDateTime(h.createdAt)}{h.createdBy ? ` · ${h.createdBy}` : ''}</p>
                <p className="text-night-700">{h.reason}</p>
                <p className="text-night-600">
                  Mensuels {h.config.monthlyCredits.gratuit} / {h.config.monthlyCredits.premium} / {h.config.monthlyCredits.coparentalite} ·
                  coûts {h.config.actions.chat_question.cost} / {h.config.actions.situation_analysis.cost} / {h.config.actions.document_analysis.cost} ·
                  packs {h.config.packs.filter((p) => p.active).map((p) => `${p.credits} = ${formatPrice(p.priceCents / 100)}`).join(', ')} ·
                  validité {h.config.purchasedValidityMonths} mois
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Solde d’un compte et ajustement manuel">
        <FilterBar action="/admin/credits" resetHref="/admin/credits">
          <FilterField label="Identifiant du compte (UUID, depuis la fiche Comptes)" htmlFor="compte">
            <input id="compte" name="compte" defaultValue={compte} className={fieldCls} placeholder="00000000-0000-0000-0000-000000000000" />
          </FilterField>
        </FilterBar>
        {compte && !user && !error && <p className="mt-3 text-[14px] text-night-600">Compte introuvable ou identifiant invalide.</p>}
        {user && (
          <div className="mt-4 space-y-4">
            <KV items={[
              { k: 'Formule propre', v: PLAN_NAME[(user.plan as 'gratuit' | 'premium' | 'coparentalite')] ?? user.plan },
              { k: 'Période', v: `${fmtDateTime(user.period_start)} → ${fmtDateTime(user.period_end)}` },
              { k: 'Solde A (mensuel)', v: `${user.monthly} / ${user.monthly_quota}` },
              { k: 'Solde B (acheté)', v: int(user.purchased) },
              { k: 'Total A + B', v: int(user.total) },
            ]} />
            <AdjustForm userId={compte} disabled={ctx.mode !== 'live'} />
            <div>
              <h3 className="mb-1 text-[14px] font-bold text-night-900">30 dernières écritures</h3>
              <ul className="divide-y divide-night-100 text-[13px]">
                {user.ledger.map((e, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>{TYPE[e.type] ?? e.type} · {e.wallet === 'monthly' ? 'mensuel' : 'acheté'}{e.reason ? ` · « ${e.reason} »` : ''}</span>
                    <span className="font-semibold">{e.delta === 0 ? `(${e.amount})` : `${e.delta > 0 ? '+' : ''}${e.delta}`} · {fmtDateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
