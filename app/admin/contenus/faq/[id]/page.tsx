import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { FaqEditor } from '@/components/admin/aide/FaqEditor'

export const metadata: Metadata = { title: 'Question de la FAQ' }
export const dynamic = 'force-dynamic'

export default async function FaqEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  const record = await loadForEdit(ctx, 'faq', id)
  return <FaqEditor key={record?.id ?? 'nouveau'} initial={record} />
}
