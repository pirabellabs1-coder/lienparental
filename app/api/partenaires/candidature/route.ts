/**
 * POST /api/partenaires/candidature   (multipart/form-data)
 *   champs : profil, structure, contactName, email, telephone?, territoire, site?, reseaux?,
 *            presentation, proposition, consent ("true"), url_confirm (piège), logo (fichier)
 *   → 201 { data: { ok: true } }
 *
 * Formulaire public /partenaires/candidature (migration 0550) :
 *  1. candidature enregistrée en base (service_role) avec son logo dans le bucket PRIVÉ
 *     `partner-submissions` ; elle apparaît dans /admin/partenaires pour validation ;
 *  2. e-mail à PARTNERSHIP_EMAIL (reply-to vers le candidat), comme avant.
 *
 * Garde-fous :
 *  - même origine (anti-CSRF) ;
 *  - limites : 5 / 10 min / IP et 40 / h au total (fail-closed) ;
 *  - champ piège rempli : réponse identique à un succès, rien n'est enregistré ;
 *  - validation zod stricte ; logo PNG / JPEG / WebP de 2 Mo au plus, type vérifié sur les octets
 *    (jamais sur l'extension ni le Content-Type déclaré) ; valeurs échappées dans l'e-mail.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { sameOrigin } from '@/lib/contenus/api'
import { zodIssues } from '@/lib/contenus/types'
import { clientIp, ipKey, rateLimit } from '@/lib/data/server/rate-limit'
import { fingerprint, ipBucket } from '@/lib/data/server/rate-limit-core'
import { sniffMime } from '@/lib/data/server/http'
import { sendEmail, cleanSubject } from '@/lib/email/send'
import { partnerApplicationEmail } from '@/lib/email/templates/partnerApplication'
import { LOGO_MAX_BYTES, partnerApplicationSchema, type LogoMime } from '@/lib/partenaires/types'
import { storeApplication } from '@/lib/partenaires/server'
import { PARTNERSHIP_EMAIL } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const RATE_PER_IP = 5
const RATE_WINDOW_MS = 10 * 60_000
/** Plafond global (toutes IP) : protège la boîte et le quota d'envoi du domaine contre une inondation distribuée. */
const RATE_GLOBAL = 40
const RATE_GLOBAL_WINDOW_MS = 60 * 60_000
/** Corps complet borné : logo (2 Mo) + textes. */
const MAX_BODY = LOGO_MAX_BYTES + 64 * 1024
const TEXT_FIELDS = ['profil', 'structure', 'contactName', 'email', 'telephone', 'territoire', 'site', 'reseaux', 'presentation', 'proposition'] as const

function fail(status: number, code: string, message: string, issues?: { path: string; message: string }[]) {
  return NextResponse.json({ error: { code, message, ...(issues?.length ? { issues } : {}) } }, { status, headers: { 'Cache-Control': 'no-store' } })
}
const ok = () => NextResponse.json({ data: { ok: true } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail(403, 'bad_origin', 'Requête refusée (origine inattendue).')
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return fail(413, 'too_large', 'Envoi trop volumineux.')

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

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail(422, 'invalid', 'Formulaire incomplet ou invalide.')
  }
  // Champ piège (invisible pour un humain) rempli : réponse identique à un succès, rien n'est enregistré.
  const trap = form.get('url_confirm')
  if (typeof trap === 'string' && trap.trim()) return ok()

  const raw: Record<string, unknown> = { consent: form.get('consent') === 'true' }
  for (const k of TEXT_FIELDS) {
    const v = form.get(k)
    if (typeof v === 'string') raw[k] = v
  }
  const parsed = partnerApplicationSchema.safeParse(raw)
  const issues = parsed.success ? [] : zodIssues(parsed.error)

  // Logo : obligatoire, type réel vérifié sur les premiers octets.
  let logo: { mime: LogoMime; bytes: Uint8Array } | null = null
  const file = form.get('logo')
  if (!(file instanceof File) || file.size === 0) {
    issues.push({ path: 'logo', message: 'required' })
  } else if (file.size > LOGO_MAX_BYTES) {
    issues.push({ path: 'logo', message: 'logoTooBig' })
  } else {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = sniffMime(bytes.subarray(0, 16))
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp') logo = { mime, bytes }
    else issues.push({ path: 'logo', message: 'logoType' })
  }
  if (!parsed.success || issues.length) return fail(422, 'invalid', 'Formulaire incomplet ou invalide.', issues)

  try {
    await storeApplication(parsed.data, logo)
  } catch (e) {
    console.warn('[partenaires] enregistrement impossible (%s)', e instanceof Error ? e.message : 'erreur')
    return fail(503, 'unavailable', 'Envoi impossible. Réessayez dans quelques minutes.')
  }

  // Prévenir l'équipe (la candidature est déjà enregistrée : un échec d'e-mail n'est pas bloquant).
  const receivedAtIso = new Date().toISOString()
  const rendered = partnerApplicationEmail({ ...parsed.data, receivedAtIso, ipBucket: ipBucket(ip) })
  const res = await sendEmail({
    to: PARTNERSHIP_EMAIL,
    subject: cleanSubject(rendered.subject),
    html: rendered.html,
    replyTo: parsed.data.email,
    // Empreinte HMAC du contenu : un double envoi identique n'arrive qu'une fois, deux candidatures différentes passent.
    idempotencyKey: `partner-apply:${fingerprint(JSON.stringify(parsed.data))}`,
  })
  if (!res.ok) console.warn('[partenaires] e-mail non envoyé (%s) — candidature enregistrée.', res.error)
  return ok()
}
