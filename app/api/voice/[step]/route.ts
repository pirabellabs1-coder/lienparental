/**
 * POST /api/voice/[step] — standard téléphonique IA (phase 4, Twilio Voice), tour par tour.
 *
 *   incoming  appel entrant : choix de langue (touche 1 / 2 / 3 ou langue dite)
 *   lang      langue retenue → accueil et première écoute
 *   turn      parole transcrite par Twilio → intention (représentant, rappel, rendez-vous, e-mail, fin)
 *             ou question libre (même agent et même base que le site) ; silences et incompréhensions
 *             gérés comme le cahier V2 §6.10 (relance, catégories, escalade)
 *   dial      fin d'une tentative de transfert : second représentant, sinon proposition de rappel
 *   callback  nom + motif dits → demande de rappel enregistrée (numéro de l'appelant)
 *
 * Chaque requête est signée par Twilio (X-Twilio-Signature, URL publique + paramètres) ; sinon 403.
 * Aucun enregistrement audio ; seule la transcription de la phrase en cours transite.
 * L'état de l'appel (langue, compteurs) voyage dans l'URL de l'étape suivante, elle-même signée.
 */
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, tokenKey } from '@/lib/data/server/rate-limit'
import { CONTACT_EMAIL, SITE } from '@/lib/seo/site'
import { fillMessage, type AgentLocale } from '@/lib/agent/core'
import { answerQuestion } from '@/lib/agent/answer'
import { insertEvent } from '@/lib/agent/repo'
import { messagesFor, requestCallback, transferTargets } from '@/lib/agent/server'
import { sendTwilioSms, validTwilioSignature } from '@/lib/agent/twilio'
import { T, callerNumber, dial, forSpeech, gather, hangup, pickLanguage, say, twiml, voiceIntent } from '@/lib/agent/voice-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_TURNS = 12
const xmlResponse = (body: string) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } })

