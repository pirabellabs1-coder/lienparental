/**
 * Validation des éléments de l'attestation (art. 202 CPC) — partagée par le parcours témoin
 * (contrôle immédiat) et par POST /api/temoin/[token] (contrôle qui fait foi, côté serveur).
 * Les messages sont des CODES (traduits au rendu : public.witness.identity.errors.<code>).
 */
import { z } from 'zod'
import { PARTY_TIES, WITNESS_LOCALES } from './attestation'

const text = (max: number) => z.string().trim().min(1, 'required').max(max, 'tooLong')
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid')

function dayValue(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(t) ? NaN : t
}

/** Chemin d'un objet déposé par /api/temoin/[token]/upload (bucket privé, contrôle d'appartenance côté serveur). */
export const witnessFilePathSchema = z.string().max(200).regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/)

export const witnessIdentitySchema = z.object({
  nom: text(80),
  prenoms: text(120),
  dateNaissance: isoDay.refine((v) => {
    const t = dayValue(v)
    return !Number.isNaN(t) && t < Date.now() && new Date(t).getUTCFullYear() >= 1900
  }, 'birthDateInvalid'),
  lieuNaissance: text(120),
  adresse: text(200),
  cp: text(12),
  ville: text(100),
  pays: z.string().trim().max(60, 'tooLong').optional(),
  profession: text(120),
}).strict()

export const witnessTieSchema = z.object({
  kind: z.enum(PARTY_TIES),
  detail: z.string().trim().max(300, 'tooLong'),
}).strict().refine((v) => v.kind === 'none' || v.detail.length > 0, { message: 'tieDetailRequired', path: ['detail'] })

/** Date de signature : le jour même (± 1 jour pour les fuseaux, ex. Guyane UTC-3 / Paris). */
export const signatureDaySchema = isoDay.refine((v) => {
  const t = dayValue(v)
  return !Number.isNaN(t) && Math.abs(t - Date.now()) <= 2 * 86_400_000
}, 'signDateInvalid')

export const witnessDeclarationSchema = z.object({
  identity: witnessIdentitySchema,
  tie: witnessTieSchema,
  /** Case « Je sais que cette attestation est destinée à être produite en justice… » cochée. */
  mention: z.literal(true),
  place: text(100),
  date: signatureDaySchema,
  /** Langue dans laquelle le témoin a lu la traduction (le texte enregistré reste en français). */
  locale: z.enum(WITNESS_LOCALES),
}).strict()

export type WitnessDeclarationInput = z.infer<typeof witnessDeclarationSchema>

/** Champs d'identité en erreur (code par champ) pour l'affichage du formulaire. */
export function identityErrors(input: unknown): Record<string, string> {
  const r = witnessIdentitySchema.safeParse(input)
  if (r.success) return {}
  const out: Record<string, string> = {}
  for (const i of r.error.issues) {
    const k = String(i.path[0] ?? 'form')
    const raw = (input as Record<string, unknown> | null)?.[k]
    if (!out[k] && typeof raw === 'string' && raw.trim() === '') { out[k] = 'required'; continue }
    if (!out[k]) out[k] = i.message === 'required' || i.message === 'tooLong' || i.message === 'birthDateInvalid' || i.message === 'dateInvalid' ? i.message : 'invalid'
  }
  return out
}
