import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listContent } from '@/lib/contenus/repo'
import { ModeleList } from '@/components/admin/contenus/lists'
import { ImportButton } from '@/components/admin/contenus/ImportButton'
import { ModeNotice, PageHeader, newBtn } from '@/components/admin/contenus/PageHeader'

export const metadata: Metadata = { title: 'Modèles de documents' }
export const dynamic = 'force-dynamic'

export default async function AdminModelesPage() {
  const ctx = await pageAdminCtx()
  const records = await listContent(ctx, 'modele')
  return (
    <div>
      <PageHeader
        title="Modèles de documents"
        description="Les « Documents prêts à l’emploi » proposés aux parents : champs à compléter, texte avec variables et mise en page. Le document est généré dans le navigateur du parent."
        actions={
          <>
            {ctx.mode === 'live' && <ImportButton what="modeles" />}
            <Link href="/admin/modeles/nouveau" className={newBtn}><Plus className="h-4 w-4" aria-hidden="true" /> Nouveau modèle</Link>
          </>
        }
      />
      <ModeNotice mode={ctx.mode} />
      <div className="mt-6"><ModeleList records={records} /></div>
    </div>
  )
}
