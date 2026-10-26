import { randomUUID } from 'node:crypto'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { isPlausibleToken, jsonError, jsonOk, sniffMime } from '@/lib/data/server/http'
import { clientIp, ipKey, rateLimit, rateLimitedResponse } from '@/lib/data/server/rate-limit'
import {
  NOT_FOUND_MESSAGE, WITNESS_BUCKET, WITNESS_MAX_FILE_BYTES, resolveRequest, serviceClientOrNull,
} from '@/lib/data/server/witness'

// POST /api/temoin/[token]/upload — dépôt d'UNE pièce jointe par le témoin.
// 1) jeton validé via RPC (demande active) ; 2) taille ≤ 10 Mo ; 3) type déterminé
// par les octets du fichier (PDF/JPEG/PNG/WebP), jamais par le Content-Type client ;
// 4) écriture service_role dans le bucket privé `temoignage-attachments/<request_id>/<uuid>.<ext>`.

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
/** Plafond d'objets par demande (tous témoins confondus). */
const MAX_OBJECTS_PER_REQUEST = 60

export async function POST(req: Request, ctx: Ctx) {
  if (!SUPABASE_ENABLED) return jsonError(503, 'not_configured', 'Service indisponible.')

  const rl = await rateLimit(ipKey('temoin:upload', clientIp(req.headers)), 15, 10 * 60_000, { failClosed: true })
  if (!rl.ok) return rateLimitedResponse(rl, 'Trop de fichiers envoyés. Patientez quelques minutes.')

  const { token } = await ctx.params
  if (!isPlausibleToken(token)) return jsonError(404, 'not_found', NOT_FOUND_MESSAGE)

  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > WITNESS_MAX_FILE_BYTES + 64 * 1024) return jsonError(413, 'too_large', 'Fichier trop volumineux (10 Mo maximum).')

  let r
  try {
    r = await resolveRequest(token)
  } catch {
    return jsonError(503, 'unavailable', 'Service momentanément indisponible.')
  }
  if (!r) return jsonError(404, 'not_found', NOT_FOUND_MESSAGE)

  const svc = serviceClientOrNull()
  if (!svc) return jsonError(503, 'unavailable', 'L’envoi de pièces jointes est momentanément indisponible.')

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return jsonError(422, 'invalid', 'Aucun fichier reçu.')
  if (file.size <= 0) return jsonError(422, 'empty', 'Le fichier est vide.')
  if (file.size > WITNESS_MAX_FILE_BYTES) return jsonError(413, 'too_large', 'Fichier trop volumineux (10 Mo maximum).')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffMime(bytes.subarray(0, 16))
  if (!mime) return jsonError(415, 'bad_type', 'Formats acceptés : PDF, JPG, PNG, WebP.')

  const { data: existing, error: listErr } = await svc.storage.from(WITNESS_BUCKET).list(r.id, { limit: MAX_OBJECTS_PER_REQUEST + 1 })
  if (listErr) return jsonError(503, 'unavailable', 'Envoi momentanément indisponible.')
  if ((existing ?? []).length >= MAX_OBJECTS_PER_REQUEST) return jsonError(409, 'limit_reached', 'Nombre maximal de pièces jointes atteint pour ce lien.')

  const path = `${r.id}/${randomUUID()}.${EXT[mime]}`
  const { error } = await svc.storage.from(WITNESS_BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
  if (error) {
    console.warn('[api/temoin/upload] échec Storage')
    return jsonError(500, 'storage_error', 'L’envoi du fichier a échoué. Réessayez.')
  }
  return jsonOk({ path, mime, size: file.size }, 201)
}
