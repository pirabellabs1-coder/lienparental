/**
 * POST /api/partenaires/candidature
 *   { profil, structure, contactName, email, telephone?, territoire,
 *     site?, reseaux?, presentation, proposition, consent }
 *   → 201 { data: { ok: true } }
 *
 * Formulaire public /partenaires/candidature : envoie un e-mail à
 * PARTNERSHIP_EMAIL avec reply-to vers l'adresse du candidat. Aucune ligne
 * en base en V1 (traité à la main depuis la boîte dédiée).
 *
 * Garde-fous :
 *  - même origine (anti-CSRF, cohérent avec les autres POST du site) ;
 *  - rate-limit par IP : 5 candidatures / 10 min / IP (fail-closed si le
 *    limiteur partagé est indisponible, pour ne pas se faire inonder).
 *  - validation zod stricte ; valeurs assainies côté template (escapeHtml).
 *  - secret CAPTCHA à ajouter en V2 si le volume l'exige (hCaptcha / Turnstile).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { sameOrigin, readJson } from '@/lib/contenus/api'
import { zodIssues } from '@/lib/contenus/types'
import { clientIp, ipKey, rateLimit } from '@/lib/data/server/rate-limit'
import { fingerprint, ipBucket } from '@/lib/data/server/rate-limit-core'
import { sendEmail, cleanSubject } from '@/lib/email/send'
import { partnerApplicationEmail } from '@/lib/email/templates/partnerApplication'
import { partnerApplicationSchema } from '@/lib/partenaires/types'
import { PARTNERSHIP_EMAIL } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'
const RATE_PER_IP = 5
const RATE_WINDOW_MS = 10 * 60_000
/** Plafond global (toutes IP) : protège la boîte et le quota d'envoi du domaine contre une inondation distribuée. */
const RATE_GLOBAL = 40
const RATE_GLOBAL_WINDOW_MS = 60 * 60_000

function fail(status: number, code: string, message: string, issues?: { path: string; message: string }[]) {
  return NextResponse.json({ error: { code, message, ...(issues?.length ? { issues } : {}) } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail(403, 'bad_origin', 'Requête refusée (origine inattendue).')

  const ip = clientIp(req.headers)
  let rl = await rateLimit(ipKey('partner-apply', ip), RATE_PER_IP, RATE_WINDOW_MS, { failClosed: true })
  if (rl.ok) rl = await rateLimit('partner-apply-global', RATE_GLOBAL, RATE_GLOBAL_WINDOW_MS, { failClosed: true })
  if (!rl.ok) {
    const retryAfter = Math.max(1, rl.retryAfter)
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Trop de candidatures depuis cette adresse. Réessayez plus tard.' } },
      { status: rl.reason === 'unavailable' ? 503 : 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } },
    )
  }

  const body = await readJson(req)
  // Champ piège (invisible pour un humain) rempli : réponse identique à un succès, rien n'est envoyé.
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).url_confirm === 'string' && (body as Record<string, string>).url_confirm.trim()) {
    return NextResponse.json({ data: { ok: true } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  }

  const parsed = partnerApplicationSchema.safeParse(body)
  if (!parsed.success) {
    return fail(422, 'invalid', 'Formulaire incomplet ou invalide.', zodIssues(parsed.error))
  }

  const receivedAtIso = new Date().toISOString()
  const rendered = partnerApplicationEmail({ ...parsed.data, receivedAtIso, ipBucket: ipBucket(ip) })

  const res = await sendEmail({
    to: PARTNERSHIP_EMAIL,
    subject: cleanSubject(rendered.subject),
    html: rendered.html,
    replyTo: parsed.data.email,
    // Un rejeu (double-clic, retry réseau) ne doublera pas l'e-mail dans la boîte interne.
    // Empreinte HMAC du contenu : un double envoi identique n'arrive qu'une fois, deux candidatures différentes passent.
    idempotencyKey: `partner-apply:${fingerprint(JSON.stringify(parsed.data))}`,
  })

  if (!res.ok) {
    console.warn('[partenaires] envoi impossible (%s)', res.error)
    return fail(503, 'unavailable', 'Envoi impossible. Réessayez dans quelques minutes.')
  }

  // skipped=true quand RESEND_API_KEY est absent (dev / recette) : on garde 201 pour
  // ne pas faire échouer le formulaire en démo, mais on consigne la trace.
  if (res.skipped) console.info('[partenaires] e-mail non envoyé (RESEND_API_KEY absent) — candidature acceptée.')

  return NextResponse.json({ data: { ok: true } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
