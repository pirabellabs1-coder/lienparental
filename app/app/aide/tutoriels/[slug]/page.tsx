import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { ArticleFeedback } from '@/components/profil/ArticleFeedback'
import { MarkdownBlocks } from '@/components/profil/markdown'
import { TUTORIELS, loadTutoriel } from '@/components/profil/help-content'

export function generateStaticParams() {
  return TUTORIELS.map(t => ({ slug: t.slug }))
}

export const dynamicParams = false

export default async function TutorielDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = await loadTutoriel(slug)
  if (!doc) notFound()
  const entry = TUTORIELS.find(t => t.slug === slug)
  const title = doc.meta.title ?? entry?.title ?? 'Tutoriel'
  const minutes = doc.meta.duree_min ?? String(entry?.duree_min ?? '')

  return (
    <article className="px-5 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
      <Link href="/app/aide/tutoriels" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 text-[12.5px] text-night-800 hover:text-night-900">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Tutoriels
      </Link>
      <h1 className="mt-1 text-[19px] font-extrabold leading-snug text-night-900">{title}</h1>
      {minutes && <p className="mb-4 mt-1.5 text-[12px] text-night-700">{minutes} min de lecture</p>}
      <MarkdownBlocks blocks={doc.blocks} />
      <ArticleFeedback slug={slug} />
    </article>
  )
}
