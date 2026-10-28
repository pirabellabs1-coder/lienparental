import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { BLOG_CATEGORIES, blogCategoryLabel, type PublishedPost } from '@/lib/blog/types'
import { intlLocale } from '@/lib/i18n/config'
import { localePath } from '@/lib/i18n/routing'
import { contentLangAttr } from '@/lib/contenus/locale'
import { readingMinutes } from '@/lib/blog/markdown'
import { isOptimizable } from './image'

const formatDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Cayenne' }).format(new Date(iso))

/** Carte d'article (liste du blog, « À lire aussi »). Toute la carte est cliquable via le titre. */
export function PostCard({ post, featured = false }: { post: PublishedPost; featured?: boolean }) {
  const t = useTranslations('public.blog')
  const locale = useLocale()
  const cl = contentLangAttr(post.lang, locale)
  const category = BLOG_CATEGORIES.some((c) => c.key === post.categorie) ? t(`categories.${post.categorie}`) : blogCategoryLabel(post.categorie)
  return (
    <article className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white transition-shadow duration-200 hover:shadow-card focus-within:ring-2 focus-within:ring-leaf-500 motion-reduce:transition-none ${featured ? 'lg:flex-row' : ''}`}>
      <div className={`relative overflow-hidden bg-gradient-to-br from-night-900 to-night-700 ${featured ? 'aspect-[16/9] lg:aspect-auto lg:w-1/2' : 'aspect-[16/9]'}`}>
        {post.couverture ? (
          <Image
            src={post.couverture}
            alt=""
            fill
            sizes={featured ? '(min-width: 1024px) 576px, calc(100vw - 40px)' : '(min-width: 1024px) 368px, (min-width: 640px) 50vw, calc(100vw - 40px)'}
            unoptimized={!isOptimizable(post.couverture)}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 flex items-end p-5 font-script text-[44px] leading-none text-leaf-300/80">Parental</span>
        )}
      </div>
      <div className={`flex flex-1 flex-col p-5 ${featured ? 'lg:p-8' : ''}`}>
        <p className="text-[12px] font-bold uppercase tracking-wider text-leaf-700">{category}</p>
        <h3 lang={cl} className={`mt-2 font-extrabold leading-snug text-night-900 ${featured ? 'text-[22px] lg:text-[28px]' : 'text-[17px]'}`}>
          <Link href={localePath(locale, `/blog/${post.slug}`)} className="after:absolute after:inset-0 focus-visible:outline-none">{post.titre}</Link>
        </h3>
        <p lang={cl} className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-night-700">{post.extrait}</p>
        <p className="mt-auto pt-4 text-[12.5px] text-night-600">
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time> · {t('readingTime', { n: readingMinutes(post.contenu) })}
        </p>
      </div>
    </article>
  )
}
