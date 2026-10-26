'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, Camera, Clock, Globe } from 'lucide-react'
import { Switch } from '@/components/ui'
import { BrandHeader, Stepper, TitleBar, btn } from '@/components/profil/kit'
import { BoxInput, BoxSelect } from '@/components/profil/fields'
import { ProfileAvatar } from '@/components/profil/ProfileAvatar'
import { SUMMARY_KEY, profile } from '@/components/profil/data'
import { cn } from '@/lib/cn'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { loadPreferences, saveAccountInfo } from '@/lib/auth/actions'
import { uploadAvatar, useAccountProfile } from '@/lib/auth/browser'
import { authErrorMessage } from '@/lib/auth/errors'
import { appUrl } from '@/lib/auth/redirect'
import { emailSchema } from '@/lib/auth/validation'

type Form = {
  prenom: string
  nom: string
  dateNaissance: string
  genre: string
  situation: string
  email: string
  telephone: string
  adresse: string
  cp: string
  ville: string
  pays: string
  langue: string
  fuseau: string
  formatDate: string
  notifEmail: boolean
  notifPush: boolean
}

const STEPS = [
  { title: 'Photo de profil', sub: 'Ajoutez une photo pour personnaliser votre compte.' },
  { title: 'Informations de base', sub: 'Modifiez vos informations personnelles.' },
  { title: 'Coordonnées', sub: 'Mettez à jour vos coordonnées de contact.' },
  { title: 'Préférences', sub: 'Personnalisez votre expérience.' },
]

const LANGUES = [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]
const PAYS = [{ value: 'FR', label: 'France' }, { value: 'BE', label: 'Belgique' }, { value: 'CH', label: 'Suisse' }, { value: 'CA', label: 'Canada' }, { value: 'LU', label: 'Luxembourg' }]

