/**
 * POST /api/assistant — assistant public du site (bulle « Une question ? »), sans compte.
 *
 * Corps JSON (≤ 16 Ko) : { messages: [{ role: 'user'|'assistant', content }...] (dernier = user,
 * ≤ 800 caractères), locale?: 'fr'|'en'|'pt' }.
 * Réponse : { text, cta, actions, demo } — `cta` : bouton « Créer mon compte gratuitement » ;
 * `actions` : parcours de l'agent d'accueil à proposer (rdv, rappel, humain — lib/agent).
 * La base de connaissances publiée (back-office, 0640) complète les faits produit du prompt ; sans IA,
 * la fiche la plus proche répond avant les réponses prédéfinies.
 *
 * Garde-fous : même origine + JSON (anti-CSRF), limiteur par IP (par minute et par jour, partagé en
 * base) et plafond quotidien global (au-delà, ou limiteur indisponible : réponses prédéfinies), historique tronqué, prompt limité à la présentation du produit (lib/ai/assistant.ts),
 * sortie bornée. Rien n'est enregistré : ni question, ni réponse, ni IP en clair.
 * Sans ANTHROPIC_API_KEY : réponses prédéfinies (`demo: true`).
 */
import { isLocale, defaultLocale, type Locale } from '@/lib/i18n/config'
import { AI_ENABLED } from '@/lib/supabase/config'
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { clientIp, ipKey, rateLimit, rateLimitedResponse } from '@/lib/data/server/rate-limit'
import { AI_MODEL, fallbackParams, getAnthropic, logAiCall, mapAiError } from '@/lib/ai/client'
import {
  ASSISTANT_MAX_BODY, ASSISTANT_MAX_CHARS, ASSISTANT_PROMPT_VERSION, AssistantBodySchema,
  assistantSystemPrompt, detectTopic, fallbackAssistantAnswer, neutralizeVisitorText, splitAnswer, trimAssistantHistory,
} from '@/lib/ai/assistant'
import { kbForPrompt, matchKb } from '@/lib/agent/core'
import { insertEvent } from '@/lib/agent/repo'
import { liveKb } from '@/lib/agent/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const PER_MINUTE = 6
const PER_DAY = 60
/** Plafond de coût, toutes IP confondues (ASSISTANT_DAILY_CAP) : au-delà, réponses prédéfinies. */
const GLOBAL_PER_DAY = Math.max(0, Number(process.env.ASSISTANT_DAILY_CAP) || 1_500)
/** Réflexion comprise (Opus 5.5) : réponse courte attendue. */
const MAX_TOKENS = 1_000
/** Une seule tentative, sous maxDuration : sinon Vercel coupe la fonction pendant un nouvel essai. */
const TIMEOUT_MS = 20_000
/** Modèle dédié possible (ASSISTANT_MODEL), sinon celui du Coach. */
const MODEL = process.env.ASSISTANT_MODEL?.trim() || AI_MODEL

const MESSAGES: Record<Locale, { invalid: string; tooLong: string; unavailable: string }> = {
  fr: { invalid: 'Message invalide.', tooLong: `Votre message est trop long (${ASSISTANT_MAX_CHARS} caractères au maximum).`, unavailable: "L'assistant est momentanément indisponible. Écrivez-nous à contact@lienparental.fr." },
  en: { invalid: 'Invalid message.', tooLong: `Your message is too long (${ASSISTANT_MAX_CHARS} characters maximum).`, unavailable: 'The assistant is temporarily unavailable. Write to us at contact@lienparental.fr.' },
  pt: { invalid: 'Mensagem inválida.', tooLong: `Sua mensagem é longa demais (${ASSISTANT_MAX_CHARS} caracteres no máximo).`, unavailable: 'O assistente está temporariamente indisponível. Escreva para contact@lienparental.fr.' },
}

