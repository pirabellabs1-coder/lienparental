import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Download, Users } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import { listAccounts, type AccountPage } from '@/lib/admin/ops/comptes'
import {
  ACCOUNT_PLANS, ACCOUNT_STATUSES, PLAN_LABEL, STATUS_LABEL, accountFiltersSchema, flatParams,
  type AccountFilters,
} from '@/lib/admin/ops/types'
import {
  DemoNotice, Empty, ErrorBox, FilterBar, FilterField, Note, OpsHeader, Pill, btnSecondaryCls, fieldCls, fmtDate, fmtDateTime, fmtMb, hrefWith, linkCls,
} from '@/components/admin/ops/ui'
import { PLAN_TONE, STATUS_TONE } from '@/components/admin/ops/tones'

export const metadata: Metadata = { title: 'Comptes' }
export const dynamic = 'force-dynamic'

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function ComptesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageAdminCtx()
  const parsed = accountFiltersSchema.safeParse(flatParams(await searchParams))
  const f: AccountFilters = parsed.success ? parsed.data : {}
  let page: AccountPage | null = null
  let error: string | null = parsed.success ? null : 'Filtres invalides : ils ont été ignorés.'
  try {
    page = await listAccounts(ctx, f)
  } catch (e) {
    error = e instanceof RepoError ? e.message : 'Liste des comptes indisponible.'
  }
  const filters = { q: f.q, plan: f.plan, statut: f.statut, du: f.du, au: f.au }

  return (
    <div>
      <OpsHeader
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title="Comptes"
        description="Rechercher, consulter et gérer les comptes. Seules les informations nécessaires à l’assistance sont affichées."
        actions={
          <a href={hrefWith('/api/admin/comptes/export', filters)} className={btnSecondaryCls} download>
            <Download className="h-4 w-4" aria-hidden="true" /> Exporter en CSV<span className="sr-only"> (filtres appliqués, sans nom ni contenu)</span>
          </a>
        }
      />
      <DemoNotice mode={ctx.mode} />
      <Note tone="privacy">
        Minimisation : l’administration ne voit jamais le Journal, le coffre-fort, les témoignages, la messagerie ni les informations de santé d’un utilisateur. Les enfants sont seulement comptés.
      </Note>

      <FilterBar action="/admin/comptes" resetHref="/admin/comptes">
        <FilterField label="E-mail, prénom ou nom" htmlFor="f-q">
          <input id="f-q" name="q" type="search" defaultValue={f.q ?? ''} maxLength={120} className={fieldCls} placeholder="ex. camille@" autoComplete="off" />
        </FilterField>
        <FilterField label="Formule" htmlFor="f-plan">
          <select id="f-plan" name="plan" defaultValue={f.plan ?? ''} className={fieldCls}>
            <option value="">Toutes</option>
            {ACCOUNT_PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>
        </FilterField>
        <FilterField label="Statut" htmlFor="f-statut">
          <select id="f-statut" name="statut" defaultValue={f.statut ?? ''} className={fieldCls}>
            <option value="">Tous (hors supprimés)</option>
            {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </FilterField>
        <FilterField label="Inscrit à partir du" htmlFor="f-du">
          <input id="f-du" name="du" type="date" defaultValue={f.du ?? ''} className={fieldCls} />
        </FilterField>
        <FilterField label="Inscrit jusqu’au" htmlFor="f-au">
          <input id="f-au" name="au" type="date" defaultValue={f.au ?? ''} className={fieldCls} />
        </FilterField>
      </FilterBar>

      {error && <ErrorBox message={error} />}

      {page && (
        <div className="mt-5">
          {page.rows.length === 0 ? (
            <Empty>Aucun compte ne correspond à ces filtres.</Empty>
          ) : (
            <>
              {/* Grand écran : tableau */}
              <div className="hidden overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-soft md:block">
                <table className="min-w-full text-[14px]">
                  <caption className="sr-only">Comptes (50 par page, du plus récent au plus ancien)</caption>
                  <thead className="border-b border-night-100 bg-night-50/70 text-left text-[11px] uppercase tracking-wider text-night-500">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-bold">Compte</th>
                      <th scope="col" className="px-4 py-3 font-bold">Formule</th>
                      <th scope="col" className="px-4 py-3 font-bold">Statut</th>
                      <th scope="col" className="px-4 py-3 font-bold">Inscription</th>
                      <th scope="col" className="px-4 py-3 font-bold">Dernière connexion</th>
                      <th scope="col" className="px-4 py-3 text-right font-bold">Stockage</th>
                      <th scope="col" className="px-4 py-3 text-right font-bold">Enfants</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Ouvrir</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-night-100">
                    {page.rows.map((r) => {
                      const name = [r.prenom, r.nom].filter(Boolean).join(' ') || 'Sans nom'
                      const initial = (r.prenom?.[0] ?? r.nom?.[0] ?? r.email[0] ?? '?').toLocaleUpperCase('fr')
                      return (
                      <tr key={r.id} className="align-middle transition-colors hover:bg-night-50/60">
                        <td className="max-w-[300px] px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night-100 text-[12.5px] font-bold text-night-600">{initial}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-night-900">{name}</span>
                              <span className="block truncate font-mono text-[12px] text-night-500">{r.email}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><Pill tone={PLAN_TONE[r.plan]}>{PLAN_LABEL[r.plan]}</Pill></td>
                        <td className="px-4 py-3"><Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill></td>
                        <td className="whitespace-nowrap px-4 py-3 text-night-700">{fmtDate(r.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-night-700">{fmtDateTime(r.lastSignInAt) || 'Jamais'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-night-700">{fmtMb(r.storageMb)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-night-700">{r.childrenCount}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/admin/comptes/${r.id}`} className={`${linkCls} inline-flex min-h-[44px] items-center gap-1 px-1 text-[13.5px]`}>
                            Ouvrir<span className="sr-only"> le compte {r.email}</span> <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>

              {/* Mobile : cartes */}
              <ul className="space-y-3 md:hidden" aria-label="Comptes">
                {page.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/comptes/${r.id}`} className="block rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                      <p className="font-semibold text-night-900">{[r.prenom, r.nom].filter(Boolean).join(' ') || 'Sans nom'}</p>
                      <p className="truncate font-mono text-[12px] text-night-600">{r.email}</p>
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        <Pill tone={PLAN_TONE[r.plan]}>{PLAN_LABEL[r.plan]}</Pill>
                        <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                      </p>
                      <p className="mt-2 text-[12.5px] text-night-600">Inscrit le {fmtDate(r.createdAt)} · {fmtMb(r.storageMb)} · {r.childrenCount} enfant{r.childrenCount > 1 ? 's' : ''}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <nav aria-label="Pagination des comptes" className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13.5px] text-night-600">
            <span>{page.rows.length} compte{page.rows.length > 1 ? 's' : ''} sur cette page</span>
            <span className="flex gap-2">
              {f.apres && <Link href={hrefWith('/admin/comptes', filters)} className={btnSecondaryCls}>Première page</Link>}
              {page.nextCursor && <Link href={hrefWith('/admin/comptes', { ...filters, apres: page.nextCursor })} className={btnSecondaryCls}>Page suivante</Link>}
            </span>
          </nav>
        </div>
      )}
    </div>
  )
}
