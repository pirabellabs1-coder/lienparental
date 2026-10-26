'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { GO, ManagedInVault, STORAGE, TrashIllustration, UsageCard } from '@/components/profil/storage'
import { LIVE } from '@/lib/data/core'
import { cn } from '@/lib/cn'

type Phase = 'confirm' | 'running' | 'done'

// Pages 5 → 6 → 7 : confirmation, suppression en cours, validation.
export default function SuppressionPage() {
  return LIVE ? <ManagedInVault title="Supprimer tous les fichiers" backHref="/app/profil/stockage/fichiers" /> : <DemoSuppressionPage />
}

/** Démonstration uniquement (fichiers et suppression simulés). */
function DemoSuppressionPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('confirm')
  const [progress, setProgress] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (phase !== 'running') return
    // NOTE Supabase: suivre la tâche réelle (realtime channel) au lieu de ce minuteur.
    const t = setInterval(() => {
      setProgress(p => {
        const n = Math.min(100, p + 6 + Math.random() * 6)
        if (n >= 100) { clearInterval(t); setTimeout(() => setPhase('done'), 300) }
        return n
      })
    }, 200)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => { if (phase !== 'confirm') headingRef.current?.focus() }, [phase])

  const title = phase === 'confirm' ? 'Supprimer tous les fichiers' : phase === 'running' ? 'Suppression en cours' : 'Stockage - Utilisation'

  return (
    <>
      <TopBar title={title} showBack={phase !== 'running'} backHref={phase === 'done' ? '/app/profil/stockage' : '/app/profil/stockage/fichiers'} showBell={false} />

      <div className="px-5 pb-8 pt-3">
        {phase === 'confirm' && (
          <div className="flex flex-col items-center text-center">
            <span className="mt-6 inline-flex h-32 w-32 items-center justify-center rounded-full bg-alert-50">
              <TrashIllustration className="h-24 w-24" />
            </span>
            <h2 className="mt-8 text-[14px] font-bold text-night-900">Cette action est irréversible.</h2>
            <p className="mt-3 max-w-[260px] text-[12.5px] leading-relaxed text-night-800">
              Tous vos fichiers seront définitivement supprimés et vous ne pourrez pas les récupérer.
            </p>
            <div className="mt-10 w-full rounded-xl2 border border-alert-100 bg-alert-50/60 py-5">
              <p className="text-[11.5px] font-semibold text-night-900">Espace qui sera libéré</p>
              <p className="mt-2 text-[18px] font-extrabold text-night-900">{STORAGE.usedGo} Go</p>
            </div>
            <button type="button" onClick={() => setPhase('running')} className={cn(btn.danger, 'mt-5')}>Tout supprimer</button>
            <button type="button" onClick={() => router.push('/app/profil/stockage/fichiers')} className={cn(btn.secondary, 'mt-3')}>Annuler</button>
          </div>
        )}

        {phase === 'running' && (
          <div className="flex flex-col items-center text-center">
            <ProgressRing value={progress} />
            <h2 ref={headingRef} tabIndex={-1} className="mt-8 text-[14px] font-bold text-night-900 focus:outline-none">Suppression en cours…</h2>
            <p className="mt-3 max-w-[240px] text-[12.5px] leading-relaxed text-night-800">Veuillez patienter, cela peut prendre quelques instants.</p>
            <div
              role="progressbar"
              aria-label="Progression de la suppression"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="mt-16 h-1.5 w-full overflow-hidden rounded-full bg-night-100"
            >
              <div className="h-full rounded-full bg-leaf-500 transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-4 text-[12px] text-night-800">Suppression de {STORAGE.usedGo} Go…</p>
            <p className="mt-3 text-[12px] text-night-800">Ne fermez pas l’application.</p>
          </div>
        )}

        {phase === 'done' && (
          <div>
            <UsageCard usedBytes={0} maxBytes={STORAGE.maxGo * GO} caption="0 % utilisés" compact />
            <div role="status" className="mt-12 flex flex-col items-center text-center">
              <span aria-hidden className="inline-flex h-28 w-28 items-center justify-center rounded-full bg-leaf-50">
                <span className="inline-flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-leaf-600 text-leaf-600">
                  <Check className="h-10 w-10" strokeWidth={3} />
                </span>
              </span>
              <h2 ref={headingRef} tabIndex={-1} className="mt-8 text-[14px] font-bold text-night-900 focus:outline-none">Tous vos fichiers ont été supprimés.</h2>
              <p className="mt-4 max-w-[220px] text-[12.5px] leading-relaxed text-night-800">Votre espace de stockage est maintenant vide.</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ProgressRing({ value }: { value: number }) {
  const r = 60
  const c = 2 * Math.PI * r
  return (
    <span aria-hidden className="relative mt-6 inline-flex h-36 w-36 items-center justify-center">
      <svg viewBox="0 0 140 140" className="absolute inset-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="#fdeced" stroke="#fbd2d3" strokeWidth="4" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="#d92128" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="transition-[stroke-dashoffset] duration-200" />
      </svg>
      <TrashIllustration className="relative h-24 w-24" />
    </span>
  )
}
