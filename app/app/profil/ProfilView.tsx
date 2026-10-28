'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Brain, CalendarDays, ChevronRight, CircleHelp, Cloud, Coins, LockKeyhole, SlidersHorizontal, UserRound } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'
import {
  BrandHeader,
  CrownIcon,
  ListGroup,
  ListRow,
  PageTitle,
  Pill,
  ProgressBar,
  SectionLabel,
  btn,
} from '@/components/profil/kit'
import { ProfileAvatar } from '@/components/profil/ProfileAvatar'
import { profile } from '@/components/profil/data'
import type { PlanId } from '@/components/profil/pricing'
import { formatBytes } from '@/components/profil/storage'
import { signOutAndRedirect, useAccountProfile } from '@/lib/auth/browser'
import { useUnreadNotificationsCount } from '@/lib/data/notifications'
import { TONE_BADGE, type StatusTone } from '@/lib/billing/ui-state'

export type ProfilViewProps = {
  /** true : compte réel (valeurs lues côté serveur) ; false : démonstration. */
  live: boolean
  plan: PlanId
  /** null : consommation indisponible (erreur de lecture). */
  storage: { usedBytes: number; maxBytes: number } | null
  coach: { used: number; quota: number } | null
  /** Crédits d'analyses du Coach IA (solde, expiration la plus proche déjà formatée côté serveur) ; null : indisponible. */
  credits?: { balance: number; expiryLabel: string | null } | null
  /** Libellé de date de l'abonnement, ou null si inconnu (accès famille, facturation non branchée). */
  subscriptionDate: { label: string; date: string } | null
  /** Statut (libellé et phrase) issu de describeStatus, comme sur « Mon abonnement ». */
  status?: { label: string; headline: string; tone: StatusTone } | null
}

/** Date d'inscription du profil de démonstration (« mai 2024 » dans components/profil/data). */
const DEMO_MEMBER_SINCE = '2024-05-15T12:00:00Z'

