/**
 * POST /api/whatsapp/webhook?key=<WACHAP_WEBHOOK_SECRET> — messages WhatsApp reçus via WaChap.
 *
 * WaChap ne signe pas ses webhooks : l'URL porte un secret long (comparaison à temps constant) et
 * seule cette URL, configurée dans le tableau de bord WaChap, est acceptée. Réponse 200 immédiate,
 * traitement après la réponse (after) : le fournisseur ne réessaie pas pendant qu'on appelle l'IA.
 * Corps ≤ 256 Ko ; format inconnu → 200 et journal de la seule STRUCTURE (aucun contenu, aucun numéro).
 * Rotation : WACHAP_WEBHOOK_SECRET_NEXT accepté en parallèle le temps de changer l'URL chez WaChap.
 */
import { after } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { extractInbound, shapeOf } from '@/lib/agent/wa-core'
import { handleInbound } from '@/lib/agent/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BODY = 256 * 1024

const same = (given: string, secret: string | undefined) => {
  if (!secret || secret.length < 24) return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorized(req: Request): Response | null {
  const current = process.env.WACHAP_WEBHOOK_SECRET?.trim()
  if (!current || current.length < 24) return jsonError(503, 'not_configured', 'Webhook WhatsApp non configuré.')
  const given = new URL(req.url).searchParams.get('key') ?? ''
  if (!same(given, current) && !same(given, process.env.WACHAP_WEBHOOK_SECRET_NEXT?.trim())) return jsonError(401, 'unauthorized', 'Clé invalide.')
  return null
}

export async function POST(req: Request) {
  const denied = authorized(req)
  if (denied) return denied
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return jsonError(413, 'payload_too_large', 'Trop volumineux.')
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return jsonError(413, 'payload_too_large', 'Trop volumineux.')
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return jsonOk({ ok: true, ignored: 'not_json' })
  }
  // 5 au plus par appel : traitement en série dans la limite de durée de la fonction.
  const messages = extractInbound(payload).slice(0, 5)
  if (!messages.length) {
    // Accusés de lecture, statuts, groupes… ou format encore inconnu : structure seule, pour adapter.
    console.info('[whatsapp] événement ignoré, structure :', JSON.stringify(shapeOf(payload)).slice(0, 1500))
    return jsonOk({ ok: true, ignored: 'no_message' })
  }
  after(async () => {
    for (const m of messages) {
      try {
        await handleInbound(m)
      } catch (e) {
        console.warn('[whatsapp] message non traité :', e instanceof Error ? e.message : e)
      }
    }
  })
  return jsonOk({ ok: true, received: messages.length })
}
