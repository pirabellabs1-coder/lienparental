import Link from 'next/link'
import { BellPlus, CalendarPlus, ChevronRight, FolderPlus, Wallet, type LucideIcon } from 'lucide-react'
import { resolveAction } from '@/lib/guide/actions'
import type { FicheAction } from '@/lib/guide/types'

const ICONS: Record<FicheAction['type'], LucideIcon> = {
  coffre: FolderPlus,
  calendrier: CalendarPlus,
  rappel: BellPlus,
  depense: Wallet,
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

// « Ajouter à Lien Parental » : chaque action ouvre le formulaire existant, pré-rempli (contrat d'URL).
export function FicheActions({ actions, ficheSlug }: { actions: FicheAction[]; ficheSlug: string }) {
  if (actions.length === 0) return null
  const items = actions.map((a) => resolveAction(a, ficheSlug))
  return (
    <ul className="space-y-2">
      {items.map((a) => {
        const Icon = ICONS[a.kind]
        return (
          <li key={a.href}>
            <Link
              href={a.href}
              className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-night-100 bg-white px-3 py-2.5 transition-colors hover:border-leaf-200 hover:bg-leaf-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
            >
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-50 text-leaf-700">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold leading-snug text-night-900">{a.label}</span>
                <span className="block text-[12.5px] leading-snug text-night-600">
                  {a.titre}
                  {a.montant !== undefined && <> : {euro.format(a.montant)}</>}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-leaf-600 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.75} aria-hidden="true" />
            </Link>
            {a.montant !== undefined && a.montantSource && (
              <p className="mt-1 px-1 text-[11.5px] text-night-600">
                Montant indiqué par{' '}
                <a href={a.montantSource} target="_blank" rel="noopener noreferrer" className="font-semibold text-leaf-700 underline">
                  la source officielle<span className="sr-only"> (nouvel onglet)</span>
                </a>
                , modifiable dans le formulaire.
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
