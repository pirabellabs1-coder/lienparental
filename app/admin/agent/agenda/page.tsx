import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listAppointments, listBlackouts, listReps, listTypes } from '@/lib/agent/admin'
import { slotLabel } from '@/lib/agent/core'
import { DemoNotice, Empty, ErrorBox, Note, OpsHeader, Panel, Pill, fmtDateTime } from '@/components/admin/ops/ui'
import { AgentTabs } from '@/components/admin/agent/AgentTabs'
import { BlackoutForm, OpButton, TypeEditor } from '@/components/admin/agent/AgentForms'

export const metadata: Metadata = { title: 'Agenda et rendez-vous' }
export const dynamic = 'force-dynamic'

export default async function AgendaAdminPage() {
  const ctx = await pageAdminCtx()
  let error: string | null = null
  const data = await Promise.all([listTypes(ctx), listBlackouts(ctx), listAppointments(ctx, 'upcoming'), listAppointments(ctx, 'past'), listReps(ctx)]).catch(() => {
    error = 'Agenda indisponible (migration 0640 appliquée ?).'
    return null
  })
  const [types, blackouts, upcoming, past, reps] = data ?? [[], [], [], [], []]
  const repName = (id: string | null) => (id ? reps.find((r) => r.id === id)?.name ?? '—' : 'Toute l’équipe')
  const typeLabel = (code: string) => types.find((t) => t.code === code)?.label_fr ?? code

  return (
    <div>
      <OpsHeader title="Agenda et rendez-vous" description="Un seul agenda pour le site, WhatsApp et le téléphone : un créneau réservé disparaît aussitôt partout. Heure de Cayenne." />
      <DemoNotice mode={ctx.mode} />
      <AgentTabs current="/admin/agent/agenda" />
      {error && <ErrorBox message={error} />}

      <Panel title="Types de rendez-vous" className="mt-6">
        <div className="space-y-2">
          {types.map((t) => <TypeEditor key={t.code} initial={{ code: t.code, label: t.label_fr, duration_min: t.duration_min, buffer_min: t.buffer_min, min_notice_min: t.min_notice_min, horizon_days: t.horizon_days, active: t.active }} />)}
        </div>
        <Note>Créneaux proposés : 3 à la fois, un par jour, dans les horaires des représentants du service. Modification ou annulation par la personne jusqu’à 2 h avant ; rappels par e-mail 24 h et 2 h avant si elle les a acceptés.</Note>
      </Panel>

      <Panel title="Indisponibilités (congés, fermetures)" className="mt-6">
        <BlackoutForm reps={reps.map((r) => ({ id: r.id, name: r.name }))} />
        {blackouts.length > 0 && (
          <ul className="mt-4 divide-y divide-night-100">
            {blackouts.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
                <span>{repName(b.representative_id)} · du {fmtDateTime(b.starts_at)} au {fmtDateTime(b.ends_at)}{b.reason ? ` · ${b.reason}` : ''}</span>
                <OpButton body={{ op: 'blackout.delete', id: b.id }} label="Supprimer" done="Supprimée." />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {[['Rendez-vous à venir', upcoming], ['Rendez-vous passés (derniers)', past.slice(0, 50)]].map(([title, list]) => (
        <Panel key={title as string} title={title as string} className="mt-6">
          {(list as typeof upcoming).length === 0 ? <Empty>Aucun rendez-vous.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13.5px]">
                <thead className="border-b border-night-100 text-[12px] uppercase tracking-wide text-night-500">
                  <tr><th scope="col" className="py-2 pr-3">Quand</th><th scope="col" className="pr-3">Motif</th><th scope="col" className="pr-3">Contact</th><th scope="col" className="pr-3">Avec</th><th scope="col" className="pr-3">Statut</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody className="divide-y divide-night-100">
                  {(list as typeof upcoming).map((a) => {
                    const l = slotLabel(a.starts_at, 'fr')
                    return (
                      <tr key={a.id}>
                        <td className="py-2 pr-3 first-letter:uppercase">{l.date} · {l.time}<br /><span className="text-[12px] text-night-500">{a.ref} · {a.channel} · {a.language.toUpperCase()}</span></td>
                        <td className="pr-3">{typeLabel(a.type_code)}{a.reason ? <span className="block text-[12px] text-night-500">{a.reason}</span> : null}</td>
                        <td className="pr-3">{a.contact_name}<span className="block text-[12px] text-night-500">{[a.contact_phone, a.contact_email].filter(Boolean).join(' · ')}</span></td>
                        <td className="pr-3">{repName(a.representative_id)}</td>
                        <td className="pr-3">{a.status === 'confirmed' ? <Pill tone="ok">Confirmé</Pill> : a.status === 'pending' ? <Pill tone="warn">E-mail à confirmer</Pill> : <Pill>Annulé</Pill>}</td>
                        <td>{a.status !== 'cancelled' && title === 'Rendez-vous à venir' && <OpButton body={{ op: 'appt.cancel', id: a.id }} label="Annuler" done="Annulé." danger confirm="Annuler ce rendez-vous ? La personne est prévenue par e-mail si elle en a donné un ; sinon, appelez-la." />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ))}
    </div>
  )
}
