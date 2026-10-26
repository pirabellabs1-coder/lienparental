import 'server-only'
/**
 * Santé partagée : lecture et re-chiffrement des entrées d'un enfant.
 * Rappel (0260 / medical-crypto) : clé dérivée de l'AUTEUR de la ligne
 * (HKDF salt = user_id), AAD = "<childId>:<kind>:<rowId>" pour les entrées,
 * AAD = "<childId>" pour children.infos_medicales (clé du titulaire).
 * La lecture passe par le client RLS de l'appelant : seules les lignes
 * autorisées par 0340 (gardien « parent » actif) sont renvoyées.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  decryptMedical, encryptMedical, isEncryptedPayload, type EncryptedPayload,
} from '@/lib/data/server/medical-crypto'

export const HEALTH_KINDS = ['vaccination', 'traitement'] as const
export type HealthKind = (typeof HEALTH_KINDS)[number]
export const HEALTH_TABLE: Record<HealthKind, string> = { vaccination: 'child_vaccinations', traitement: 'child_treatments' }

export type HealthRow = { kind: HealthKind; id: string; user_id: string; payload: unknown; created_at: string }

export const healthAad = (childId: string, kind: HealthKind, rowId: string) => `${childId}:${kind}:${rowId}`

export async function loadHealthRows(db: SupabaseClient, childId: string): Promise<HealthRow[] | null> {
  const load = (kind: HealthKind) =>
    db.from(HEALTH_TABLE[kind]).select('id, user_id, payload, created_at').eq('child_id', childId)
      .order('created_at', { ascending: false }).limit(500)
  const [v, t] = await Promise.all([load('vaccination'), load('traitement')])
  if (v.error || t.error) return null
  type R = Omit<HealthRow, 'kind'>
  return [
    ...((v.data ?? []) as R[]).map((r) => ({ ...r, kind: 'vaccination' as const })),
    ...((t.data ?? []) as R[]).map((r) => ({ ...r, kind: 'traitement' as const })),
  ]
}

/** Déchiffre une entrée ; null si illisible (clé changée, payload altéré). */
export function openHealthRow(childId: string, row: HealthRow): unknown | null {
  if (!isEncryptedPayload(row.payload)) return null
  try {
    return decryptMedical(row.user_id, healthAad(childId, row.kind, row.id), row.payload)
  } catch {
    return null
  }
}

/**
 * Re-chiffre une entrée pour un autre enfant (même auteur, nouvel AAD).
 * Une entrée déjà illisible est transmise telle quelle : elle le restera,
 * mais la fusion ne la perd pas.
 */
export function rewrapHealthRow(fromChildId: string, toChildId: string, row: HealthRow): EncryptedPayload | unknown {
  const clear = openHealthRow(fromChildId, row)
  if (clear === null) return row.payload
  return encryptMedical(row.user_id, healthAad(toChildId, row.kind, row.id), clear)
}

/** Infos médicales générales de la fiche (clé du titulaire, AAD = id de l'enfant). */
export function openChildMedical(ownerId: string, childId: string, payload: unknown): unknown | null {
  if (!isEncryptedPayload(payload)) return null
  try {
    return decryptMedical(ownerId, childId, payload)
  } catch {
    return null
  }
}

/**
 * Refus EXPLICITE de la santé pour un proche (docs/FAMILLE.md §1) : quand la fiche n'est pas
 * visible par la RLS (`children_select_family` exige titulaire ou parent), on distingue un
 * proche lié (403 `health_not_shared`, message clair) d'un tiers (404 inchangé, aucune
 * information divulguée). `list_family_children()` (0340) ne renvoie que les enfants dont
 * l'appelant est membre actif : un tiers n'apprend donc rien de plus qu'avec un 404.
 */
export const HEALTH_NOT_SHARED_MESSAGE =
  'Les informations de santé de cet enfant sont réservées à ses parents. En tant que proche, vous voyez son prénom, sa classe et le calendrier partagé.'

export async function isProcheOf(db: SupabaseClient, childId: string): Promise<boolean> {
  try {
    const { data, error } = await db.rpc('list_family_children')
    if (error || !Array.isArray(data)) return false
    return (data as Array<{ child_id: string; my_role: string | null }>).some((c) => c.child_id === childId && c.my_role === 'proche')
  } catch {
    return false
  }
}
