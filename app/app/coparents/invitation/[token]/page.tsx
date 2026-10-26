'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Users } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { LoadingState } from '@/components/mobile/StateScreens'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { SharedScope } from '@/components/coparents/SharedScope'
import { RoleBadge, frBirth, frDay, joinNames } from '@/components/coparents/bits'
import { btn, card } from '@/components/ui/kit'
import { cn } from '@/lib/cn'
import {
  ROLE_HELP, acceptFamilyInvitation, declineFamilyInvitation, previewFamilyInvitation, type InvitationPreview,
} from '@/lib/coparents'

const ENDED: Record<'invalid' | 'expired' | 'accepted' | 'cancelled' | 'declined', { title: string; text: string }> = {
  invalid: { title: 'Invitation invalide', text: 'Ce lien n’est pas reconnu. Demandez un nouveau lien à la personne qui vous a invité.' },
  expired: { title: 'Invitation expirée', text: 'Ce lien a dépassé sa durée de validité de 7 jours. Demandez à la personne qui vous a invité de vous le renvoyer.' },
  accepted: { title: 'Invitation déjà acceptée', text: 'Cette invitation a déjà été utilisée. Retrouvez les enfants partagés dans Famille et co-parents.' },
  cancelled: { title: 'Invitation annulée', text: 'La personne qui vous a invité a annulé ce lien.' },
  declined: { title: 'Invitation refusée', text: 'Cette invitation a été refusée.' },
}

// Acceptation d'une invitation famille (compte requis : /app est protégé, retour ici après connexion).
export default function FamilyInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    previewFamilyInvitation(token)
      .then((p) => { if (live) setPreview(p) })
      .catch(() => { if (live) setPreview({ state: 'invalid' }) })
    return () => { live = false }
  }, [token])

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      await acceptFamilyInvitation({ token })
      router.push('/app/coparents')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation invalide ou expirée.')
      setBusy(false)
    }
  }

  const decline = async () => {
    if (preview?.state !== 'ready') return
    setBusy(true)
    try {
      await declineFamilyInvitation(preview.id)
      router.push('/app')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.')
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title="Invitation" showBack backHref="/app" showBell={false} />
      <div className="w-full px-5 pb-10 pt-2">
        {!preview ? (
          <LoadingState compact title="Vérification de l’invitation" description="" />
        ) : preview.state === 'ready' ? (
          <div className="mx-auto grid max-w-3xl gap-4 lg:grid-cols-[1.2fr_1fr]">
            <section aria-labelledby="inv-title" className={cn(card, 'p-5')}>
              <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
                <Users className="h-6 w-6" strokeWidth={1.9} />
              </span>
              <h2 id="inv-title" className="mt-4 text-[18px] font-extrabold text-night-900">
                {preview.inviterPrenom || 'Un parent'} vous invite à rejoindre l&apos;espace partagé
              </h2>
              <p className="mt-2 text-[14px] text-night-700">
                {joinNames(preview.children.map((c) => (c.dateNaissance ? `${c.prenom} (né(e) le ${frBirth(c.dateNaissance)})` : c.prenom)))}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-night-700">
                Rôle proposé : <RoleBadge role={preview.role} />
              </p>
              <p className="mt-1.5 text-[13px] text-night-600">{ROLE_HELP[preview.role]}</p>
              <p className="mt-3 text-[12px] text-night-600">Valable jusqu&apos;au {frDay(preview.expiresAt)}.</p>
              <p className="mt-3 rounded-xl bg-night-50/70 p-3 text-[12px] text-night-700">
                Vous avez déjà une fiche pour cet enfant ? Après acceptation, nous vous proposerons de fusionner les deux fiches, avec votre confirmation.
              </p>
              {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{error}</p>}
              <button type="button" onClick={() => void accept()} disabled={busy} className={cn(btn.primary, 'mt-5 w-full')}>
                {busy ? 'Un instant…' : 'Accepter l’invitation'}
              </button>
              <button type="button" onClick={() => void decline()} disabled={busy} className={cn(btn.secondary, 'mt-2.5 w-full')}>
                Refuser
              </button>
            </section>
            <SharedScope compact />
          </div>
        ) : preview.state === 'other_account' ? (
          <section className={cn(card, 'mx-auto max-w-lg p-5')} aria-labelledby="inv-other">
            <AlertCircle className="h-7 w-7 text-orange-700" aria-hidden="true" />
            <h2 id="inv-other" className="mt-3 text-[18px] font-extrabold text-night-900">Cette invitation est destinée à un autre compte</h2>
            <p className="mt-2 text-[14px] text-night-700">
              Elle a été envoyée à <strong className="font-semibold">{preview.inviteeHint}</strong>. Connectez-vous avec le compte de cette adresse, après l&apos;avoir vérifiée, pour l&apos;accepter.
            </p>
            <LogoutButton variant="button" className="mt-5" />
          </section>
        ) : (
          <section className={cn(card, 'mx-auto max-w-lg p-5')} aria-labelledby="inv-ended">
            <AlertCircle className="h-7 w-7 text-night-600" aria-hidden="true" />
            <h2 id="inv-ended" className="mt-3 text-[18px] font-extrabold text-night-900">{ENDED[preview.state].title}</h2>
            <p className="mt-2 text-[14px] text-night-700">{ENDED[preview.state].text}</p>
            <button type="button" onClick={() => router.push('/app/coparents')} className={cn(btn.secondary, 'mt-5 w-full')}>
              Famille et co-parents
            </button>
          </section>
        )}
      </div>
    </>
  )
}
