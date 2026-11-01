import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listAppointments, listCallbacks, listReps, stats } from '@/lib/agent/admin'
import { slotLabel } from '@/lib/agent/core'
import { DemoNotice, Empty, ErrorBox, Note, OpsHeader, Panel, Pill, fmtDateTime } from '@/components/admin/ops/ui'
import { AgentTabs } from '@/components/admin/agent/AgentTabs'
import { OpButton } from '@/components/admin/agent/AgentForms'

export const metadata: Metadata = { title: 'Agent d’accueil' }
export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  answer_ai: 'Réponses de l’IA', answer_kb: 'Réponses de la base (sans IA)', answer_fallback: 'Réponses prédéfinies', answer_escalated: 'Orientations vers un humain',
  ai_error: 'Erreurs du fournisseur IA', appointment_booked: 'Rendez-vous pris', appointment_changed: 'Rendez-vous déplacés', appointment_cancelled: 'Rendez-vous annulés',
  callback_requested: 'Demandes de rappel', human_available: 'Représentant disponible', human_unavailable: 'Représentant indisponible',
}

export default async function AgentAdminPage() {
  const ctx = await pageAdminCtx()
  let error: string | null = null
  const data = await Promise.all([stats(ctx, 30), listCallbacks(ctx, 'new'), listAppointments(ctx, 'upcoming'), listReps(ctx)]).catch(() => {
    error = 'Données de l’agent indisponibles (migration 0640 appliquée ?).'
    return null
  })
  const [s, callbacks, upcoming, reps] = data ?? [null, [], [], []]
  const repName = (id: string) => reps.find((r) => r.id === id)?.name ?? '—'
  const row = (label: string, n: number) => (
    <div key={label} className="flex justify-between border-b border-night-100 py-1.5 text-[14px] last:border-0"><span className="text-night-700">{label}</span><strong>{n}</strong></div>
  )

  return (
    <div>
      <OpsHeader title="Agent d’accueil" description="Assistant du site aujourd’hui ; WhatsApp et standard téléphonique viendront s’appuyer sur la même base, le même agenda et les mêmes représentants." />
      <DemoNotice mode={ctx.mode} />
      <AgentTabs current="/admin/agent" />
      {error && <ErrorBox message={error} />}

      {s && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel title={`Activité sur ${s.days} jours`}>
            {row('Événements enregistrés', s.total)}
            {Object.entries(s.byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => row(KIND_LABEL[k] ?? k, n))}
          </Panel>
          <Panel title="Langues et canaux">
            {Object.entries(s.byLocale).map(([k, n]) => row(k.toUpperCase(), n))}
            {Object.entries(s.byChannel).map(([k, n]) => row(k === 'web' ? 'Site' : k === 'whatsapp' ? 'WhatsApp' : 'Téléphone', n))}
          </Panel>
          <Panel title="Intentions détectées">
            {Object.keys(s.byIntent).length ? Object.entries(s.byIntent).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => row(k, n)) : <p className="text-[14px] text-night-600">Aucune donnée pour le moment.</p>}
          </Panel>
        </div>
      )}
      <Note tone="privacy">Statistiques sans contenu : canal, langue, type d’événement et intention. Aucune question ni réponse n’est conservée ; elles sont supprimées au bout de 90 jours.</Note>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title={`Rappels à traiter (${callbacks.length})`}>
          {callbacks.length === 0 ? <Empty>Aucune demande de rappel en attente.</Empty> : (
            <ul className="divide-y divide-night-100">
              {callbacks.map((c) => (
                <li key={c.id} className="py-3 text-[14px]">
                  <p className="font-semibold text-night-900">{c.name} · <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a> <Pill>{c.language.toUpperCase()}</Pill></p>
                  <p className="mt-1 whitespace-pre-line text-night-700">{c.reason}</p>
                  <p className="mt-1 text-[12.5px] text-night-500">Reçue le {fmtDateTime(c.created_at)}</p>
                  <div className="mt-2"><OpButton body={{ op: 'callback.status', id: c.id, status: 'done' }} label="Marquer traité" done="Rappel traité." /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Prochains rendez-vous (${upcoming.filter((a) => a.status === 'confirmed').length})`}>
          {upcoming.filter((a) => a.status === 'confirmed').length === 0 ? <Empty>Aucun rendez-vous à venir.</Empty> : (
            <ul className="divide-y divide-night-100">
              {upcoming.filter((a) => a.status === 'confirmed').slice(0, 15).map((a) => {
                const l = slotLabel(a.starts_at, 'fr')
                return (
                  <li key={a.id} className="py-3 text-[14px]">
                    <p className="font-semibold text-night-900 first-letter:uppercase">{l.date} · {l.time}</p>
                    <p className="text-night-700">{a.contact_name} · {a.type_code} · avec {repName(a.representative_id)} · {a.ref}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
