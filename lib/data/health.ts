'use client'

/**
 * Espace Santé d'un enfant — vaccinations et traitements.
 * - Supabase : tables `child_vaccinations` / `child_treatments` (0260), contenu chiffré
 *   AES-256-GCM CÔTÉ SERVEUR via /api/enfants/[id]/sante (la clé ne quitte jamais le serveur).
 *   Les données de santé voyagent uniquement dans le corps des requêtes, jamais dans l'URL.
 * - Démo : données fictives de Lina + ajouts/suppressions en sessionStorage.
 *
 * Les rendez-vous (calendar_events type `sante`), documents (catégorie Santé) et entrées
 * Journal `sante` sont lus par l'écran via leurs couches respectives, filtrés sur l'enfant.
 */
import { z } from 'zod'
import { DataError, LIVE, dataMsg, useAsyncData } from './core'
import { addDaysToKey } from '@/lib/tz'

export type Vaccination = {
  id: string
  nom: string
  /** Date d'administration YYYY-MM-DD */
  date: string
  /** Rappel prévu YYYY-MM-DD */
  rappel?: string
  /** false = entrée ajoutée par un autre parent lié (lecture seule, docs/FAMILLE.md). */
  byMe?: boolean
  createdAt?: string
}

export type Treatment = {
  id: string
  nom: string
  posologie?: string
  debut: string
  fin?: string
  /** false = entrée ajoutée par un autre parent lié (lecture seule, docs/FAMILLE.md). */
  byMe?: boolean
  createdAt?: string
}

export type ChildHealth = { vaccinations: Vaccination[]; traitements: Treatment[]; unavailable?: boolean }
export type HealthKind = 'vaccination' | 'traitement'

// --- Validation (miroir de la route serveur, qui reste l'autorité) ----------

// Messages résolus à chaque validation (langue de l'interface) : z.lazy reconstruit le schéma.
const day = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, dataMsg('health.invalidDate'))
const optDay = () => day().optional().or(z.literal('').transform(() => undefined))
const maxChars = (max: number) => dataMsg('health.maxChars', { max })

const buildVaccinationInput = () => z.object({
  nom: z.string().trim().min(1, dataMsg('health.vaccineNameRequired')).max(80, maxChars(80)),
  date: z.string().min(1, dataMsg('health.vaccineDateRequired')).regex(/^\d{4}-\d{2}-\d{2}$/, dataMsg('health.invalidDate')),
  rappel: optDay(),
}).refine((v) => !v.rappel || v.rappel > v.date, { message: dataMsg('health.boosterAfterVaccine'), path: ['rappel'] })

const buildTreatmentInput = () => z.object({
  nom: z.string().trim().min(1, dataMsg('health.treatmentNameRequired')).max(80, maxChars(80)),
  posologie: z.string().trim().max(160, maxChars(160)).optional(),
  debut: z.string().min(1, dataMsg('health.startDateRequired')).regex(/^\d{4}-\d{2}-\d{2}$/, dataMsg('health.invalidDate')),
  fin: optDay(),
}).refine((t) => !t.fin || t.fin >= t.debut, { message: dataMsg('health.endAfterStart'), path: ['fin'] })

export const vaccinationInput = z.lazy(buildVaccinationInput)
export const treatmentInput = z.lazy(buildTreatmentInput)

export type VaccinationInput = z.input<typeof vaccinationInput>
export type TreatmentInput = z.input<typeof treatmentInput>

// --- Démo ---------------------------------------------------------------------

const DEMO: Record<string, ChildHealth> = {
  c_1: {
    vaccinations: [
      { id: 'vac_1', nom: 'Hexavalent (DTCaP-Hib-Hépatite B)', date: '2020-04-14' },
      { id: 'vac_2', nom: 'Fièvre jaune', date: '2020-06-02' },
      { id: 'vac_3', nom: 'ROR (2e dose)', date: '2020-11-10' },
      { id: 'vac_4', nom: 'DTCaP (rappel 6 ans)', date: '2025-06-03', rappel: '2030-06-03' },
      { id: 'vac_5', nom: 'Méningocoque B (3e dose)', date: '2020-05-12', rappel: '2026-11-20' },
    ],
    traitements: [
      { id: 'trt_1', nom: 'Cétirizine (allergie au pollen)', posologie: '5 gouttes le soir', debut: '2026-09-01', fin: '2026-11-30' },
      { id: 'trt_2', nom: 'Amoxicilline', posologie: '2 prises par jour pendant 7 jours', debut: '2026-03-02', fin: '2026-03-09' },
    ],
  },
}

const demoKey = (id: string) => `lp:child-health:${id}`
type DemoDelta = { added: { vaccinations: Vaccination[]; traitements: Treatment[] }; removed: string[] }

function readDelta(id: string): DemoDelta {
  try {
    const raw = window.sessionStorage.getItem(demoKey(id))
    if (raw) return JSON.parse(raw) as DemoDelta
  } catch { /* stockage indisponible */ }
  return { added: { vaccinations: [], traitements: [] }, removed: [] }
}