export function ProfilView({ live, plan, storage, coach, credits, subscriptionDate, status }: ProfilViewProps) {
  const t = useTranslations('account.profile.home')
  const tb = useTranslations('billing.common.plan')
  const locale = useLocale()
  const isPremium = plan !== 'gratuit'
  const planName = tb(plan)
  const abonnementHref = '/app/abonnement'
  const unread = useUnreadNotificationsCount()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  // Supabase : public.users (RLS) ; démonstration : profil fictif.
  const { profile: account } = useAccountProfile(profile)
  const fullName = `${account.prenom} ${account.nom}`.trim()
  // Compte réel : date déjà formatée dans la langue de l'interface (useAccountProfile).
  // Démonstration : le profil fictif porte un libellé français, reformaté ici dans la langue courante.
  const memberSince = account.memberSince === profile.memberSince
    ? new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(DEMO_MEMBER_SINCE))
    : account.memberSince

  return (
    <>
      <BrandHeader notifications={unread} />

      <div className="space-y-5 px-5 pb-8 pt-3">
        <PageTitle title={t('title')} subtitle={t('subtitle')} />

        {/* Carte identité */}
        <Link
          href="/app/profil/informations"
          className="flex items-center gap-4 rounded-xl2 border border-night-100 bg-white p-4 shadow-soft transition hover:border-night-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
        >
          <ProfileAvatar name={fullName} src={account.avatarUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-bold text-night-900">{fullName}</span>
            <span className="mt-1.5 flex items-center gap-2 text-[12.5px] text-night-800">
              <span aria-hidden className="h-2 w-2 rounded-full bg-leaf-500" />
              {t('memberSince', { date: memberSince })}
            </span>
            <span className="mt-1.5 block truncate text-[12.5px] text-night-800">{account.email}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-night-900" aria-hidden />
          <span className="sr-only">{t('editInfo')}</span>
        </Link>

        {/* Carte formule */}
        {isPremium ? (
          <Link
            href={abonnementHref}
            className="block rounded-xl2 border border-gold-100 bg-gradient-to-br from-orange-50/80 to-gold-50 p-4 shadow-soft transition hover:border-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          >
            <Pill tone="goldSoft" className="uppercase tracking-wide">{planName}</Pill>
            <span className="mt-3 flex items-center gap-4">
              <CrownIcon className="h-12 w-14 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold text-night-900">Lien Parental {planName}</span>
                  {status ? (
                    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-bold', TONE_BADGE[status.tone])}>{status.label}</span>
                  ) : (
                    <Pill tone="leafSoft">{t('active')}</Pill>
                  )}
                </span>
                <span className="mt-1 block text-[12.5px] text-night-800">{status ? status.headline : t('activeHeadline')}</span>
                <span className="mt-2.5 flex items-center justify-between gap-2 text-[12.5px] text-night-800">
                  {subscriptionDate ? (
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-night-900" aria-hidden />
                      {subscriptionDate.label} {subscriptionDate.date}
                    </span>
                  ) : (
                    <span>{t('subscriptionDetail')}</span>
                  )}
                  <ChevronRight className="h-5 w-5 text-night-900" aria-hidden />
                </span>
              </span>
            </span>
          </Link>
        ) : (
          <section aria-labelledby="plan-title" className="rounded-xl2 border border-night-100 bg-night-50/80 p-4 shadow-soft">
            <Pill tone="night" className="uppercase tracking-wide">{t('free')}</Pill>
            <div className="mt-3 flex items-center gap-4">
              <CrownIcon variant="outline" className="h-12 w-14 shrink-0 text-night-900" />
              <div className="min-w-0 flex-1">
                <h2 id="plan-title" className="text-[15px] font-bold text-night-900">{t('freeTitle')}</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-night-800">
                  {t('freeText1')}
                  <br />
                  {t('freeText2')}
                </p>
              </div>
            </div>
            <Link href="/app/abonnement?formule=premium" className={cn(btn.primary, "relative mt-4 text-[14px]")}>
              {t('seePlans')}
              <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
            </Link>
          </section>
        )}

        <section aria-labelledby="sec-compte">
          <SectionLabel id="sec-compte">{t('sections.account')}</SectionLabel>
          <ListGroup>
            <ListRow href="/app/profil/informations" icon={<UserRound className="h-6 w-6" strokeWidth={1.7} />} title={t('rows.info')} subtitle={t('rows.infoSub')} />
            <ListRow href="/app/profil/securite" icon={<LockKeyhole className="h-6 w-6" strokeWidth={1.7} />} title={t('rows.security')} subtitle={t('rows.securitySub')} />
            <ListRow href="/app/profil/preferences" icon={<SlidersHorizontal className="h-6 w-6" strokeWidth={1.7} />} title={t('rows.prefs')} subtitle={t('rows.prefsSub')} />
          </ListGroup>
        </section>

        <section aria-labelledby="sec-abo">
          <SectionLabel id="sec-abo">{t('sections.subscription')}</SectionLabel>
          <ListGroup>
            {isPremium ? (
              <>
                <ListRow href={abonnementHref} icon={<CrownIcon className="h-6 w-7" />} title={t('rows.subscription')} subtitle={t('rows.subscriptionSub')} />
              </>
            ) : (
              <ListRow href="/app/abonnement" icon={<CrownIcon variant="outline" className="h-6 w-7 text-night-900" />} title={t('rows.subscription')} subtitle={t('rows.subscriptionFreeSub')} />
            )}
            {credits && (
              <ListRow
                href="/app/coach/credits"
                icon={<Coins className="h-6 w-6" strokeWidth={1.7} />}
                title={t('rows.credits')}
                subtitle={
                  credits.balance > 0 && credits.expiryLabel
                    ? t('rows.creditsExpiry', { label: t('rows.creditsSub', { count: credits.balance }), date: credits.expiryLabel })
                    : t('rows.creditsSub', { count: credits.balance })
                }
              />
            )}
          </ListGroup>
        </section>

        <section aria-labelledby="sec-stockage">
          <SectionLabel id="sec-stockage">{t('sections.storage')}</SectionLabel>
          <Link
            href="/app/profil/stockage"
            className="flex items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3.5 shadow-soft transition hover:border-night-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
          >
            <Cloud className="h-6 w-6 shrink-0 text-night-900" strokeWidth={1.7} aria-hidden />
            <span className="ml-1 min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-night-900">{t('storageUsed')}</span>
              {storage ? (
                <>
                  <span className="mt-0.5 block text-[12.5px] text-night-700">{formatBytes(storage.usedBytes, locale)} / {formatBytes(storage.maxBytes, locale)}</span>
                  <ProgressBar className="mt-2.5" value={storage.usedBytes} max={storage.maxBytes} label={t('storageAria')} />
                </>
              ) : (
                <span className="mt-0.5 block text-[12.5px] text-night-700">{t('storageUnavailable')}</span>
              )}
            </span>
          </Link>
        </section>

        <section aria-labelledby="sec-coach">
          <SectionLabel id="sec-coach">{t('sections.coach')}</SectionLabel>
          <div className="flex items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3.5 shadow-soft">
            <Brain className="h-6 w-6 shrink-0 text-night-900" strokeWidth={1.7} aria-hidden />
            <div className="ml-1 min-w-0 flex-1">
              <p className="text-[14px] font-bold text-night-900">{t('coachUsage')}</p>
              {coach ? (
                <>
                  <p className="mt-0.5 text-[12.5px] text-night-700">{live ? t('coachCount30', { used: coach.used, quota: coach.quota }) : t('coachCount', { used: coach.used, quota: coach.quota })}</p>
                  <ProgressBar className="mt-2.5" value={coach.used} max={coach.quota} label={t('coachAria')} />
                </>
              ) : (
                <p className="mt-0.5 text-[12.5px] text-night-700">{t('coachUnavailable')}</p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="sec-aide">
          <SectionLabel id="sec-aide">{t('sections.help')}</SectionLabel>
          <ListGroup>
            <ListRow href="/app/aide" icon={<CircleHelp className="h-6 w-6" strokeWidth={1.7} />} title={t('rows.help')} subtitle={t('rows.helpSub')} />
          </ListGroup>
        </section>

        <button type="button" onClick={() => setLogoutOpen(true)} className={btn.secondary}>
          {t('logout.button')}
        </button>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => {
          // Supabase : signOut (cet appareil) ; démonstration : endDemoSession(). Puis écran de connexion.
          setLoggingOut(true)
          void signOutAndRedirect('/onboarding/connexion')
        }}
        loading={loggingOut}
        title={t('logout.title')}
        description={t('logout.description')}
        confirmLabel={t('logout.confirm')}
        tone="danger"
      />
    </>
  )
}
