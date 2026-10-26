import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listContent } from '@/lib/contenus/repo'
import { ConseilList } from '@/components/admin/contenus/lists'
import { ImportButton } from '@/components/admin/contenus/ImportButton'
import { ModeNotice, PageHeader, newBtn } from '@/components/admin/contenus/PageHeader'
import { ContenusNav } from '@/components/admin/aide/ContenusNav'

export const metadata: Metadata = { title: 'Conseils du jour' }
export const dynamic = 'force-dynamic'

export default async function AdminConseilsPage() {
  const ctx = await pageAdminCtx()
  const records = (await listContent(ctx, 'conseil'))
    .sort((a, b) => a.data.ordre - b.data.ordre || a.titre.localeCompare(b.titre, 'fr'))
  return (
    <div>
      <PageHeader
        title="Conseils du jour"
        description="Cartes « Conseil du jour » de l’accueil parent. Les conseils publiés défilent selon leur ordre d’affichage."
        actions={
          <>
            {ctx.mode === 'live' && <ImportButton what="aide" />}
            <Link href="/admin/contenus/conseils/nouveau" className={newBtn}><Plus className="h-4 w-4" aria-hidden="true" /> Nouveau conseil</Link>
          </>
        }
      />
      <ContenusNav current="/admin/contenus/conseils" />
      <ModeNotice mode={ctx.mode} />
      <div className="mt-6"><ConseilList records={records} /></div>
    </div>
  )
}
