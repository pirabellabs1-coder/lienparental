import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { getApplication, submittedLogoUrl } from '@/lib/partenaires/server'
import { DemoNotice, KV, OpsHeader, Panel, Pill, fmtDateTime } from '@/components/admin/ops/ui'
import { CATEGORY_LABEL, PROFILE_LABEL, STATUS_LABEL, STATUS_TONE, TERRITORY_LABEL } from '@/components/admin/partenaires/labels'
import { PartnerDecision } from '@/components/admin/partenaires/PartnerDecision'

export const metadata: Metadata = { title: 'Candidature partenaire' }
export const dynamic = 'force-dynamic'

export default async function PartnerApplicationAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await pageAdminCtx()
  const row = await getApplication(ctx, id).catch(() => null)
  if (!row) notFound()
  const logo = await submittedLogoUrl(ctx, row).catch(() => null)

  return (
    <div>
      <Link href="/admin/partenaires" className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-night-800 hover:text-leaf-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Toutes les candidatures
      </Link>
      <OpsHeader
        title={row.structure}
        description={`${PROFILE_LABEL[row.profil]} · reçue le ${fmtDateTime(row.created_at)}`}
        actions={<Pill tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Pill>}
      />
      <DemoNotice mode={ctx.mode} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <div className="space-y-6">
          <Panel title="Candidature">
            <KV items={[
              { k: 'Profil', v: PROFILE_LABEL[row.profil] },
              { k: 'Structure', v: row.structure },
              { k: 'Contact', v: row.contact_name },
              { k: 'E-mail', v: <a className="underline" href={`mailto:${row.email}`}>{row.email}</a> },
              { k: 'Téléphone', v: row.telephone ?? '—' },
              { k: 'Territoire', v: TERRITORY_LABEL[row.territoire] },
              // Adresse affichée en texte : un lien saisi par un inconnu n'est pas cliquable ici.
              { k: 'Site', v: row.site ?? '—' },
              { k: 'Réseaux sociaux', v: row.reseaux ? <span className="whitespace-pre-line">{row.reseaux}</span> : '—' },
            ]} />
          </Panel>
          <Panel title="Présentation de l’activité">
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-night-800">{row.presentation}</p>
          </Panel>
          <Panel title="Proposition de collaboration">
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-night-800">{row.proposition}</p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Logo reçu">
            {logo ? (
              <div className="grid place-items-center rounded-xl bg-night-50 p-4 ring-1 ring-night-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt={`Logo envoyé par ${row.structure}`} className="max-h-40 w-auto object-contain" />
              </div>
            ) : (
              <p className="text-[14px] text-alert-700">Aucun logo : la candidature ne peut pas être publiée.</p>
            )}
            <p className="mt-2 text-[12.5px] text-night-600">Vérifiez que le logo appartient bien à la structure et que vous avez son accord écrit pour l’afficher.</p>
          </Panel>
          <Panel title="Décision">
            <PartnerDecision
              id={row.id}
              status={row.status}
              hasLogo={Boolean(row.logo_path)}
              initial={{ category: row.category, publicName: row.public_name ?? row.structure, tagline: row.tagline ?? '', displayOrder: row.display_order }}
              categoryLabels={CATEGORY_LABEL}
            />
          </Panel>
        </div>
      </div>
    </div>
  )
}
