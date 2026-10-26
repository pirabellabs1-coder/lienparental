import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { ArticleFeedback } from '@/components/profil/ArticleFeedback'
import { MarkdownBlocks } from '@/components/profil/markdown'
import { FAQ, loadFaq } from '@/components/profil/help-content'

export function generateStaticParams() {
  return FAQ.map(q => ({ slug: q.slug }))
}

export const dynamicParams = false

export default async function FaqDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = await loadFaq(slug)
  if (!doc) notFound()
  const title = doc.meta.title ?? FAQ.find(q => q.slug === slug)?.question ?? 'FAQ'

  return (
    <>
      <article className="px-5 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
        <Link href="/app/aide/faq" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 text-[12.5px] text-night-800 hover:text-night-900">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          FAQ
        </Link>
        <h1 className="mb-4 mt-1 text-[19px] font-extrabold leading-snug text-night-900">{title}</h1>
        <MarkdownBlocks blocks={doc.blocks} />
        <ArticleFeedback slug={slug} />
      </article>
    </>
  )
}
