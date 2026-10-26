import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listContent } from '@/lib/contenus/repo'
import { TutorielList } from '@/components/admin/contenus/lists'
import { ImportButton } from '@/components/admin/contenus/ImportButton'
import { ModeNotice, PageHeader, newBtn } from '@/components/admin/contenus/PageHeader'
import { ContenusNav } from '@/components/admin/aide/ContenusNav'

export const metadata: Metadata = { title: 'Tutoriels' }
export const dynamic = 'force-dynamic'

export default async function AdminTutorielsPage() {
  const ctx = await pageAdminCtx()
  const records = await listContent(ctx, 'tutoriel')
  return (
    <div>
      <PageHeader
        title="Tutoriels"
        description="Pas-à-pas du centre d’aide (/app/aide/tutoriels) pour prendre en main l’application."
        actions={
          <>
            {ctx.mode === 'live' && <ImportButton what="aide" />}
            <Link href="/admin/contenus/tutoriels/nouveau" className={newBtn}><Plus className="h-4 w-4" aria-hidden="true" /> Nouveau tutoriel</Link>
          </>
        }
      />
      <ContenusNav current="/admin/contenus/tutoriels" />
      <ModeNotice mode={ctx.mode} />
      <div className="mt-6"><TutorielList records={records} /></div>
    </div>
  )
}
