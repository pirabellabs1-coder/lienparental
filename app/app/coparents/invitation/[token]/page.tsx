'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AlertCircle, Users } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { LoadingState } from '@/components/mobile/StateScreens'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { SharedScope } from '@/components/coparents/SharedScope'
import { RoleBadge, frBirth, frDay, joinNames } from '@/components/coparents/bits'
import { btn, card } from '@/components/ui/kit'
import { cn } from '@/lib/cn'
import {
  acceptFamilyInvitation, declineFamilyInvitation, previewFamilyInvitation, type InvitationPreview,
} from '@/lib/coparents'

// États terminaux : family.coparents.invitationPage.ended.<état>.{title,text} (traduits au rendu).

// Acceptation d'une invitation famille (compte requis : /app est protégé, retour ici après connexion).
export default function FamilyInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const t = useTranslations('family.coparents.invitationPage')
  const tRoles = useTranslations('family.coparents.inviteForm.roles')
  const locale = useLocale()
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
      setError(e instanceof Error ? e.message : t('invalidOrExpired'))
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
      setError(e instanceof Error ? e.message : t('actionFailed'))
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app" showBell={false} />
      <div className="w-full px-5 pb-10 pt-2">
        {!preview ? (
          <LoadingState compact title={t('checking')} description="" />
        ) : preview.state === 'ready' ? (
          <div className="mx-auto grid max-w-3xl gap-4 lg:grid-cols-[1.2fr_1fr]">
            <section aria-labelledby="inv-title" className={cn(card, 'p-5')}>
              <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
                <Users className="h-6 w-6" strokeWidth={1.9} />
              </span>
              <h2 id="inv-title" className="mt-4 text-[18px] font-extrabold text-night-900">
                {t('heading', { name: preview.inviterPrenom || t('aParent') })}
              </h2>
              <p className="mt-2 text-[14px] text-night-700">
                {joinNames(preview.children.map((c) => (c.dateNaissance ? t('childBorn', { name: c.prenom, date: frBirth(c.dateNaissance, locale) }) : c.prenom)), locale)}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-night-700">
                {t('proposedRole')} <RoleBadge role={preview.role} />
              </p>
              <p className="mt-1.5 text-[13px] text-night-600">{tRoles(`${preview.role}.help`)}</p>
              <p className="mt-3 text-[12px] text-night-600">{t('validUntil', { date: frDay(preview.expiresAt, false, locale) })}</p>
              <p className="mt-3 rounded-xl bg-night-50/70 p-3 text-[12px] text-night-700">
                {t('mergeNote')}
              </p>
              {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{error}</p>}
              <button type="button" onClick={() => void accept()} disabled={busy} className={cn(btn.primary, 'mt-5 w-full')}>
                {busy ? t('wait') : t('accept')}
              </button>
              <button type="button" onClick={() => void decline()} disabled={busy} className={cn(btn.secondary, 'mt-2.5 w-full')}>
                {t('decline')}
              </button>
            </section>
            <SharedScope compact />
          </div>
        ) : preview.state === 'other_account' ? (
          <section className={cn(card, 'mx-auto max-w-lg p-5')} aria-labelledby="inv-other">
            <AlertCircle className="h-7 w-7 text-orange-700" aria-hidden="true" />
            <h2 id="inv-other" className="mt-3 text-[18px] font-extrabold text-night-900">{t('otherAccountTitle')}</h2>
            <p className="mt-2 text-[14px] text-night-700">
              {t.rich('otherAccountText', {
                hint: preview.inviteeHint,
                strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
              })}
            </p>
            <LogoutButton variant="button" className="mt-5" />
          </section>
        ) : (
          <section className={cn(card, 'mx-auto max-w-lg p-5')} aria-labelledby="inv-ended">
            <AlertCircle className="h-7 w-7 text-night-600" aria-hidden="true" />
            <h2 id="inv-ended" className="mt-3 text-[18px] font-extrabold text-night-900">{t(`ended.${preview.state}.title`)}</h2>
            <p className="mt-2 text-[14px] text-night-700">{t(`ended.${preview.state}.text`)}</p>
            <button type="button" onClick={() => router.push('/app/coparents')} className={cn(btn.secondary, 'mt-5 w-full')}>
              {t('familyLink')}
            </button>
          </section>
        )}
      </div>
    </>
  )
}
