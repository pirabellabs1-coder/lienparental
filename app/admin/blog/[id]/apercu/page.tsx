import type { Metadata } from 'next'
import Link from 'next/link'
import { pageAdminCtx } from '@/lib/contenus/api'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { ArticleView } from '@/app/blog/_components/ArticleView'
import { StatusPill } from '@/components/admin/contenus/StatusPill'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Aperçu de l’article', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** Aperçu pleine page de la version ENREGISTRÉE d'un article (brouillon compris), réservé aux admins. */
export default async function ArticlePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  const record = await loadForEdit(ctx, 'article', id)
  if (!record) notFound()
  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-gold-200 bg-gold-50 px-5 py-3 text-[13.5px] text-gold-900">
        <strong>Aperçu</strong>
        <StatusPill statut={record.statut} publishedAt={record.publishedAt} />
        <span>Version enregistrée n° {record.version}. Cette page n’est visible que des administrateurs.</span>
        <Link href={`/admin/blog/${record.id}`} className="ml-auto inline-flex min-h-[44px] items-center font-semibold underline">Revenir à l’édition</Link>
      </div>
      <div className="bg-white">
        <ArticleView post={record.data} publishedAt={record.publishedAt} backHref="/admin/blog" />
      </div>
    </div>
  )
}
