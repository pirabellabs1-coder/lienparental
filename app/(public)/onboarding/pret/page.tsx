'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { btn } from '@/components/onboarding/styles'
import { clearDraft } from '@/components/onboarding/draft'
import { DEMO_MODE, startDemoSession } from '@/lib/demo-auth'
import { ConfettiBurst, FamilyHeartIcon } from '@/components/illustrations'

const BENEFITS = ['Communication simplifiée', 'Documents sécurisés', 'Organisation facilitée']

// Étape 12 : c'est terminé ! Votre espace est prêt.
export default function PretPage() {
  const router = useRouter()

  const enter = () => {
    clearDraft()
    // Supabase : la session a été ouverte à la vérification du code (étape 7).
    // Démonstration : session temporaire.
    if (DEMO_MODE) startDemoSession('nouveau')
    router.push('/app')
  }

  return (
    <OnboardingScreen
      step={12}
      back={false}
      align="center"
      media={
        <div className="relative mx-auto mb-6 mt-6 h-32 w-56">
          <ConfettiBurst className="absolute inset-0 h-full w-full motion-safe:animate-fade-up" />
          <FamilyHeartIcon className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2" />
        </div>
      }
      title="Votre espace est prêt !"
      subtitle="Vous pouvez dès à présent accéder à votre espace personnalisé."
      footer={
        <button type="button" onClick={enter} className={cn(btn.primary, 'relative w-full')}>
          Accéder à mon espace
          <ArrowRight className="absolute right-5 h-5 w-5" aria-hidden="true" />
        </button>
      }
    >
      <ul className="mx-auto mt-2 w-fit space-y-3.5">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-center gap-3 text-sm font-semibold text-night-800">
            <span className="grid h-5 w-5 place-items-center rounded-full border-[1.5px] border-leaf-500 text-leaf-500" aria-hidden="true">
              <Check className="h-3 w-3" strokeWidth={3.2} />
            </span>
            {b}
          </li>
        ))}
      </ul>
    </OnboardingScreen>
  )
}