export default function InformationsWizardPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  // Supabase : profil réel (public.users) ; démonstration : profil fictif.
  const { profile: account, loading: accountLoading } = useAccountProfile(profile)
  const [form, setForm] = useState<Form>({
    prenom: profile.prenom,
    nom: profile.nom,
    dateNaissance: '1990-04-15',
    genre: 'f',
    situation: 'couple',
    email: profile.email,
    telephone: '6 12 34 56 78',
    adresse: '25 Rue des Lilas',
    cp: '75015',
    ville: 'Paris',
    pays: 'FR',
    langue: 'fr',
    fuseau: 'America/Cayenne',
    formatDate: 'dd/mm/yyyy',
    notifEmail: true,
    notifPush: true,
  })
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  // Pré-remplissage depuis la base (Supabase uniquement ; la démo garde ses valeurs).
  useEffect(() => {
    if (!SUPABASE_ENABLED || accountLoading) return
    setForm(f => ({
      ...f,
      prenom: account.prenom,
      nom: account.nom,
      email: account.email,
      dateNaissance: account.dateNaissance ?? '',
      genre: account.genre ?? 'nsp',
      situation: account.situation ?? 'autre',
      telephone: account.telephone ?? '',
      adresse: account.adresse ?? '',
      cp: account.codePostal ?? '',
      ville: account.ville ?? '',
      pays: account.pays ?? 'FR',
    }))
  }, [accountLoading, account])

  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    loadPreferences().then(res => {
      if (!res.ok) return
      const p = res.data
      setForm(f => ({
        ...f,
        langue: p.langue ?? f.langue,
        fuseau: p.fuseau ?? f.fuseau,
        formatDate: p.formatDate ?? f.formatDate,
        notifEmail: p.notifEmail ?? f.notifEmail,
        notifPush: p.notifPush ?? f.notifPush,
      }))
    }).catch(() => undefined)
  }, [])

  // Aperçu de la photo : URL blob révoquée à chaque changement / démontage.
  useEffect(() => {
    if (!avatarFile) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(avatarFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [avatarFile])

  // Déplace le focus sur le titre de l'étape à chaque changement (lecteurs d'écran).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    headingRef.current?.focus()
  }, [step])

  const onPhoto = (file?: File) => {
    setPhotoError(undefined)
    if (!file) return
    if (!file.type.startsWith('image/')) return setPhotoError('Choisissez une image (JPG ou PNG).')
    if (file.size > 5 * 1024 * 1024) return setPhotoError('Image trop lourde (5 Mo maximum).')
    setAvatarFile(file)
  }

  /** Supabase : avatar → Storage, profil + préférences → Server Action (zod + RLS), e-mail → Auth. */
  const persist = async (): Promise<{ ok: boolean; emailPending?: boolean }> => {
    setSaving(true)
    setSaveError(undefined)
    let photoPath: string | undefined
    if (avatarFile) {
      const up = await uploadAvatar(avatarFile, 'avatar')
      if (!up.ok) { setSaving(false); setSaveError(up.error); return { ok: false } }
      photoPath = up.path
    }
    const res = await saveAccountInfo(
      {
        prenom: form.prenom,
        nom: form.nom,
        dateNaissance: form.dateNaissance,
        genre: form.genre,
        situation: form.situation,
        telephone: form.telephone,
        adresse: form.adresse,
        cp: form.cp,
        ville: form.ville,
        pays: form.pays,
        ...(photoPath ? { photoPath } : {}),
      },
      { langue: form.langue, fuseau: form.fuseau, formatDate: form.formatDate, notifEmail: form.notifEmail, notifPush: form.notifPush },
    )
    if (!res.ok) {
      setSaving(false)
      if (res.reason === 'unauthenticated' || res.reason === 'mfa_required') { router.push('/onboarding/connexion?suite=/app/profil/informations'); return { ok: false } }
      setSaveError(res.error)
      return { ok: false }
    }

    // Changement d'e-mail : Supabase envoie un lien de confirmation ; public.users
    // est mis à jour par trigger une fois l'adresse confirmée (0200).
    let emailPending = false
    const nextEmail = form.email.trim().toLowerCase()
    if (nextEmail && nextEmail !== account.email.toLowerCase()) {
      const parsed = emailSchema.safeParse(nextEmail)
      if (!parsed.success) { setSaving(false); setSaveError('Adresse e-mail invalide.'); setStep(3); return { ok: false } }
      const { error } = await createClient().auth.updateUser(
        { email: parsed.data },
        { emailRedirectTo: `${appUrl()}/auth/callback?next=/app/profil` },
      )
      if (error) { setSaving(false); setSaveError(authErrorMessage(error)); setStep(3); return { ok: false } }
      emailPending = true
    }
    setSaving(false)
    return { ok: true, emailPending }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (step < 4) return setStep(step + 1)
    if (saving) return
    let emailPending = false
    if (SUPABASE_ENABLED) {
      const r = await persist()
      if (!r.ok) return
      emailPending = !!r.emailPending
    }
    try {
      sessionStorage.setItem(SUMMARY_KEY, JSON.stringify({
        nom: `${form.prenom} ${form.nom}`.trim(),
        email: emailPending ? `${account.email} (nouvelle adresse ${form.email.trim()} à confirmer par e-mail)` : form.email,
        telephone: form.telephone ? `+33 ${form.telephone}` : '',
        adresse: [form.adresse, [form.cp, form.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        langue: LANGUES.find(l => l.value === form.langue)?.label ?? 'Français',
      }))
    } catch { /* stockage indisponible : la page de validation retombe sur le profil */ }
    router.push('/app/profil/informations/validation')
  }

  const current = STEPS[step - 1]
  const fullName = `${form.prenom} ${form.nom}`

  return (
    <>
      <BrandHeader notifications={profile.notifications} />
      <TitleBar
        title="Informations personnelles"
        size="md"
        backHref="/app/profil"
        onBack={step > 1 ? () => setStep(step - 1) : undefined}
      />

      <form onSubmit={submit} className="flex min-h-[calc(100dvh-240px)] flex-col px-5 pb-8 pt-4">
        <Stepper current={step} total={4} className="px-1" />

        <h2 ref={headingRef} tabIndex={-1} className="mt-8 text-[17px] font-bold text-night-900 focus:outline-none">{current.title}</h2>
        <p className="mt-1.5 text-[12.5px] text-night-700">{current.sub}</p>

        <div className="mt-6 flex-1">
          {step === 1 && (
            <div className="flex flex-col items-center">
              <ProfileAvatar name={fullName} src={previewUrl ?? account.avatarUrl} size={150} className="mt-4" />
              <input
                ref={fileRef}
                id="avatar-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="peer sr-only"
                onChange={e => onPhoto(e.target.files?.[0])}
                aria-describedby={photoError ? 'avatar-err' : undefined}
              />
              <label
                htmlFor="avatar-file"
                className="mt-10 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl2 border border-orange-300 bg-orange-50/30 text-[14px] font-semibold text-orange-700 transition hover:bg-orange-50 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-300"
              >
                <Camera className="h-[18px] w-[18px]" aria-hidden />
                Changer la photo
              </label>
              {photoError && <p id="avatar-err" role="alert" className="mt-2 text-xs font-medium text-alert-500">{photoError}</p>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <BoxInput label="Prénom" required value={form.prenom} onChange={e => set('prenom', e.target.value)} autoComplete="given-name" />
              <BoxInput label="Nom" required value={form.nom} onChange={e => set('nom', e.target.value)} autoComplete="family-name" />
              <BoxInput label="Date de naissance" type="date" value={form.dateNaissance} onChange={e => set('dateNaissance', e.target.value)} autoComplete="bday" />
              <BoxSelect label="Genre" value={form.genre} onChange={e => set('genre', e.target.value)} options={[
                { value: 'f', label: 'Femme' }, { value: 'h', label: 'Homme' }, { value: 'nb', label: 'Non-binaire' }, { value: 'nsp', label: 'Je préfère ne pas dire' },
              ]} />
              <BoxSelect label="Situation familiale" value={form.situation} onChange={e => set('situation', e.target.value)} options={[
                { value: 'couple', label: 'En couple' }, { value: 'separe', label: 'Séparé·e' }, { value: 'divorce', label: 'Divorcé·e' },
                { value: 'procedure', label: 'En procédure' }, { value: 'celibataire', label: 'Célibataire' }, { value: 'autre', label: 'Autre' },
              ]} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <BoxInput label="Adresse e-mail" type="email" required value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
              <BoxInput
                label="Numéro de téléphone"
                type="tel"
                inputMode="tel"
                value={form.telephone}
                onChange={e => set('telephone', e.target.value)}
                autoComplete="tel-national"
                leading={<span className="flex items-center gap-2 pt-4"><FrFlag /><span className="text-[15px] text-night-900">+33</span></span>}
              />
              <BoxInput label="Adresse" value={form.adresse} onChange={e => set('adresse', e.target.value)} autoComplete="street-address" />
              <div className="grid grid-cols-2 gap-3">
                <BoxInput label="Code postal" inputMode="numeric" value={form.cp} onChange={e => set('cp', e.target.value)} autoComplete="postal-code" />
                <BoxInput label="Ville" value={form.ville} onChange={e => set('ville', e.target.value)} autoComplete="address-level2" />
              </div>
              <BoxSelect label="Pays" value={form.pays} onChange={e => set('pays', e.target.value)} options={PAYS} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <BoxSelect label="Langue" value={form.langue} onChange={e => set('langue', e.target.value)} options={LANGUES} leading={<Globe className="h-6 w-6 text-orange-500" />} />
              <BoxSelect label="Fuseau horaire" value={form.fuseau} onChange={e => set('fuseau', e.target.value)} leading={<Clock className="h-6 w-6 text-orange-500" />} options={[
                { value: 'Europe/Paris', label: '(UTC+01:00) Paris' }, { value: 'Europe/Brussels', label: '(UTC+01:00) Bruxelles' },
                { value: 'America/Cayenne', label: '(UTC-03:00) Cayenne' }, { value: 'Indian/Reunion', label: '(UTC+04:00) La Réunion' }, { value: 'America/Montreal', label: '(UTC-05:00) Montréal' },
              ]} />
              <BoxSelect label="Format de date" value={form.formatDate} onChange={e => set('formatDate', e.target.value)} leading={<CalendarDays className="h-6 w-6 text-orange-500" />} options={[
                { value: 'dd/mm/yyyy', label: 'JJ / MM / AAAA' }, { value: 'mm/dd/yyyy', label: 'MM / JJ / AAAA' }, { value: 'yyyy-mm-dd', label: 'AAAA - MM - JJ' },
              ]} />
              <ToggleCard>
                <Switch label={<span className="font-bold">Notifications par e-mail</span>} description="Recevez des emails pour les informations importantes." checked={form.notifEmail} onChange={e => set('notifEmail', e.target.checked)} containerClassName="flex-1 py-0" />
              </ToggleCard>
              <ToggleCard>
                <Switch label={<span className="font-bold">Notifications push</span>} description="Recevez des notifications sur votre appareil." checked={form.notifPush} onChange={e => set('notifPush', e.target.checked)} containerClassName="flex-1 py-0" />
              </ToggleCard>
            </div>
          )}
        </div>

        {saveError && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{saveError}</p>}
        <button type="submit" className={cn(btn.primary, 'mt-8')} disabled={saving} aria-busy={saving}>
          {step < 4 ? 'Continuer' : saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </>
  )
}

function ToggleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3 shadow-soft">
      <Bell className="h-6 w-6 shrink-0 text-orange-500" aria-hidden />
      {children}
    </div>
  )
}

function FrFlag() {
  return (
    <svg viewBox="0 0 3 2" className="h-3.5 w-5 rounded-[2px]" aria-hidden>
      <rect width="1" height="2" fill="#0055a4" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#ef4135" />
    </svg>
  )
}
