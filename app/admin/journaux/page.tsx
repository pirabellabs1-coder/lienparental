import type { Metadata } from 'next'
import Link from 'next/link'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import { listAudit, type AuditPage } from '@/lib/admin/ops/journaux'
import { ACTION_LABEL, actionLabel, auditFiltersSchema, flatParams, type AuditFilters, type AuditRow } from '@/lib/admin/ops/types'
import { DemoNotice, Empty, ErrorBox, FilterBar, FilterField, Note, OpsHeader, Pill, btnSecondaryCls, fieldCls, fmtDateTime, hrefWith, linkCls, shortId, type Tone } from '@/components/admin/ops/ui'

export const metadata: Metadata = { title: 'Journaux' }
export const dynamic = 'force-dynamic'

type SP = Promise<Record<string, string | string[] | undefined>>

function tone(a: string): Tone {
  if (/delete|suspend|revoke|banned|failed|mfa_removed/.test(a)) return 'danger'
  if (/export|password|email_changed|force_logout/.test(a)) return 'warn'
  if (a.startsWith('admin.')) return 'info'
  return 'neutral'
}

const ACTOR: Record<string, string> = { admin: 'Administration', user: 'Utilisateur', system: 'Système', witness: 'Témoin' }

/** Métadonnées affichées : valeurs courtes uniquement (les écrivains n'y mettent aucune donnée personnelle). */
function meta(m: AuditRow['metadata']): string {
  return Object.entries(m)
    .filter(([, v]) => v !== null && v !== '' && (typeof v !== 'object' || Array.isArray(v)))
    .slice(0, 5)
    .map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(' → ') : String(v)}`)
    .join(' · ')
    .slice(0, 160)
}

export default async function JournauxPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageAdminCtx()
  const parsed = auditFiltersSchema.safeParse(flatParams(await searchParams))
  const f: AuditFilters = parsed.success ? parsed.data : {}
  let page: AuditPage | null = null
  let error: string | null = parsed.success ? null : 'Filtres invalides : ils ont été ignorés.'
  try {
    page = await listAudit(ctx, f)
  } catch (e) {
    error = e instanceof RepoError ? e.message : 'Journal indisponible.'
  }
  const filters = { categorie: f.categorie, action: f.action, compte: f.compte, du: f.du, au: f.au }

  return (
    <div>
      <OpsHeader title="Journaux d’audit" description="Trace en lecture seule des actions d’administration et des événements de sécurité. Les lignes ne peuvent être ni modifiées ni supprimées (conservation 12 mois)." />
      <DemoNotice mode={ctx.mode} />
      <Note>Aucune donnée personnelle n’est écrite dans le détail des événements : la personne concernée n’apparaît que par son identifiant.</Note>

      <FilterBar action="/admin/journaux" resetHref="/admin/journaux">
        <FilterField label="Catégorie" htmlFor="j-cat">
          <select id="j-cat" name="categorie" defaultValue={f.categorie ?? ''} className={fieldCls}>
            <option value="">Toutes</option>
            <option value="admin">Actions d’administration</option>
            <option value="securite">Sécurité et comptes</option>
          </select>
        </FilterField>
        <FilterField label="Action" htmlFor="j-action">
          <select id="j-action" name="action" defaultValue={f.action ?? ''} className={fieldCls}>
            <option value="">Toutes</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FilterField>
        <FilterField label="Compte concerné (identifiant)" htmlFor="j-compte">
          <input id="j-compte" name="compte" defaultValue={f.compte ?? ''} className={`${fieldCls} font-mono text-[13px]`} placeholder="uuid" autoComplete="off" spellCheck={false} />
        </FilterField>
        <FilterField label="Du" htmlFor="j-du">
          <input id="j-du" name="du" type="date" defaultValue={f.du ?? ''} className={fieldCls} />
        </FilterField>
        <FilterField label="Au" htmlFor="j-au">
          <input id="j-au" name="au" type="date" defaultValue={f.au ?? ''} className={fieldCls} />
        </FilterField>
      </FilterBar>

      {error && <ErrorBox message={error} />}

      {page && (
        <div className="mt-5">
          {page.rows.length === 0 ? <Empty>Aucun événement pour ces filtres.</Empty> : (
            <div className="overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white shadow-soft">
              <table className="min-w-full text-[13.5px]">
                <caption className="sr-only">Journal d’audit, du plus récent au plus ancien</caption>
                <thead className="bg-night-50 text-left text-night-700">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Événement</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Auteur</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Concerne</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r.id} className="border-t border-night-100 align-top">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12.5px] text-night-700">{fmtDateTime(r.createdAt)}</td>
                      <td className="px-4 py-3"><Pill tone={tone(r.action)}>{actionLabel(r.action)}</Pill></td>
                      <td className="px-4 py-3 text-night-800">
                        {ACTOR[r.actorType] ?? r.actorType}
                        {r.actorEmail && <span className="block break-all text-[12px] text-night-600">{r.actorEmail}</span>}
                      </td>
                      <td className="px-4 py-3 text-night-700">
                        {r.subjectId ? (
                          <Link className={`${linkCls} font-mono text-[12.5px]`} href={`/admin/comptes/${r.subjectId}`}>
                            compte {shortId(r.subjectId)}
                          </Link>
                        ) : r.entity ? <span className="font-mono text-[12.5px]">{r.entity}{r.entityId ? `/${shortId(r.entityId)}` : ''}</span> : ''}
                      </td>
                      <td className="max-w-[320px] px-4 py-3 text-[12.5px] text-night-600">{meta(r.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label="Pagination du journal" className="mt-4 flex flex-wrap justify-end gap-2">
            {f.avant && <Link className={btnSecondaryCls} href={hrefWith('/admin/journaux', filters)}>Plus récents</Link>}
            {page.nextBefore && <Link className={btnSecondaryCls} href={hrefWith('/admin/journaux', { ...filters, avant: page.nextBefore })}>Plus anciens</Link>}
          </nav>
        </div>
      )}
    </div>
  )
}
