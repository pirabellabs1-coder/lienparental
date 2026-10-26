'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Globe, Mail, MapPin, Phone, UserRound } from 'lucide-react'
import { SuccessBurst, btn } from '@/components/profil/kit'
import { ProfileAvatar } from '@/components/profil/ProfileAvatar'
import { SUMMARY_KEY, profile } from '@/components/profil/data'
import { cn } from '@/lib/cn'
import { useAccountProfile } from '@/lib/auth/browser'

type Summary = { nom: string; email: string; telephone: string; adresse: string; langue: string }

const FALLBACK: Summary = {
  nom: `${profile.prenom} ${profile.nom}`,
  email: profile.email,
  telephone: '',
  adresse: '',
  langue: 'Français',
}

// Résumé issu de l'assistant (sessionStorage) ; la photo est relue depuis public.users avec Supabase.
export default function ValidationPage() {
  const [summary, setSummary] = useState<Summary>(FALLBACK)
  const { profile: account } = useAccountProfile(profile)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SUMMARY_KEY)
      if (raw) setSummary({ ...FALLBACK, ...(JSON.parse(raw) as Partial<Summary>) })
    } catch { /* données absentes ou invalides : on garde le profil par défaut */ }
  }, [])

  const rows = [
    { icon: <UserRound className="h-5 w-5" />, label: 'Nom', value: summary.nom },
    { icon: <Mail className="h-5 w-5" />, label: 'E-mail', value: summary.email },
    { icon: <Phone className="h-5 w-5" />, label: 'Téléphone', value: summary.telephone },
    { icon: <MapPin className="h-5 w-5" />, label: 'Adresse', value: summary.adresse },
    { icon: <Globe className="h-5 w-5" />, label: 'Langue', value: summary.langue },
  ].filter(r => r.value)

  return (
    <div className="px-5 pb-8 pt-10">
      <SuccessBurst tone="gold" />

      <div role="status" className="mt-4 text-center">
        <h1 className="text-[20px] font-extrabold text-night-900">Informations mises à jour !</h1>
        <p className="mx-auto mt-2 max-w-[260px] text-[13.5px] leading-relaxed text-night-800">
          Vos informations personnelles ont bien été enregistrées.
        </p>
      </div>

      <section aria-labelledby="recap" className="mt-8 rounded-xl2 border border-gold-100 bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <h2 id="recap" className="pt-2 text-[13.5px] font-bold text-night-900">Résumé de vos informations</h2>
          <ProfileAvatar name={summary.nom} src={account.avatarUrl} size={48} camera={false} />
        </div>
        <dl className="mt-2 space-y-3.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-center gap-3 text-[12.5px] text-night-900">
              <dt className="shrink-0 text-night-900">
                <span aria-hidden>{r.icon}</span>
                <span className="sr-only">{r.label}</span>
              </dt>
              <dd className="min-w-0 break-words">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Link href="/app/profil" className={cn(btn.primary, 'mt-10')}>Retour au profil</Link>
    </div>
  )
}
