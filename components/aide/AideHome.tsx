'use client'

import { useMemo, useState } from 'react'
import { BookOpenCheck, CircleHelp, FileText, Info, MessageSquareText, ShieldCheck, TriangleAlert } from 'lucide-react'
import { ListRow } from '@/components/profil/kit'
import { SoftSearch } from '@/components/profil/SoftSearch'
import { APP_VERSION } from '@/components/profil/data'

/** Entrée FAQ minimale envoyée au client (jamais la réponse complète). */
export type FaqLink = { slug: string; question: string }

const ICON = 'h-6 w-6'
const ROWS = [
  { href: '/app/aide/faq', icon: <CircleHelp className={ICON} strokeWidth={1.7} />, title: 'FAQ', sub: 'Les réponses à vos questions' },
  { href: '/app/aide/tutoriels', icon: <BookOpenCheck className={ICON} strokeWidth={1.7} />, title: 'Tutoriels', sub: 'Guides et conseils d’utilisation' },
  { href: '/app/aide/contact', icon: <MessageSquareText className={ICON} strokeWidth={1.7} />, title: 'Nous contacter', sub: 'Notre équipe vous répond' },
  { href: '/app/aide/signaler', icon: <TriangleAlert className={ICON} strokeWidth={1.7} />, title: 'Signaler un problème', sub: 'Nous aider à nous améliorer' },
  { href: '/app/aide/cgu', icon: <FileText className={ICON} strokeWidth={1.7} />, title: 'Conditions générales', sub: 'Consultez nos CGU' },
  { href: '/app/aide/confidentialite', icon: <ShieldCheck className={ICON} strokeWidth={1.7} />, title: 'Politique de confidentialité', sub: 'Découvrez comment nous protégeons vos données' },
]

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export function AideHome({ faq }: { faq: FaqLink[] }) {
  const [q, setQ] = useState('')
  const s = norm(q.trim())

  const rows = useMemo(() => (s ? ROWS.filter(r => norm(`${r.title} ${r.sub}`).includes(s)) : ROWS), [s])
  const questions = useMemo(() => (s ? faq.filter(x => norm(x.question).includes(s)) : []), [s, faq])
  const showAbout = !s || norm('À propos version').includes(s)

  return (
    <div className="px-5 pb-8 pt-2">
      <SoftSearch value={q} onChange={setQ} placeholder="Rechercher dans l’aide…" label="Rechercher dans l’aide" />

      <ul className="mt-4">
        {rows.map(r => (
          <ListRow key={r.href} href={r.href} icon={r.icon} title={r.title} subtitle={r.sub} className="px-1" />
        ))}
        {questions.map(x => (
          <ListRow key={x.slug} href={`/app/aide/faq/${x.slug}`} icon={<CircleHelp className={ICON} strokeWidth={1.7} />} title={x.question} subtitle="FAQ" className="px-1" />
        ))}
        {showAbout && (
          <ListRow href="/app/aide/apropos" icon={<Info className={ICON} strokeWidth={1.7} />} title="À propos" subtitle={`Version ${APP_VERSION}`} chevron={false} className="px-1" />
        )}
      </ul>

      <p className="sr-only" aria-live="polite">
        {s ? `${rows.length + questions.length + (showAbout ? 1 : 0)} résultat(s)` : ''}
      </p>
      {s && rows.length + questions.length === 0 && !showAbout && (
        <p className="mt-8 text-center text-[13px] text-night-700">Aucun résultat pour « {q} ».</p>
      )}
    </div>
  )
}
