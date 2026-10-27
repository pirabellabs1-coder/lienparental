import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getPost, relatedPosts } from '@/lib/blog/queries'
import { markdownToText } from '@/lib/blog/markdown'
import { ArticleView } from '../_components/ArticleView'
import { JsonLd } from '@/components/seo/JsonLd'
import { blogPosting, breadcrumbList, graph } from '@/lib/seo/jsonld'
import { NOINDEX_FOLLOW, pageMetadata } from '@/lib/seo/metadata'
import { SITE_NAME, abs } from '@/lib/seo/site'

// Langue lue dans un cookie à chaque requête : rendu dynamique, sans generateStaticParams ni ISR
// (l'ISR + getLocale() provoquait une erreur 500 en production, cf. docs/SEO-AUDIT.md C1).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const absolute = (u: string) => (u.startsWith('/') ? abs(u) : u)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getLocale()
  const post = await getPost(slug, locale)
  const tb = await getTranslations('public.blog')
  if (!post) return { title: tb('notFound'), robots: NOINDEX_FOLLOW }
  const title = post.seoTitre || post.titre
  const description = post.seoDescription || post.extrait || markdownToText(post.contenu).slice(0, 160)
  return pageMetadata({
    title,
    description,
    path: `/blog/${post.slug}`,
    // Langue réellement affichée (traduction ou repli français).
    locale: post.lang ?? 'fr',
    keywords: post.tags,
    images: post.couverture ? [{ url: absolute(post.couverture), alt: post.couvertureAlt }] : undefined,
    article: {
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      section: tb(`categories.${post.categorie}`),
      tags: post.tags,
      authors: [SITE_NAME],
    },
  })
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params
  const locale = await getLocale()
  const post = await getPost(slug, locale)
  if (!post) notFound()
  const related = await relatedPosts(post, 3, locale)
  const tn = await getTranslations('nav')
  const tb = await getTranslations('public.blog')
  const path = `/blog/${post.slug}`

  return (
    <>
      <JsonLd data={graph(
        blogPosting({
          path,
          headline: post.titre,
          description: post.seoDescription || post.extrait,
          image: post.couverture ? absolute(post.couverture) : undefined,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          section: tb(`categories.${post.categorie}`),
          keywords: post.tags,
          lang: post.lang,
          wordCount: markdownToText(post.contenu).split(/\s+/).filter(Boolean).length,
        }),
        breadcrumbList({
          path,
          crumbs: [
            { name: tn('home'), path: '/' },
            { name: tn('blog'), path: '/blog' },
            { name: post.titre, path },
          ],
        }),
      )} />
      <ArticleView post={post} publishedAt={post.publishedAt} related={related} contentLang={post.lang} />
    </>
  )
}