function writeDelta(id: string, d: DemoDelta) {
  try { window.sessionStorage.setItem(demoKey(id), JSON.stringify(d)) } catch { /* ignore */ }
}

function demoHealth(id: string, withDelta: boolean): ChildHealth {
  const base = DEMO[id] ?? { vaccinations: [], traitements: [] }
  if (!withDelta) return base
  const d = readDelta(id)
  return {
    vaccinations: [...base.vaccinations, ...d.added.vaccinations].filter((v) => !d.removed.includes(v.id)),
    traitements: [...base.traitements, ...d.added.traitements].filter((t) => !d.removed.includes(t.id)),
  }
}

// --- HTTP -----------------------------------------------------------------------

const url = (childId: string) => `/api/enfants/${encodeURIComponent(childId)}/sante`

async function call<T>(childId: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url(childId), { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  } catch {
    throw new DataError(dataMsg('errors.network'), 'network')
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null
  if (!res.ok) throw new DataError(body?.error?.message ?? dataMsg('errors.generic'), `http_${res.status}`)
  return body as T
}

function invalid(e: z.ZodError): DataError {
  return new DataError(e.issues[0]?.message ?? dataMsg('errors.invalid'), 'invalid')
}

// --- API ------------------------------------------------------------------------

const byDateDesc = <T,>(get: (x: T) => string) => (a: T, b: T) => get(b).localeCompare(get(a))

function sorted(h: ChildHealth): ChildHealth {
  return {
    ...h,
    vaccinations: [...h.vaccinations].sort(byDateDesc((v) => v.date)),
    traitements: [...h.traitements].sort(byDateDesc((t) => t.debut)),
  }
}

export async function getChildHealth(childId: string): Promise<ChildHealth> {
  if (!LIVE) return sorted(demoHealth(childId, true))
  if (!z.string().uuid().safeParse(childId).success) return { vaccinations: [], traitements: [] }
  return sorted(await call<ChildHealth>(childId))
}

export async function addVaccination(childId: string, input: VaccinationInput): Promise<Vaccination> {
  const p = vaccinationInput.safeParse(input)
  if (!p.success) throw invalid(p.error)
  const item = { nom: p.data.nom, date: p.data.date, ...(p.data.rappel ? { rappel: p.data.rappel } : {}) }
  if (!LIVE) {
    const v: Vaccination = { id: `vac_${crypto.randomUUID()}`, ...item }
    const d = readDelta(childId)
    d.added.vaccinations.push(v)
    writeDelta(childId, d)
    return v
  }
  const res = await call<{ item: Vaccination }>(childId, { method: 'POST', body: JSON.stringify({ kind: 'vaccination', item }) })
  return res.item
}

export async function addTreatment(childId: string, input: TreatmentInput): Promise<Treatment> {
  const p = treatmentInput.safeParse(input)
  if (!p.success) throw invalid(p.error)
  const item = {
    nom: p.data.nom,
    debut: p.data.debut,
    ...(p.data.posologie ? { posologie: p.data.posologie } : {}),
    ...(p.data.fin ? { fin: p.data.fin } : {}),
  }
  if (!LIVE) {
    const t: Treatment = { id: `trt_${crypto.randomUUID()}`, ...item }
    const d = readDelta(childId)
    d.added.traitements.push(t)
    writeDelta(childId, d)
    return t
  }
  const res = await call<{ item: Treatment }>(childId, { method: 'POST', body: JSON.stringify({ kind: 'traitement', item }) })
  return res.item
}

export async function removeHealthItem(childId: string, kind: HealthKind, itemId: string): Promise<void> {
  if (!LIVE) {
    const d = readDelta(childId)
    if (!d.removed.includes(itemId)) d.removed.push(itemId)
    writeDelta(childId, d)
    return
  }
  await call<{ ok: true }>(childId, { method: 'DELETE', body: JSON.stringify({ kind, itemId }) })
}

// --- Statuts dérivés (affichage) ----------------------------------------------------

/** Traitement en cours à la date `today` (YYYY-MM-DD). */
export function isTreatmentActive(t: Treatment, today: string): boolean {
  return t.debut <= today && (!t.fin || t.fin >= today)
}

/** Rappel : « à venir » (≤ 60 jours), « dépassé », « prévu » ou aucun. */
export function reminderStatus(v: Vaccination, today: string): 'none' | 'overdue' | 'soon' | 'planned' {
  if (!v.rappel) return 'none'
  if (v.rappel < today) return 'overdue'
  const lim = addDaysToKey(today, 60)
  return v.rappel <= lim ? 'soon' : 'planned'
}

// --- Hook -----------------------------------------------------------------------------

export function useChildHealth(childId: string) {
  return useAsyncData<ChildHealth>(
    () => getChildHealth(childId),
    `health:${childId}`,
    LIVE ? undefined : sorted(demoHealth(childId, false)),
  )
}
