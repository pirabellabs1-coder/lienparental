/**
 * Superposition d'une traduction sur le français (module PUR, sans schéma zod) : utilisable côté
 * navigateur sans embarquer tous les schémas de contenu. La validation par type (CONTENT_SCHEMAS)
 * est dans lib/contenus/i18n.ts, qui ré-exporte ce module.
 */
import { INVARIANT_KEYS } from './i18n-invariants'
import { TRANSLATION_LOCALES, type Translations } from './locale'

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Ne garde que { en?: objet, pt?: objet } (colonne jsonb, cookie, corps de requête…). */
export function sanitizeTranslations(raw: unknown): Translations {
  if (!isPlainObject(raw)) return {}
  const out: Translations = {}
  for (const l of TRANSLATION_LOCALES) if (isPlainObject(raw[l])) out[l] = raw[l]
  return out
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

/** Vrai si un chemin d'éditeur (« ou.0.url », « miseEnPage.objet ») désigne un champ invariant. */
export function isInvariantPath(path: string | undefined): boolean {
  if (!path) return false
  return path.split('.').some((seg) => INVARIANT_KEYS.has(seg))
}

export type Overlay = { value: unknown; mismatch: boolean }

/**
 * Superpose `tr` sur `fr` : clés et ordre du français, invariants du français, textes de la
 * traduction quand ils sont présents et non vides. `mismatch` signale une structure différente
 * (tableau de longueur différente, objet/tableau/texte attendu mais autre chose reçu) ; la
 * valeur renvoyée reste alors une superposition « au mieux » (index par index), utile pour
 * pré-remplir l'éditeur, mais la lecture publique la refuse.
 */
export function overlayTranslation(fr: unknown, tr: unknown): Overlay {
  if (Array.isArray(fr)) {
    if (tr === undefined || tr === null) return { value: clone(fr), mismatch: false }
    if (!Array.isArray(tr)) return { value: clone(fr), mismatch: true }
    let mismatch = tr.length !== fr.length
    const value = fr.map((v, i) => {
      const r = overlayTranslation(v, tr[i])
      mismatch ||= r.mismatch
      return r.value
    })
    return { value, mismatch }
  }
  if (isPlainObject(fr)) {
    if (tr === undefined || tr === null) return { value: clone(fr), mismatch: false }
    if (!isPlainObject(tr)) return { value: clone(fr), mismatch: true }
    let mismatch = false
    const value: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fr)) {
      if (INVARIANT_KEYS.has(k)) {
        value[k] = clone(v)
        continue
      }
      const r = overlayTranslation(v, tr[k])
      mismatch ||= r.mismatch
      value[k] = r.value
    }
    return { value, mismatch }
  }
  if (typeof fr === 'string') {
    if (tr === undefined || tr === null) return { value: fr, mismatch: false }
    if (typeof tr !== 'string') return { value: fr, mismatch: true }
    // Rien à traduire (texte facultatif vide en français) : on n'ajoute pas d'information.
    if (fr === '') return { value: '', mismatch: false }
    return { value: tr.trim() ? tr : fr, mismatch: false }
  }
  // Nombres, booléens, null : jamais traduits.
  return { value: fr, mismatch: false }
}
