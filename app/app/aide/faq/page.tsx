'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { SoftSearch } from '@/components/profil/SoftSearch'
import faqIndex from '@/content/faq/index.json'
import { cn } from '@/lib/cn'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function FaqPage() {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = norm(q.trim())
    return s ? faqIndex.questions.filter(x => norm(x.question).includes(s)) : faqIndex.questions
  }, [q])

  return (
    <>
      <TopBar title="FAQ" showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-2">
        <SoftSearch value={q} onChange={setQ} placeholder="Rechercher une question…" label="Rechercher une question" />

        <h2 className="mt-5 text-[13px] font-bold text-night-900">Questions fréquentes</h2>
        {list.length === 0 ? (
          <p className="mt-6 text-center text-[13px] text-night-700" role="status">Aucune question ne correspond à « {q} ».</p>
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

        <div className="mt-6 rounded-xl2 bg-night-50/80 p-4">
          <p className="text-[13px] font-bold text-night-900">Vous ne trouvez pas la réponse ?</p>
          <p className="mt-1 text-[12.5px] text-night-800">Contactez notre équipe, nous sommes là pour vous aider.</p>
          <Link href="/app/aide/contact" className={cn(btn.secondary, 'mt-3 text-[13px]')}>Nous contacter</Link>
        </div>
      </div>
    </>
  )
}
