import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import { getTicket } from '@/lib/admin/ops/support'
import { CATEGORY_LABEL, PRIORITY_LABEL, TICKET_STATUS_LABEL, type TicketDetail } from '@/lib/admin/ops/types'
import { TicketPanel } from '@/components/admin/ops/TicketPanel'
import { DemoNotice, ErrorBox, Pill, fmtDateTime, linkCls } from '@/components/admin/ops/ui'
import { PRIORITY_TONE, TICKET_STATUS_TONE } from '@/components/admin/ops/tones'

export const metadata: Metadata = { title: 'Ticket de support' }
export const dynamic = 'force-dynamic'

const PLAN: Record<string, string> = { free: 'Gratuit', premium: 'Premium', coparentalite: 'Coparentalité+' }

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  let t: TicketDetail
  try {
    t = await getTicket(ctx, id)
  } catch (e) {
    if (e instanceof RepoError && e.code === 'not_found') notFound()
    return <div><Back /><ErrorBox message={e instanceof RepoError ? e.message : 'Ticket indisponible.'} /></div>
  }
  return (
    <div className="space-y-5">
      <Back />
      <header>
        <p className="font-mono text-[12px] text-night-500">#{t.id.slice(0, 8)}</p>
        <h1 className="break-words text-[24px] font-extrabold leading-tight text-night-900 sm:text-[28px]">{t.subject}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-night-600">
          <Pill tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Pill>
          <Pill tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Pill>
          <span>{CATEGORY_LABEL[t.category]} · ouvert le {fmtDateTime(t.createdAt)}</span>
        </p>
        <p className="mt-2 text-[13.5px] text-night-700">
          Demandeur :{' '}
          {t.requester.deleted ? 'compte supprimé' : (
            <Link className={linkCls} href={`/admin/comptes/${t.requester.id}`}>{t.requester.prenom ? `${t.requester.prenom} · ` : ''}{t.requester.email}</Link>
          )}{' '}· formule effective {PLAN[t.requester.plan] ?? t.requester.plan}
        </p>
      </header>
      <DemoNotice mode={ctx.mode} />
      <TicketPanel key={`${t.id}-${t.updatedAt}-${t.messages.length}`} ticket={t} />
    </div>
  )
}

function Back() {
  return (
    <Link href="/admin/support" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[14px] font-semibold text-night-700 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour aux tickets
    </Link>
  )
}
