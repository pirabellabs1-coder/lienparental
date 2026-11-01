import 'server-only'
/**
 * Twilio — fournisseur unique de l'agent d'accueil : WhatsApp (API officielle Meta via Twilio)
 * aujourd'hui, standard téléphonique ensuite. Clés côté serveur uniquement.
 *
 * Variables : TWILIO_ACCOUNT_SID (AC…), TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER (expéditeur WhatsApp
 * approuvé, +594… / +33… ; à défaut TWILIO_PHONE_NUMBER). Absentes : aucun envoi (journal expurgé).
 * Modèle Meta pour les rappels hors fenêtre de 24 h : TWILIO_WA_REMINDER_SID (HX…, variables {{1}} date,
 * {{2}} heure).
 */
import { signatureMatches } from './twilio-signature'

const API = 'https://api.twilio.com/2010-04-01'
const TIMEOUT_MS = 8_000

const sid = () => process.env.TWILIO_ACCOUNT_SID?.trim() ?? ''
const token = () => process.env.TWILIO_AUTH_TOKEN?.trim() ?? ''
export const whatsappSender = () => (process.env.TWILIO_WHATSAPP_NUMBER?.trim() || process.env.TWILIO_PHONE_NUMBER?.trim() || '').replace(/[^\d+]/g, '')

export const TWILIO_WA_ENABLED = Boolean(/^AC[0-9a-f]{32}$/i.test(sid()) && token() && whatsappSender())

/** Requête bien signée par Twilio (Auth Token du compte). */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null, authToken = token()): boolean {
  return signatureMatches(authToken, url, params, signature)
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string }

/** Message WhatsApp : texte libre (dans la fenêtre de 24 h) ou modèle approuvé (ContentSid). */
export async function sendTwilioWhatsApp(to: string, body: string, template?: { sid: string; variables: Record<string, string> }): Promise<SendResult> {
  if (!TWILIO_WA_ENABLED) {
    console.info('[twilio] WhatsApp désactivé (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / numéro absents) — non envoyé')
    return { ok: false, error: 'disabled' }
  }
  const form = new URLSearchParams({ From: `whatsapp:${whatsappSender()}`, To: `whatsapp:+${to.replace(/[^\d]/g, '')}` })
  if (template) {
    form.set('ContentSid', template.sid)
    form.set('ContentVariables', JSON.stringify(template.variables))
  } else {
    form.set('Body', body.slice(0, 1500))
  }
  try {
    const res = await fetch(`${API}/Accounts/${sid()}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${sid()}:${token()}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as { sid?: string; code?: number } | null
    if (!res.ok) {
      // 63016 : hors fenêtre de 24 h sans modèle. Jamais le numéro ni le contenu dans le journal.
      console.warn('[twilio] envoi WhatsApp refusé (%s)', String(json?.code ?? res.status))
      return { ok: false, error: String(json?.code ?? res.status) }
    }
    return { ok: true, id: typeof json?.sid === 'string' ? json.sid : null }
  } catch (e) {
    console.warn('[twilio] envoi impossible (%s)', e instanceof Error ? e.name : 'erreur')
    return { ok: false, error: 'network' }
  }
}

export type TwilioStatus =
  | { state: 'missing' }
  | { state: 'error'; code: string }
  | { state: 'ok'; accountStatus: string; numbers: { phone: string; sms: boolean; voice: boolean }[]; sender: string }

/** Diagnostic pour l'administration : compte reconnu et numéros, sans jamais renvoyer les clés. */
export async function twilioStatus(): Promise<TwilioStatus> {
  if (!sid() || !token()) return { state: 'missing' }
  const auth = { Authorization: `Basic ${Buffer.from(`${sid()}:${token()}`).toString('base64')}` }
  try {
    const [acc, nums] = await Promise.all([
      fetch(`${API}/Accounts/${sid()}.json`, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' }),
      fetch(`${API}/Accounts/${sid()}/IncomingPhoneNumbers.json?PageSize=20`, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' }),
    ])
    if (!acc.ok) return { state: 'error', code: String(acc.status) }
    const a = (await acc.json()) as { status?: string }
    const n = nums.ok ? ((await nums.json()) as { incoming_phone_numbers?: { phone_number: string; capabilities?: { sms?: boolean; voice?: boolean } }[] }) : {}
    return {
      state: 'ok',
      accountStatus: a.status ?? 'inconnu',
      numbers: (n.incoming_phone_numbers ?? []).map((x) => ({ phone: x.phone_number, sms: Boolean(x.capabilities?.sms), voice: Boolean(x.capabilities?.voice) })),
      sender: whatsappSender(),
    }
  } catch (e) {
    return { state: 'error', code: e instanceof Error ? e.name : 'network' }
  }
}
