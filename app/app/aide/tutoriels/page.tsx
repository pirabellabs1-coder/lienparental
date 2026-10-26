'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronRight, Crown, FolderDown, Rocket, Sparkles, Upload, UserCheck } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { SoftSearch } from '@/components/profil/SoftSearch'
import tutoIndex from '@/content/tutoriels/index.json'
import { cn } from '@/lib/cn'

const ICONS: Record<string, { icon: React.ReactNode; tone: string }> = {
  rocket: { icon: <Rocket className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-night-50 text-night-700' },
  sparkles: { icon: <Sparkles className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-iris-50 text-iris-600' },
  upload: { icon: <Upload className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-orange-50 text-orange-500' },
  'user-check': { icon: <UserCheck className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-leaf-50 text-leaf-600' },
  'folder-down': { icon: <FolderDown className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-alert-50 text-alert-500' },
  star: { icon: <Crown className="h-6 w-6" strokeWidth={1.7} />, tone: 'bg-gold-50 text-gold-500' },
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function TutorielsPage() {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = norm(q.trim())
    return s ? tutoIndex.tutoriels.filter(t => norm(t.title).includes(s)) : tutoIndex.tutoriels
  }, [q])

  return (
    <>
      <TopBar title="Tutoriels" showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-2">
        <SoftSearch value={q} onChange={setQ} placeholder="Rechercher un tutoriel…" label="Rechercher un tutoriel" />
        <h2 className="mt-5 text-[13px] font-bold text-night-900">Guides d’utilisation</h2>
        {list.length === 0 ? (
          <p className="mt-6 text-center text-[13px] text-night-700" role="status">Aucun tutoriel ne correspond à « {q} ».</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {list.map(t => {
              const v = ICONS[t.coverIcon] ?? ICONS.rocket
              return (
                <li key={t.slug}>
                  <Link
                    href={`/app/aide/tutoriels/${t.slug}`}
                    className="flex min-h-[72px] items-center gap-4 rounded-xl2 py-2 hover:bg-night-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
                  >
                    <span aria-hidden className={cn('inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl2', v.tone)}>{v.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold text-night-900">{t.title}</span>
                      <span className="mt-1 block text-[12px] text-night-700">{t.duree_min} min</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-night-900" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
