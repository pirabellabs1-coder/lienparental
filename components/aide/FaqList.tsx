'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight } from 'lucide-react'
import { SoftSearch } from '@/components/profil/SoftSearch'
import { norm, type FaqLink } from './AideHome'

export function FaqList({ faq }: { faq: FaqLink[] }) {
  const t = useTranslations('public.help.faq')
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = norm(q.trim())
    return s ? faq.filter(x => norm(x.question).includes(s)) : faq
  }, [q, faq])

  return (
    <>
      <SoftSearch value={q} onChange={setQ} placeholder={t('searchPh')} label={t('searchLabel')} />

      <h2 className="mt-5 text-[13px] font-bold text-night-900">{t('heading')}</h2>
      {list.length === 0 ? (
        <p className="mt-6 text-center text-[13px] text-night-700" role="status">
          {q.trim() ? t('noMatch', { q }) : t('empty')}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-night-100">
          {list.map(x => (
            <li key={x.slug}>
              <Link
                href={`/app/aide/faq/${x.slug}`}
                className="flex min-h-[48px] items-center gap-3 py-2.5 text-[13px] font-bold text-night-900 hover:text-night-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
              >
                <span className="flex-1">{x.question}</span>
                <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
