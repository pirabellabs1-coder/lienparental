'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { btn } from '@/components/onboarding/styles'
import { useOnboardingDraft } from '@/components/onboarding/draft'
import Image from 'next/image'
import { InviteForm } from '@/components/coparents/InviteForm'
import { ShareInvite } from '@/components/coparents/ShareInvite'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { mockChildren } from '@/lib/mock-data'
import { FAMILY_LIVE, type IssuedInvitation } from '@/lib/coparents'

// Étape facultative (entre le récapitulatif et « Votre espace est prêt ») :
// inviter l'autre parent ou un proche. Supabase : la session est ouverte depuis
// l'étape 7 et la fiche enfant de l'étape 9 existe (draft.child.id).
export default function OnboardingCoparentPage() {
  const router = useRouter()
  const { draft, ready } = useOnboardingDraft()
  const [issued, setIssued] = useState<IssuedInvitation | null>(null)
  const { announce, node: announcer } = useAnnounce()
  const next = () => router.push('/onboarding/pret')

  const child = draft.child
  // Démo : la fiche de l'onboarding n'est pas persistée, on s'appuie sur l'enfant fictif.
  const childOptions = child?.id
    ? [{ id: child.id, prenom: child.prenom }]
    : !FAMILY_LIVE && mockChildren[0]
      ? [{ id: mockChildren[0].id, prenom: child?.prenom || mockChildren[0].prenom }]
      : []

  const skip = (
    <button type="button" onClick={next} className={cn(btn.secondary, 'w-full')}>
      Passer cette étape
    </button>
  )

  return (
    <OnboardingScreen
      step={11}
      back="/onboarding/recap"
      media={<Image src="/images/onboarding/bienvenue.webp" alt="" width={720} height={376} className="mb-4 h-24 w-auto" />}
      title={issued ? 'Invitation prête' : 'Ajouter l’autre parent'}
      subtitle={issued
        ? 'Envoyez le lien par WhatsApp, SMS ou e-mail. Vous pourrez gérer les accès depuis Famille et co-parents.'
        : 'Facultatif. L’autre parent ou un proche accède à l’espace partagé de l’enfant ; votre Journal et vos notes restent privés.'}
      footer={issued ? (
        <button type="button" onClick={next} className={cn(btn.primary, 'w-full')}>Continuer</button>
      ) : childOptions.length === 0 && ready ? skip : undefined}
    >
      <div className={cn('transition-opacity', !ready && 'opacity-0')}>
        {issued ? (
          <ShareInvite issued={issued} senderPrenom={draft.prenom ?? ''} announce={announce} />
        ) : childOptions.length === 0 ? (
          <p className="rounded-xl bg-night-50 p-3 text-[13px] text-night-700">
            Ajoutez d&apos;abord la fiche de votre enfant pour pouvoir la partager. Vous pourrez inviter l&apos;autre parent plus tard depuis Famille et co-parents.
          </p>
        ) : (
          <InviteForm
            childOptions={childOptions}
            onCreated={setIssued}
            submitLabel="Inviter"
            secondary={skip}
          />
        )}
      </div>
      {announcer}
    </OnboardingScreen>
  )
}
