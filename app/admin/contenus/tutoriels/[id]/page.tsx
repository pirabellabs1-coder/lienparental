import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { TutorielEditor } from '@/components/admin/aide/TutorielEditor'

export const metadata: Metadata = { title: 'Tutoriel' }
export const dynamic = 'force-dynamic'

export default async function TutorielEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  const record = await loadForEdit(ctx, 'tutoriel', id)
  return <TutorielEditor key={record?.id ?? 'nouveau'} initial={record} />
}
