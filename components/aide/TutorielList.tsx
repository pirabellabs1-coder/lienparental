'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Crown, FolderDown, Rocket, Sparkles, Upload, UserCheck } from 'lucide-react'
import { SoftSearch } from '@/components/profil/SoftSearch'
import { cn } from '@/lib/cn'
import type { TutoIcon } from '@/lib/aide/types'
import { norm } from './AideHome'

/** Entrée tutoriel minimale envoyée au client (jamais le contenu complet). */
/** `lang` : attribut à poser si le titre s'affiche dans une autre langue que l'interface (non traduit). */
export type TutorielLink = { slug: string; titre: string; dureeMin: number; icone: TutoIcon; lang?: string }

const ICONS: Record<TutoIcon, { icon: React.ReactNode; tone: string }> = {
  rocket: { icon: <Rocket className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-night-50 text-night-700' },
  sparkles: { icon: <Sparkles className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-iris-50 text-iris-600' },
  upload: { icon: <Upload className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-orange-50 text-orange-500' },
  'user-check': { icon: <UserCheck className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-leaf-50 text-leaf-600' },
  'folder-down': { icon: <FolderDown className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-alert-50 text-alert-500' },
  star: { icon: <Crown className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-gold-50 text-gold-500' },
}

export function TutorielList({ tutoriels }: { tutoriels: TutorielLink[] }) {
  const t = useTranslations('public.help.tutorials')
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = norm(q.trim())
    return s ? tutoriels.filter(tuto => norm(tuto.titre).includes(s)) : tutoriels
  }, [q, tutoriels])

  return (
    <>
      <SoftSearch value={q} onChange={setQ} placeholder={t('searchPh')} label={t('searchLabel')} />
      <h2 className="mt-5 text-[13px] font-bold text-night-900">{t('heading')}</h2>
      {list.length === 0 ? (
        <p className="mt-6 text-center text-[13px] text-night-700" role="status">
          {q.trim() ? t('noMatch', { q }) : t('empty')}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {list.map(tuto => {
            const v = ICONS[tuto.icone] ?? ICONS.rocket
            return (
              <li key={tuto.slug}>
                <Link
                  href={`/app/aide/tutoriels/${tuto.slug}`}
                  className="flex min-h-[72px] items-center gap-4 rounded-xl2 py-2 hover:bg-night-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
                >
                  <span aria-hidden className={cn('inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl2', v.tone)}>{v.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-night-900" lang={tuto.lang}>{tuto.titre}</span>
                    <span className="mt-1 block text-[12px] text-night-700">{t('minutes', { n: tuto.dureeMin })}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-night-900" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
