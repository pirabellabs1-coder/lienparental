'use client'

/**
 * Journal familial — couche de données.
 * - Supabase : table `journal_entries` (RLS user_id = auth.uid()), soft delete.
 *   Pièces jointes dans le bucket privé `documents` sous `${uid}/journal/…`
 *   (la policy Storage exige le 1er segment = auth.uid()) ; lecture via URL signée 15 min.
 *   Dépenses (type `depense`) : table liée `journal_expenses` (0240 + 0350, 1-1 avec l'entrée,
 *   RLS user_id), justificatifs (principal + supplémentaires) dans le même bucket, même
 *   préfixe `${uid}/journal/`.
 * - Démo : données de components/journal/journalData + entrées créées pendant la session
 *   (sessionStorage, métadonnées seulement : les fichiers ne sont jamais conservés).
 * - Dates : `occurred_at` (instant UTC) ↔ jour + heure murale dans DEFAULT_TZ (lib/tz),
 *   jamais le fuseau du navigateur. Une dépense saisie sans heure est placée à 12:00.
 */
import { z } from 'zod'
import type { JournalType } from '@/lib/mock-data'
import {
  getJournalEntries, getJournalEntry, sortJournal, type JournalImage, type JournalItem,
} from '@/components/journal/journalData'
import {
  MAX_JUSTIFICATIFS, allJustificatifs, depenseSchema, isDepenseCategorie, isDepenseMode, isDepenseSens,
  isDepenseStatut, isDevise, isPartageMode, isPartie, isRealDay, isRecurrence, justificatifError,
  type DepenseJustificatif, type JournalDepense,
} from '@/lib/journal-finances'
import {
  DOCUMENTS_BUCKET, DataError, LIVE, SIGNED_URL_TTL, db, requireUserId,
  safeFileName, toDataError, useAsyncData, uuid,
} from './core'
import { addDaysToKey, dayKeyInTz, dayRangeBoundsInTz, shiftMonthKey, timeInTz, wallTimeToIso } from '@/lib/tz'

type Media = { path: string; mime: string; size: number; name?: string }

type ExpenseRow = {
  amount_cents: number
  currency: string
  categorie: string
  payment_method: string
  beneficiaire: string | null
  justificatif: Media | null
  // 0350
  direction?: string | null
  payer_type?: string | null
  payer_label?: string | null
  beneficiary_type?: string | null
  payment_method_label?: string | null
  transaction_ref?: string | null
  status?: string | null
  amount_paid_cents?: number | null
  split_mode?: string | null
  split_value?: number | null
  recurrence?: string | null
  next_due_date?: string | null
  justificatifs_extra?: Media[] | null
}

type JournalRow = {
  id: string
  type: JournalType
  titre: string
  description: string | null
  lieu: string | null
  occurred_at: string
  children_ids: string[]
  media: Media[] | null
  created_at: string
  journal_expenses?: ExpenseRow | ExpenseRow[] | null
}

// Les colonnes 0350 sont lues explicitement : la migration 0350 doit être appliquée
// avant le déploiement de ce code (sinon PostgREST renvoie « column does not exist »).
const EXPENSE_COLUMNS =
  'amount_cents, currency, categorie, payment_method, beneficiaire, justificatif, ' +
  'direction, payer_type, payer_label, beneficiary_type, payment_method_label, transaction_ref, ' +
  'status, amount_paid_cents, split_mode, split_value, recurrence, next_due_date, justificatifs_extra'
const COLUMNS = `id, type, titre, description, lieu, occurred_at, children_ids, media, created_at, journal_expenses(${EXPENSE_COLUMNS})`

export const JOURNAL_MAX_FILES = 10
export const JOURNAL_MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/

/** Élément du journal enrichi des chemins Storage (pour URL signées). */
export type JournalRecord = JournalItem & { media?: Media[] }

