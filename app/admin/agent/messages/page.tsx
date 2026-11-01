import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listMessages } from '@/lib/agent/admin'
import { DEFAULT_MESSAGES, LOCALES, MESSAGE_KEYS } from '@/lib/agent/core'
import type { MessageRow } from '@/lib/agent/repo'
import { DemoNotice, ErrorBox, Note, OpsHeader, Panel } from '@/components/admin/ops/ui'
import { AgentTabs } from '@/components/admin/agent/AgentTabs'
import { MessageEditor } from '@/components/admin/agent/AgentForms'

export const metadata: Metadata = { title: 'Textes par défaut' }
export const dynamic = 'force-dynamic'

export default async function MessagesAdminPage() {
  const ctx = await pageAdminCtx()
  let rows: MessageRow[] = []
  let error: string | null = null
  try {
    rows = await listMessages(ctx)
  } catch {
    error = 'Textes indisponibles (migration 0640 appliquée ?).'
  }
  return (
    <div>
      <OpsHeader title="Textes par défaut" description="Phrases de l’agent (accueil, rendez-vous, rappel, indisponibilité…) en français, anglais et portugais. Une traduction naturelle plutôt que littérale." />
      <DemoNotice mode={ctx.mode} />
      <AgentTabs current="/admin/agent/messages" />
      {error && <ErrorBox message={error} />}
      <Note>Repères à conserver : [DATE] et [HEURE] (rendez-vous), [EMAIL] (adresse de contact). Chaque modification est journalisée avec l’ancienne et la nouvelle valeur.</Note>
      <div className="mt-6 space-y-4">
        {MESSAGE_KEYS.map((k) => (
          <Panel key={k} title={k}>
            <div className="grid gap-4 lg:grid-cols-3">
              {LOCALES.map((l) => {
                const custom = rows.find((r) => r.msg_key === k && r.locale === l)
                return <MessageEditor key={l} msgKey={k} locale={l} value={custom?.text ?? DEFAULT_MESSAGES[k][l]} fallback={DEFAULT_MESSAGES[k][l]} custom={Boolean(custom)} />
              })}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
