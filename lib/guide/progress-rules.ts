/**
 * Règles PURES de progression du Guide (sans React ni Supabase : testables).
 *
 * Une étape de parcours liée à une fiche (`element.fiche`) et cette fiche décrivent la MÊME
 * démarche : elles partagent un seul statut. Source de vérité : le statut de la fiche entière
 * (`fiche:<slug>:_fiche`) dès qu'il a été enregistré ; à défaut, l'ancien statut propre à
 * l'étape (progressions enregistrées avant la synchronisation).
 * - « Démarche terminée » sur la fiche → l'étape est terminée dans tous les parcours ;
 * - changer l'étape dans un parcours → la fiche (et les autres parcours) suivent.
 */
import { FICHE_ELEMENT, type ProgressRefType, type ProgressStatus } from './types'

export type ProgressKey = { refType: ProgressRefType; slug: string; element: string }

/** Lecture brute d'un statut : `undefined` si jamais enregistré. */
export type RawProgressReader = (refType: ProgressRefType, slug: string, element: string) => ProgressStatus | undefined

/** Statut effectif d'une étape de parcours. */
export function parcoursElementStatus(
  read: RawProgressReader,
  parcoursSlug: string,
  element: { id: string; fiche?: string },
): ProgressStatus {
  if (element.fiche) {
    const fiche = read('fiche', element.fiche, FICHE_ELEMENT)
    if (fiche) return fiche
  }
  return read('parcours', parcoursSlug, element.id) ?? 'a_faire'
}

/**
 * Clés à écrire quand l'utilisateur change le statut d'une étape de parcours, DANS L'ORDRE
 * d'écriture : la fiche (source de vérité) d'abord, puis l'étape. Si seule la fiche passe,
 * le statut effectif affiché (lu sur la fiche) est déjà le bon.
 */
export function parcoursElementWrites(parcoursSlug: string, element: { id: string; fiche?: string }): ProgressKey[] {
  const own: ProgressKey = { refType: 'parcours', slug: parcoursSlug, element: element.id }
  return element.fiche ? [{ refType: 'fiche', slug: element.fiche, element: FICHE_ELEMENT }, own] : [own]
}

/**
 * Écrit les clés une par une, dans l'ordre. À la première erreur, les écritures suivantes sont
 * abandonnées et l'état est RECHARGÉ depuis la source (`resync`) au lieu d'un retour arrière local :
 * une écriture déjà acceptée par la base ne doit pas disparaître de l'écran. L'erreur d'origine
 * est relancée (le composant l'affiche) ; un échec de `resync` ne la masque pas.
 */
export async function persistOrResync(
  writes: readonly ProgressKey[],
  persist: (w: ProgressKey) => Promise<void>,
  resync: () => Promise<void>,
): Promise<void> {
  try {
    for (const w of writes) await persist(w)
  } catch (e) {
    try { await resync() } catch { /* resync gère son propre repli ; l'erreur d'écriture prime */ }
    throw e
  }
}