type State = { l: AgentLocale; n: number; m: number; t: number }
const url = (step: string, s: Partial<State> & { i?: number; r?: number } = {}) => {
  const q = new URLSearchParams(Object.entries(s).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
  return `/api/voice/${step}${q.size ? `?${q}` : ''}`
}

export async function POST(req: Request, { params }: { params: Promise<{ step: string }> }) {
  const { step } = await params
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) return jsonError(503, 'not_configured', 'Standard non configuré.')
  const raw = await req.text().catch(() => '')
  if (raw.length > 32 * 1024) return jsonError(413, 'payload_too_large', 'Trop volumineux.')
  const p = Object.fromEntries(new URLSearchParams(raw))
  const u = new URL(req.url)
  if (!validTwilioSignature(`${SITE}${u.pathname}${u.search}`, p, req.headers.get('x-twilio-signature'))) return jsonError(403, 'bad_signature', 'Signature invalide.')

  const q = u.searchParams
  const l = (['fr', 'en', 'pt'] as const).find((x) => x === q.get('l')) ?? 'fr'
  const st: State = { l, n: Number(q.get('n')) || 0, m: Number(q.get('m')) || 0, t: Number(q.get('t')) || 0 }
  const caller = callerNumber(p.From)
  const t = T[l]
  const listen = (prompt: string, next: Partial<State> = {}) => {
    const s = { ...st, ...next }
    return twiml(gather({ action: url('turn', s), locale: l, prompt, onSilence: url('turn', { ...s, n: s.n + 1 }) }))
  }

  switch (step) {
    case 'incoming': {
      if (q.get('r') === '2') return xmlResponse(twiml(say(T.fr.silenceEnd, 'fr'), hangup()))
      if (q.get('r') !== '1') void insertEvent({ channel: 'voice', locale: 'fr', kind: 'call_started' })
      const menu = q.get('r') === '1' ? [say(T.fr.sayLang, 'fr')] : [say(T.fr.menu, 'fr'), say(T.en.menu, 'en'), say(T.pt.menu, 'pt')]
      return xmlResponse(twiml(
        `<Gather input="dtmf speech" numDigits="1" action="${url('lang')}" method="POST" timeout="6" speechTimeout="auto" language="fr-FR" hints="français, English, português" actionOnEmptyResult="false">${menu.join('')}</Gather>`,
        `<Redirect method="POST">${url('incoming', { r: q.get('r') === '1' ? 2 : 1 })}</Redirect>`,
      ))
    }

    case 'lang': {
      const chosen = pickLanguage(p.Digits, p.SpeechResult)
      if (!chosen) return xmlResponse(twiml(`<Redirect method="POST">${url('incoming', { r: 1 })}</Redirect>`))
      return xmlResponse(twiml(gather({ action: url('turn', { l: chosen, n: 0, m: 0, t: 0 }), locale: chosen, prompt: `${T[chosen].greeting}`, onSilence: url('turn', { l: chosen, n: 1, m: 0, t: 0 }) })))
    }

    case 'turn': {
      const speech = (p.SpeechResult ?? '').trim()
      if (!speech) {
        if (st.n >= 2) {
          void insertEvent({ channel: 'voice', locale: l, kind: 'call_silence_end' })
          return xmlResponse(twiml(say(t.silenceEnd, l), hangup()))
        }
        return xmlResponse(listen(t.still))
      }
      if (st.t >= MAX_TURNS) return xmlResponse(twiml(say(t.tooLong, l), hangup()))
      const next = { n: 0, t: st.t + 1 }
      const m = await messagesFor(l)

      // Transcription peu sûre : reformulation, puis catégories, puis représentant (cahier V2 §6.10).
      const confidence = Number(p.Confidence)
      if (Number.isFinite(confidence) && confidence > 0 && confidence < 0.35 && !voiceIntent(speech)) {
        if (st.m === 0) return xmlResponse(listen(t.misunderstood1, { ...next, m: 1 }))
        if (st.m === 1) return xmlResponse(listen(t.misunderstood2, { ...next, m: 2 }))
        return xmlResponse(await human(l, caller, `${t.escalate} `))
      }

      const intent = voiceIntent(speech)
      if (intent === 'fin') return xmlResponse(twiml(say(m.END, l), hangup()))
      if (intent === 'humain') return xmlResponse(await human(l, caller))
      if (intent === 'rappel') return xmlResponse(callbackPrompt(l, caller))
      if (intent === 'rdv' || intent === 'email') {
        const isEmail = intent === 'email'
        const line = isEmail ? `${fillMessage(m.EMAIL_SLA, { email: CONTACT_EMAIL })} ` : ''
        if (!caller) return xmlResponse(listen(`${line}${t.hidden} ${CONTACT_EMAIL}. ${t.another}`, { ...next, m: 0 }))
        if (!(await rateLimit(tokenKey('voice-sms', caller), 3, 86_400_000)).ok) return xmlResponse(listen(`${line}${t.limit} ${t.another}`, { ...next, m: 0 }))
        const sent = (await sendTwilioSms(caller, isEmail ? `${t.smsEmailText} ${CONTACT_EMAIL}` : t.smsBookingText)).ok
        const said = sent ? (isEmail ? t.smsEmail : t.smsBooking) : isEmail ? '' : `${t.smsFailed} ${CONTACT_EMAIL}.`
        return xmlResponse(listen(`${line}${said} ${t.another}`.replace(/\s+/g, ' ').trim(), { ...next, m: 0 }))
      }

      // Question libre : même agent, même base de connaissances publiée que le site et WhatsApp.
      const allowAi = caller ? (await rateLimit(tokenKey('voice-ai', caller), 30, 86_400_000)).ok : true
      const a = await answerQuestion([{ role: 'user', content: speech.slice(0, 800) }], l, 'voice', { allowAi })
      if (a.actions.includes('humain') && a.source !== 'ai') return xmlResponse(await human(l, caller, `${forSpeech(a.text)} `))
      return xmlResponse(listen(`${forSpeech(a.text)} ${t.another}`, { ...next, m: 0 }))
    }

    case 'dial': {
      // Représentant joint : l'appel est terminé quand il raccroche.
      if (p.DialCallStatus === 'completed' || p.DialCallStatus === 'answered') return xmlResponse(twiml(hangup()))
      const i = Number(q.get('i')) || 0
      const targets = await transferTargets(l).catch(() => [])
      if (i + 1 < targets.length) return xmlResponse(twiml(dial(targets[i + 1]!, url('dial', { l, i: i + 1 }), p.To ?? '')))
      void insertEvent({ channel: 'voice', locale: l, kind: 'transfer_failed', intent: 'HUMAN' })
      return xmlResponse(callbackPrompt(l, caller, `${t.transferFailed} `))
    }

    case 'callback': {
      const reason = (p.SpeechResult ?? '').trim()
      if (!caller) return xmlResponse(twiml(say(`${t.hidden} ${CONTACT_EMAIL}.`, l), hangup()))
      if (!reason) return xmlResponse(callbackPrompt(l, caller))
      const m = await messagesFor(l)
      const ok = (await rateLimit(tokenKey('voice-callback', caller), 2, 86_400_000)).ok
      if (ok) await requestCallback({ name: 'Appel téléphonique', phone: caller, reason: reason.slice(0, 500), language: l, channel: 'voice' })
      return xmlResponse(twiml(say(`${ok ? m.CALLBACK_DONE : t.limit} ${m.END}`, l), hangup()))
    }
  }
  return jsonError(404, 'not_found', 'Étape inconnue.')
}

/** Représentant : transfert si quelqu'un est joignable (horaires, numéro de transfert), sinon rappel. */
async function human(l: AgentLocale, caller: string | null, prefix = ''): Promise<string> {
  const targets = await transferTargets(l).catch(() => [])
  void insertEvent({ channel: 'voice', locale: l, kind: targets.length ? 'human_available' : 'human_unavailable', intent: 'HUMAN' })
  if (!targets.length) return callbackPrompt(l, caller, `${prefix}${T[l].unavailable} `)
  return twiml(say(`${prefix}${T[l].transfer}`, l), dial(targets[0]!, url('dial', { l, i: 0 }), process.env.TWILIO_PHONE_NUMBER?.trim() ?? ''))
}

function callbackPrompt(l: AgentLocale, caller: string | null, prefix = ''): string {
  if (!caller) return twiml(say(`${prefix}${T[l].hidden} ${CONTACT_EMAIL}.`, l), hangup())
  return twiml(
    `<Gather input="speech" action="${url('callback', { l })}" method="POST" language="${l === 'en' ? 'en-US' : l === 'pt' ? 'pt-BR' : 'fr-FR'}" speechTimeout="auto" timeout="8" actionOnEmptyResult="true">${say(`${prefix}${T[l].callbackPrompt}`, l)}</Gather>`,
    say(T[l].silenceEnd, l), hangup(),
  )
}
