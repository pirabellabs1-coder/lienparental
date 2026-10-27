'use client'

import { useId } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, MapPin } from 'lucide-react'
import type { Territoire } from '@/lib/guide/types'

// Bandeau « Territoire : … ». Prêt pour plusieurs territoires (un dossier content/guide/<code> chacun).
export function TerritorySelect({ current, territoires }: { current: Territoire; territoires: Territoire[] }) {
  const t = useTranslations('coach.guide.header')
  const id = useId()
  const router = useRouter()
  const pathname = usePathname()
  const options = territoires.filter((ter) => ter.disponible)
  const single = options.length <= 1

  const onChange = (code: string) => {
    router.push(`${pathname}?${new URLSearchParams({ territoire: code }).toString()}`)
  }

  return (
    <div className="relative inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-leaf-50 py-1 pl-3 pr-2 text-[13px] text-leaf-800 ring-1 ring-leaf-200">
      <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <label htmlFor={id} className="font-medium">{t('territory')}</label>
      {single ? (
        <>
          <select id={id} value={current.code} disabled className="sr-only" aria-describedby={`${id}-note`}>
            <option value={current.code}>{current.nom}</option>
          </select>
          <span className="pr-1 font-bold" aria-hidden="true">{current.nom}</span>
          <span id={`${id}-note`} className="sr-only">{t('onlyTerritory')}</span>
        </>
      ) : (
        <span className="relative inline-flex items-center">
          <select
            id={id}
            value={current.code}
            onChange={(e) => onChange(e.target.value)}
            className="appearance-none bg-transparent pr-5 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
          >
            {options.map((ter) => <option key={ter.code} value={ter.code}>{ter.nom}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
    </div>
  )
}