const isMedia = (m: unknown): m is Media => !!m && typeof (m as Media).path === 'string'
const mediaToJustif = (m: Media): DepenseJustificatif => ({
  name: m.name ?? m.path.split('/').pop() ?? 'justificatif', mime: m.mime, sizeBytes: m.size, path: m.path,
})
const justifToMedia = (j: DepenseJustificatif): Media | null =>
  j.path ? { path: j.path, mime: j.mime, size: j.sizeBytes, name: j.name.slice(0, 120) } : null
const str = (v: string | null | undefined) => (v ? v : undefined)
const int = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function depenseFromRow(raw: JournalRow['journal_expenses']): JournalDepense | undefined {
  const r = Array.isArray(raw) ? raw[0] : raw
  if (!r) return undefined
  // Lecture défensive : la base est contrainte (CHECK 0240 / 0350), mais l'UI ne doit jamais casser.
  const j = isMedia(r.justificatif) ? r.justificatif : null
  const extra = Array.isArray(r.justificatifs_extra) ? r.justificatifs_extra.filter(isMedia) : []
  const statut = isDepenseStatut(r.status) ? r.status : undefined
  const recurrence = isRecurrence(r.recurrence) ? r.recurrence : undefined
  const partageMode = isPartageMode(r.split_mode) ? r.split_mode : undefined
  return {
    montantCents: Number(r.amount_cents) || 0,
    devise: isDevise(r.currency) ? r.currency : 'EUR',
    categorie: isDepenseCategorie(r.categorie) ? r.categorie : 'autre',
    mode: isDepenseMode(r.payment_method) ? r.payment_method : 'autre',
    beneficiaire: str(r.beneficiaire),
    justificatif: j ? mediaToJustif(j) : undefined,
    autresJustificatifs: extra.length ? extra.map(mediaToJustif) : undefined,
    sens: isDepenseSens(r.direction) ? r.direction : undefined,
    payeurType: isPartie(r.payer_type) ? r.payer_type : undefined,
    payeurLibelle: str(r.payer_label),
    beneficiaireType: isPartie(r.beneficiary_type) ? r.beneficiary_type : undefined,
    modeLibelle: str(r.payment_method_label),
    reference: str(r.transaction_ref),
    statut,
    montantPayeCents: statut === 'partiel' ? int(r.amount_paid_cents) : undefined,
    partageMode,
    partageValeur: partageMode ? int(r.split_value) : undefined,
    recurrence,
    echeanceSuivante: recurrence && recurrence !== 'ponctuel' && isRealDay(r.next_due_date) ? r.next_due_date : undefined,
  }
}

function fromRow(r: JournalRow): JournalRecord {
  const at = new Date(r.occurred_at)
  const media = Array.isArray(r.media) ? r.media : []
  return {
    id: r.id,
    type: r.type,
    title: r.titre,
    date: dayKeyInTz(at),
    heure: timeInTz(at),
    description: r.description ?? undefined,
    lieu: r.lieu ?? undefined,
    childIds: r.children_ids ?? [],
    images: media.map<JournalImage>((m) => ({ name: m.name ?? m.path.split('/').pop() ?? 'fichier', sizeBytes: m.size })),
    media,
    createdAt: r.created_at,
    createdTime: timeInTz(new Date(r.created_at)),
    depense: r.type === 'depense' ? depenseFromRow(r.journal_expenses) : undefined,
  }
}

const inputSchema = z
  .object({
    type: z.enum(['visite', 'appel', 'message', 'sante', 'depense', 'autre']),
    titre: z.string().trim().min(1, 'Donnez un titre à cet événement.').max(120),
    description: z.string().trim().max(2000).optional(),
    lieu: z.string().trim().max(200).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La date est requise.'),
    heure: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    childIds: z.array(z.string()).max(20),
    depense: depenseSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'depense' && !v.depense) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['depense'], message: 'Renseignez le montant, la catégorie et le mode de paiement.' })
    }
    if (v.depense?.echeanceSuivante && v.depense.echeanceSuivante <= v.date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['depense', 'echeanceSuivante'], message: 'L’échéance suivante doit être postérieure à la date de la dépense.' })
    }
  })
