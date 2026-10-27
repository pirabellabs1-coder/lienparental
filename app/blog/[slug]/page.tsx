import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPost, listPosts, relatedPosts, siteUrl } from '@/lib/blog/queries'
import { markdownToText } from '@/lib/blog/markdown'
import { blogCategoryLabel } from '@/lib/blog/types'
import { ArticleView } from '../_components/ArticleView'
import { JsonLd } from '../_components/JsonLd'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return (await listPosts()).map((p) => ({ slug: p.slug }))
}

const absolute = (u: string) => (u.startsWith('/') ? `${siteUrl()}${u}` : u)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return { title: (await getTranslations('public.blog'))('notFound'), robots: { index: false } }
  const title = post.seoTitre || post.titre
  const description = post.seoDescription || post.extrait || markdownToText(post.contenu).slice(0, 160)
  const images = post.couverture ? [{ url: absolute(post.couverture), alt: post.couvertureAlt }] : undefined
  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    authors: [{ name: post.auteur }],
    keywords: post.tags,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `${siteUrl()}/blog/${post.slug}`,
      siteName: 'Lien Parental',
      locale: 'fr_FR',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.auteur],
      section: blogCategoryLabel(post.categorie),
      tags: post.tags,
      images,
    },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, images: images?.map((i) => i.url) },
  }
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()
  const related = await relatedPosts(post)
  const url = `${siteUrl()}/blog/${post.slug}`

  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.titre.slice(0, 110),
        description: post.seoDescription || post.extrait,
        ...(post.couverture ? { image: [absolute(post.couverture)] } : {}),
        datePublished: post.publishedAt,
        dateModified: post.updatedAt || post.publishedAt,
        author: { '@type': 'Person', name: post.auteur },
        publisher: { '@type': 'Organization', name: 'Lien Parental', url: siteUrl(), logo: { '@type': 'ImageObject', url: `${siteUrl()}/icons/icon-512.png` } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        articleSection: blogCategoryLabel(post.categorie),
        keywords: post.tags.join(', '),
        inLanguage: 'fr-FR',
        wordCount: markdownToText(post.contenu).split(' ').length,
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: siteUrl() },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl()}/blog` },
          { '@type': 'ListItem', position: 3, name: post.titre, item: url },
        ],
      }} />
      <ArticleView post={post} publishedAt={post.publishedAt} related={related} />
    </>
  )
}
