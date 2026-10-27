import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { listPosts, siteUrl } from '@/lib/blog/queries'
import { BLOG_CATEGORIES } from '@/lib/blog/types'
import { cn } from '@/lib/cn'
import { PostCard } from './_components/PostCard'
import { JsonLd } from './_components/JsonLd'

export const revalidate = 300

const PAGE_SIZE = 9
const DESCRIPTION = 'Conseils pratiques pour les parents séparés : coparentalité, démarches, organisation du quotidien et bien-être de l’enfant.'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams
  const t = await getTranslations('public.blog')
  const cat = BLOG_CATEGORIES.find((c) => c.key === one(sp.categorie))
  const title = cat ? t('metaTitleCategory', { category: t(`categories.${cat.key}`) }) : t('metaTitle')
  const description = t('description')
  return {
    title,
    description,
    alternates: { canonical: cat ? `/blog?categorie=${cat.key}` : '/blog' },
    openGraph: { type: 'website', title: `${title} · Lien Parental`, description, url: `${siteUrl()}/blog`, locale: 'fr_FR', siteName: 'Lien Parental' },
    twitter: { card: 'summary_large_image', title: `${title} · Lien Parental`, description },
  }
}

export default async function BlogPage({ searchParams }: Props) {
  const t = await getTranslations('public.blog')
  const sp = await searchParams
  const all = await listPosts()
  const cat = BLOG_CATEGORIES.find((c) => c.key === one(sp.categorie))?.key
  const filtered = cat ? all.filter((p) => p.categorie === cat) : all
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1))
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const [first, ...rest] = slice
  const present = new Set(all.map((p) => p.categorie))
  const href = (p: number) => {
    const q = new URLSearchParams()
    if (cat) q.set('categorie', cat)
    if (p > 1) q.set('page', String(p))
    const s = q.toString()
    return s ? `/blog?${s}` : '/blog'
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:pt-12">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'Le blog Lien Parental',
        description: DESCRIPTION,
        url: `${siteUrl()}/blog`,
        inLanguage: 'fr-FR',
        publisher: { '@type': 'Organization', name: 'Lien Parental', url: siteUrl() },
      }} />
      <header className="max-w-3xl">
        <p className="font-script text-[34px] leading-none text-leaf-500">{t('kicker')}</p>
        <h1 className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 sm:text-[42px]">{t('title')}</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-night-700">{t('description')}</p>
      </header>

      <nav aria-label={t('categoriesLabel')} className="-mx-5 mt-8 overflow-x-auto px-5 [scrollbar-width:none]">
        <ul className="flex gap-2">
          {[{ key: undefined, label: t('all') }, ...BLOG_CATEGORIES.filter((c) => present.has(c.key)).map((c) => ({ key: c.key, label: t(`categories.${c.key}`) }))].map((c) => {
            const active = c.key === cat
            return (
              <li key={c.key ?? 'all'} className="shrink-0">
                <Link
                  href={c.key ? `/blog?categorie=${c.key}` : '/blog'}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-[44px] items-center rounded-full border px-4 text-[13.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
                    active ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-[#E5E7EB] bg-white text-night-800 hover:border-night-200',
                  )}
                >
                  {c.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {slice.length === 0 ? (
        <p className="mt-12 rounded-2xl border border-dashed border-[#E5E7EB] p-10 text-center text-night-600">
          {cat ? t('emptyCategory', { category: t(`categories.${cat}`) }) : t('empty')}
        </p>
      ) : (
        <>
          <h2 className="sr-only">{cat ? t('articlesIn', { category: t(`categories.${cat}`) }) : t('articles')}</h2>
          {page === 1 && first && <div className="mt-8"><PostCard post={first} featured /></div>}
          <ul className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-3', page === 1 ? 'mt-5' : 'mt-8')}>
            {(page === 1 ? rest : slice).map((p) => <li key={p.slug}><PostCard post={p} /></li>)}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav aria-label={t('pagination')} className="mt-10 flex items-center justify-center gap-2 text-[14px] font-semibold">
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[#E5E7EB] px-4 text-night-900 hover:bg-night-50"><ChevronLeft className="h-4 w-4" aria-hidden="true" />{t('prev')}</Link>
          ) : null}
          <span className="px-3 text-night-600">{t('pageOf', { page, pages })}</span>
          {page < pages ? (
            <Link href={href(page + 1)} rel="next" className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[#E5E7EB] px-4 text-night-900 hover:bg-night-50">{t('next')}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
          ) : null}
        </nav>
      )}
    </div>
  )
}
