/**
 * POST /api/whatsapp/webhook — messages WhatsApp reçus via Twilio (API officielle Meta).
 *
 * Authentification : signature X-Twilio-Signature (HMAC-SHA1 avec l'Auth Token) calculée sur l'URL
 * publique exacte (NEXT_PUBLIC_SITE_URL + chemin) et les paramètres du formulaire ; requête non signée
 * ou mal signée → 403. Réponse TwiML vide immédiate ; traitement après la réponse (after), pour que
 * Twilio ne réessaie pas pendant l'appel à l'IA. Corps ≤ 64 Ko. Les rappels de statut (MessageStatus,
 * sans texte) sont acceptés et ignorés.
 */
import { after } from 'next/server'
import { jsonError } from '@/lib/data/server/http'
import { SITE } from '@/lib/seo/site'
import { validTwilioSignature } from '@/lib/agent/twilio'
import { fromTwilioForm } from '@/lib/agent/wa-core'
import { handleInbound } from '@/lib/agent/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BODY = 64 * 1024
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const twiml = () => new Response(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) return jsonError(503, 'not_configured', 'WhatsApp non configuré.')
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return jsonError(413, 'payload_too_large', 'Trop volumineux.')
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return jsonError(413, 'payload_too_large', 'Trop volumineux.')
  const params = Object.fromEntries(new URLSearchParams(raw))
  // URL publique telle que configurée chez Twilio (derrière le proxy Vercel, req.url peut différer).
  const url = `${SITE}${new URL(req.url).pathname}${new URL(req.url).search}`
  if (!validTwilioSignature(url, params, req.headers.get('x-twilio-signature'))) return jsonError(403, 'bad_signature', 'Signature invalide.')
  const message = fromTwilioForm(params)
  if (message) {
    after(async () => {
      try {
        await handleInbound(message)
      } catch (e) {
        console.warn('[whatsapp] message non traité :', e instanceof Error ? e.message : e)
      }
    })
  }
  return twiml()
}
