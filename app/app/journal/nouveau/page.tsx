'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { BookOpen, CircleCheck, ChevronRight, Image as ImageIcon, MapPin } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import {
  ChildrenPicker, ChoiceChips, DateTimeFields, FieldLabel, SelectField, SubmitBar, TextAreaField, TextField,
  TypeTileGroup,
} from '@/components/journal/FormFields'
import { FinancesNotice } from '@/components/journal/FinancesView'
import {
  DepenseDetails, EMPTY_DETAILS, parsePartValue, type DepenseDetailsValues, type DetailsErrors,
} from '@/components/journal/DepenseDetails'
import { JustificatifsField } from '@/components/journal/JustificatifsField'
import { useFinanceLabels } from '@/components/journal/financeLabels'
import { JOURNAL_TYPES, JOURNAL_TYPE_ORDER } from '@/components/journal/journalTypes'
import { useChildOptions } from '@/lib/data/children'
import { createJournal, updateJournal, useJournalEntry } from '@/lib/data/journal'
import { clearDraft, dropFormDraft, peekFormDraft, saveFormDraft, useImageDraft } from '@/components/journal/imageDraft'
import {
  DEPENSE_CATEGORIES, DEPENSE_CATEGORIE_LABELS, DEPENSE_MODES_AUTRES, DEPENSE_MODES_PRINCIPAUX,
  DEPENSE_SENS, DEVISES, MODES_AVEC_SERVICE,
  advancedErrors, allJustificatifs, centsToInput, depenseSchema, monthKeyOf, parseAmountToCents,
  suggestNextDue,
  type DepenseCategorie, type DepenseJustificatif, type DepenseMode, type DepenseSens, type Devise,
} from '@/lib/journal-finances'
import type { JournalType } from '@/lib/mock-data'
import { parseJournalPrefill } from '@/lib/prefill'
import { addDaysToKey, timeInTz, todayKey } from '@/lib/tz'

// M05 — Ajouter un événement au journal (dont « Dépense / Paiement », type `depense`).
// Supabase : insert/update journal_entries (user_id issu de la session) + journal_expenses pour
// une dépense ; images et justificatifs dans le bucket privé « documents » (lib/data/journal).
// `?id=` = modification. Pré-remplissage par URL (contrat partagé, docs/RECAP_FONCTIONNEL_V2.md) :
// `type`, `titre`, `montant`, `categorie`, `enfant`, `date`, `source=guide:<slug>` — validés et bornés,
// valeurs invalides ignorées silencieusement. Champs avancés (0350) dans « Plus de détails ».
const DRAFT_KEY = 'nouveau'

/** Champs gardés pendant l'aller-retour vers « Ajouter des images ». */
type FormDraft = {
  editId?: string
  type: JournalType
  date: string
  heure: string
  titre: string
  description: string
  lieu: string
  childIds: string[]
}

type Search = Record<string, string | string[] | undefined>

// Jour et heure par défaut dans le fuseau de l'utilisateur (pas le fuseau implicite du navigateur).
const todayInput = (): string => todayKey()
const nowTime = (): string => timeInTz(new Date())

const AUTRE_MODE = '__autre'
const isPrincipal = (m: string) => (DEPENSE_MODES_PRINCIPAUX as readonly string[]).includes(m)
// Libellé court (champ étroit) : code + symbole.
const DEVISE_SHORT: Record<Devise, string> = { EUR: 'EUR (€)', BRL: 'BRL (R$)', SRD: 'SRD', USD: 'USD ($)' }
const DEVISE_OPTIONS = DEVISES.map((d) => ({ value: d, label: DEVISE_SHORT[d] }))

const isOutgoing = (s: DepenseSens) => s === 'depense' || s === 'remboursement-verse'
/** Le libellé d'un tiers n'est affiché (donc enregistré) que pour un type qui le justifie. */
const tiersLabelShown = (t: string) => t !== '' && t !== 'autre-parent'

