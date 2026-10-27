import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ArticleFeedback } from '@/components/profil/ArticleFeedback'
import { MarkdownBlocks, parseMarkdown } from '@/components/profil/markdown'
import { getHelpTutoriel, getHelpTutoriels } from '@/lib/aide/public'

export const revalidate = 300

export async function generateStaticParams() {
  return (await getHelpTutoriels()).map(t => ({ slug: t.slug }))
}

export default async function TutorielDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const tuto = await getHelpTutoriel(slug)
  if (!tuto) notFound()
  const { blocks } = parseMarkdown(tuto.contenu)
  const t = await getTranslations('public.help.tutorials')

  return (
    <article className="px-5 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
      <Link href="/app/aide/tutoriels" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 text-[12.5px] text-night-800 hover:text-night-900">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t('title')}
      </Link>
      <h1 className="mt-1 text-[19px] font-extrabold leading-snug text-night-900">{tuto.titre}</h1>
      <p className="mb-4 mt-1.5 text-[12px] text-night-700">{t('readingTime', { n: tuto.dureeMin })}</p>
      <MarkdownBlocks blocks={blocks} />
      <ArticleFeedback slug={slug} />
    </article>
  )
}
