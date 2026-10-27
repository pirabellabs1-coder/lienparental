import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowRight, ChevronRight, LogIn } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CategoryIcon } from '@/components/guide/icons'
import type { GuideCategoryKey } from '@/lib/guide/types'
import type { Crumb } from '@/lib/seo/guide-jsonld'

// Primitives de présentation du Guide public (/guide/**), alignées sur la charte du site
// (components/accueil/ui.tsx) : fond blanc / #F7F9FC, titres night-900, accents leaf, bordures #E5E7EB.

export const CONTAINER = 'mx-auto w-full max-w-[1120px] px-4 sm:px-8'
export const H1 = 'text-[28px] font-extrabold leading-[1.15] tracking-[-0.025em] text-night-900 [text-wrap:balance] sm:text-[36px]'
export const H2 = 'text-[20px] font-extrabold leading-snug tracking-[-0.015em] text-night-900 sm:text-[22px]'
export const CARD = 'rounded-2xl bg-white ring-1 ring-[#E5E7EB]'
export const LINK_CARD = cn(CARD, 'group block transition-shadow duration-200 hover:shadow-[0_12px_32px_-20px_rgba(11,45,91,0.35)] motion-reduce:transition-none')
export const EXT_LINK = 'inline-flex items-center gap-1 font-semibold text-leaf-700 underline decoration-leaf-300 underline-offset-2 hover:decoration-leaf-600'

const BTN = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 text-center text-[15px] font-semibold transition-colors duration-200'
export const BTN_PRIMARY = cn(BTN, 'bg-leaf-500 text-white hover:bg-leaf-600')
export const BTN_OUTLINE = cn(BTN, 'bg-white text-night-900 ring-1 ring-inset ring-night-900/20 hover:bg-night-50')

/** Fil d'Ariane visible (le dernier élément est la page courante). */
export async function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const t = await getTranslations('public.guide')
  return (
    <nav aria-label={t('breadcrumbLabel')}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13.5px] text-night-600">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={c.path} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-night-400" strokeWidth={2} aria-hidden="true" />}
              {last ? (
                <span aria-current="page" className="line-clamp-1 font-semibold text-night-800">{c.name}</span>
              ) : (
                <Link href={c.path} className="inline-flex min-h-[32px] items-center underline-offset-2 hover:text-night-900 hover:underline">{c.name}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Tuile de catégorie (icône, libellé, nombre de fiches). */
export function CategoryTile({ href, cat, label, count }: { href: string; cat: GuideCategoryKey; label: string; count: string }) {
  return (
    <Link href={href} className={cn(LINK_CARD, 'flex min-h-[68px] items-center gap-3 px-4 py-3')}>
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-700">
        <CategoryIcon cat={cat} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-night-900">{label}</span>
        <span className="block text-[13px] text-night-600">{count}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-night-400 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.75} aria-hidden="true" />
    </Link>
  )
}

/** Carte de fiche : titre + résumé. `lang` = langue du contenu si elle diffère de l'interface. */
export function FicheCard({ href, title, summary, lang, meta }: { href: string; title: string; summary: string; lang?: string; meta?: string }) {
  return (
    <Link href={href} className={cn(LINK_CARD, 'flex h-full items-start gap-3 p-4')}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-bold leading-snug text-night-900" lang={lang}>{title}</span>
        <span className="mt-1 line-clamp-3 block text-[13.5px] leading-snug text-night-600" lang={lang}>{summary}</span>
        {meta && <span className="mt-2 block text-[12.5px] font-semibold text-leaf-700">{meta}</span>}
      </span>
      <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.75} aria-hidden="true" />
    </Link>
  )
}

/**
 * Appel à l'action d'inscription (remplace, sur le Guide public, les actions de l'espace connecté).
 * `next` : chemin de l'espace connecté vers lequel revenir après connexion.
 */
export async function SignupCta({ next, variant = 'fiche', className }: { next: string; variant?: 'fiche' | 'parcours' | 'generic'; className?: string }) {
  const t = await getTranslations('public.guide.cta')
  const login = `/onboarding/connexion?${new URLSearchParams({ suite: next }).toString()}`
  return (
    <section aria-labelledby="cta-guide" className={cn('rounded-2xl bg-night-900 p-5 text-white sm:p-6 on-dark', className)}>
      <h2 id="cta-guide" className="text-[18px] font-extrabold leading-snug">{t(`${variant}.title`)}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-white/80">{t(`${variant}.text`)}</p>
      <div className="mt-4 flex flex-col gap-2.5">
        <Link href="/onboarding/inscription" className={cn(BTN, 'bg-leaf-400 text-night-900 hover:bg-leaf-300')}>
          {t(`${variant}.signup`)}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
        <Link href={login} className={cn(BTN, 'min-h-[44px] text-white ring-1 ring-inset ring-white/30 hover:bg-white/10')}>
          <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />{t('login')}
        </Link>
      </div>
      <p className="mt-3 text-[12.5px] text-white/70">{t('free')}</p>
    </section>
  )
}
