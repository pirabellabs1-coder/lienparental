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
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { btn } from '@/components/onboarding/styles'
import { BackButton, EnfantsHeader } from '@/components/enfants/EnfantsHeader'
import { ChildAvatar, ChildStatusBadge, DetailRow } from '@/components/enfants/ChildBits'
import { useChild } from '@/components/enfants/useChild'
import { setChildPhoto } from '@/lib/data/children'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { ageFromBirthDate, type Child } from '@/lib/mock-data'
import { useChildLabels } from '@/components/enfants/childLabels'
import { useFamilyFormat } from '@/components/famille/useFamilyFormat'

type SectionKey = 'general' | 'physique' | 'medical'

// M04 — Profil de l'enfant. `?vue=recap` (après enregistrement) affiche toutes les informations.
export default function EnfantProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vue?: string }>
}) {
  const t = useTranslations('family.children.profile')
  const labels = useChildLabels()
  const { id } = use(params)
  const { vue } = use(searchParams)
  const recap = vue === 'recap'
  const { child, loading, error, refresh } = useChild(id)
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ general: recap, physique: recap, medical: recap })
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoState, setPhotoState] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null)

  useEffect(() => () => {
    if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo)
  }, [photo])

  if (!child && (loading || error)) {
    return (
      <div className="w-full px-4 pb-8 md:px-6">
        <EnfantsHeader title={t('title')} left={<BackButton href="/app/enfants" />} />
        {error ? (
          <ErrorState compact description={error.message} primary={{ label: t('retry'), onClick: () => void refresh() }} secondary={{ label: t('backToChildren'), href: '/app/enfants' }} />
        ) : (
          <LoadingState compact title={t('loading')} description="" />
        )}
      </div>
    )
  }

  if (!child) {
    return (
      <div className="w-full px-4 pb-8 md:px-6">
        <EnfantsHeader title={t('title')} left={<BackButton href="/app/enfants" />} />
        <p className="mt-10 text-center text-sm text-night-600">{t('notFound')}</p>
        <Link href="/app/enfants" className={cn(btn.secondary, 'mt-6 w-full')}>
          {t('backToChildren')}
        </Link>
      </div>
    )
  }

  // Aperçu immédiat, puis envoi (bucket privé « avatars ») ; en cas d'échec, retour à la photo précédente.
  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 25 * 1024 * 1024) {
      setPhotoState({ kind: 'error', text: t('photoInvalid') })
      return
    }
    const previous = photo
    setPhoto(URL.createObjectURL(f))
    setPhotoState({ kind: 'saving', text: t('photoSaving') })
    try {
      const url = await setChildPhoto(child.id, f)
      setPhoto(url)
      setPhotoState({ kind: 'saved', text: t('photoSaved') })
      void refresh() // listes et carte « Enfant actif » : nouvelle URL signée
    } catch (err) {
      setPhoto(previous)
      setPhotoState({ kind: 'error', text: err instanceof Error && err.message ? err.message : t('photoFailed') })
    }
  }

  const sections: { key: SectionKey; label: string; icon: ReactNode; body: ReactNode }[] = [
    { key: 'general', label: t('sectionGeneral'), icon: <CalendarDays className="h-5 w-5" />, body: <General child={child} /> },
    { key: 'physique', label: t('sectionPhysical'), icon: <PersonStanding className="h-5 w-5" />, body: <Physique child={child} /> },
    { key: 'medical', label: t('sectionMedical'), icon: <HeartPulse className="h-5 w-5" />, body: <Medical child={child} /> },
  ]

  return (
    <div className="w-full px-4 pb-8 md:px-6">
      <EnfantsHeader
        title={t('titleOf', { name: child.prenom })}
        left={<BackButton href="/app/enfants" />}
        right={
          <Link
            href={`/app/enfants/${child.id}/modifier`}
            aria-label={t('editAria', { name: child.prenom })}
            className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
          >
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </Link>
        }
      />

      <section className="mt-3 flex flex-col items-center text-center" aria-label={t('identity')}>
        <div className="relative">
          <ChildAvatar child={child} src={photo} size="xl" />
          <label className="absolute bottom-0.5 right-0.5 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-leaf-500 text-white ring-[3px] ring-white has-[:focus-visible]:ring-leaf-200">
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onPhoto(e)} disabled={photoState?.kind === 'saving'} />
            <Camera className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('changePhoto', { name: child.prenom })}</span>
          </label>
        </div>
        <p className="mt-3 text-[20px] font-extrabold text-night-900">{child.prenom}</p>
        <p className="mt-0.5 text-[13px] text-night-600">
          {labels.ageLabel(child)} <span aria-hidden="true">•</span>
          <span className="sr-only">,</span> {labels.classLabel(child.classe)}
        </p>
        <ChildStatusBadge child={child} className="mt-2" />
        {photoState && (
          <p role={photoState.kind === 'error' ? 'alert' : 'status'} className={cn('mt-2 text-[13px] font-semibold', photoState.kind === 'error' ? 'text-alert-600' : 'text-night-600')}>
            {photoState.text}
          </p>
        )}
        {recap && (
          <p role="status" className="sr-only">
            {t('saved')}
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
          <span className="block text-[15px] font-extrabold text-night-900">{t('healthSpace')}</span>
          <span className="block text-[12.5px] leading-snug text-night-700">{t('healthSpaceHint')}</span>
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
        {t('edit')}
      </Link>
    </div>
  )
}

