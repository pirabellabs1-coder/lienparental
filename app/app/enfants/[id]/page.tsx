'use client'

import Link from 'next/link'
import { use, useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  CalendarDays,
  Camera,
  ChevronRight,
  Droplet,
  Eye,
  HeartPulse,
  Pencil,
  PersonStanding,
  Pill,
  Ruler,
  School,
  Scissors,
  ShieldAlert,
  Stethoscope,
  UserRound,
  Weight,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn } from '@/components/onboarding/styles'
import { BackButton, EnfantsHeader } from '@/components/enfants/EnfantsHeader'
import { ChildAvatar, ChildStatusBadge, DetailRow } from '@/components/enfants/ChildBits'
import { useChild } from '@/components/enfants/useChild'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { ageFromBirthDate, childAgeLabel, formatLongDate, type Child } from '@/lib/mock-data'

type SectionKey = 'general' | 'physique' | 'medical'

// M04 — Profil de l'enfant. `?vue=recap` (après enregistrement) affiche toutes les informations.
export default function EnfantProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vue?: string }>
}) {
  const { id } = use(params)
  const { vue } = use(searchParams)
  const recap = vue === 'recap'
  const { child, loading, error, refresh } = useChild(id)
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ general: recap, physique: recap, medical: recap })
  const [photo, setPhoto] = useState<string | null>(null)

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo)
  }, [photo])

  if (!child && (loading || error)) {
    return (
      <div className="w-full px-4 pb-8 md:px-6">
        <EnfantsHeader title="Profil" left={<BackButton href="/app/enfants" />} />
        {error ? (
          <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} secondary={{ label: 'Retour à mes enfants', href: '/app/enfants' }} />
        ) : (
          <LoadingState compact title="Chargement du profil" description="" />
        )}
      </div>
    )
  }

  if (!child) {
    return (
      <div className="w-full px-4 pb-8 md:px-6">
        <EnfantsHeader title="Profil" left={<BackButton href="/app/enfants" />} />
        <p className="mt-10 text-center text-sm text-night-600">Ce profil n’existe pas ou a été supprimé.</p>
        <Link href="/app/enfants" className={cn(btn.secondary, 'mt-6 w-full')}>
          Retour à mes enfants
        </Link>
      </div>
    )
  }

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) return
    setPhoto(URL.createObjectURL(f))
    // TODO Supabase Storage : upload vers le bucket privé `children-photos`.
  }

  const sections: { key: SectionKey; label: string; icon: ReactNode; body: ReactNode }[] = [
    { key: 'general', label: 'Informations générales', icon: <CalendarDays className="h-5 w-5" />, body: <General child={child} /> },
    { key: 'physique', label: 'Informations physiques', icon: <PersonStanding className="h-5 w-5" />, body: <Physique child={child} /> },
    { key: 'medical', label: 'Informations médicales', icon: <HeartPulse className="h-5 w-5" />, body: <Medical child={child} /> },
  ]

  return (
    <div className="w-full px-4 pb-8 md:px-6">
      <EnfantsHeader
        title={`Profil de ${child.prenom}`}
        left={<BackButton href="/app/enfants" />}
        right={
          <Link
            href={`/app/enfants/${child.id}/modifier`}
            aria-label={`Modifier le profil de ${child.prenom}`}
            className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
          >
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </Link>
        }
      />

      <section className="mt-3 flex flex-col items-center text-center" aria-label="Identité">
        <div className="relative">
          <ChildAvatar child={child} src={photo} size="xl" />
          <label className="absolute bottom-0.5 right-0.5 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-leaf-500 text-white ring-[3px] ring-white has-[:focus-visible]:ring-leaf-200">
            <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} />
            <Camera className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Changer la photo de {child.prenom}</span>
          </label>
        </div>
        <p className="mt-3 text-[20px] font-extrabold text-night-900">{child.prenom}</p>
        <p className="mt-0.5 text-[13px] text-night-600">
          {childAgeLabel(child)} <span aria-hidden="true">•</span>
          <span className="sr-only">,</span> {child.classe}
        </p>
        <ChildStatusBadge child={child} className="mt-2" />
        {recap && (
          <p role="status" className="sr-only">
            Modifications enregistrées.
          </p>
        )}
      </section>

      <Link
        href={`/app/enfants/${child.id}/sante`}
        className="mt-6 flex min-h-[72px] items-center gap-3.5 rounded-2xl border border-leaf-200 bg-leaf-50 px-4 py-3 transition-colors hover:bg-leaf-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-leaf-700 ring-1 ring-leaf-200">
          <HeartPulse className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold text-night-900">Espace Santé</span>
          <span className="block text-[12.5px] leading-snug text-night-700">Rendez-vous, vaccins, traitements, documents médicaux</span>
        </span>
        <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-leaf-700" />
      </Link>

      <div className="mt-3 space-y-3">
        {sections.map((s) =>
          recap ? (
            <section key={s.key} aria-labelledby={`h-${s.key}`} className="pt-2">
              <h2 id={`h-${s.key}`} className="text-[13px] font-extrabold text-night-900">
                {s.label}
              </h2>
              <dl className="mt-1.5">{s.body}</dl>
            </section>
          ) : (
            <div key={s.key} className="rounded-2xl border border-night-100 bg-white shadow-[0_1px_2px_rgba(11,45,91,0.06),0_8px_24px_-16px_rgba(11,45,91,0.12)]">
              <h2>
                <button
                  type="button"
                  aria-expanded={open[s.key]}
                  aria-controls={`p-${s.key}`}
                  onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}
                  className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-4 text-left"
                >
                  <span className="text-night-700" aria-hidden="true">
                    {s.icon}
                  </span>
                  <span className="flex-1 text-sm font-bold text-night-900">{s.label}</span>
                  <ChevronRight
                    className={cn('h-5 w-5 text-night-400 transition-transform motion-reduce:transition-none', open[s.key] && 'rotate-90')}
                    aria-hidden="true"
                  />
                </button>
              </h2>
              <dl id={`p-${s.key}`} hidden={!open[s.key]} className="border-t border-night-100 px-4 py-2">
                {s.body}
              </dl>
            </div>
          ),
        )}
      </div>

      <Link href={`/app/enfants/${child.id}/modifier`} className={cn(btn.secondary, 'mt-8 w-full')}>
        Modifier le profil
      </Link>
    </div>
  )
}

