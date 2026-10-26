import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { ArticleEditor } from '@/components/admin/blog/ArticleEditor'

export const metadata: Metadata = { title: 'Article de blog' }
export const dynamic = 'force-dynamic'

export default async function ArticleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  const record = await loadForEdit(ctx, 'article', id)
  return <ArticleEditor key={record?.id ?? 'nouveau'} initial={record} />
}
