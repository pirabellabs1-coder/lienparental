import type { Metadata } from 'next'
import Link from 'next/link'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listWaConversations, listWaMessages } from '@/lib/agent/admin'
import { TWILIO_WA_ENABLED, twilioStatus } from '@/lib/agent/twilio'
import type { Conversation, WaMessage } from '@/lib/agent/whatsapp'
import { DemoNotice, Empty, ErrorBox, Note, OpsHeader, Panel, Pill, fmtDateTime } from '@/components/admin/ops/ui'
import { AgentTabs } from '@/components/admin/agent/AgentTabs'
import { OpButton, WaReply } from '@/components/admin/agent/AgentForms'
import { cn } from '@/lib/cn'

export const metadata: Metadata = { title: 'WhatsApp' }
export const dynamic = 'force-dynamic'

const humanActive = (c: Conversation) => c.mode === 'human' && Boolean(c.human_until) && Date.parse(c.human_until!) > Date.now()

export default async function WhatsAppAdminPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const ctx = await pageAdminCtx()
  const sp = await searchParams
  let conversations: Conversation[] = []
  let messages: WaMessage[] = []
  let error: string | null = null
  try {
    conversations = await listWaConversations(ctx)
    if (sp.id && /^[0-9a-f-]{36}$/.test(sp.id)) messages = await listWaMessages(ctx, sp.id)
  } catch {
    error = 'Conversations indisponibles (migration 0650 appliquée ?).'
  }
  const current = conversations.find((c) => c.id === sp.id)
  const twilio = await twilioStatus()

  return (
    <div>
      <OpsHeader title="WhatsApp" description="Conversations reçues sur le numéro WhatsApp de l’association (Twilio, API officielle). L’assistant répond avec la même base de connaissances et le même agenda que le site ; quand un représentant répond ici, il se met en retrait. Message libre possible dans les 24 h qui suivent le dernier message de la personne." />
      <DemoNotice mode={ctx.mode} />
      <AgentTabs current="/admin/agent/whatsapp" />
      {error && <ErrorBox message={error} />}
      {!TWILIO_WA_ENABLED && (
        <Note>WhatsApp n’est pas encore configuré : renseignez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_WHATSAPP_NUMBER dans Vercel, puis l’adresse du webhook dans Twilio (expéditeur WhatsApp). Les messages ne partent pas tant que ce n’est pas fait.</Note>
      )}
      <Panel title="Connexion Twilio" className="mt-6">
        {twilio.state === 'missing' ? (
          <p className="text-[14px] text-night-700">Clés absentes : ajoutez TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN dans Vercel (Production).</p>
        ) : twilio.state === 'error' ? (
          <p className="text-[14px] text-alert-700">Twilio refuse la connexion (code {twilio.code}) : vérifiez l’Account SID et l’Auth Token.</p>
        ) : (
          <div className="space-y-1 text-[14px] text-night-800">
            <p><Pill tone="ok">Compte reconnu</Pill> statut : {twilio.accountStatus}</p>
            <p>Numéros du compte : {twilio.numbers.length ? twilio.numbers.map((x) => `${x.phone} (${[x.voice && 'appels', x.sms && 'SMS'].filter(Boolean).join(', ') || 'aucune capacité'})`).join(' · ') : 'aucun pour le moment'}</p>
            <p>Expéditeur WhatsApp configuré : {twilio.sender || 'non renseigné (TWILIO_WHATSAPP_NUMBER)'}</p>
            <p className="text-[12.5px] text-night-500">Adresse du webhook à indiquer chez Twilio : https://lienparental.fr/api/whatsapp/webhook (méthode POST).</p>
          </div>
        )}
      </Panel>
      <Note tone="privacy">Conversations conservées 6 mois. Les numéros et messages ne sont visibles que dans l’administration.</Note>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] [&>*]:min-w-0">
        <Panel title={`Conversations (${conversations.length})`}>
          {conversations.length === 0 ? <Empty>Aucune conversation pour le moment.</Empty> : (
            <ul className="divide-y divide-night-100">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/agent/whatsapp?id=${c.id}`} aria-current={c.id === sp.id ? 'true' : undefined} className="block rounded-lg px-2 py-2.5 hover:bg-night-50 aria-[current=true]:bg-night-50">
                    <span className="block text-[14px] font-semibold text-night-900">{c.name ?? 'Sans nom'} · +{c.phone}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-night-600">
                      {fmtDateTime(c.last_inbound_at ?? c.updated_at)} · {c.locale.toUpperCase()}
                      {humanActive(c) ? <Pill tone="warn">Représentant</Pill> : <Pill tone="ok">Assistant</Pill>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {current ? (
          <Panel title={`${current.name ?? 'Sans nom'} · +${current.phone}`} actions={humanActive(current) ? <OpButton body={{ op: 'wa.release', id: current.id }} label="Rendre la main à l’assistant" done="L’assistant répond de nouveau." /> : undefined}>
            <ol className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {messages.map((m) => (
                <li key={m.id} className={cn('flex', m.direction === 'in' ? 'justify-start' : 'justify-end')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-[14px]', m.direction === 'in' ? 'bg-night-50 text-night-900' : m.author === 'team' ? 'bg-leaf-50 text-leaf-900' : 'bg-iris-50 text-night-900')}>
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                    <p className="mt-1 text-[11.5px] text-night-500">{m.author === 'contact' ? 'Contact' : m.author === 'team' ? 'Représentant' : 'Assistant'} · {fmtDateTime(m.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4"><WaReply id={current.id} /></div>
          </Panel>
        ) : (
          <Panel title="Conversation"><Empty>Choisissez une conversation.</Empty></Panel>
        )}
      </div>
    </div>
  )
}
