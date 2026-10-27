'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BookOpenCheck, CircleHelp, FileText, Info, MessageSquareText, ShieldCheck, TriangleAlert } from 'lucide-react'
import { ListRow } from '@/components/profil/kit'
import { SoftSearch } from '@/components/profil/SoftSearch'
import { APP_VERSION } from '@/components/profil/data'

/** Entrée FAQ minimale envoyée au client (jamais la réponse complète). */
/** `lang` : attribut à poser si la question s'affiche dans une autre langue que l'interface (non traduite). */
export type FaqLink = { slug: string; question: string; lang?: string }

const ICON = 'h-6 w-6'
const ROWS = [
  { href: '/app/aide/faq', icon: <CircleHelp className={ICON} strokeWidth={1.7} />, key: 'faq' },
  { href: '/app/aide/tutoriels', icon: <BookOpenCheck className={ICON} strokeWidth={1.7} />, key: 'tutorials' },
  { href: '/app/aide/contact', icon: <MessageSquareText className={ICON} strokeWidth={1.7} />, key: 'contact' },
  { href: '/app/aide/signaler', icon: <TriangleAlert className={ICON} strokeWidth={1.7} />, key: 'report' },
  { href: '/app/aide/cgu', icon: <FileText className={ICON} strokeWidth={1.7} />, key: 'terms' },
  { href: '/app/aide/confidentialite', icon: <ShieldCheck className={ICON} strokeWidth={1.7} />, key: 'privacy' },
] as const

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export function AideHome({ faq }: { faq: FaqLink[] }) {
  const t = useTranslations('public.help.home')
  const [q, setQ] = useState('')
  const s = norm(q.trim())

  const allRows = useMemo(() => ROWS.map(r => ({ ...r, title: t(`rows.${r.key}.title`), sub: t(`rows.${r.key}.sub`) })), [t])
  const rows = useMemo(() => (s ? allRows.filter(r => norm(`${r.title} ${r.sub}`).includes(s)) : allRows), [s, allRows])
  const questions = useMemo(() => (s ? faq.filter(x => norm(x.question).includes(s)) : []), [s, faq])
  const showAbout = !s || norm(t('aboutSearch')).includes(s)

  return (
    <div className="px-5 pb-8 pt-2">
      <SoftSearch value={q} onChange={setQ} placeholder={t('searchPh')} label={t('searchLabel')} />

      <ul className="mt-4">
        {rows.map(r => (
          <ListRow key={r.href} href={r.href} icon={r.icon} title={r.title} subtitle={r.sub} className="px-1" />
        ))}
        {questions.map(x => (
          <ListRow key={x.slug} href={`/app/aide/faq/${x.slug}`} icon={<CircleHelp className={ICON} strokeWidth={1.7} />} title={x.lang ? <span lang={x.lang}>{x.question}</span> : x.question} subtitle={t('faqTag')} className="px-1" />
        ))}
        {showAbout && (
          <ListRow href="/app/aide/apropos" icon={<Info className={ICON} strokeWidth={1.7} />} title={t('about')} subtitle={t('version', { version: APP_VERSION })} chevron={false} className="px-1" />
        )}
      </ul>

      <p className="sr-only" aria-live="polite">
        {s ? t('results', { count: rows.length + questions.length + (showAbout ? 1 : 0) }) : ''}
      </p>
      {s && rows.length + questions.length === 0 && !showAbout && (
        <p className="mt-8 text-center text-[13px] text-night-700">{t('noResult', { q })}</p>
      )}
    </div>
  )
}
