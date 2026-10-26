import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { ConseilEditor } from '@/components/admin/aide/ConseilEditor'

export const metadata: Metadata = { title: 'Conseil du jour' }
export const dynamic = 'force-dynamic'

export default async function ConseilEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  const record = await loadForEdit(ctx, 'conseil', id)
  return <ConseilEditor key={record?.id ?? 'nouveau'} initial={record} />
}