export type JournalInput = z.input<typeof inputSchema>
type ValidInput = z.output<typeof inputSchema>

/** Heure par défaut d'une dépense saisie sans heure : midi (DEFAULT_TZ), loin de tout changement de jour. */
export const DEPENSE_DEFAULT_TIME = '12:00'

/** Jour + heure murale (DEFAULT_TZ) → instant `occurred_at`. */
function occurredAt(v: Pick<ValidInput, 'type' | 'date' | 'heure'>): string {
  return wallTimeToIso(v.date, v.heure || (v.type === 'depense' ? DEPENSE_DEFAULT_TIME : '00:00'))
}

function validate(input: JournalInput): ValidInput {
  const p = inputSchema.safeParse(input)
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? 'Certaines informations sont invalides.', 'invalid')
  return p.data
}

function checkFiles(files: File[], existing = 0) {
  if (files.length + existing > JOURNAL_MAX_FILES) throw new DataError(`${JOURNAL_MAX_FILES} fichiers maximum par événement.`, 'too_many_files')
  for (const f of files) {
    if (!ALLOWED_MIME.test(f.type)) throw new DataError(`« ${f.name} » : format non pris en charge (images ou PDF).`, 'bad_type')
    if (f.size > JOURNAL_MAX_FILE_BYTES) throw new DataError(`« ${f.name} » dépasse 10 Mo.`, 'too_large')
  }
}

function checkJustificatifs(files: File[], kept = 0) {
  if (files.length + kept > MAX_JUSTIFICATIFS) throw new DataError(`${MAX_JUSTIFICATIFS} justificatifs maximum par dépense.`, 'too_many_files')
  for (const f of files) {
    const err = justificatifError(f)
    if (err) throw new DataError(`Justificatif « ${f.name} » : ${err}`, 'bad_justificatif')
  }
}

/**
 * Justificatifs d'une dépense :
 * - `added` : nouveaux fichiers, AJOUTÉS à ceux conservés ;
 * - `keep` absent : tous les justificatifs actuels sont conservés ;
 * - `keep` fourni : seuls ceux-ci (sous-ensemble des actuels, comparé par chemin, ou nom + taille
 *   en démo) sont conservés. Un justificatif retiré reste dans le Storage (valeur de preuve,
 *   purge par la rétention), comme un fichier remplacé en v2.
 * Un `File` seul (signature v2) vaut `{ added: [file] }`.
 */
export type JustificatifsChange = { added?: File[]; keep?: DepenseJustificatif[] }

function normalizeJustifs(j?: File | null | JustificatifsChange): JustificatifsChange {
  if (!j) return {}
  if (typeof File !== 'undefined' && j instanceof File) return { added: [j] }
  return j as JustificatifsChange
}

function sameJustif(a: DepenseJustificatif, b: DepenseJustificatif) {
  return a.path && b.path ? a.path === b.path : a.name === b.name && a.sizeBytes === b.sizeBytes
}

function keptJustifs(current: DepenseJustificatif[], keep?: DepenseJustificatif[]): DepenseJustificatif[] {
  return keep ? current.filter((c) => keep.some((k) => sameJustif(c, k))) : current
}

async function uploadMedia(userId: string, files: File[]): Promise<Media[]> {
  const out: Media[] = []
  try {
    for (const f of files) {
      const path = `${userId}/journal/${uuid()}-${safeFileName(f.name)}`
      const { error } = await db().storage.from(DOCUMENTS_BUCKET).upload(path, f, { contentType: f.type, upsert: false })
      if (error) throw error
      out.push({ path, mime: f.type, size: f.size, name: f.name.slice(0, 120) })
    }
    return out
  } catch (e) {
    // Pas d'orphelins : on retire ce qui a déjà été envoyé.
    if (out.length) await db().storage.from(DOCUMENTS_BUCKET).remove(out.map((m) => m.path))
    throw toDataError(e, 'journal.upload', 'L’envoi des fichiers a échoué.')
  }
}

