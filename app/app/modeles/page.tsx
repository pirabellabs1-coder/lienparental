'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronRight, FileText, ListFilter, Search } from 'lucide-react'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { TONES } from '@/components/coffre/tones'
import { MODELES, MODELE_CATEGORIES, type ModeleCategory, type VaultTone } from '@/lib/mock-vault'
import { usePublishedTemplates } from '@/lib/modeles/client'
import { cn } from '@/lib/cn'

type ListItem = { slug: string; title: string; kind: string; category: string; badge?: 'Populaire' | 'Nouveau' | null; tone: VaultTone; description: string }

const TONE_BY_CATEGORY: Record<string, VaultTone> = { juridique: 'violet', scolaire: 'green', communication: 'orange', autre: 'blue' }

// « Documents prêts à l'emploi » : liste filtrable des modèles publiés depuis l'admin
// (repli sur les modèles de démonstration si aucun n'est publié ou si l'API est indisponible).
export default function ModelesPage() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ModeleCategory | 'tous'>('tous')
  const [popularFirst, setPopularFirst] = useState(false)
  const published = usePublishedTemplates()
  const loading = published.status === 'loading'

  const source = useMemo<ListItem[]>(() => {
    if (published.data.length > 0) {
      return published.data.map((t) => ({
        slug: t.slug,
        title: t.titre,
        kind: t.champs > 0 ? `Modèle à remplir, ${t.pages} page${t.pages > 1 ? 's' : ''}` : `${t.pages} page${t.pages > 1 ? 's' : ''}`,
        category: t.categorie,
        badge: t.badge,
        tone: TONE_BY_CATEGORY[t.categorie] ?? 'gray',
        description: t.description,
      }))
    }
    return loading ? [] : MODELES
  }, [published.data, loading])

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('fr')
    const out = source.filter((m) =>
      (cat === 'tous' || m.category === cat) &&
      (!needle || m.title.toLocaleLowerCase('fr').includes(needle) || m.description.toLocaleLowerCase('fr').includes(needle)),
    )
    return popularFirst ? [...out].sort((a, b) => Number(b.badge === 'Populaire') - Number(a.badge === 'Populaire')) : out
  }, [source, q, cat, popularFirst])

  return (
    <div className="w-full px-5 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
      <h1 className="max-w-[260px] text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 md:max-w-none">
        Documents prêts à l’emploi
      </h1>
      <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-night-700 md:max-w-none">
        Des modèles rédigés par des professionnels à adapter à votre situation.
      </p>

      <div role="search" className="mt-4 flex items-center gap-2">
        <label htmlFor="modele-search" className="sr-only">Rechercher un document</label>
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-night-100 bg-white px-4 shadow-soft focus-within:border-leaf-500">
          <Search className="h-[18px] w-[18px] shrink-0 text-night-500" aria-hidden="true" />
          <input
            id="modele-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un document…"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-night-900 outline-none placeholder:text-night-400"
          />
        </div>
        <button
          type="button"
          aria-pressed={popularFirst}
          aria-label="Afficher les modèles populaires en premier"
          onClick={() => setPopularFirst((v) => !v)}
          className={cn('inline-flex h-12 w-12 items-center justify-center rounded-full transition-colors', popularFirst ? 'bg-leaf-50 text-leaf-600' : 'text-night-800 hover:bg-night-50')}
        >
          <ListFilter className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div role="radiogroup" aria-label="Catégorie de modèles" className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
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
              {c.label}
            </button>
          )
        })}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? 'Chargement des modèles' : `${list.length} modèle${list.length > 1 ? 's' : ''}`}
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
          Aucun modèle ne correspond à votre recherche.
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
                  <span className="block text-[14px] font-bold leading-snug text-night-900">{m.title}</span>
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
