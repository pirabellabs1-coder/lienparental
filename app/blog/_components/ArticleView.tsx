import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, CalendarDays, Clock3 } from 'lucide-react'
import { BLOG_CATEGORIES, blogCategoryLabel, type BlogPost, type PublishedPost } from '@/lib/blog/types'
import { intlLocale } from '@/lib/i18n/config'
import { localePath } from '@/lib/i18n/routing'
import { contentLangAttr, type ContentLocale } from '@/lib/contenus/locale'
import { readingMinutes, tableOfContents } from '@/lib/blog/markdown'
import { Markdown } from './Markdown'
import { PostCard } from './PostCard'
import { isOptimizable } from './image'

export const formatArticleDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Cayenne' }).format(new Date(iso))

/**
 * Article complet (page publique et aperçu du back-office).
 * `contentLang` : langue réellement affichée ; si elle diffère de l'interface (article non traduit),
 * les textes de l'article portent l'attribut `lang` (lecteurs d'écran, césure).
 */
export function ArticleView({
  post, publishedAt, related = [], backHref = '/blog', contentLang,
}: { post: BlogPost; publishedAt: string | null; related?: PublishedPost[]; backHref?: string; contentLang?: ContentLocale }) {
  const t = useTranslations('public.blog')
  const locale = useLocale()
  const cl = contentLangAttr(contentLang, locale)
  const category = BLOG_CATEGORIES.some((c) => c.key === post.categorie) ? t(`categories.${post.categorie}`) : blogCategoryLabel(post.categorie)
  const toc = tableOfContents(post.contenu)
  const minutes = readingMinutes(post.contenu)

  return (
    <article className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:pt-10">
      <Link href={localePath(locale, backHref)} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[14px] font-semibold text-night-700 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('allArticles')}
      </Link>

      <header className="mx-auto mt-4 max-w-3xl">
        <p className="inline-flex rounded-full bg-leaf-50 px-3 py-1 text-[12.5px] font-bold text-leaf-800">{category}</p>
        <h1 className="mt-4 text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em] text-night-900 sm:text-[40px]" lang={cl}>{post.titre}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-night-700" lang={cl}>{post.extrait}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-night-600">
          <span className="font-semibold text-night-900" lang={cl}>{post.auteur}</span>
          {publishedAt && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-leaf-600" aria-hidden="true" />
              <time dateTime={publishedAt}>{formatArticleDate(publishedAt, locale)}</time>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-leaf-600" aria-hidden="true" />
            {t('readingTime', { n: minutes })}
          </span>
        </div>
      </header>

      {post.couverture && (
        <div className="relative mx-auto mt-8 aspect-[16/8] max-w-4xl overflow-hidden rounded-3xl border border-[#E5E7EB] bg-night-50">
          <Image
            src={post.couverture}
            alt={post.couvertureAlt}
            lang={cl}
            fill
            priority
            sizes="(min-width: 960px) 896px, calc(100vw - 40px)"
            unoptimized={!isOptimizable(post.couverture)}
            className="object-cover object-[center_30%]"
          />
        </div>
      )}

      <div className="mx-auto mt-10 grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 max-w-3xl">
          <div lang={cl}><Markdown source={post.contenu} /></div>
          {post.tags.length > 0 && (
            <ul aria-label={t('tags')} lang={cl} className="mt-10 flex flex-wrap gap-2 border-t border-[#E5E7EB] pt-6">
              {post.tags.map((tag) => (
                <li key={tag} className="rounded-full border border-[#E5E7EB] px-3 py-1 text-[12.5px] font-semibold text-night-700">#{tag}</li>
              ))}
            </ul>
          )}
          <aside className="mt-10 rounded-2xl bg-night-900 p-6 text-white sm:p-8" aria-labelledby="cta-titre">
            <h2 id="cta-titre" className="text-[20px] font-extrabold">{t('ctaTitle')}</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-night-100">{t('ctaText')}</p>
            <Link href={localePath(locale, '/onboarding/inscription')} className="mt-5 inline-flex min-h-[48px] items-center rounded-xl bg-leaf-500 px-5 font-semibold text-white hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-night-900">
              {t('ctaButton')}
            </Link>
          </aside>
        </div>
        {toc.length >= 3 && (
          <nav aria-labelledby="sommaire" className="hidden lg:block">
            <div className="sticky top-6 rounded-2xl border border-[#E5E7EB] p-4">
              <p id="sommaire" className="text-[12px] font-bold uppercase tracking-wider text-night-500">{t('toc')}</p>
              <ol className="mt-3 space-y-2 text-[13.5px]" lang={cl}>
                {toc.map((h) => (
                  <li key={h.id}><a href={`#${h.id}`} className="text-night-700 hover:text-leaf-700 hover:underline">{h.text}</a></li>
                ))}
              </ol>
            </div>
          </nav>
        )}
      </div>

      {related.length > 0 && (
        <section aria-labelledby="a-lire" className="mx-auto mt-16 max-w-5xl">
          <h2 id="a-lire" className="text-[22px] font-extrabold text-night-900">{t('related')}</h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => <li key={p.slug}><PostCard post={p} /></li>)}
          </ul>
        </section>
      )}
    </article>
  )
}
