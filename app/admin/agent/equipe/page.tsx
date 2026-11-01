import type { Metadata } from 'next'
import Link from 'next/link'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listReps, listServices } from '@/lib/agent/admin'
import { availableNow } from '@/lib/agent/core'
import type { RepRow, ServiceRow } from '@/lib/agent/repo'
import { DemoNotice, Empty, ErrorBox, Note, OpsHeader, Panel, Pill, linkCls } from '@/components/admin/ops/ui'
import { AgentTabs } from '@/components/admin/agent/AgentTabs'
import { RepEditor } from '@/components/admin/agent/AgentForms'

export const metadata: Metadata = { title: 'Services et représentants' }
export const dynamic = 'force-dynamic'

const MODE: Record<ServiceRow['ai_mode'], string> = { answer: 'L’IA répond', qualify: 'Pré-qualification', limited: 'Réponse limitée' }

export default async function TeamAdminPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const ctx = await pageAdminCtx()
  const sp = await searchParams
  let reps: RepRow[] = []
  let services: ServiceRow[] = []
  let error: string | null = null
  try {
    ;[reps, services] = await Promise.all([listReps(ctx), listServices(ctx)])
  } catch {
    error = 'Annuaire indisponible (migration 0640 appliquée ?).'
  }
  const opts = services.map((s) => ({ code: s.code, label: s.label_fr }))
  const editing = sp.id ? reps.find((r) => r.id === sp.id) : undefined
  const now = Date.now()

  return (
    <div>
      <OpsHeader title="Services et représentants" description="Qui répond à quoi, dans quelles langues et à quelles heures. L’assistant ne propose « parler à un représentant » que dans ces horaires ; hors horaires, il propose un rendez-vous, un rappel ou l’e-mail." />
      <DemoNotice mode={ctx.mode} />
      <AgentTabs current="/admin/agent/equipe" />
      {error && <ErrorBox message={error} />}

      <Panel title="Services" className="mt-6">
        <ul className="grid gap-2 sm:grid-cols-3">
          {services.map((s) => {
            const n = reps.filter((r) => r.active && r.services.includes(s.code)).length
            return (
              <li key={s.code} className="rounded-xl border border-night-100 p-3 text-[14px]">
                <p className="font-semibold text-night-900">{s.label_fr}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-[12.5px] text-night-600"><Pill>{MODE[s.ai_mode]}</Pill>{n ? <Pill tone="ok">{n} représentant{n > 1 ? 's' : ''}</Pill> : <Pill tone="warn">Personne</Pill>}</p>
              </li>
            )
          })}
        </ul>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] [&>*]:min-w-0">
        <Panel title={`Représentants (${reps.length})`} actions={<Link href="/admin/agent/equipe" className={linkCls}>Ajouter</Link>}>
          {reps.length === 0 ? <Empty>Aucun représentant : l’assistant propose alors seulement le rappel et l’e-mail.</Empty> : (
            <ul className="divide-y divide-night-100">
              {reps.map((r) => {
                const on = r.services.some((s) => r.languages.some((l) => availableNow([r], s, l, now).length))
                return (
                  <li key={r.id} className="py-2.5">
                    <Link href={`/admin/agent/equipe?id=${r.id}`} className="block rounded-lg px-2 py-1 hover:bg-night-50">
                      <span className="block text-[14px] font-semibold text-night-900">{r.name}{r.role ? ` · ${r.role}` : ''}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1.5 text-[12.5px] text-night-600">
                        {r.languages.map((l) => l.toUpperCase()).join(' / ')} · priorité {r.priority}
                        {!r.active ? <Pill>Inactif</Pill> : r.status === 'unavailable' ? <Pill tone="warn">Absent</Pill> : on ? <Pill tone="ok">Disponible maintenant</Pill> : <Pill>Hors horaires</Pill>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
        <Panel title={editing ? `Modifier ${editing.name}` : 'Nouveau représentant'}>
          <RepEditor
            key={editing?.id ?? 'new'}
            services={opts}
            initial={editing ? {
              id: editing.id, name: editing.name, role: editing.role ?? '', email: editing.email ?? '', transfer_phone: editing.transfer_phone ?? '',
              languages: editing.languages, services: editing.services, hours: editing.hours as Record<string, [string, string][]>,
              status: editing.status, priority: editing.priority, active: editing.active,
            } : { name: '', role: '', email: '', transfer_phone: '', languages: ['fr'], services: ['info'], hours: { '1': [['08:00', '12:00']], '2': [['08:00', '12:00']], '3': [['08:00', '12:00']], '4': [['08:00', '12:00']], '5': [['08:00', '12:00']] }, status: 'auto', priority: 100, active: true }}
          />
          <Note tone="privacy">L’e-mail et le numéro de transfert ne sont jamais affichés aux visiteurs : ils servent aux avis de rendez-vous et, plus tard, au transfert d’appel.</Note>
        </Panel>
      </div>
    </div>
  )
}
