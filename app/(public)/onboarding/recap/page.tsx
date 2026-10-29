'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Pencil, User } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { btn } from '@/components/onboarding/styles'
import { getDraftPhoto, useOnboardingDraft } from '@/components/onboarding/draft'
import { ChecklistIllustration, ChildAvatarIllustration } from '@/components/illustrations'
import { childClassKey } from '@/components/onboarding/fields'
import { intlLocale } from '@/lib/i18n/config'
import { isTerritoryCode } from '@/lib/guide/territories'

// Étape 10 (récap) : vérifiez vos informations.
export default function RecapPage() {
  const router = useRouter()
  const t = useTranslations('public.onboarding.recap')
  const tc = useTranslations('public.onboarding.classes')
  const tTerr = useTranslations('shared.territories')
  const locale = useLocale()
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric' })
  const classLabel = (c: string) => {
    const k = childClassKey(c)
    return k ? tc(k) : c
  }
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
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => router.push('/onboarding/coparent')}>
          {t('continue')}
        </button>
      }
    >
      <section
        aria-label={t('summary')}
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
            <h2 className="text-[13px] font-bold text-night-900">{t('you')}</h2>
            <p className="truncate text-sm font-semibold text-night-800">{fullName || t('noName')}</p>
            <p className="truncate text-[13px] text-night-500">{draft.email || t('noEmail')}</p>
            {draft.territoire && isTerritoryCode(draft.territoire) && (
              <p className="truncate text-[13px] text-night-500">{t('territory', { name: tTerr(draft.territoire) })}</p>
            )}
          </div>
          <Link
            href="/onboarding/profil"
            aria-label={t('editProfile')}
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
            <h2 className="text-[13px] font-bold text-night-900">{t('child')}</h2>
            {child ? (
              <>
                <p className="truncate text-sm font-semibold text-night-800">
                  {child.prenom} – {formatDate(child.dateNaissance)}
                </p>
                {child.classe && <p className="truncate text-[13px] text-night-500">{classLabel(child.classe)}</p>}
              </>
            ) : (
              <p className="text-[13px] text-night-500">{t('noChild')}</p>
            )}
          </div>
          <Link
            href="/onboarding/enfant"
            aria-label={child ? t('editChild', { name: child.prenom }) : t('addChild')}
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-500 hover:bg-night-50 hover:text-night-900"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </OnboardingScreen>
  )
}
