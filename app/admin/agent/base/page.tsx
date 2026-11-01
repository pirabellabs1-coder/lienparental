import type { Metadata } from 'next'
import Link from 'next/link'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listKb } from '@/lib/agent/admin'
import { liveEntries, type KbEntry } from '@/lib/agent/core'
import { DemoNotice, Empty, ErrorBox, Note, OpsHeader, Panel, Pill, fmtDateTime, linkCls } from '@/components/admin/ops/ui'
import { AgentTabs, CATEGORY_LABEL, KB_STATUS } from '@/components/admin/agent/AgentTabs'
import { KbActions, KbEditor } from '@/components/admin/agent/AgentForms'

export const metadata: Metadata = { title: 'Base de connaissances' }
export const dynamic = 'force-dynamic'

export default async function KbAdminPage({ searchParams }: { searchParams: Promise<{ fiche?: string; nouvelle?: string }> }) {
  const ctx = await pageAdminCtx()
  const sp = await searchParams
  let entries: KbEntry[] = []
  let error: string | null = null
  try {
    entries = await listKb(ctx)
  } catch {
    error = 'Base de connaissances indisponible (migration 0640 appliquée ?).'
  }
  const live = new Set(liveEntries(entries, Date.now()).map((e) => e.id))
  const groups = new Map<string, KbEntry[]>()
  for (const e of entries) groups.set(`${e.entry_key}|${e.locale}`, [...(groups.get(`${e.entry_key}|${e.locale}`) ?? []), e])
  const selected = sp.fiche ? groups.get(sp.fiche) : undefined
  const latest = selected?.slice().sort((a, b) => b.version - a.version)[0]

  return (
    <div>
      <OpsHeader title="Base de connaissances" description="Seule source des réponses de l’assistant, en plus des tarifs officiels. Une fiche n’est utilisée qu’une fois publiée (ou à sa date de publication programmée) ; la modification apparaît sur l’assistant en une minute, sans redéploiement." />
      <DemoNotice mode={ctx.mode} />
      <AgentTabs current="/admin/agent/base" />
      {error && <ErrorBox message={error} />}
      <Note>Les prix et crédits viennent de la configuration des offres : ne les recopiez pas dans une fiche, pour éviter deux sources contradictoires.</Note>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] [&>*]:min-w-0">
        <Panel title={`Fiches (${groups.size})`} actions={<Link href="/admin/agent/base?nouvelle=1" className={linkCls}>Nouvelle fiche</Link>}>
          {groups.size === 0 ? <Empty>Aucune fiche. Créez la première.</Empty> : (
            <ul className="divide-y divide-night-100">
              {[...groups.entries()].map(([k, list]) => {
                const top = list.slice().sort((a, b) => b.version - a.version)[0]!
                const active = list.find((e) => live.has(e.id))
                return (
                  <li key={k} className="py-2.5">
                    <Link href={`/admin/agent/base?fiche=${encodeURIComponent(k)}`} aria-current={sp.fiche === k ? 'true' : undefined} className="block rounded-lg px-2 py-1 hover:bg-night-50 aria-[current=true]:bg-night-50">
                      <span className="block text-[14px] font-semibold text-night-900">{top.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-night-600">
                        {top.entry_key} · {top.locale.toUpperCase()} · {CATEGORY_LABEL[top.category]}
                        {active ? <Pill tone="ok">En ligne v{active.version}</Pill> : <Pill>Hors ligne</Pill>}
                        {top !== active && <Pill tone={KB_STATUS[top.status]!.tone}>v{top.version} {KB_STATUS[top.status]!.label.toLowerCase()}</Pill>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          {(sp.nouvelle || !selected) && (
            <Panel title="Nouvelle fiche">
              <KbEditor categories={CATEGORY_LABEL} initial={{ entry_key: '', locale: 'fr', category: 'presentation', title: '', questions: '', answer: '', source: '' }} />
            </Panel>
          )}
          {selected && latest && (
            <>
              <Panel title={`Modifier « ${latest.title} »`}>
                <KbEditor key={latest.id} categories={CATEGORY_LABEL} initial={{ id: latest.id, entry_key: latest.entry_key, locale: latest.locale, category: latest.category, title: latest.title, questions: latest.questions, answer: latest.answer, source: latest.source ?? '' }} />
              </Panel>
              <Panel title="Versions">
                <ul className="space-y-3">
                  {selected.slice().sort((a, b) => b.version - a.version).map((e) => (
                    <li key={e.id} className="rounded-xl border border-night-100 p-3">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-night-900">
                        Version {e.version} <Pill tone={KB_STATUS[e.status]!.tone}>{KB_STATUS[e.status]!.label}</Pill>
                        {live.has(e.id) && <Pill tone="ok">Utilisée par l’assistant</Pill>}
                      </p>
                      <p className="mt-1 text-[12.5px] text-night-600">
                        {e.author ?? '—'} · {fmtDateTime(e.updated_at)}{e.status === 'scheduled' && e.effective_at ? ` · publication le ${fmtDateTime(e.effective_at)}` : ''}{e.source ? ` · source : ${e.source}` : ''}
                      </p>
                      <p className="mt-2 line-clamp-4 whitespace-pre-line text-[13.5px] text-night-800">{e.answer}</p>
                      <div className="mt-2"><KbActions id={e.id} status={e.status} /></div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
