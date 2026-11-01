/**
 * POST /api/assistant/rendez-vous — réservation depuis le chatbot.
 * { type, lang, start, name, email, phone?, reason?, remindersConsent } → 201 { ref, start, emailSent, pending: true }
 * Double validation : le créneau est tenu 30 min et confirmé par le lien envoyé à l'e-mail (neutre,
 * sans texte saisi). Garde-fous : même origine ; 5 par heure et 10 par jour par IP ; 3 par jour par
 * boîte e-mail réelle (sans +étiquette) ; plafond global quotidien fail-closed ; créneau revérifié au
 * serveur et contrainte d'exclusion en base (409 slot_taken).
 */
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, tokenKey } from '@/lib/data/server/rate-limit'
import { BookSchema, mailboxKey } from '@/lib/agent/schemas'
import { bookAppointment } from '@/lib/agent/server'
import { agentErrorResponse, limitGlobal, limitIp, readSmallJson } from '@/lib/agent/http'

/** Réservations par jour, toutes origines (AGENT_BOOKINGS_DAILY_CAP). */
const DAILY_CAP = Math.max(1, Number(process.env.AGENT_BOOKINGS_DAILY_CAP) || 60)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const limited = (await limitIp(req, 'agent-book', 5, 3_600_000)) ?? (await limitIp(req, 'agent-book-day', 10, 86_400_000))
  if (limited) return limited
  const body = BookSchema.safeParse(await readSmallJson(req))
  if (!body.success) {
    const email = body.error.issues.some((i) => i.path[0] === 'email')
    return jsonError(422, email ? 'email_required' : 'invalid', email ? 'Indiquez une adresse e-mail valide : elle sert à confirmer le rendez-vous.' : 'Vérifiez les informations saisies.')
  }
  // Champ piège rempli : réponse d'apparence normale, rien n'est réservé.
  if (body.data.website) return jsonOk({ pending: true, emailSent: true }, 201)
  const perMailbox = await rateLimit(tokenKey('agent-book-mailbox', mailboxKey(body.data.email)), 3, 86_400_000)
  if (!perMailbox.ok) return rateLimitedResponse(perMailbox)
  const global = await limitGlobal('agent-book-global', DAILY_CAP, 86_400_000)
  if (global) return global
  try {
    const b = await bookAppointment({
      typeCode: body.data.type, language: body.data.lang, start: body.data.start, name: body.data.name,
      phone: body.data.phone, email: body.data.email, reason: body.data.reason, channel: 'web',
      remindersConsent: body.data.remindersConsent,
    })
    // Le lien de confirmation et de gestion part par e-mail seulement : jamais renvoyé au navigateur.
    return jsonOk({ ref: b.ref, start: b.start, emailSent: b.emailSent, pending: true }, 201)
  } catch (e) {
    return agentErrorResponse(e, 'book')
  }
}
