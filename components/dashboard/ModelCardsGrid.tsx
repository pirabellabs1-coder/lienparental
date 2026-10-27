import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarRange, FileText, Plus, ScrollText, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ModelCard } from '@/lib/mock-data'
import { contentLangAttr } from '@/lib/contenus/locale'

const ICONS = {
  scale: FileText,
  school: CalendarRange,
  clock: ScrollText,
  home: Users,
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

// M03 — Documents prêts à l'emploi : 4 tuiles + « Plus de modèles ».
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
    <ul className="-mx-2 grid grid-cols-5 divide-x divide-night-100">
      {models.slice(0, 4).map((m) => {
        const Icon = ICONS[m.icon]
        return (
          <li key={m.id} className="min-w-0">
            <Link
              href={(m as { href?: string }).href ?? MODELS_HREF}
              className="flex h-full flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-center transition hover:bg-night-50/60 active:scale-[.98]"
            >
              <span className={cn('grid h-12 w-12 place-items-center rounded-xl2', ACCENTS[m.accent])} aria-hidden="true">
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <span lang={isDemo(m.id) ? undefined : contentLangAttr(m.lang ?? 'fr', locale)} className="mt-1 text-[10.5px] font-bold leading-tight text-night-900 [hyphens:auto]">{isDemo(m.id) ? td(`${m.id}.title`) : m.title}</span>
              {m.category && <span className="text-[10px] leading-tight text-night-600">{categoryLabel(m)}</span>}
            </Link>
          </li>
        )
      })}
      <li className="min-w-0">
        <Link
          href={MODELS_HREF}
          className="flex h-full flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-center transition hover:bg-night-50/60 active:scale-[.98]"
        >
          <span className="grid h-12 w-12 place-items-center text-night-900" aria-hidden="true">
            <Plus className="h-7 w-7" strokeWidth={1.8} />
          </span>
          <span className="mt-1 text-[11px] font-bold leading-tight text-night-900">
            {tr('grid.more1')}
            <br />
            {tr('grid.more2')}
          </span>
        </Link>
      </li>
    </ul>
  )
}
