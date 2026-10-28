import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, ChevronRight, FileText, HeartPulse, History, House, Mail, Scale, School } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ModelCard } from '@/lib/mock-data'
import { contentLangAttr } from '@/lib/contenus/locale'

// Une icône qui dit ce qu'est le document (justice, école, chronologie, logement, courrier, santé).
const ICONS = {
  scale: Scale,
  school: School,
  clock: History,
  home: House,
  mail: Mail,
  health: HeartPulse,
  file: FileText,
} as const

const ACCENTS: Record<ModelCard['accent'], string> = {
  night: 'bg-night-50 text-night-600',
  leaf: 'bg-leaf-50 text-leaf-600',
  iris: 'bg-iris-50 text-iris-600',
  gold: 'bg-gold-50 text-gold-600',
  orange: 'bg-orange-50 text-orange-500',
}

const MODELS_HREF = '/app/modeles'

// Libellés de catégorie fournis en français (lib/modeles) : traduits au rendu.
const CATEGORY_KEY_BY_LABEL: Record<string, string> = { Juridique: 'juridique', Communication: 'communication', Scolaire: 'scolaire', Autre: 'autre' }

// M03 — Documents prêts à l'emploi : 4 lignes lisibles (1 colonne sur téléphone, 2 sur grand écran)
// + lien « Voir tous les modèles ». Titres entiers, jamais coupés au milieu d'un mot.
export function ModelCardsGrid({ models }: { models: ModelCard[] }) {
  const tr = useTranslations('coach.templates')
  const td = useTranslations('dash.demoModels')
  const locale = useLocale()
  // Cartes de démonstration (ids m_1…m_4) : textes du catalogue ; modèles réels : titre publié.
  const isDemo = (id: string) => td.has(`${id}.title`)
  const categoryLabel = (m: ModelCard) => {
    if (isDemo(m.id)) return td(`${m.id}.category`)
    const key = CATEGORY_KEY_BY_LABEL[m.category ?? '']
    return key ? tr(`categories.${key}`) : m.category
  }
  return (
    <div>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {models.slice(0, 4).map((m) => {
          const Icon = ICONS[m.icon]
          return (
            <li key={m.id} className="min-w-0">
              <Link
                href={(m as { href?: string }).href ?? MODELS_HREF}
                className="flex h-full min-h-[64px] items-center gap-3 rounded-xl2 border border-night-100 bg-white px-3.5 py-3 shadow-soft transition hover:border-leaf-200 hover:bg-leaf-50/30 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', ACCENTS[m.accent])} aria-hidden="true">
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    lang={isDemo(m.id) ? undefined : contentLangAttr(m.lang ?? 'fr', locale)}
                    className="line-clamp-2 text-[14px] font-bold leading-snug text-night-900 [hyphens:none]"
                  >
                    {isDemo(m.id) ? td(`${m.id}.title`) : m.title}
                  </span>
                  {m.category && <span className="mt-0.5 block truncate text-[12px] text-night-600">{categoryLabel(m)}</span>}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-night-300" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ul>
      <Link
        href={MODELS_HREF}
        className="mt-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl2 border border-night-100 bg-white px-4 text-[14px] font-semibold text-leaf-700 transition hover:bg-leaf-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
      >
        {tr('grid.seeAll')}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
