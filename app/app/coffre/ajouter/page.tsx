'use client'

import Link from 'next/link'
import { use, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, ChevronDown, ChevronRight, CloudUpload, FolderInput, Info, Lock, Plus, ScanLine, X } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { Stepper } from '@/components/coffre/Stepper'
import { StickyActions } from '@/components/coffre/StickyActions'
import { CategoryIcon } from '@/components/coffre/CategoryIcon'
import { FileIcon } from '@/components/coffre/FileIcon'
import { SuccessBurst } from '@/components/coffre/Illustrations'
import { btn } from '@/components/coffre/buttons'
import { useCategories } from '@/components/coffre/store'
import { VAULT_SOURCES, frDate, frSize, type VaultTone } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'
import { LIVE } from '@/lib/data/core'
import { uploadDocument, validateVaultFile } from '@/lib/data/vault'
import { useChildOptions } from '@/lib/data/children'
import { matchCategory, parseVaultPrefill, type RawParams } from '@/lib/prefill'

type Step = 1 | 2 | 3 | 4
const STEPS = ['Détails', 'Catégorie', 'Fichier', 'Aperçu']
const MAX_SIZE = 20 * 1024 * 1024
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.doc,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'doc']

type Picked = { name: string; size: number; ext: string }

function extOf(name: string) {
  return (name.split('.').pop() ?? '').toLowerCase()
}
function toneForExt(ext: string): VaultTone {
  if (ext === 'pdf') return 'red'
  if (ext === 'doc' || ext === 'docx') return 'blue'
  return 'green'
}
function labelForExt(ext: string) {
  if (ext === 'doc' || ext === 'docx') return 'W'
  if (ext === 'jpeg') return 'JPG'
  return ext.toUpperCase()
}

const fieldCls = 'h-12 w-full rounded-xl border bg-white px-3.5 text-[14px] text-night-900 outline-none transition-colors placeholder:text-night-400 focus:border-leaf-500'

