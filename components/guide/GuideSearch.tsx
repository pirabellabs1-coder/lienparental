'use client'

import Link from 'next/link'
import { useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Search, X } from 'lucide-react'
import { CategoryIcon } from './icons'
import { getCategory, type FicheResume } from '@/lib/guide/types'
import { ficheHref, normalize } from '@/lib/guide/links'

// Recherche locale dans les fiches du territoire (titre, résumé, mots-clés, catégorie).
export function GuideSearch({ fiches, territoire }: { fiches: FicheResume[]; territoire: string }) {
  const t = useTranslations('coach.guide')
  const id = useId()
  const [q, setQ] = useState('')

  const index = useMemo(
    () => fiches.map((f) => ({ f, text: normalize([f.titre, f.resume, ...f.motsCles, getCategory(f.categorie)?.label ?? '', t(`categories.${f.categorie}`)].join(' ')) })),
    [fiches, t],
  )

  const terms = normalize(q).split(/\s+/).filter((term) => term.length > 1)
  const results = terms.length ? index.filter((e) => terms.every((term) => e.text.includes(term))).map((e) => e.f) : []

  return (
    <div role="search">
      <label htmlFor={id} className="sr-only">{t('search.label')}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-night-500" strokeWidth={1.75} aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 80))}
          placeholder={t('search.placeholder')}
          autoComplete="off"
          aria-controls={`${id}-results`}
          className="h-12 w-full rounded-xl border border-night-200 bg-white pl-11 pr-11 text-[15px] text-night-900 placeholder:text-night-500 focus:border-leaf-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={t('search.clear')}
            className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-night-600 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>

      <div id={`${id}-results`} aria-live="polite">
        {terms.length > 0 && (
          <div className="mt-3 rounded-2xl border border-night-100 bg-white">
            <p className="px-4 pt-3 text-[12.5px] font-semibold text-night-600">
              {results.length === 0 ? t('search.none') : t('search.found', { count: results.length })}
            </p>
            {results.length > 0 && (
              <ul className="divide-y divide-night-100">
                {results.slice(0, 8).map((f) => (
                  <li key={f.slug}>
                    <Link
                      href={ficheHref(f.slug, territoire)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-leaf-500"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-50 text-leaf-700">
                        <CategoryIcon cat={f.categorie} className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold text-night-900">{f.titre}</span>
                        <span className="block truncate text-[12.5px] text-night-600">{t(`categories.${f.categorie}`)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-night-400" strokeWidth={1.75} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
