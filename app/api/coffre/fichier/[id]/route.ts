import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { DENIED_MESSAGES, requireAuthedUser } from '@/lib/auth/guard'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireVaultUnlocked, vaultDeniedResponse } from '@/lib/vault-lock'

// GET /api/coffre/fichier/[id]?mode=telecharger|apercu[&format=json]
//
// Seule porte d'accès aux fichiers du coffre depuis l'application : le navigateur ne
// génère plus d'URL signée lui-même (lib/data/vault.ts).
//   1. session revalidée (requireAuthedUser : getUser + aal2 si 2FA) ;
//   2. coffre déverrouillé pour CETTE session (cookie signé ; la base l'exige aussi, 0370) ;
//   3. document lu avec le client RLS de l'utilisateur : propriétaire, ou gardien d'un enfant
//      commun pour un document explicitement partagé (0340) ; contrôle applicatif en plus ;
//   4. URL signée de 60 s générée avec le client de l'UTILISATEUR (politiques Storage
//      appliquées), jamais avec le service_role.
// Réponse : redirection 302 vers l'URL signée, ou { url, expiresIn } si `format=json`
// (le client affiche alors proprement les refus : coffre verrouillé, introuvable…).
// Les routes publiques (témoin, partage par lien, partage avocat) ne passent pas ici.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SIGNED_SECONDS = 60
const INLINE_MIME = /^(application\/pdf|image\/(jpeg|png|webp))$/

const querySchema = z.object({
  mode: z.enum(['telecharger', 'apercu']).default('telecharger'),
  format: z.enum(['redirect', 'json']).default('redirect'),
})

type Ctx = { params: Promise<{ id: string }> }
type DocRow = { id: string; user_id: string; name: string; mime: string; storage_path: string; family_shared: boolean | null }

const NOT_FOUND = 'Document introuvable ou inaccessible.'

/** Chemin rangé sous le dossier du propriétaire, sans traversée ni caractère de contrôle. */
function ownedPath(path: string, ownerId: string): boolean {
  return path.startsWith(`${ownerId}/`)
    && path.length > ownerId.length + 1
    && path.length <= 1024
    && !path.includes('..')
    && !path.includes('//')
    && !path.includes('\\')
    && !/[\u0000-\u001f\u007f]/.test(path)
}

/** Nom de téléchargement : nom du document + extension du fichier stocké, sans caractère réservé. */
function downloadName(d: DocRow): string {
  const ext = (d.storage_path.split('.').pop() ?? '').toLowerCase()
  const base = d.name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'document'
  return ext && /^[a-z0-9]{1,5}$/.test(ext) && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return jsonError(404, 'not_found', NOT_FOUND)
  const url = new URL(req.url)
  const q = querySchema.safeParse({ mode: url.searchParams.get('mode') ?? undefined, format: url.searchParams.get('format') ?? undefined })
  if (!q.success) return jsonError(422, 'invalid', 'Requête invalide.')

  // Démonstration : aucun fichier réel n'est stocké.
  if (!SUPABASE_ENABLED) return jsonError(404, 'demo', 'Les fichiers ne sont pas disponibles en mode démonstration.')

  const auth = await requireAuthedUser()
  if (!auth.ok) {
    return auth.reason === 'mfa_required'
      ? jsonError(403, 'mfa_required', DENIED_MESSAGES.mfa_required)
      : jsonError(401, 'unauthenticated', DENIED_MESSAGES.unauthenticated)
  }
  const { supabase, user } = auth

  const vault = await requireVaultUnlocked()
  if (!vault.ok) return vaultDeniedResponse(vault)
  if (vault.principal.userId !== user.id) return jsonError(401, 'unauthenticated', DENIED_MESSAGES.unauthenticated)

  const rl = await rateLimit(userKey('coffre:fichier', user.id), 60, 60_000, { failClosed: true })
  if (!rl.ok) return rateLimitedResponse(rl, 'Trop de demandes. Patientez un instant.')

  // Colonnes récentes (family_shared, 0340) absentes des types générés : client non typé.
  const db = supabase as unknown as SupabaseClient
  const { data, error } = await db
    .from('documents')
    .select('id, user_id, name, mime, storage_path, family_shared')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.warn(`[coffre/fichier] lecture a échoué (code ${error.code ?? 'inconnu'})`)
    return jsonError(503, 'unavailable', 'Fichier momentanément indisponible. Réessayez.')
  }
  const d = data as DocRow | null
  // Propriétaire, ou document explicitement partagé et visible par la RLS famille (gardien actif).
  if (!d || (d.user_id !== user.id && !d.family_shared)) return jsonError(404, 'not_found', NOT_FOUND)
  if (!ownedPath(d.storage_path, d.user_id)) {
    console.warn('[coffre/fichier] storage_path hors du dossier propriétaire refusé')
    return jsonError(404, 'not_found', NOT_FOUND)
  }

  // Aperçu uniquement pour les formats affichables sans risque par le navigateur.
  const inline = q.data.mode === 'apercu' && INLINE_MIME.test(d.mime)
  const { data: signed, error: sErr } = await db.storage
    .from('documents')
    .createSignedUrl(d.storage_path, SIGNED_SECONDS, inline ? undefined : { download: downloadName(d) })
  if (sErr || !signed?.signedUrl) {
    console.warn('[coffre/fichier] signature refusée ou indisponible')
    return jsonError(503, 'unavailable', 'Fichier momentanément indisponible. Réessayez.')
  }

  if (q.data.format === 'json') {
    const res = jsonOk({ url: signed.signedUrl, expiresIn: SIGNED_SECONDS, inline })
    res.headers.set('Referrer-Policy', 'no-referrer')
    return res
  }
  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}