function expensePayload(userId: string, entryId: string, d: NonNullable<ValidInput['depense']>, justifs: Media[]) {
  return {
    entry_id: entryId,
    user_id: userId,
    amount_cents: d.montantCents,
    currency: d.devise,
    categorie: d.categorie,
    payment_method: d.mode,
    beneficiaire: d.beneficiaire ?? null,
    justificatif: justifs[0] ?? null,
    justificatifs_extra: justifs.slice(1),
    direction: d.sens,
    payer_type: d.payeurType ?? null,
    payer_label: d.payeurLibelle ?? null,
    beneficiary_type: d.beneficiaireType ?? null,
    payment_method_label: d.modeLibelle ?? null,
    transaction_ref: d.reference ?? null,
    status: d.statut,
    amount_paid_cents: d.montantPayeCents ?? null,
    split_mode: d.partageMode ?? null,
    split_value: d.partageValeur ?? null,
    recurrence: d.recurrence,
    next_due_date: d.echeanceSuivante ?? null,
  }
}

// --- Démo : entrées créées pendant la session ---------------------------------------

const DEMO_KEY = 'lp_demo_journal_v1'

function readDemo(): JournalRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(DEMO_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as JournalRecord[]).filter((e) => e && typeof e.id === 'string' && typeof e.date === 'string') : []
  } catch {
    return []
  }
}

function writeDemo(list: JournalRecord[]) {
  try {
    window.sessionStorage.setItem(DEMO_KEY, JSON.stringify(list.slice(0, 200)))
  } catch {
    /* stockage plein ou désactivé : la démo reste utilisable sans persistance */
  }
}

const fileToJustif = (f: File): DepenseJustificatif => ({ name: f.name.slice(0, 120), mime: f.type, sizeBytes: f.size })

function splitJustifs(list: DepenseJustificatif[]): Pick<JournalDepense, 'justificatif' | 'autresJustificatifs'> {
  return { justificatif: list[0], autresJustificatifs: list.length > 1 ? list.slice(1) : undefined }
}

function demoRecord(id: string, v: ValidInput, files: File[], justifs: DepenseJustificatif[] = []): JournalRecord {
  const now = new Date()
  return {
    id,
    type: v.type,
    title: v.titre,
    date: v.date,
    heure: v.heure || undefined,
    description: v.description || undefined,
    lieu: v.lieu || undefined,
    childIds: v.childIds,
    images: files.map((f) => ({ name: f.name.slice(0, 120), sizeBytes: f.size })),
    createdAt: now.toISOString(),
    createdTime: timeInTz(now),
    depense: v.type === 'depense' && v.depense ? { ...v.depense, ...splitJustifs(justifs) } : undefined,
  }
}

/** Démo : liste fusionnée, une copie de session (entrée modifiée) masque l'entrée d'origine. */
function demoList(): JournalRecord[] {
  const session = readDemo()
  const ids = new Set(session.map((e) => e.id))
  return sortJournal([...session, ...getJournalEntries().filter((e) => !ids.has(e.id))])
}

// --- API --------------------------------------------------------------------

export async function listJournal(): Promise<JournalRecord[]> {
  if (!LIVE) return demoList()
  const { data, error } = await db()
    .from('journal_entries')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })
    .limit(500)
  if (error) throw toDataError(error, 'journal.list')
  return ((data ?? []) as unknown as JournalRow[]).map(fromRow)
}

/** Plage de jours inclusive "yyyy-mm-dd" (DEFAULT_TZ). Bornes absentes = ouverte. */
export type DayRange = { fromDay?: string; toDay?: string }

const EXPENSE_PAGE = 500
const EXPENSE_MAX_PAGES = 20 // 10 000 dépenses : garde-fou