/** Intention (cahier V2 §2.2) déduite du thème, pour les statistiques seulement. */
const INTENT: Record<ReturnType<typeof detectTopic>, string> = {
  pricing: 'PRICING', features: 'FEATURE', guide: 'NAVIGATION', signup: 'ACCOUNT_HELP', contact: 'HUMAN',
  security: 'FEATURE', legal: 'SENSITIVE', default: 'PRESENTATION',
}

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected

  const ip = clientIp(req.headers)
  const rl = await rateLimit(ipKey('assistant', ip), PER_MINUTE, 60_000)
  if (!rl.ok) return rateLimitedResponse(rl)
  const daily = await rateLimit(ipKey('assistant-day', ip), PER_DAY, 86_400_000)
  if (!daily.ok) return rateLimitedResponse(daily)

  if (Number(req.headers.get('content-length') ?? '0') > ASSISTANT_MAX_BODY) return jsonError(413, 'payload_too_large', MESSAGES.fr.tooLong)
  const raw = await req.text().catch(() => '')
  if (raw.length > ASSISTANT_MAX_BODY) return jsonError(413, 'payload_too_large', MESSAGES.fr.tooLong)
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return jsonError(400, 'bad_json', MESSAGES.fr.invalid)
  }
  const parsed = AssistantBodySchema.safeParse(json)
  if (!parsed.success) return jsonError(422, 'invalid_body', MESSAGES.fr.invalid)
  const locale: Locale = isLocale(parsed.data.locale) ? parsed.data.locale : defaultLocale
  const m = MESSAGES[locale]

  const history = trimAssistantHistory(parsed.data.messages)
  const question = history[history.length - 1]
  if (!question || question.role !== 'user') return jsonError(422, 'invalid_body', m.invalid)
  if (question.content.length > ASSISTANT_MAX_CHARS) return jsonError(413, 'message_too_long', m.tooLong)

  const kb = await liveKb(locale).catch(() => [])
  const intent = INTENT[detectTopic(question.content)]
  // Réponse sans IA : fiche publiée la plus proche, sinon réponse prédéfinie.
  const offline = (demo: boolean) => {
    const hit = matchKb(question.content, kb, locale)
    void insertEvent({ channel: 'web', locale, kind: hit ? 'answer_kb' : 'answer_fallback', intent })
    return jsonOk({ ...splitAnswer(hit ? hit.answer : fallbackAssistantAnswer(question.content, locale)), demo })
  }
  if (!AI_ENABLED) return offline(true)
  // Plafond global (fail-closed) : le visiteur reçoit une réponse prédéfinie plutôt qu'une erreur.
  const global = await rateLimit('assistant-global:all', GLOBAL_PER_DAY, 86_400_000, { failClosed: true })
  if (!global.ok) return offline(true)

  const started = Date.now()
  try {
    const msg = await getAnthropic().beta.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: assistantSystemPrompt(locale, kbForPrompt(kb, locale)), cache_control: { type: 'ephemeral' } }],
        messages: history.map((t) =>
          t.role === 'assistant'
            ? { role: 'assistant' as const, content: t.content }
            : { role: 'user' as const, content: `<question_visiteur>\n${neutralizeVisitorText(t.content)}\n</question_visiteur>` },
        ),
        output_config: { effort: 'low' },
        ...fallbackParams(),
      },
      { timeout: TIMEOUT_MS, maxRetries: 0, signal: req.signal },
    )
    logAiCall({
      route: 'assistant', model: msg.model, promptVersion: ASSISTANT_PROMPT_VERSION, effort: 'low',
      latencyMs: Date.now() - started, stopReason: msg.stop_reason, usage: msg.usage,
    })
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
    // Refus ou réponse vide : repli prédéfini plutôt qu'un message d'erreur au visiteur.
    if (msg.stop_reason === 'refusal' || !text) return offline(false)
    const answer = splitAnswer(text)
    void insertEvent({ channel: 'web', locale, kind: answer.actions.includes('humain') ? 'answer_escalated' : 'answer_ai', intent })
    return jsonOk({ ...answer, demo: false })
  } catch (err) {
    const f = mapAiError(err)
    logAiCall({ route: 'assistant', model: MODEL, promptVersion: ASSISTANT_PROMPT_VERSION, effort: 'low', latencyMs: Date.now() - started, stopReason: null, error: f.code })
    if (f.code === 'aborted') return jsonError(499, 'aborted', m.invalid)
    void insertEvent({ channel: 'web', locale, kind: 'ai_error', intent })
    return jsonError(503, f.code, m.unavailable, f.retryAfter ? { 'Retry-After': String(f.retryAfter) } : undefined)
  }
}
