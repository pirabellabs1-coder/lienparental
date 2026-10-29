import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { getSettings } from '@/lib/admin/ops/parametres'
import { DemoNotice, Note, OpsHeader, Panel, Pill, linkCls } from '@/components/admin/ops/ui'

export const metadata: Metadata = { title: 'Paramètres' }
export const dynamic = 'force-dynamic'

export default async function ParametresPage() {
  const ctx = await pageAdminCtx()
  const { groups, territoires, territoiresError } = await getSettings(ctx)
  return (
    <div className="space-y-5">
      <OpsHeader title="Paramètres" description="État réel du déploiement, en lecture seule. Aucun secret n’est affiché : seulement s’il est configuré ou non." />
      <DemoNotice mode={ctx.mode}>Le déploiement de recette n’a pas de base de données : les intégrations apparaissent non configurées.</DemoNotice>
      <Note>
        Les formules et tarifs d’abonnement sont définis dans le code et dans Stripe : les modifier passe par un déploiement
        (et par le tableau de bord Stripe pour les prix facturés). Les réglages réellement stockés en base sont listés en bas de page.
      </Note>

      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => (
          <Panel key={g.title} title={g.title}>
            {g.description && <p className="-mt-1 mb-2 text-[13px] text-night-600">{g.description}</p>}
            <dl className="divide-y divide-night-100 text-[14px]">
              {g.items.map((it) => (
                <div key={it.label} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2">
                  <dt className="min-w-0 text-night-700">
                    {it.label}
                    {it.hint && <span className="block text-[12px] text-night-500">{it.hint}</span>}
                  </dt>
                  <dd className="text-right font-semibold text-night-900">
                    {it.tone === 'ok' ? (
                      <Pill tone="ok"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{it.value}</Pill>
                    ) : it.tone === 'warn' ? (
                      <Pill tone="warn"><CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />{it.value}</Pill>
                    ) : it.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        ))}
      </div>

      <Panel title="Réglages en base : territoires du Guide" actions={<Link className={`${linkCls} text-[13px]`} href="/admin/guides">Gérer dans Guides</Link>}>
        {territoiresError ? (
          <p className="text-[14px] text-alert-700">Territoires indisponibles (base injoignable).</p>
        ) : territoires.length === 0 ? (
          <p className="text-[14px] text-night-600">Aucun territoire.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {territoires.map((t) => (
              <li key={t.code}><Pill tone={t.disponible ? 'ok' : 'neutral'}>{t.nom}{t.disponible ? '' : ' (bientôt)'}</Pill></li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