/**
 * Lecture DÉDIÉE des dépenses (type `depense`), indépendante de la limite de `listJournal`
 * (500 entrées tous types) : pagination jusqu'à épuisement. Bornes en DEFAULT_TZ.
 * Démo : mêmes données que le Journal, filtrées sur la date.
 */
export async function listJournalExpenses(range: DayRange = {}): Promise<JournalRecord[]> {
  const inRange = (day: string) => (!range.fromDay || day >= range.fromDay) && (!range.toDay || day <= range.toDay)
  if (!LIVE) return (await listJournal()).filter((e) => e.type === 'depense' && e.depense && inRange(e.date))
  const bounds = range.fromDay || range.toDay
    ? dayRangeBoundsInTz(range.fromDay ?? '1900-01-01', range.toDay ?? '2100-12-31')
    : null
  const out: JournalRecord[] = []
  for (let page = 0; page < EXPENSE_MAX_PAGES; page++) {
    let q = db().from('journal_entries').select(COLUMNS).eq('type', 'depense').is('deleted_at', null)
    if (bounds && range.fromDay) q = q.gte('occurred_at', bounds.from)
    if (bounds && range.toDay) q = q.lt('occurred_at', bounds.to)
    const { data, error } = await q
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: true }) // ordre total : pagination stable
      .range(page * EXPENSE_PAGE, page * EXPENSE_PAGE + EXPENSE_PAGE - 1)
    if (error) throw toDataError(error, 'journal.listExpenses')
    const rows = (data ?? []) as unknown as JournalRow[]
    out.push(...rows.map(fromRow).filter((e) => e.depense))
    if (rows.length < EXPENSE_PAGE) break
  }
  return out
}

/** Dépenses d'un mois "yyyy-mm" (bornes du mois dans DEFAULT_TZ). */
export function listMonthExpenses(month: string): Promise<JournalRecord[]> {
  return listJournalExpenses({ fromDay: `${month}-01`, toDay: addDaysToKey(`${shiftMonthKey(month, 1)}-01`, -1) })
}

export async function getJournal(id: string): Promise<JournalRecord | null> {
  if (!LIVE) return readDemo().find((e) => e.id === id) ?? getJournalEntry(id) ?? null
  if (!z.string().uuid().safeParse(id).success) return null
  const { data, error } = await db().from('journal_entries').select(COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) throw toDataError(error, 'journal.get')
  return data ? fromRow(data as unknown as JournalRow) : null
}

/**
 * Crée une entrée (+ pièces jointes, + dépense liée et ses justificatifs si `type = depense`).
 * Démo : conservée dans la session (sans les fichiers).
 */
export async function createJournal(
  input: JournalInput, files: File[] = [], justificatifs?: File | null | JustificatifsChange,
): Promise<string | null> {
  const v = validate(input)
  checkFiles(files)
  const newJustifs = v.type === 'depense' ? normalizeJustifs(justificatifs).added ?? [] : []
  checkJustificatifs(newJustifs)
  if (!LIVE) {
    const id = `jd_${uuid().slice(0, 8)}`
    writeDemo([demoRecord(id, v, files, newJustifs.map(fileToJustif)), ...readDemo()])
    return id
  }
  const userId = await requireUserId()
  const media = await uploadMedia(userId, files)
  let justifs: Media[] = []
  try {
    justifs = await uploadMedia(userId, newJustifs)
  } catch (e) {
    if (media.length) await db().storage.from(DOCUMENTS_BUCKET).remove(media.map((m) => m.path))
    throw e
  }
  const uploaded = [...media.map((m) => m.path), ...justifs.map((m) => m.path)]
  const cleanup = async () => { if (uploaded.length) await db().storage.from(DOCUMENTS_BUCKET).remove(uploaded) }

  const { data, error } = await db()
    .from('journal_entries')
    .insert({
      user_id: userId,
      type: v.type,
      titre: v.titre,
      description: v.description || null,
      lieu: v.lieu || null,
      occurred_at: occurredAt(v),
      children_ids: v.childIds,
      media,
    })
    .select('id')
    .single()
  if (error) {
    await cleanup()
    throw toDataError(error, 'journal.create')
  }
  const id = (data as { id: string }).id

  if (v.type === 'depense' && v.depense) {
    const { error: expErr } = await db().from('journal_expenses').insert(expensePayload(userId, id, v.depense, justifs))
    if (expErr) {
      // Pas d'entrée « dépense » sans montant : on annule l'entrée créée à l'instant.
      await db().from('journal_entries').delete().eq('id', id)
      await cleanup()
      throw toDataError(expErr, 'journal.createExpense')
    }
  }
  return id
}