function General({ child }: { child: Child }) {
  const t = useTranslations('family.children.profile')
  const labels = useChildLabels()
  const fmt = useFamilyFormat()
  return (
    <>
      <DetailRow
        icon={<CalendarDays className="h-4 w-4" />}
        label={t('birthDate')}
        value={child.dateNaissance && t('birthDateValue', { date: fmt.day(child.dateNaissance), count: ageFromBirthDate(child.dateNaissance) })}
      />
      <DetailRow icon={<School className="h-4 w-4" />} label={t('class')} value={labels.classLabel(child.classe)} />
    </>
  )
}

function Physique({ child }: { child: Child }) {
  const t = useTranslations('family.children.profile')
  const labels = useChildLabels()
  return (
    <>
      <DetailRow icon={<Ruler className="h-4 w-4" />} label={t('height')} value={child.taille && t('heightValue', { value: child.taille })} />
      <DetailRow icon={<Weight className="h-4 w-4" />} label={t('weight')} value={child.poids && t('weightValue', { value: child.poids })} />
      <DetailRow icon={<Eye className="h-4 w-4" />} label={t('eyes')} value={labels.eyeLabel(child.couleurYeux)} />
      <DetailRow icon={<Scissors className="h-4 w-4" />} label={t('hair')} value={labels.hairLabel(child.couleurCheveux)} />
    </>
  )
}

function Medical({ child }: { child: Child }) {
  const t = useTranslations('family.children.profile')
  const labels = useChildLabels()
  const allergies = [...(child.allergies ?? []).map(labels.allergyLabel), child.autresAllergies].filter(Boolean).join(', ')
  return (
    <>
      <DetailRow icon={<ShieldAlert className="h-4 w-4" />} label={t('allergies')} value={allergies} />
      <DetailRow icon={<Stethoscope className="h-4 w-4" />} label={t('sectionMedical')} value={child.infosMedicales} />
      <DetailRow icon={<Droplet className="h-4 w-4" />} label={t('bloodGroup')} value={labels.bloodLabel(child.groupeSanguin)} />
      <DetailRow icon={<Pill className="h-4 w-4" />} label={t('treatment')} value={child.traitement} />
      <DetailRow icon={<UserRound className="h-4 w-4" />} label={t('doctor')} value={child.medecinTraitant} />
    </>
  )
}