export default function NouvelleEntreePage({ searchParams }: { searchParams: Promise<Search> }) {
  const t = useTranslations('family.journal.entryForm')
  const fl = useFinanceLabels()
  const sp = use(searchParams)
  const editId = typeof sp.id === 'string' ? sp.id : undefined
  const router = useRouter()
  const images = useImageDraft(DRAFT_KEY)
  // Brouillon laissé en partant ajouter des images (lu une fois, puis retiré au montage).
  const [formDraft] = useState(() => {
    const d = peekFormDraft<FormDraft>(DRAFT_KEY)
    return d && d.editId === editId ? d : undefined
  })
  const { options: rawChildOptions } = useChildOptions()
  // Libellé « Prénom (n ans) » traduit au rendu (lib/data/children est partagé).
  const childOptions = rawChildOptions.map((c) => ({ ...c, label: t('childOption', { name: c.prenom, count: c.age }) }))
  const { data: existing, loading: existingLoading, error: existingError } = useJournalEntry(editId ?? null)
  const prefilled = useRef(false)
  const urlChild = useRef<string | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Date/heure du client (le serveur peut être en UTC) : renseignées au montage.
  const [today, setToday] = useState('')
  const [guideSlug, setGuideSlug] = useState<string | null>(null)

  const [type, setType] = useState<JournalType>('visite')
  const [date, setDate] = useState('')
  const [heure, setHeure] = useState('')
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [lieu, setLieu] = useState('')
  const [childIds, setChildIds] = useState<string[]>([])
  // Dépense
  const [sens, setSens] = useState<DepenseSens>('depense')
  const [montant, setMontant] = useState('')
  const [devise, setDevise] = useState<Devise>('EUR')
  const [categorie, setCategorie] = useState<DepenseCategorie | ''>('')
  const [mode, setMode] = useState<DepenseMode | ''>('')
  const [modeLibelle, setModeLibelle] = useState('')
  const [details, setDetails] = useState<DepenseDetailsValues>(EMPTY_DETAILS)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [keptJustifs, setKeptJustifs] = useState<DepenseJustificatif[]>([])
  const [newJustifs, setNewJustifs] = useState<File[]>([])

  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  // Enregistrement réussi : la navigation vers la liste peut prendre plusieurs secondes (données
  // serveur + code de la page), le bouton ne doit plus afficher « Enregistrement… » pendant ce temps.
  const [saved, setSaved] = useState(false)
  // Prépare la page de destination pendant la saisie : le retour à la liste est alors immédiat.
  useEffect(() => { router.prefetch('/app/journal') }, [router])
  const [focusTick, setFocusTick] = useState(0)
  const [done, setDone] = useState<{ type: JournalType; date: string; id: string | null } | null>(null)

  const isDepense = type === 'depense'
  const outgoing = isOutgoing(sens)
  const isEdit = Boolean(editId && existing)
  // Modification d'une entrée pas (encore) chargée ou introuvable : envoi bloqué,
  // sinon l'enregistrement créerait un doublon au lieu de modifier l'entrée.
  const editBlocked = Boolean(editId) && !existing
  const editBlockedMessage = !editBlocked
    ? null
    : existingError
      ? existingError.message
      : existingLoading
        ? t('editLoading')
        : t('editNotFound')

  function applyDraft(d: FormDraft) {
    setType(d.type)
    setDate(d.date)
    setHeure(d.heure)
    setTitre(d.titre)
    setDescription(d.description)
    setLieu(d.lieu)
    setChildIds(d.childIds)
  }

  const patchDetails = (p: Partial<DepenseDetailsValues>) => setDetails((d) => {
    const next = { ...d, ...p }
    // Récurrence choisie sans échéance : on propose la suivante à partir de la date.
    if (p.recurrence && p.recurrence !== 'ponctuel' && !d.echeance && date) next.echeance = suggestNextDue(date, p.recurrence) ?? ''
    return next
  })

  /** Changement de sens : la contrepartie (bénéficiaire ↔ payeur) suit, sans perte de saisie. */
  function changeSens(next: DepenseSens) {
    if (isOutgoing(next) !== outgoing) {
      setDetails((d) => ({
        ...d,
        payeurType: d.beneficiaireType, beneficiaireType: d.payeurType,
        payeurLibelle: d.beneficiaire, beneficiaire: d.payeurLibelle,
      }))
    }
    setSens(next)
  }

  // Montage : date du jour + pré-remplissage par URL (création uniquement).
  useEffect(() => {
    const day = todayInput()
    setToday(day)
    const p = parseJournalPrefill(sp, day)
    if (p.guideSlug) setGuideSlug(p.guideSlug)
    if (!editId) {
      if (p.type) setType(p.type)
      if (p.titre) setTitre(p.titre)
      if (p.montantCents) setMontant(centsToInput(p.montantCents))
      if (p.categorie) setCategorie(p.categorie)
      if (p.date) setDate(p.date)
      urlChild.current = p.enfant
    }
    if (formDraft && !editId) applyDraft(formDraft)
    dropFormDraft(DRAFT_KEY)
    setDate((d) => d || day)
    setHeure((h) => h || nowTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique des paramètres d'URL
  }, [])

  // `enfant=<id>` : appliqué seulement s'il correspond à un enfant réel du compte.
  useEffect(() => {
    const cid = urlChild.current
    if (!cid || rawChildOptions.length === 0) return
    urlChild.current = undefined
    if (rawChildOptions.some((c) => c.id === cid)) setChildIds((ids) => (ids.includes(cid) ? ids : [...ids, cid]))
  }, [rawChildOptions])

  // Modification : pré-remplissage une seule fois, dès que l'entrée est chargée.
  useEffect(() => {
    if (!existing || prefilled.current) return
    prefilled.current = true
    if (formDraft) {
      applyDraft(formDraft)
      return
    }
    setType(existing.type)
    setDate(existing.date)
    setHeure(existing.heure ?? '')
    setTitre(existing.title)
    setDescription(existing.description ?? '')
    setLieu(existing.lieu ?? '')
    setChildIds(existing.childIds)
    const d = existing.depense
    if (d) {
      const s = d.sens ?? 'depense'
      const out = isOutgoing(s)
      setSens(s)
      setMontant(centsToInput(d.montantCents))
      setDevise(d.devise)
      setCategorie(d.categorie)
      setMode(d.mode)
      setModeLibelle(d.modeLibelle ?? '')
      // « Moi » = valeur implicite côté utilisateur (option vide).
      const v: DepenseDetailsValues = {
        payeurType: out && d.payeurType === 'moi' ? '' : d.payeurType ?? '',
        payeurLibelle: d.payeurLibelle ?? '',
        beneficiaireType: !out && d.beneficiaireType === 'moi' ? '' : d.beneficiaireType ?? '',
        beneficiaire: d.beneficiaire ?? '',
        reference: d.reference ?? '',
        statut: d.statut ?? 'paye',
        montantPaye: d.montantPayeCents !== undefined ? centsToInput(d.montantPayeCents) : '',
        partageMode: d.partageMode ?? '',
        partageValeur: d.partageValeur === undefined ? '' : d.partageMode === 'montant' ? centsToInput(d.partageValeur) : String(d.partageValeur),
        recurrence: d.recurrence ?? 'ponctuel',
        echeance: d.echeanceSuivante ?? '',
      }
      setDetails(v)
      setDetailsOpen(Boolean(v.payeurType || v.beneficiaireType || v.reference || v.statut !== 'paye' || v.partageMode || v.recurrence !== 'ponctuel'))
      setKeptJustifs(allJustificatifs(d))
    }
  }, [existing])

  // Après une soumission invalide (erreurs rendues) : focus sur le premier champ en erreur.
  useEffect(() => {
    if (focusTick === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  useEffect(() => { if (done) successRef.current?.focus() }, [done])

  // --- Validation (schéma zod partagé avec la couche de données) ---------------------
  const cents = parseAmountToCents(montant)
  const payeCents = details.statut === 'partiel' ? parseAmountToCents(details.montantPaye) : null
  const partValue = parsePartValue(details.partageMode, details.partageValeur)
  const counterpart = outgoing ? details.beneficiaire : details.payeurLibelle
  const depenseInput = {
    montantCents: cents ?? 0,
    devise,
    categorie: categorie || undefined,
    mode: mode || undefined,
    sens,
    // Libellé saisi dans le champ principal (contrepartie) ou, côté « moi / tiers », seulement s'il est affiché.
    beneficiaire: (outgoing || tiersLabelShown(details.beneficiaireType) ? details.beneficiaire : '') || undefined,
    payeurType: details.payeurType || undefined,
    payeurLibelle: (!outgoing || tiersLabelShown(details.payeurType) ? details.payeurLibelle : '') || undefined,
    beneficiaireType: details.beneficiaireType || undefined,
    modeLibelle: mode && MODES_AVEC_SERVICE.includes(mode) ? modeLibelle || undefined : undefined,
    reference: details.reference || undefined,
    statut: details.statut,
    montantPayeCents: payeCents ?? undefined,
    partageMode: details.partageMode || undefined,
    partageValeur: partValue ?? undefined,
    recurrence: details.recurrence,
    echeanceSuivante: details.recurrence !== 'ponctuel' ? details.echeance || undefined : undefined,
  }
  const depenseCheck = depenseSchema.safeParse(depenseInput)
  const issue = (k: string) => (depenseCheck.success ? undefined : fl.error(depenseCheck.error.issues.find((i) => i.path[0] === k)?.message))
  // Règles avancées évaluées directement (le schéma ne les vérifie qu'une fois les champs principaux valides).
  const adv = advancedErrors({ ...depenseInput, montantCents: cents ?? undefined })
  const detailsErrors: DetailsErrors = !isDepense ? {} : {
    montantPaye: details.statut === 'partiel' && details.montantPaye.trim() && payeCents === null
      ? t('errors.amountExample')
      : fl.error(adv.montantPayeCents),
    partageValeur: details.partageMode && details.partageValeur.trim() && partValue === null
      ? (details.partageMode === 'pourcentage' ? t('errors.percentInteger') : t('errors.amountExample'))
      : fl.error(adv.partageValeur),
    echeance: fl.error(adv.echeanceSuivante)
      ?? (details.recurrence !== 'ponctuel' && details.echeance && date && details.echeance <= date
        ? t('errors.dueAfterDate')
        : undefined),
  }
  const errors = {
    titre: !isDepense && !titre.trim() ? t('errors.titleRequired') : undefined,
    date: !date ? t('errors.dateRequired') : today && date > today ? t('errors.dateFuture') : undefined,
    montant: !isDepense ? undefined : !montant.trim() ? t('errors.amountRequired') : cents === null ? t('errors.amountInvalid') : issue('montantCents'),
    categorie: isDepense ? issue('categorie') : undefined,
    mode: isDepense ? issue('mode') : undefined,
    counterpart: isDepense ? issue(outgoing ? 'beneficiaire' : 'payeurLibelle') : undefined,
    modeLibelle: isDepense ? issue('modeLibelle') : undefined,
    ...detailsErrors,
  }
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : undefined)
  const shownDetailsErrors: DetailsErrors = submitted ? detailsErrors : {}

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (editBlocked) {
      setSaveError(editBlockedMessage)
      return
    }
    setSubmitted(true)
    if (Object.values(errors).some(Boolean) || (isDepense && !depenseCheck.success)) {
      // Un champ de « Plus de détails » en erreur : on ouvre la section avant d'y placer le focus.
      if (Object.values(detailsErrors).some(Boolean)) setDetailsOpen(true)
      setFocusTick((n) => n + 1)
      return
    }
    setSaving(true)
    setSaveError(null)
    // Titre par défaut enregistré en base : libellé français de la catégorie (donnée, inchangée).
    const finalTitre = titre.trim() || (isDepense && categorie ? DEPENSE_CATEGORIE_LABELS[categorie] : '')
    const input = {
      type,
      titre: finalTitre,
      description,
      lieu: isDepense ? '' : lieu,
      date,
      heure: isDepense ? '' : heure,
      childIds,
      depense: isDepense && depenseCheck.success ? depenseCheck.data : undefined,
    }
    const files = isDepense ? [] : images.map((d) => d.file)
    try {
      let id: string | null = editId ?? null
      if (editId) await updateJournal(editId, input, files, isDepense ? { added: newJustifs, keep: keptJustifs } : null)
      else id = await createJournal(input, files, isDepense ? { added: newJustifs } : null)
      if (!isDepense) clearDraft(DRAFT_KEY)
      if (guideSlug && !isEdit) {
        setDone({ type, date, id })
        setSaving(false)
        return
      }
      setSaving(false)
      setSaved(true)
      // Retour à la liste avec confirmation (`ok`, lu puis retiré de l'URL par la page Journal).
      router.push(
        isEdit
          ? `/app/journal/${editId}`
          : isDepense
            ? `/app/journal?filtre=finances&mois=${monthKeyOf(date)}&ok=depense`
            : '/app/journal?ok=evenement',
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('saveFailed'))
      setSaving(false)
    }
  }

  const tiles = JOURNAL_TYPE_ORDER.map((k) => {
    const Icon = JOURNAL_TYPES[k].icon
    return { value: k, label: fl.type(k), icon: <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} /> }
  })
  const categoryOptions = DEPENSE_CATEGORIES.map((c) => ({ value: c, label: fl.category(c) }))
  const sensOptions = DEPENSE_SENS.map((s) => ({ value: s, label: fl.sens(s) }))
  const modeChips = [
    ...DEPENSE_MODES_PRINCIPAUX.map((m) => ({ value: m, label: fl.mode(m) })),
    { value: AUTRE_MODE, label: t('otherModes') },
  ]
  const autreModeOptions = DEPENSE_MODES_AUTRES.map((m) => ({ value: m, label: fl.mode(m) }))

  const guideHref = guideSlug ? `/app/guide/${guideSlug}` : null
  const backHref = isEdit ? `/app/journal/${editId}` : guideHref ?? (isDepense ? '/app/journal?filtre=finances' : '/app/journal')
  const title = isEdit ? (isDepense ? t('titleEditExpense') : t('titleEditEvent')) : isDepense ? t('titleAddExpense') : t('titleAddEvent')
  const modeChip = mode ? (isPrincipal(mode) ? mode : AUTRE_MODE) : ''
  const showService = mode !== '' && MODES_AVEC_SERVICE.includes(mode)

  // --- Succès (arrivée depuis le Guide) : retour à la fiche ---------------------------
  if (done) {
    const listHref = done.type === 'depense' ? `/app/journal?filtre=finances&mois=${monthKeyOf(done.date)}` : '/app/journal'
    return (
      <>
        <TopBar title={done.type === 'depense' ? t('doneExpenseTitle') : t('doneEventTitle')} showBack backHref={guideHref ?? '/app/journal'} showBell={false} />
        <section aria-labelledby="ok-title" className="mx-auto flex max-w-md flex-col items-center px-4 pb-6 pt-8 text-center">
          <span aria-hidden="true" className="grid h-[76px] w-[76px] place-items-center rounded-full bg-leaf-50 text-leaf-600 motion-safe:animate-fade-up">
            <CircleCheck className="h-9 w-9" strokeWidth={1.7} />
          </span>
          <h2 id="ok-title" ref={successRef} tabIndex={-1} className="mt-4 text-[19px] font-extrabold text-night-900 focus:outline-none">
            {done.type === 'depense' ? t('doneExpenseHeading') : t('doneEventHeading')}
          </h2>
          <p role="status" className="mt-2 text-[13px] text-night-700">{t('doneText')}</p>
          <div className="mt-6 grid w-full gap-3">
            {guideHref && (
              <Link href={guideHref} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-leaf-500 text-[15px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)] transition-colors hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 motion-safe:active:scale-[.98]">
                <BookOpen aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
                {t('backToGuide')}
              </Link>
            )}
            <Link href={done.id ? `/app/journal/${done.id}` : listHref} className="flex h-12 items-center justify-center rounded-xl border border-night-200 bg-white text-[15px] font-semibold text-night-900 transition-colors hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2">
              {t('viewInJournal')}
            </Link>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <TopBar title={title} showBack backHref={backHref} showBell={false} />

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5 px-4 pb-6 pt-3 lg:mx-auto lg:max-w-2xl">
        {guideHref && (
          <p className="flex items-center gap-2.5 rounded-xl bg-leaf-50 px-3.5 py-2.5 text-[12.5px] text-leaf-800 ring-1 ring-leaf-200">
            <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>{t('prefilledFromGuide')}</span>
          </p>
        )}

        <TypeTileGroup name="type" legend={t('eventType')} options={tiles} value={type} onChange={(v) => setType(v as JournalType)} columns={3} />

        {isDepense && (
          <ChoiceChips
            name="sens"
            legend={t('direction')}
            options={sensOptions}
            value={sens}
            onChange={(v) => changeSens(v as DepenseSens)}
            columns={4}
          />
        )}

        {isDepense && (
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <TextField
              label={details.statut === 'partiel' ? t('amountTotalDue') : t('amount')}
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder={t('amountPlaceholder')}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              maxLength={14}
              hint={t('amountHint')}
              error={show('montant')}
            />
            <div className="w-[8.5rem]">
              <SelectField label={t('currency')} value={devise} onChange={(e) => setDevise(e.target.value as Devise)} options={DEVISE_OPTIONS} />
            </div>
          </div>
        )}

        <DateTimeFields
          date={date}
          time={heure}
          onDate={setDate}
          onTime={setHeure}
          max={today || undefined}
          dateError={show('date')}
          withTime={!isDepense}
          legend={isDepense ? (outgoing ? t('dateExpense') : t('dateReceived')) : t('dateTime')}
        />

        <TextField
          label={isDepense ? t('labelOptional') : t('titleLabel')}
          required={!isDepense}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder={isDepense ? (outgoing ? t('labelPlaceholderOut') : t('labelPlaceholderIn')) : t('titlePlaceholder')}
          maxLength={120}
          hint={isDepense ? t('labelHint') : undefined}
          error={show('titre')}
        />

        {isDepense && (
          <>
            <SelectField
              label={t('category')}
              required
              placeholder={t('categoryPlaceholder')}
              value={categorie}
              onChange={(e) => setCategorie(e.target.value as DepenseCategorie)}
              options={categoryOptions}
              error={show('categorie')}
            />

            <div className="space-y-3">
              <ChoiceChips
                name="mode"
                legend={t('paymentMode')}
                options={modeChips}
                value={modeChip}
                onChange={(v) => setMode(v === AUTRE_MODE ? (mode && !isPrincipal(mode) ? mode : 'mobile') : (v as DepenseMode))}
                error={show('mode')}
              />
              {modeChip === AUTRE_MODE && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label={t('specifyMode')}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as DepenseMode)}
                    options={autreModeOptions}
                  />
                  {showService && (
                    <TextField
                      label={mode === 'mobile' ? t('serviceUsed') : t('precision')}
                      value={modeLibelle}
                      onChange={(e) => setModeLibelle(e.target.value)}
                      placeholder={mode === 'mobile' ? t('servicePlaceholder') : t('precisionPlaceholder')}
                      maxLength={60}
                      autoComplete="off"
                      error={show('modeLibelle')}
                    />
                  )}
                </div>
              )}
            </div>

            <TextField
              label={outgoing ? t('beneficiary') : t('receivedFrom')}
              value={counterpart}
              onChange={(e) => patchDetails(outgoing ? { beneficiaire: e.target.value } : { payeurLibelle: e.target.value })}
              placeholder={outgoing ? t('beneficiaryPlaceholder') : t('receivedFromPlaceholder')}
              maxLength={120}
              autoComplete="off"
              error={show('counterpart')}
            />
          </>
        )}

        <ChildrenPicker
          options={childOptions}
          value={childIds}
          onChange={setChildIds}
          label={isDepense ? t('childrenExpense') : t('children')}
        />

        <TextAreaField
          label={isDepense ? t('descriptionOptional') : t('description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isDepense ? t('descriptionPlaceholderExpense') : t('descriptionPlaceholder')}
          maxLength={2000}
        />

        {!isDepense && (
          <TextField
            label={t('place')}
            value={lieu}
            onChange={(e) => setLieu(e.target.value)}
            placeholder={t('placePlaceholder')}
            trailingIcon={<MapPin className="h-[18px] w-[18px]" />}
          />
        )}

        {isDepense ? (
          <>
            <JustificatifsField kept={keptJustifs} added={newJustifs} onKeptChange={setKeptJustifs} onAddedChange={setNewJustifs} />
            <DepenseDetails
              open={detailsOpen}
              onToggle={setDetailsOpen}
              values={details}
              onChange={patchDetails}
              outgoing={outgoing}
              mode={mode}
              montantCents={cents}
              devise={devise}
              errors={shownDetailsErrors}
              minEcheance={date ? addDaysToKey(date, 1) : undefined}
            />
          </>
        ) : (
          <div>
            <FieldLabel as="p">{t('addImages')}</FieldLabel>
            <Link
              href="/app/journal/nouveau/images"
              onClick={() => saveFormDraft<FormDraft>(DRAFT_KEY, { editId, type, date, heure, titre, description, lieu, childIds })}
              className="flex min-h-[64px] items-center gap-4 rounded-xl border border-night-100 bg-white px-4 py-3.5 transition-colors hover:border-night-200"
            >
              <ImageIcon aria-hidden="true" className="h-6 w-6 shrink-0 text-night-900" strokeWidth={1.7} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-night-900">{t('addImagesButton')}</span>
                <span className="block text-[11px] text-night-600">
                  {images.length ? `${t('filesAdded', { count: images.length })} · ${t('maxFiles')}` : t('maxFiles')}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-night-700" />
            </Link>
          </div>
        )}

        {isDepense && <FinancesNotice />}

        {editBlocked && !saveError && (
          <p role="status" className="text-center text-[13px] font-semibold text-night-700">{editBlockedMessage}</p>
        )}
        {saveError && (
          <p role="alert" className="text-center text-[13px] font-semibold text-alert-600">{saveError}</p>
        )}
        <p role="status" className={saved ? 'text-center text-[13px] font-semibold text-leaf-700' : 'sr-only'}>
          {saved ? (isDepense ? t('doneExpenseHeading') : t('doneEventHeading')) : ''}
        </p>

        <div className="pt-1">
          <SubmitBar disabled={saving || saved || editBlocked}>
            {saving ? t('saving') : saved ? (isDepense ? t('doneExpenseTitle') : t('doneEventTitle')) : isDepense ? (outgoing ? t('saveExpense') : t('savePayment')) : t('save')}
          </SubmitBar>
        </div>
      </form>
    </>
  )
}