/**
 * Modifie une entrée et AJOUTE d'éventuelles pièces jointes (created_at reste immuable).
 * Dépense : upsert de la ligne liée ; justificatifs selon `JustificatifsChange`
 * (10 maximum ; un justificatif retiré reste dans le Storage, purge par la rétention).
 */
export async function updateJournal(
  id: string, input: JournalInput, files: File[] = [], justificatifs?: File | null | JustificatifsChange,
): Promise<void> {
  const v = validate(input)
  const change = v.type === 'depense' ? normalizeJustifs(justificatifs) : {}
  const newJustifs = change.added ?? []
  if (!LIVE) {
    const list = readDemo()
    const i = list.findIndex((e) => e.id === id)
    // Entrée de démonstration d'origine : la modification est conservée en copie de session.
    const prev = i >= 0 ? list[i] : getJournalEntry(id)
    if (!prev) throw new DataError('Événement introuvable.', 'not_found')
    const kept = keptJustifs(prev.depense ? allJustificatifs(prev.depense) : [], change.keep)
    checkJustificatifs(newJustifs, kept.length)
    const next = demoRecord(id, v, [], [...kept, ...newJustifs.map(fileToJustif)])
    const rec: JournalRecord = { ...next, images: prev.images, createdAt: prev.createdAt, createdTime: prev.createdTime }
    if (i >= 0) list[i] = rec
    else list.unshift(rec)
    writeDemo(list)
    return
  }
  const current = await getJournal(id)
  if (!current) throw new DataError('Événement introuvable.', 'not_found')
  checkFiles(files, current.media?.length ?? 0)
  const kept = keptJustifs(current.depense ? allJustificatifs(current.depense) : [], change.keep)
  checkJustificatifs(newJustifs, kept.length)
  const userId = await requireUserId()
  const added = await uploadMedia(userId, files)
  let justifs: Media[] = []
  try {
    justifs = await uploadMedia(userId, newJustifs)
  } catch (e) {
    if (added.length) await db().storage.from(DOCUMENTS_BUCKET).remove(added.map((m) => m.path))
    throw e
  }
  const uploaded = [...added.map((m) => m.path), ...justifs.map((m) => m.path)]
  const cleanup = async () => { if (uploaded.length) await db().storage.from(DOCUMENTS_BUCKET).remove(uploaded) }

  const { error } = await db()
    .from('journal_entries')
    .update({
      type: v.type,
      titre: v.titre,
      description: v.description || null,
      lieu: v.lieu || null,
      occurred_at: occurredAt(v),
      children_ids: v.childIds,
      media: [...(current.media ?? []), ...added],
    })
    .eq('id', id)
  if (error) {
    await cleanup()
    throw toDataError(error, 'journal.update')
  }

  if (v.type === 'depense' && v.depense) {
    const keepMedia = kept.map(justifToMedia).filter((m): m is Media => m !== null)
    const { error: expErr } = await db()
      .from('journal_expenses')
      .upsert(expensePayload(userId, id, v.depense, [...keepMedia, ...justifs]), { onConflict: 'entry_id' })
    if (expErr) {
      if (justifs.length) await db().storage.from(DOCUMENTS_BUCKET).remove(justifs.map((m) => m.path))
      throw toDataError(expErr, 'journal.updateExpense')
    }
  } else if (current.type === 'depense') {
    // L'entrée n'est plus une dépense : la ligne liée n'a plus de sens.
    const { error: delErr } = await db().from('journal_expenses').delete().eq('entry_id', id)
    if (delErr) throw toDataError(delErr, 'journal.dropExpense')
  }
}

