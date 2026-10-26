'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Brain, CalendarDays, ChevronRight, CircleHelp, Cloud, LockKeyhole, SlidersHorizontal, UserRound } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { cn } from '@/lib/cn'
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
import { PLAN_NAME, type PlanId } from '@/components/profil/pricing'
import { formatBytes } from '@/components/profil/storage'
import { signOutAndRedirect, useAccountProfile } from '@/lib/auth/browser'
import { useUnreadNotificationsCount } from '@/lib/data/notifications'

export type ProfilViewProps = {
  /** true : compte réel (valeurs lues côté serveur) ; false : démonstration. */
  live: boolean
  plan: PlanId
  /** null : consommation indisponible (erreur de lecture). */
  storage: { usedBytes: number; maxBytes: number } | null
  coach: { used: number; quota: number } | null
  /** Libellé de date de l'abonnement, ou null si inconnu (accès famille, facturation non branchée). */
  subscriptionDate: { label: string; date: string } | null
}

export function ProfilView({ live, plan, storage, coach, subscriptionDate }: ProfilViewProps) {
  const isPremium = plan !== 'gratuit'
  const planName = PLAN_NAME[plan]
  const abonnementHref = live ? '/app/profil/abonnement' : `/app/profil/abonnement?plan=${plan}`
  const unread = useUnreadNotificationsCount()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  // Supabase : public.users (RLS) ; démonstration : profil fictif.
  const { profile: account } = useAccountProfile(profile)
  const fullName = `${account.prenom} ${account.nom}`.trim()

  return (
    <>
      <BrandHeader notifications={unread} />

      <div className="space-y-5 px-5 pb-8 pt-3">
        <PageTitle title="Mon profil" subtitle="Gérez vos informations et votre compte." />

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
              Membre depuis {account.memberSince}
            </span>
            <span className="mt-1.5 block truncate text-[12.5px] text-night-800">{account.email}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-night-900" aria-hidden />
          <span className="sr-only">Modifier mes informations</span>
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
                  <Pill tone="gold">Actif</Pill>
                </span>
                <span className="mt-1 block text-[12.5px] text-night-800">Votre abonnement est actif.</span>
                <span className="mt-2.5 flex items-center justify-between gap-2 text-[12.5px] text-night-800">
                  {subscriptionDate ? (
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-night-900" aria-hidden />
                      {subscriptionDate.label} {subscriptionDate.date}
                    </span>
                  ) : (
                    <span>Voir le détail de l’abonnement</span>
                  )}
                  <ChevronRight className="h-5 w-5 text-night-900" aria-hidden />
                </span>
              </span>
            </span>
          </Link>
        ) : (
          <section aria-labelledby="plan-title" className="rounded-xl2 border border-night-100 bg-night-50/80 p-4 shadow-soft">
            <Pill tone="night" className="uppercase tracking-wide">Gratuit</Pill>
            <div className="mt-3 flex items-center gap-4">
              <CrownIcon variant="outline" className="h-12 w-14 shrink-0 text-night-900" />
              <div className="min-w-0 flex-1">
                <h2 id="plan-title" className="text-[15px] font-bold text-night-900">Compte gratuit</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-night-800">
                  Accédez aux fonctionnalités de base.
                  <br />
                  <Link href="/app/premium" className="font-semibold text-leaf-600 underline underline-offset-2">Passer à Premium</Link>{' '}
                  pour plus d’avantages.
                </p>
              </div>
            </div>
            <Link href="/app/premium" className={cn(btn.primary, "relative mt-4 text-[14px]")}>
              Découvrir Premium
              <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
            </Link>
          </section>
        )}

        <section aria-labelledby="sec-compte">
          <SectionLabel id="sec-compte">Mon compte</SectionLabel>
          <ListGroup>
            <ListRow href="/app/profil/informations" icon={<UserRound className="h-6 w-6" strokeWidth={1.7} />} title="Informations personnelles" subtitle="Gérez vos informations et coordonnées" />
            <ListRow href="/app/profil/securite" icon={<LockKeyhole className="h-6 w-6" strokeWidth={1.7} />} title="Sécurité" subtitle="Mot de passe, authentification et sessions" />
            <ListRow href="/app/profil/preferences" icon={<SlidersHorizontal className="h-6 w-6" strokeWidth={1.7} />} title="Préférences" subtitle="Notifications, langue et affichage" />
          </ListGroup>
        </section>

        <section aria-labelledby="sec-abo">
          <SectionLabel id="sec-abo">Mon abonnement</SectionLabel>
          <ListGroup>
            {isPremium ? (
              <>
                <ListRow href={abonnementHref} icon={<CrownIcon className="h-6 w-7" />} title="Gérer mon abonnement" subtitle="Voir, modifier ou annuler votre abonnement" />
                {plan === 'premium' && (
                  <ListRow href="/app/premium?formule=coparentalite" icon={<CrownIcon variant="outline" className="h-6 w-7 text-night-900" />} title="Découvrir Coparentalité+" subtitle="Les parents liés profitent aussi de Premium" />
                )}
              </>
            ) : (
              <ListRow href="/app/premium" icon={<CrownIcon variant="outline" className="h-6 w-7 text-night-900" />} title="Passer à Premium" subtitle="Débloquez toutes les fonctionnalités" />
            )}
          </ListGroup>
        </section>

        <section aria-labelledby="sec-stockage">
          <SectionLabel id="sec-stockage">Stockage</SectionLabel>
          <Link
            href="/app/profil/stockage"
            className="flex items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3.5 shadow-soft transition hover:border-night-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
          >
            <Cloud className="h-6 w-6 shrink-0 text-night-900" strokeWidth={1.7} aria-hidden />
            <span className="ml-1 min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-night-900">Espace utilisé</span>
              {storage ? (
                <>
                  <span className="mt-0.5 block text-[12.5px] text-night-700">{formatBytes(storage.usedBytes)} / {formatBytes(storage.maxBytes)}</span>
                  <ProgressBar className="mt-2.5" value={storage.usedBytes} max={storage.maxBytes} label="Espace de stockage utilisé" />
                </>
              ) : (
                <span className="mt-0.5 block text-[12.5px] text-night-700">Consommation indisponible pour le moment. Réessayez plus tard.</span>
              )}
            </span>
          </Link>
        </section>

        <section aria-labelledby="sec-coach">
          <SectionLabel id="sec-coach">Coach IA</SectionLabel>
          <div className="flex items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3.5 shadow-soft">
            <Brain className="h-6 w-6 shrink-0 text-night-900" strokeWidth={1.7} aria-hidden />
            <div className="ml-1 min-w-0 flex-1">
              <p className="text-[14px] font-bold text-night-900">Utilisation actuelle</p>
              {coach ? (
                <>
                  <p className="mt-0.5 text-[12.5px] text-night-700">{coach.used} / {coach.quota} analyses{live ? ' sur 30 jours' : ''}</p>
                  <ProgressBar className="mt-2.5" value={coach.used} max={coach.quota} label="Analyses du Coach IA utilisées" />
                </>
              ) : (
                <p className="mt-0.5 text-[12.5px] text-night-700">Utilisation indisponible pour le moment. Réessayez plus tard.</p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="sec-aide">
          <SectionLabel id="sec-aide">Assistance</SectionLabel>
          <ListGroup>
            <ListRow href="/app/aide" icon={<CircleHelp className="h-6 w-6" strokeWidth={1.7} />} title="Centre d'aide" subtitle="FAQ, guides et contact support" />
          </ListGroup>
        </section>

        <button type="button" onClick={() => setLogoutOpen(true)} className={btn.secondary}>
          Se déconnecter
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
        title="Se déconnecter ?"
        description="Vous devrez saisir vos identifiants pour revenir."
        confirmLabel="Déconnexion"
        tone="danger"
      />
    </>
  )
}
