import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listContent } from '@/lib/contenus/repo'
import { FaqList } from '@/components/admin/contenus/lists'
import { ImportButton } from '@/components/admin/contenus/ImportButton'
import { ModeNotice, PageHeader, newBtn } from '@/components/admin/contenus/PageHeader'
import { ContenusNav } from '@/components/admin/aide/ContenusNav'

export const metadata: Metadata = { title: 'FAQ' }
export const dynamic = 'force-dynamic'

export default async function AdminFaqPage() {
  const ctx = await pageAdminCtx()
  const records = await listContent(ctx, 'faq')
  return (
    <div>
      <PageHeader
        title="FAQ"
        description="Questions fréquentes du centre d’aide (/app/aide/faq). Seules les questions publiées sont visibles des parents."
        actions={
          <>
            {ctx.mode === 'live' && <ImportButton what="aide" />}
            <Link href="/admin/contenus/faq/nouveau" className={newBtn}><Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle question</Link>
          </>
        }
      />
      <ContenusNav current="/admin/contenus/faq" />
      <ModeNotice mode={ctx.mode} />
      <div className="mt-6"><FaqList records={records} /></div>
    </div>
  )
}
