import type { Metadata } from 'next'
import Link from 'next/link'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import { listTickets, type TicketPage } from '@/lib/admin/ops/support'
import {
  CATEGORY_LABEL, PRIORITY_LABEL, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, TICKET_STATUS_LABEL,
  flatParams, ticketFiltersSchema, type TicketFilters,
} from '@/lib/admin/ops/types'
import { DemoNotice, Empty, ErrorBox, FilterBar, FilterField, Note, OpsHeader, Pill, btnSecondaryCls, fieldCls, fmtDateTime, hrefWith, linkCls } from '@/components/admin/ops/ui'
import { PRIORITY_TONE, TICKET_STATUS_TONE } from '@/components/admin/ops/tones'

export const metadata: Metadata = { title: 'Support' }
export const dynamic = 'force-dynamic'

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function SupportPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageAdminCtx()
  const raw = flatParams(await searchParams)
  // Par défaut : la file des tickets à traiter.
  const parsed = ticketFiltersSchema.safeParse({ statut: 'en_cours', ...raw, ...(raw.statut === 'tous' ? { statut: undefined } : {}) })
  const f: TicketFilters = parsed.success ? parsed.data : { statut: 'en_cours' }
  let page: TicketPage | null = null
  let error: string | null = parsed.success ? null : 'Filtres invalides : ils ont été ignorés.'
  try {
    page = await listTickets(ctx, f)
  } catch (e) {
    error = e instanceof RepoError ? e.message : 'File du support indisponible.'
  }
  const filters = { statut: f.statut ?? 'tous', priorite: f.priorite, categorie: f.categorie, q: f.q }

  return (
    <div>
      <OpsHeader title="Support" description="Demandes envoyées depuis le centre d’aide. Les abonnés Coparentalité+ passent en premier (assistance prioritaire), puis l’ordre d’arrivée." />
      <DemoNotice mode={ctx.mode} />
      <Note>
        Priorité posée par la base selon la formule effective du demandeur : haute pour Coparentalité+, normale pour Premium, basse pour Gratuit. « Urgente » est réservée au support.
      </Note>

      <FilterBar action="/admin/support" resetHref="/admin/support">
        <FilterField label="Recherche (objet, e-mail)" htmlFor="s-q">
          <input id="s-q" name="q" type="search" defaultValue={f.q ?? ''} maxLength={120} className={fieldCls} autoComplete="off" />
        </FilterField>
        <FilterField label="Statut" htmlFor="s-statut">
          <select id="s-statut" name="statut" defaultValue={f.statut ?? 'tous'} className={fieldCls}>
            <option value="en_cours">À traiter (ouverts, en cours, en attente)</option>
            <option value="tous">Tous</option>
            {TICKET_STATUSES.map((s) => <option key={s} value={s}>{TICKET_STATUS_LABEL[s]}</option>)}
          </select>
        </FilterField>
        <FilterField label="Priorité" htmlFor="s-prio">
          <select id="s-prio" name="priorite" defaultValue={f.priorite ?? ''} className={fieldCls}>
            <option value="">Toutes</option>
            {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </FilterField>
        <FilterField label="Catégorie" htmlFor="s-cat">
          <select id="s-cat" name="categorie" defaultValue={f.categorie ?? ''} className={fieldCls}>
            <option value="">Toutes</option>
            {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </FilterField>
      </FilterBar>

      {error && <ErrorBox message={error} />}

      {page && (
        <div className="mt-5">
          {page.rows.length === 0 ? <Empty>Aucun ticket pour ces filtres.</Empty> : (
            <ul className="space-y-2.5" aria-label="Tickets de support">
              {page.rows.map((t) => (
                <li key={t.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/admin/support/${t.id}`} className={`${linkCls} text-[15px]`}>{t.subject}</Link>
                      <p className="mt-0.5 truncate text-[13px] text-night-600">
                        {t.userEmail ?? 'Compte supprimé'} · {CATEGORY_LABEL[t.category]} · {t.messageCount} message{t.messageCount > 1 ? 's' : ''}
                      </p>
                    </div>
                    <p className="flex shrink-0 flex-wrap gap-1.5">
                      <Pill tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority].split(' (')[0]}</Pill>
                      <Pill tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Pill>
                    </p>
                  </div>
                  <p className="mt-2 text-[12.5px] text-night-500">
                    Ouvert le {fmtDateTime(t.createdAt)}
                    {t.lastReplyAt ? ` · dernière réponse ${t.lastReplyBy === 'admin' ? 'du support' : 'de l’utilisateur'} le ${fmtDateTime(t.lastReplyAt)}` : ' · sans réponse'}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Pagination des tickets" className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13.5px] text-night-600">
            <span>{page.total} ticket{page.total > 1 ? 's' : ''} · page {page.page} sur {page.pages}</span>
            <span className="flex gap-2">
              {page.page > 1 && <Link className={btnSecondaryCls} href={hrefWith('/admin/support', { ...filters, page: page.page - 1 })}>Page précédente</Link>}
              {page.page < page.pages && <Link className={btnSecondaryCls} href={hrefWith('/admin/support', { ...filters, page: page.page + 1 })}>Page suivante</Link>}
            </span>
          </nav>
        </div>
      )}
    </div>
  )
}
