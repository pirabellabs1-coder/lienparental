import type { Metadata } from 'next'
import Link from 'next/link'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listApplications, type ApplicationRow, type ApplicationStatus } from '@/lib/partenaires/server'
import { DemoNotice, Empty, ErrorBox, Note, OpsHeader, Pill, fmtDateTime, linkCls } from '@/components/admin/ops/ui'
import { CATEGORY_LABEL, PROFILE_LABEL, STATUS_LABEL, STATUS_TONE } from '@/components/admin/partenaires/labels'
import { cn } from '@/lib/cn'

export const metadata: Metadata = { title: 'Partenaires' }
export const dynamic = 'force-dynamic'

const FILTERS: (ApplicationStatus | 'tous')[] = ['pending', 'approved', 'hidden', 'rejected', 'tous']

export default async function PartnersAdminPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const ctx = await pageAdminCtx()
  const sp = await searchParams
  const statut = (FILTERS as string[]).includes(sp.statut ?? '') ? (sp.statut as ApplicationStatus | 'tous') : 'pending'
  let rows: ApplicationRow[] = []
  let error: string | null = null
  try {
    rows = await listApplications(ctx, statut === 'tous' ? undefined : statut)
  } catch {
    error = 'Candidatures indisponibles pour le moment.'
  }

  return (
    <div>
      <OpsHeader
        title="Partenaires"
        description="Candidatures reçues depuis le formulaire « Devenir partenaire ». Validez pour publier le logo : le partenaire apparaît aussitôt dans sa catégorie sur la page Partenaires et sur l’accueil."
      />
      <DemoNotice mode={ctx.mode} />
      <Note tone="privacy">
        Les coordonnées des candidats ne sont visibles que dans l’administration. Seuls le nom public, la catégorie, l’accroche, le site et le logo validés sont affichés sur le site.
      </Note>

      <nav aria-label="Filtrer par statut" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'pending' ? '/admin/partenaires' : `/admin/partenaires?statut=${f}`}
            aria-current={statut === f ? 'page' : undefined}
            className={cn('inline-flex min-h-[40px] items-center rounded-full px-4 text-[14px] font-semibold ring-1', statut === f ? 'bg-night-900 text-white ring-night-900' : 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}
          >
            {f === 'tous' ? 'Toutes' : STATUS_LABEL[f]}
          </Link>
        ))}
      </nav>

      {error ? <ErrorBox message={error} /> : rows.length === 0 ? (
        <Empty>Aucune candidature dans cette liste.</Empty>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-night-100">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="border-b border-night-100 text-[12.5px] uppercase tracking-wide text-night-500">
              <tr>
                <th scope="col" className="px-4 py-3">Structure</th>
                <th scope="col" className="px-4 py-3">Profil</th>
                <th scope="col" className="px-4 py-3">Catégorie</th>
                <th scope="col" className="px-4 py-3">Reçue le</th>
                <th scope="col" className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/partenaires/${r.id}`} className={linkCls}>{r.public_name ?? r.structure}</Link>
                    {!r.logo_path && <span className="ml-2 text-[12px] text-alert-600">sans logo</span>}
                  </td>
                  <td className="px-4 py-3 text-night-700">{PROFILE_LABEL[r.profil]}</td>
                  <td className="px-4 py-3 text-night-700">{CATEGORY_LABEL[r.category]}</td>
                  <td className="px-4 py-3 text-night-700">{fmtDateTime(r.created_at)}</td>
                  <td className="px-4 py-3"><Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