function General({ child }: { child: Child }) {
  return (
    <>
      <DetailRow
        icon={<CalendarDays className="h-4 w-4" />}
        label="Date de naissance"
        value={child.dateNaissance && `${formatLongDate(child.dateNaissance)} (${ageFromBirthDate(child.dateNaissance)} ans)`}
      />
      <DetailRow icon={<School className="h-4 w-4" />} label="Classe" value={child.classe} />
    </>
  )
}

function Physique({ child }: { child: Child }) {
  return (
    <>
      <DetailRow icon={<Ruler className="h-4 w-4" />} label="Taille" value={child.taille && `${child.taille} cm`} />
      <DetailRow icon={<Weight className="h-4 w-4" />} label="Poids" value={child.poids && `${child.poids} kg`} />
      <DetailRow icon={<Eye className="h-4 w-4" />} label="Yeux" value={child.couleurYeux} />
      <DetailRow icon={<Scissors className="h-4 w-4" />} label="Cheveux" value={child.couleurCheveux} />
    </>
  )
}

function Medical({ child }: { child: Child }) {
  const allergies = [...(child.allergies ?? []), child.autresAllergies].filter(Boolean).join(', ')
  return (
    <>
      <DetailRow icon={<ShieldAlert className="h-4 w-4" />} label="Allergies" value={allergies} />
      <DetailRow icon={<Stethoscope className="h-4 w-4" />} label="Informations médicales" value={child.infosMedicales} />
      <DetailRow icon={<Droplet className="h-4 w-4" />} label="Groupe sanguin" value={child.groupeSanguin} />
      <DetailRow icon={<Pill className="h-4 w-4" />} label="Traitement en cours" value={child.traitement} />
      <DetailRow icon={<UserRound className="h-4 w-4" />} label="Médecin traitant" value={child.medecinTraitant} />
    </>
  )
}
