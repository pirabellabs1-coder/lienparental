'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, FileText, ListFilter, Search } from 'lucide-react'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { TONES } from '@/components/coffre/tones'
import { MODELES, MODELE_CATEGORIES, type ModeleCategory, type VaultTone } from '@/lib/mock-vault'
import { usePublishedTemplates } from '@/lib/modeles/client'
import { cn } from '@/lib/cn'
import { contentLangAttr, type ContentLocale } from '@/lib/contenus/locale'

type ListItem = { slug: string; title: string; kind: string; category: string; badge?: 'Populaire' | 'Nouveau' | null; tone: VaultTone; description: string; lang?: ContentLocale }

const TONE_BY_CATEGORY: Record<string, VaultTone> = { juridique: 'violet', scolaire: 'green', communication: 'orange', autre: 'blue' }

// « Documents prêts à l'emploi » : liste filtrable des modèles publiés depuis l'admin
// (repli sur les modèles de démonstration si aucun n'est publié ou si l'API est indisponible).
export default function ModelesPage() {
  const tr = useTranslations('coach.templates')
  const locale = useLocale()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ModeleCategory | 'tous'>('tous')
  const [popularFirst, setPopularFirst] = useState(false)
  const published = usePublishedTemplates()
  const loading = published.status === 'loading'

  const source = useMemo<ListItem[]>(() => {
    if (published.data.length > 0) {
      return published.data.map((tpl) => ({
        slug: tpl.slug,
        title: tpl.titre,
        kind: tpl.champs > 0 ? tr('list.fillable', { pages: tr('pages', { count: tpl.pages }) }) : tr('pages', { count: tpl.pages }),
        category: tpl.categorie,
        badge: tpl.badge,
        tone: TONE_BY_CATEGORY[tpl.categorie] ?? 'gray',
        description: tpl.description,
        lang: tpl.lang,
      }))
    }
    return loading ? [] : MODELES
  }, [published.data, loading, tr])

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('fr')
    const out = source.filter((m) =>
      (cat === 'tous' || m.category === cat) &&
      (!needle || m.title.toLocaleLowerCase('fr').includes(needle) || m.description.toLocaleLowerCase('fr').includes(needle)),
    )
    return popularFirst ? [...out].sort((a, b) => Number(b.badge === 'Populaire') - Number(a.badge === 'Populaire')) : out
  }, [source, q, cat, popularFirst])

  return (
    <div className="w-full px-5 pb-6" data-safe-top style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
      <h1 className="max-w-[260px] text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 md:max-w-none">
        {tr('list.title')}
      </h1>
      <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-night-700 md:max-w-none">
        {tr('list.intro')}
      </p>

      <div role="search" className="mt-4 flex items-center gap-2">
        <label htmlFor="modele-search" className="sr-only">{tr('list.searchLabel')}</label>
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-night-100 bg-white px-4 shadow-soft focus-within:border-leaf-500">
          <Search className="h-[18px] w-[18px] shrink-0 text-night-500" aria-hidden="true" />
          <input
            id="modele-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr('list.searchPlaceholder')}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-night-900 outline-none placeholder:text-night-400"
          />
        </div>
        <button
          type="button"
          aria-pressed={popularFirst}
          aria-label={tr('list.popularFirst')}
          onClick={() => setPopularFirst((v) => !v)}
          className={cn('inline-flex h-12 w-12 items-center justify-center rounded-full transition-colors', popularFirst ? 'bg-leaf-50 text-leaf-600' : 'text-night-800 hover:bg-night-50')}
        >
          <ListFilter className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div role="radiogroup" aria-label={tr('list.categoryGroup')} className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {MODELE_CATEGORIES.map((c) => {
          const on = cat === c.id
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCat(c.id)}
              className={cn(
                'h-11 shrink-0 rounded-xl border px-4 text-[13px] font-bold transition-colors',
                on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-night-100 bg-white text-night-800 hover:bg-night-50',
              )}
            >
              {tr(`categories.${c.id}`)}
            </button>
          )
        })}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? tr('list.loading') : tr('list.count', { count: list.length })}
      </p>

      {loading ? (
        <ul aria-hidden="true" className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex h-[78px] items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-3.5">
              <span className="h-12 w-12 shrink-0 rounded-xl bg-night-50 motion-safe:animate-pulse" />
              <span className="h-4 flex-1 rounded bg-night-50 motion-safe:animate-pulse" />
            </li>
          ))}
        </ul>
      ) : list.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-night-200 p-8 text-center text-[13.5px] text-night-500">
          {tr('list.empty')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {list.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/app/modeles/${m.slug}`}
                className="group flex items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
              >
                <span aria-hidden="true" className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', TONES[m.tone].soft)}>
                  <FileText className="h-6 w-6" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold leading-snug text-night-900" lang={contentLangAttr(m.lang, locale)}>{m.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[12px] text-night-500">{m.kind}</span>
                    {m.badge && <StatusBadge kind={m.badge === 'Populaire' ? 'populaire' : 'nouveau'} />}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-night-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
