import 'server-only'
/**
 * Accès témoin anonyme — helpers serveur partagés par /api/temoin/[token]/*.
 *
 * Règles :
 * - La demande n'est JAMAIS lue directement : uniquement via les RPC SECURITY DEFINER
 *   get_testimony_request_by_token / get_testimony_request_people (colonnes publiques).
 * - Ces RPC (et record_testimony_submission) sont réservées au service_role (0270) :
 *   la clé anon ne peut plus les appeler, ce qui empêchait de contourner la limitation
 *   de débit par IP de ces routes ou d'injecter un ip_hash arbitraire.
 * - Réponse uniforme quand le lien est inconnu, expiré ou révoqué (pas d'oracle).
 * - Les réponses du client service_role ne sont jamais renvoyées brutes au témoin.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

export const WITNESS_BUCKET = 'temoignage-attachments'
export const WITNESS_MAX_FILE_BYTES = 10 * 1024 * 1024
export const WITNESS_MAX_FILES = 5
/** Plafond d'envois par lien (un lien peut être partagé à plusieurs témoins). */
export const WITNESS_MAX_SUBMISSIONS = 20

export type PublicRequest = {
  id: string
  parentPrenom: string | null
  parents: string[]
  enfants: string[]
  expiresAt: string
}

/** Client service_role si configuré, sinon null (fonctionnalités dépendantes désactivées proprement). */
export function serviceClientOrNull(): SupabaseClient | null {
  try {
    return createServiceClient() as unknown as SupabaseClient
  } catch {
    return null
  }
}

/** Demande active pour ce jeton, ou null. Lève une erreur si le service est indisponible (→ 503). */
export async function resolveRequest(token: string): Promise<PublicRequest | null> {
  const sb = serviceClientOrNull()
  if (!sb) throw new Error('service_unavailable')
  const [req, people] = await Promise.all([
    sb.rpc('get_testimony_request_by_token', { p_token: token }),
    sb.rpc('get_testimony_request_people', { p_token: token }),
  ])
  if (req.error) {
    console.warn('[witness] RPC get_testimony_request_by_token', req.error.code ?? 'unknown')
    throw new Error('rpc_failed')
  }
  const row = (Array.isArray(req.data) ? req.data[0] : req.data) as
    | { id: string; parent_prenom: string | null; expires_at: string }
    | undefined
  if (!row) return null
  const p = (Array.isArray(people.data) ? people.data[0] : people.data) as { parents: string[] | null; enfants: string[] | null } | undefined
  return {
    id: row.id,
    parentPrenom: row.parent_prenom,
    parents: p?.parents ?? [],
    enfants: p?.enfants ?? [],
    expiresAt: row.expires_at,
  }
}

export const NOT_FOUND_MESSAGE = 'Ce lien de témoignage n’est pas valide ou a expiré. Contactez la personne qui vous l’a envoyé.'
