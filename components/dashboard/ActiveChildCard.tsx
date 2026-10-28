'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, UserPlus, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Child } from '@/lib/mock-data'
import { useChildLabels } from '@/components/enfants/childLabels'

type Props = {
  items: Child[]
  activeId: string
  onChange: (id: string) => void
}

// M03 — Enfant actif : avatar, nom, âge • classe | « Changer d'enfant ».
export function ActiveChildCard({ items, activeId, onChange }: Props) {
  const t = useTranslations('dash')
  // Mêmes libellés que « Mes enfants » : âge calculé depuis la date de naissance, classe traduite.
  const labels = useChildLabels()
  const [open, setOpen] = useState(false)
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const active = items.find((c) => c.id === activeId) ?? items[0]

  // Ferme la liste au clic extérieur ou avec Échap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!active) {
    return (
      <Link
        href="/app/enfants/nouveau"
        className="flex items-center gap-3 rounded-xl2 border border-dashed border-night-200 bg-white p-4 text-[14px] font-semibold text-leaf-600"
      >
        <UserPlus className="h-5 w-5" aria-hidden="true" />
        {t('addChild')}
      </Link>
    )
  }

  const canSwitch = items.length > 1
  const switchClass =
    'flex min-h-[44px] max-w-[9rem] shrink items-center gap-2.5 rounded-lg pl-1 pr-1 text-left text-[13px] font-semibold leading-tight text-leaf-600 hover:text-leaf-700 [overflow-wrap:anywhere]'

  return (
    <div ref={rootRef} className="relative rounded-xl2 border border-night-100 bg-white shadow-soft">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-3.5 py-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-leaf-50">
          {active.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.photoUrl} alt="" width={56} height={56} className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-7 w-7 fill-leaf-500 text-leaf-500" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-[7.5rem] flex-1">
          <p className="sr-only">{t('activeChildSr')}</p>
          {/* Retour à la ligne plutôt que troncature : prénom, âge et classe restent lisibles en taille de texte « Grande ». */}
          <p className="break-words text-[16px] font-bold leading-snug text-night-900">{active.prenom}</p>
          <p className="mt-0.5 break-words text-[12.5px] leading-snug text-night-700">
            {labels.ageLabel(active)}
            {active.classe && (
              <>
                <span aria-hidden="true" className="mx-1">•</span>
                <span className="sr-only">, </span>
                {labels.classLabel(active.classe)}
              </>
            )}
          </p>
        </div>

        {/* Séparateur seulement quand tout tient sur une ligne (sinon le bouton passe dessous). */}
        <span aria-hidden="true" className="hidden h-11 w-px shrink-0 bg-night-100 sm:block [html[data-text-size=grande]_&]:hidden" />

        {canSwitch ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={listId}
            className={switchClass}
          >
            <UserPlus className="h-6 w-6 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0">{t('switchChild')}</span>
          </button>
        ) : (
          <Link href="/app/enfants" className={switchClass}>
            <UserPlus className="h-6 w-6 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0">{t('switchChild')}</span>
          </Link>
        )}
      </div>

      {open && canSwitch && (
        <ul
          id={listId}
          aria-label={t('chooseChild')}
          className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl2 border border-night-100 bg-white shadow-card motion-safe:animate-fade-up"
        >
          {items.map((c) => {
            const selected = c.id === activeId
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-night-50"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-leaf-50" aria-hidden="true">
                    <UserRound className="h-4 w-4 fill-leaf-500 text-leaf-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[14px] font-semibold text-night-900">{c.prenom}</span>
                    <span className="block break-words text-[12px] text-night-600">
                      {labels.ageLabel(c)}{c.classe ? ` • ${labels.classLabel(c.classe)}` : ''}
                    </span>
                  </span>
                  {selected && <Check className="h-4 w-4 text-leaf-500" aria-hidden="true" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
