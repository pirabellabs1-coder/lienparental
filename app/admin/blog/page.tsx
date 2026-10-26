import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink, Plus } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listContent } from '@/lib/contenus/repo'
import { ArticleList } from '@/components/admin/contenus/lists'
import { ImportButton } from '@/components/admin/contenus/ImportButton'
import { ModeNotice, PageHeader, newBtn } from '@/components/admin/contenus/PageHeader'
import { btnSecondary } from '@/components/admin/contenus/form'

export const metadata: Metadata = { title: 'Blog' }
export const dynamic = 'force-dynamic'

export default async function AdminBlogPage() {
  const ctx = await pageAdminCtx()
  const records = await listContent(ctx, 'article')
  return (
    <div>
      <PageHeader
        title="Blog"
        description="Articles publics (/blog). Un article publié avec une date future reste programmé jusqu’à cette date."
        actions={
          <>
            {ctx.mode === 'live' && <ImportButton what="blog" />}
            <a href="/blog" target="_blank" rel="noopener noreferrer" className={btnSecondary}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Voir le blog<span className="sr-only"> (nouvel onglet)</span></a>
            <Link href="/admin/blog/nouveau" className={newBtn}><Plus className="h-4 w-4" aria-hidden="true" /> Nouvel article</Link>
          </>
        }
      />
      <ModeNotice mode={ctx.mode} />
      <div className="mt-6"><ArticleList records={records} /></div>
    </div>
  )
}
