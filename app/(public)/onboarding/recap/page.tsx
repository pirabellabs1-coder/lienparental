'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Pencil, User } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { btn } from '@/components/onboarding/styles'
import { getDraftPhoto, useOnboardingDraft } from '@/components/onboarding/draft'
import { ChecklistIllustration, ChildAvatarIllustration } from '@/components/illustrations'
import { formatNumericDate } from '@/lib/mock-data'

// Étape 10 (récap) : vérifiez vos informations.
export default function RecapPage() {
  const router = useRouter()
  const { draft, ready } = useOnboardingDraft()
  const [photos, setPhotos] = useState<{ parent: string | null; child: string | null }>({ parent: null, child: null })

  useEffect(() => {
    setPhotos({ parent: getDraftPhoto('parent'), child: getDraftPhoto('child') })
  }, [])

  const fullName = [draft.prenom, draft.nom].filter(Boolean).join(' ')
  const child = draft.child

  return (
    <OnboardingScreen
      step={10}
      align="center"
      media={<ChecklistIllustration className="mx-auto mb-4 h-24 w-24" />}
      title="Vérifiez vos informations"
      subtitle="Voici un récapitulatif de votre profil et de l’enfant ajouté."
      footer={
        <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => router.push('/onboarding/coparent')}>
          Continuer
        </button>
      }
    >
      <section
        aria-label="Récapitulatif"
        className={cn('rounded-2xl border border-night-100 bg-white p-4 shadow-[0_1px_2px_rgba(11,45,91,0.06),0_8px_24px_-16px_rgba(11,45,91,0.12)] transition-opacity', !ready && 'opacity-0')}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-night-50 text-night-300">
            {photos.parent ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos.parent} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-bold text-night-900">Vous</h2>
            <p className="truncate text-sm font-semibold text-night-800">{fullName || 'Nom non renseigné'}</p>
            <p className="truncate text-[13px] text-night-500">{draft.email || 'E-mail non renseigné'}</p>
          </div>
          <Link
            href="/onboarding/profil"
            aria-label="Modifier votre profil"
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-500 hover:bg-night-50 hover:text-night-900"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <hr className="my-4 border-night-100" />

        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full">
            {child && photos.child ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos.child} alt="" className="h-full w-full object-cover" />
            ) : (
              <ChildAvatarIllustration className="h-full w-full" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-bold text-night-900">Enfant</h2>
            {child ? (
              <>
                <p className="truncate text-sm font-semibold text-night-800">
                  {child.prenom} – {formatNumericDate(child.dateNaissance)}
                </p>
                {child.classe && <p className="truncate text-[13px] text-night-500">{child.classe}</p>}
              </>
            ) : (
              <p className="text-[13px] text-night-500">Aucun enfant ajouté pour le moment.</p>
            )}
          </div>
          <Link
            href="/onboarding/enfant"
            aria-label={child ? `Modifier l’enfant ${child.prenom}` : 'Ajouter un enfant'}
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-500 hover:bg-night-50 hover:text-night-900"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </OnboardingScreen>
  )
}
