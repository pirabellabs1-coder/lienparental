import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { ModeleEditor } from '@/components/admin/modeles/ModeleEditor'

export const metadata: Metadata = { title: 'Modèle de document' }
export const dynamic = 'force-dynamic'

export default async function ModeleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  const record = await loadForEdit(ctx, 'modele', id)
  return <ModeleEditor key={record?.id ?? 'nouveau'} initial={record} />
}