function Field({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-bold text-night-900">
        {label}
        {required && <span className="text-alert-500" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-[12.5px] font-semibold text-alert-600">{error}</p>}
    </div>
  )
}

// Pré-remplissage (contrat d'URL, lib/prefill) : categorie, titre, enfant, source=guide:<slug>.
export default function AddDocumentPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = use(searchParams)
  const prefill = useMemo(() => parseVaultPrefill(params), [params])
  const router = useRouter()
  const uid = useId()
  const { categories } = useCategories()
  const { options: childOptions, loading: childrenLoading } = useChildOptions()
  const wantedCategory = useRef(prefill.categorie)
  const childPrefilled = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>(1)
  const [done, setDone] = useState(false)
  const [tried, setTried] = useState(false)

  const [name, setName] = useState(prefill.titre ?? '')
  const [desc, setDesc] = useState('')
  const [docDate, setDocDate] = useState('')
  const [source, setSource] = useState('')
  const [conf, setConf] = useState<'prive' | 'partage'>('prive')
  const [cat, setCat] = useState<string>(prefill.categorie ?? 'jaf')
  const [childIds, setChildIds] = useState<string[]>([])
  const [file, setFile] = useState<Picked | null>(null)
  const [rawFile, setRawFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)

  // Focus sur le titre d'étape à chaque changement (annonce lecteur d'écran), pas au premier rendu.
  // Supabase : les catégories ont des identifiants UUID → présélection de la première disponible.
  // `?categorie=<slug>` : démo id = slug ; Supabase id = UUID → correspondance par nom de catégorie par défaut.
  useEffect(() => {
    if (!categories.length) return
    if (wantedCategory.current) {
      const m = matchCategory(categories, wantedCategory.current)
      wantedCategory.current = undefined
      if (m) { setCat(m.id); return }
    }
    if (!categories.some((c) => c.id === cat)) setCat(categories[0].id)
  }, [categories, cat])

  // `?enfant=<id>` : retenu seulement s'il fait partie des enfants du compte.
  useEffect(() => {
    if (childPrefilled.current || childrenLoading || childOptions.length === 0) return
    childPrefilled.current = true
    if (prefill.enfant && childOptions.some((c) => c.id === prefill.enfant)) setChildIds([prefill.enfant])
  }, [childrenLoading, childOptions, prefill.enfant])
  const toggleChild = (id: string) => setChildIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  const childLabel = childOptions.filter((c) => childIds.includes(c.id)).map((c) => c.prenom).join(', ')
  // Retour vers l'espace Santé de l'enfant (« Ajouter un document médical »).
  const healthChild = prefill.categorie === 'sante' && prefill.enfant ? childOptions.find((c) => c.id === prefill.enfant) : undefined

  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    headingRef.current?.focus()
  }, [step, done])

  const errors = {
    name: !name.trim() ? 'Indiquez le nom du document.' : '',
    date: !docDate ? 'Indiquez la date du document.' : '',
    file: !file ? 'Ajoutez un fichier pour continuer.' : '',
  }

  const accept = (f: File | undefined | null) => {
    if (!f) return
    const ext = extOf(f.name)
    if (!ALLOWED_EXT.includes(ext)) { setFileError('Format non pris en charge. Formats acceptés : PDF, JPG, PNG, DOCX, DOC.'); return }
    if (f.size > MAX_SIZE) { setFileError(`Fichier trop volumineux (${frSize(f.size)}). Taille max. 20 Mo.`); return }
    if (LIVE) {
      try { validateVaultFile(f) } catch (e) { setFileError(e instanceof Error ? e.message : 'Fichier refusé.'); return }
    }
    setFileError('')
    setSaveError('')
    setFile({ name: f.name, size: f.size, ext })
    setRawFile(f)
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, ''))
  }
  const onInput = (e: ChangeEvent<HTMLInputElement>) => { accept(e.target.files?.[0]); e.target.value = '' }
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]) }

  const next = () => {
    setTried(true)
    if (step === 1 && (errors.name || errors.date)) return
    if (step === 3 && errors.file) return
    setTried(false)
    if (step < 4) setStep((s) => (s + 1) as Step)
  }
  const back = () => (step > 1 ? setStep((s) => (s - 1) as Step) : router.back())

  const category = categories.find((c) => c.id === cat)

  // Supabase : upload Storage (`${uid}/${uuid}-${nom}`) puis ligne `documents`. Démo : succès simulé.
  const save = async () => {
    if (!LIVE) { setDone(true); return }
    if (!rawFile) { setStep(3); return }
    setSaving(true)
    setSaveError('')
    try {
      await uploadDocument(rawFile, {
        name: name.trim(),
        description: desc.trim() || undefined,
        docDate,
        source: source || undefined,
        confidentialite: conf,
        categoryId: category?.id ?? null,
        childIds,
      })
      setDone(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------ Succès ------------------------------ */
  if (done && file) {
    return (
      <div className="flex min-h-[calc(100dvh-6rem)] flex-col px-6 pb-6 pt-10 text-center">
        <SuccessBurst />
        <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-[22px] font-extrabold text-leaf-600 outline-none">Document ajouté !</h1>
        <p className="mx-auto mt-2 max-w-[290px] text-[14px] leading-relaxed text-night-600">
          Votre document a été enregistré et est maintenant disponible dans votre coffre-fort.
        </p>
        <div className="mx-auto mt-6 flex w-full items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-4 text-left shadow-soft">
          <FileIcon tone={toneForExt(file.ext)} label={labelForExt(file.ext)} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-night-900">{name}</p>
            <p className="text-[12.5px] text-night-500">{labelForExt(file.ext) === 'W' ? 'DOCX' : labelForExt(file.ext)} <span aria-hidden="true">•</span> {frSize(file.size)}</p>
            <p className="text-[12.5px] text-night-500">{category?.name}</p>
          </div>
        </div>
        <div className="mt-auto space-y-2 pt-8">
          {prefill.source ? (
            <>
              <Link href={prefill.source.href} className={btn({ variant: 'primary' })}>Retour au guide</Link>
              <Link href="/app/coffre/documents/tous" className={btn({ variant: 'secondary' })}>Voir mes documents</Link>
            </>
          ) : healthChild ? (
            <>
              <Link href={`/app/enfants/${healthChild.id}/sante`} className={btn({ variant: 'primary' })}>Retour à l’espace Santé de {healthChild.prenom}</Link>
              <Link href="/app/coffre/documents/tous" className={btn({ variant: 'secondary' })}>Voir mes documents</Link>
            </>
          ) : (
            <Link href="/app/coffre/documents/tous" className={btn({ variant: 'primary' })}>Voir mes documents</Link>
          )}
          <button
            type="button"
            onClick={() => { setDone(false); setStep(1); setName(''); setDesc(''); setDocDate(''); setSource(''); setFile(null); setRawFile(null); setChildIds([]) }}
            className={btn({ variant: 'ghost' })}
          >
            Ajouter un autre document
          </button>
        </div>
      </div>
    )
  }

  const titles: Record<Step, string> = {
    1: 'Informations principales',
    2: 'Catégorie du document',
    3: 'Fichier',
    4: 'Récapitulatif',
  }

  return (
    <>
      <ScreenHeader title="Ajouter un document" onBack={back} backLabel={step > 1 ? 'Étape précédente' : 'Retour'} />
      <div className="px-5">
        <Stepper steps={STEPS} current={step} className="mt-1" />

        <h2 ref={headingRef} tabIndex={-1} className="mt-6 text-[15px] font-extrabold text-night-900 outline-none">
          {titles[step]}
          <span className="sr-only"> — étape {step} sur 4</span>
        </h2>

        {prefill.source && step === 1 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-leaf-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-leaf-800">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            Formulaire pré-rempli depuis le Guide Parent. Vérifiez les informations avant d’enregistrer.
          </p>
        )}

        {/* ---------------------------- Étape 1 ---------------------------- */}
        {step === 1 && (
          <div className="mt-3 space-y-4">
            <Field id={`${uid}-name`} label="Nom du document" required error={tried ? errors.name : ''}>
              <input
                id={`${uid}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. : Jugement du 12 mai 2024"
                maxLength={120}
                aria-required="true"
                aria-invalid={tried && !!errors.name}
                aria-describedby={tried && errors.name ? `${uid}-name-error` : undefined}
                className={cn(fieldCls, tried && errors.name ? 'border-alert-400' : 'border-night-200')}
              />
            </Field>
            <Field id={`${uid}-desc`} label="Description">
              <input
                id={`${uid}-desc`}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Ajoutez une description (facultatif)"
                maxLength={280}
                className={cn(fieldCls, 'border-night-200')}
              />
            </Field>
            <Field id={`${uid}-date`} label="Date du document" required error={tried ? errors.date : ''}>
              <input
                id={`${uid}-date`}
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                aria-required="true"
                aria-invalid={tried && !!errors.date}
                aria-describedby={tried && errors.date ? `${uid}-date-error` : undefined}
                className={cn(fieldCls, tried && errors.date ? 'border-alert-400' : 'border-night-200')}
              />
            </Field>
            <Field id={`${uid}-source`} label="Source">
              <div className="relative">
                <select
                  id={`${uid}-source`}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className={cn(fieldCls, 'appearance-none border-night-200 pr-10', !source && 'text-night-400')}
                >
                  <option value="">Ex. : Tribunal judiciaire de Cayenne</option>
                  {VAULT_SOURCES.map((s) => <option key={s} value={s} className="text-night-900">{s}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-night-500" aria-hidden="true" />
              </div>
            </Field>
            <Field id={`${uid}-conf`} label="Confidentialité">
              <div className="relative rounded-xl border border-night-200 bg-white focus-within:border-leaf-500">
                <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-leaf-600" aria-hidden="true" />
                <select
                  id={`${uid}-conf`}
                  value={conf}
                  onChange={(e) => setConf(e.target.value as 'prive' | 'partage')}
                  aria-describedby={`${uid}-conf-help`}
                  className="h-11 w-full appearance-none rounded-xl bg-transparent pl-10 pr-10 text-[14px] font-bold text-night-900 outline-none"
                >
                  <option value="prive">Privé</option>
                  <option value="partage">Partageable</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-3 h-5 w-5 text-night-500" aria-hidden="true" />
                <p id={`${uid}-conf-help`} className="-mt-1 pb-2.5 pl-10 text-[12px] text-night-500">
                  {conf === 'prive' ? 'Seul vous pouvez voir ce document' : 'Partage possible par lien sécurisé et expirable'}
                </p>
              </div>
            </Field>
            {childOptions.length > 0 && (
              <fieldset aria-describedby={`${uid}-kids-help`}>
                <legend className="mb-1.5 block text-[13px] font-bold text-night-900">Enfant(s) concerné(s)</legend>
                <p id={`${uid}-kids-help`} className="mb-2 text-[12px] text-night-500">Facultatif. Un document Santé lié à un enfant apparaît dans son espace Santé.</p>
                <div className="flex flex-wrap gap-2">
                  {childOptions.map((c) => {
                    const on = childIds.includes(c.id)
                    return (
                      <label key={c.id} className="cursor-pointer">
                        <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggleChild(c.id)} />
                        <span
                          className={cn(
                            'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 text-[13.5px] font-semibold transition-colors',
                            'peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500 peer-focus-visible:ring-offset-2',
                            on ? 'border-leaf-200 bg-leaf-50 text-leaf-700' : 'border-night-200 bg-white text-night-900 hover:bg-night-50',
                          )}
                        >
                          {on && <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.4} />}
                          {c.prenom}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}
          </div>
        )}

        {/* ---------------------------- Étape 2 ---------------------------- */}
        {step === 2 && (
          <fieldset className="mt-1">
            <legend className="text-[13px] text-night-600">Sélectionnez une catégorie existante ou créez-en une nouvelle.</legend>
            <div className="mt-3 divide-y divide-night-100">
              {categories.map((c) => (
                <label key={c.id} className="flex min-h-[56px] cursor-pointer items-center gap-3">
                  <CategoryIcon icon={c.icon} tone={c.tone} size="sm" />
                  <span className="flex-1 text-[14px] font-semibold text-night-900">{c.name}</span>
                  <input
                    type="radio"
                    name="categorie"
                    value={c.id}
                    checked={cat === c.id}
                    onChange={() => setCat(c.id)}
                    className="peer sr-only"
                  />
                  <span aria-hidden="true" className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-night-300 peer-checked:border-leaf-500 peer-focus-visible:ring-4 peer-focus-visible:ring-leaf-200 [&>span]:scale-0 peer-checked:[&>span]:scale-100">
                    <span className="h-3 w-3 rounded-full bg-leaf-500 transition-transform" />
                  </span>
                </label>
              ))}
            </div>
            <Link
              href="/app/coffre/categories/nouvelle?from=ajouter"
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl px-2 text-[14px] font-bold text-leaf-600 hover:bg-leaf-50"
            >
              <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" /> Créer une nouvelle catégorie
            </Link>
          </fieldset>
        )}

        {/* ---------------------------- Étape 3 ---------------------------- */}
        {step === 3 && (
          <div className="mt-3">
            <input ref={fileRef} id={`${uid}-file`} type="file" accept={ACCEPT} onChange={onInput} className="sr-only" aria-describedby={`${uid}-file-help`} tabIndex={-1} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onInput} className="sr-only" tabIndex={-1} aria-hidden="true" />

            {file ? (
              <div className="flex items-center gap-3.5 rounded-2xl border border-leaf-200 bg-leaf-50/60 p-4">
                <FileIcon tone={toneForExt(file.ext)} label={labelForExt(file.ext)} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold text-night-900">{file.name}</p>
                  <p className="text-[12.5px] text-night-500">{frSize(file.size)}</p>
                </div>
                <button type="button" onClick={() => { setFile(null); setRawFile(null) }} aria-label={`Retirer ${file.name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-night-600 hover:bg-white">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  'flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                  dragging ? 'border-leaf-500 bg-leaf-50' : 'border-night-200 bg-night-50/40',
                  tried && errors.file && 'border-alert-300',
                )}
              >
                <CloudUpload className="h-11 w-11 text-night-800" strokeWidth={1.6} aria-hidden="true" />
                <p className="mt-3 text-[14px] font-bold text-night-900">Glissez votre fichier ici</p>
                <p className="text-[14px] font-bold text-night-900">
                  ou{' '}
                  <button type="button" onClick={() => fileRef.current?.click()} className="rounded text-leaf-600 underline decoration-2 underline-offset-2">
                    parcourez
                  </button>
                </p>
                <p id={`${uid}-file-help`} className="mt-3 text-[12px] text-night-500">PDF, JPG, PNG, DOCX, DOC<br />Taille max. 20 Mo</p>
              </div>
            )}
            {(fileError || (tried && errors.file)) && (
              <p role="alert" className="mt-2 text-[12.5px] font-semibold text-alert-600">{fileError || errors.file}</p>
            )}

            <h3 className="mt-6 text-[14px] font-extrabold text-night-900">Autres options</h3>
            <div className="mt-2 divide-y divide-night-100">
              {[
                { label: 'Prendre une photo', icon: Camera, on: () => cameraRef.current?.click() },
                { label: 'Scanner un document', icon: ScanLine, on: () => cameraRef.current?.click() },
                { label: 'Importer depuis un autre dossier', icon: FolderInput, on: () => fileRef.current?.click() },
              ].map(({ label, icon: Icon, on }) => (
                <button key={label} type="button" onClick={on} className="flex min-h-[52px] w-full items-center gap-3 px-1 text-left hover:bg-night-50/60">
                  <Icon className="h-5 w-5 text-night-700" aria-hidden="true" />
                  <span className="flex-1 text-[14px] font-semibold text-night-900">{label}</span>
                  <ChevronRight className="h-5 w-5 text-night-400" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------------------- Étape 4 ---------------------------- */}
        {step === 4 && file && (
          <div className="mt-3">
            <div className="flex items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
              <FileIcon tone={toneForExt(file.ext)} label={labelForExt(file.ext)} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-night-900">{name}</p>
                <p className="text-[12.5px] text-night-500">{labelForExt(file.ext) === 'W' ? 'DOCX' : labelForExt(file.ext)} <span aria-hidden="true">•</span> {frSize(file.size)}</p>
              </div>
            </div>
            <dl className="mt-4 divide-y divide-night-100 text-[13.5px]">
              {[
                ['Catégorie', category?.name ?? '—'],
                ['Enfant(s)', childLabel || '—'],
                ['Date du document', docDate ? frDate(docDate) : '—'],
                ['Source', source || '—'],
                ['Confidentialité', conf === 'prive' ? 'Privé' : 'Partageable'],
                ['Description', desc || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-4 py-2.5">
                  <dt className="w-[42%] shrink-0 font-bold text-night-900">{k}</dt>
                  <dd className="flex-1 text-right text-night-600">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <StickyActions>
        {step < 4 ? (
          <button type="button" onClick={next} className={btn({ variant: 'primary' })}>Continuer</button>
        ) : (
          <>
            {saveError && <p role="alert" className="mb-2 text-center text-[12.5px] font-semibold text-alert-600">{saveError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setStep(1)} disabled={saving} className={btn({ variant: 'secondary' })}>Modifier</button>
              <button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving} className={btn({ variant: 'primary' })}>
                {saving ? 'Envoi…' : 'Enregistrer'}
              </button>
            </div>
          </>
        )}
      </StickyActions>
    </>
  )
}