/** Ajoute des pièces jointes à une entrée existante. */
export async function addJournalFiles(id: string, files: File[]): Promise<void> {
  if (!LIVE || files.length === 0) return
  const current = await getJournal(id)
  if (!current) throw new DataError('Événement introuvable.', 'not_found')
  checkFiles(files, current.media?.length ?? 0)
  const userId = await requireUserId()
  const added = await uploadMedia(userId, files)
  const { error } = await db().from('journal_entries').update({ media: [...(current.media ?? []), ...added] }).eq('id', id)
  if (error) {
    await db().storage.from(DOCUMENTS_BUCKET).remove(added.map((m) => m.path))
    throw toDataError(error, 'journal.addFiles')
  }
}

/** Suppression logique : l'entrée (valeur probante) est purgée par le job de rétention. */
export async function removeJournal(id: string): Promise<void> {
  if (!LIVE) {
    writeDemo(readDemo().filter((e) => e.id !== id))
    return
  }
  const { error } = await db().from('journal_entries').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw toDataError(error, 'journal.remove')
}

/** URL signées (15 min) des pièces jointes, dans l'ordre de `media`. */
export async function signJournalMedia(media: Media[]): Promise<(string | null)[]> {
  if (!LIVE || media.length === 0) return media.map(() => null)
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUrls(media.map((m) => m.path), SIGNED_URL_TTL)
  if (error || !data) return media.map(() => null)
  return data.map((d) => d.signedUrl ?? null)
}

/** URL signée (15 min) du justificatif d'une dépense ; null en démo ou si indisponible. */
export async function signJustificatif(j: DepenseJustificatif | undefined): Promise<string | null> {
  if (!LIVE || !j?.path) return null
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUrl(j.path, SIGNED_URL_TTL)
  return error || !data ? null : data.signedUrl
}

/** URL signées (15 min) de plusieurs justificatifs, dans l'ordre ; null en démo ou si indisponible. */
export async function signJustificatifs(list: DepenseJustificatif[]): Promise<(string | null)[]> {
  const paths = list.map((j) => j.path).filter((p): p is string => !!p)
  if (!LIVE || paths.length === 0) return list.map(() => null)
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)
  if (error || !data) return list.map(() => null)
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl ?? null]))
  return list.map((j) => (j.path ? byPath.get(j.path) ?? null : null))
}

// --- Hooks ------------------------------------------------------------------

// Pas de valeur initiale synchrone, même en démo : les données de démonstration sont
// datées relativement à « aujourd'hui » (new Date()) et le rendu serveur pourrait différer
// du client (écart d'hydratation). Chargement au montage, côté client uniquement.

export function useJournalList() {
  return useAsyncData<JournalRecord[]>(listJournal, 'journal')
}

/** Dépenses du mois "yyyy-mm" (vue Finances) : lecture dédiée, non tronquée. */
export function useMonthExpenses(month: string) {
  return useAsyncData<JournalRecord[]>(() => listMonthExpenses(month), `journal-expenses:${month}`)
}

/** Dépenses d'une plage de jours inclusive (vue Finances, filtre « période »). */
export function useExpensesInRange(fromDay: string, toDay: string) {
  return useAsyncData<JournalRecord[]>(() => listJournalExpenses({ fromDay, toDay }), `journal-expenses:${fromDay}:${toDay}`)
}

export function useJournalEntry(id: string | null) {
  return useAsyncData<JournalRecord | null>(
    () => (id ? getJournal(id) : Promise.resolve(null)),
    `journal:${id ?? ''}`,
  )
}
