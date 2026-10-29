import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, ShieldAlert } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import {
  REPORT_REASON_LABEL, listTestimonyReports, listTestimonyRequests, testimonyOverview,
  type TestimonyPage, type TestimonyReportRow,
} from '@/lib/admin/ops/temoignages'
import {
  TESTIMONY_STATUSES, TESTIMONY_STATUS_LABEL, flatParams, testimonyFiltersSchema,
  type TestimonyFilters, type TestimonyOverview,
} from '@/lib/admin/ops/types'
import { RevokeButton } from '@/components/admin/ops/RevokeButton'
import { ReportDecision } from '@/components/admin/ops/ReportDecision'
import { DemoNotice, Empty, ErrorBox, FilterBar, FilterField, OpsHeader, Pill, btnSecondaryCls, fieldCls, fmtDate, hrefWith, linkCls, shortId } from '@/components/admin/ops/ui'
import { TESTIMONY_TONE } from '@/components/admin/ops/tones'

export const metadata: Metadata = { title: 'Témoignages' }
export const dynamic = 'force-dynamic'

type SP = Promise<Record<string, string | string[] | undefined>>

const OPEN = new Set(['pending', 'opened', 'in_progress'])

export default async function TemoignagesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageAdminCtx()
  const parsed = testimonyFiltersSchema.safeParse(flatParams(await searchParams))
  const f: TestimonyFilters = parsed.success ? parsed.data : {}
  let overview: TestimonyOverview | null = null
  let page: TestimonyPage | null = null
  let reports: TestimonyReportRow[] | null = null
  let reportsError: string | null = null
  let error: string | null = parsed.success ? null : 'Filtres invalides : ils ont été ignorés.'
  try {
    ;[overview, page] = await Promise.all([testimonyOverview(ctx), listTestimonyRequests(ctx, f)])
  } catch (e) {
    error = e instanceof RepoError ? e.message : 'Suivi des témoignages indisponible.'
  }
  try {
    reports = await listTestimonyReports(ctx, 'open')
  } catch (e) {
    reportsError = e instanceof RepoError ? e.message : 'Signalements indisponibles (migration 0570 appliquée ?).'
  }
  const filters = { statut: f.statut, compte: f.compte }

  return (
    <div>
      <OpsHeader title="Témoignages" description="Modération par métadonnées : statut des demandes, signalements et révocation d’un lien. Le contenu reste inaccessible." />
      <DemoNotice mode={ctx.mode} />

      <div role="note" className="mt-4 flex items-start gap-3 rounded-2xl border border-alert-200 bg-alert-50 p-4 text-[13.5px] text-alert-700">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-bold">Confidentialité des témoignages</p>
          <p className="mt-1">
            La politique de confidentialité ne prévoit aucune lecture des témoignages par l’équipe : ni le texte, ni les réponses, ni les pièces,
            ni le nom du témoin, ni le message du parent ne sont affichés ici, même signalés. Un témoignage reçu est irréversible pour le
            parent et le témoin : seul un administrateur peut le supprimer, à partir d’un signalement du parent (motif et précisions).
          </p>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {overview && (
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Demandes (30 jours)" value={overview.requests30d} />
          <Stat label="Témoignages reçus (30 jours)" value={overview.submitted30d} />
          <Stat label="Liens ouverts en attente" value={(overview.byStatus.pending ?? 0) + (overview.byStatus.opened ?? 0) + (overview.byStatus.in_progress ?? 0)} />
          <Stat label="Tickets d’abus au support" value={overview.reportsOpen}
            link={overview.reportsOpen > 0 ? hrefWith('/admin/support', { categorie: 'abus', statut: 'en_cours' }) : undefined} />
        </dl>
      )}

      <section aria-labelledby="reports-title" className="mt-6">
        <h2 id="reports-title" className="text-[17px] font-extrabold text-night-900">
          Signalements à traiter{reports ? ` (${reports.length})` : ''}
        </h2>
        {reportsError && <ErrorBox message={reportsError} />}
        {reports && (reports.length === 0 ? <div className="mt-3"><Empty>Aucun signalement en attente.</Empty></div> : (
          <ul className="mt-3 space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-night-900">
                      <span className="font-mono">{r.reference}</span>
                      <Pill tone="warn">{REPORT_REASON_LABEL[r.reason]}</Pill>
                    </p>
                    <p className="mt-1 text-[12.5px] text-night-600">
                      Signalé le {fmtDate(r.createdAt)} · compte{' '}
                      <Link className={`${linkCls} font-mono`} href={`/admin/comptes/${r.ownerId}`}>{shortId(r.ownerId)}</Link>
                    </p>
                    {r.details && (
                      <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-night-50 px-3 py-2 text-[13.5px] text-night-800">
                        <span className="sr-only">Précisions du parent : </span>{r.details}
                      </p>
                    )}
                  </div>
                  <ReportDecision id={r.id} reference={r.reference} />
                </div>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <FilterBar action="/admin/temoignages" resetHref="/admin/temoignages">
        <FilterField label="Statut" htmlFor="t-statut">
          <select id="t-statut" name="statut" defaultValue={f.statut ?? ''} className={fieldCls}>
            <option value="">Tous</option>
            {TESTIMONY_STATUSES.map((s) => <option key={s} value={s}>{TESTIMONY_STATUS_LABEL[s]}{overview?.byStatus[s] ? ` (${overview.byStatus[s]})` : ''}</option>)}
          </select>
        </FilterField>
        <FilterField label="Compte du parent (identifiant)" htmlFor="t-compte">
          <input id="t-compte" name="compte" defaultValue={f.compte ?? ''} className={`${fieldCls} font-mono text-[13px]`} placeholder="uuid" autoComplete="off" spellCheck={false} />
        </FilterField>
      </FilterBar>

      {page && (
        <div className="mt-5">
          {page.rows.length === 0 ? <Empty>Aucune demande pour ces filtres.</Empty> : (
            <div className="overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white shadow-soft">
              <table className="min-w-full text-[13.5px]">
                <caption className="sr-only">Demandes de témoignage (métadonnées)</caption>
                <thead className="bg-night-50 text-left text-night-700">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Demande</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Compte du parent</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Créée</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Expire / clôturée</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Contenu</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r.id} className="border-t border-night-100 align-middle">
                      <td className="px-4 py-3 font-mono text-[12.5px] text-night-700">{shortId(r.id)}</td>
                      <td className="px-4 py-3">
                        <Link className={`${linkCls} font-mono text-[12.5px]`} href={`/admin/comptes/${r.userId}`}>{shortId(r.userId)}</Link>
                      </td>
                      <td className="px-4 py-3"><Pill tone={TESTIMONY_TONE[r.status]}>{TESTIMONY_STATUS_LABEL[r.status]}</Pill></td>
                      <td className="whitespace-nowrap px-4 py-3 text-night-700">{fmtDate(r.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-night-700">
                        {r.revokedAt ? `révoquée le ${fmtDate(r.revokedAt)}` : r.submittedAt ? `reçue le ${fmtDate(r.submittedAt)}` : fmtDate(r.expiresAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-night-100 px-2.5 py-1 text-[11.5px] font-semibold text-night-700">
                          <Lock className="h-3 w-3" aria-hidden="true" /> {r.hasTestimony ? 'reçu, inaccessible' : 'inaccessible'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {OPEN.has(r.status) ? <RevokeButton id={r.id} label={shortId(r.id)} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label="Pagination des demandes" className="mt-4 flex justify-end gap-2">
            {f.apres && <Link className={btnSecondaryCls} href={hrefWith('/admin/temoignages', filters)}>Première page</Link>}
            {page.nextCursor && <Link className={btnSecondaryCls} href={hrefWith('/admin/temoignages', { ...filters, apres: page.nextCursor })}>Page suivante</Link>}
          </nav>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, link }: { label: string; value: number; link?: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft">
      <dt className="text-[12.5px] font-semibold text-night-600">{label}</dt>
      <dd className="mt-1 text-[26px] font-extrabold tabular-nums text-night-900">
        {link ? <Link className={linkCls} href={link}>{value}</Link> : value}
      </dd>
    </div>
  )
}
