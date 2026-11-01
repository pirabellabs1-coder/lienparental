import 'server-only'
/**
 * Réponse de l'agent à une question libre, hors site web (WhatsApp aujourd'hui, téléphone demain) :
 * même prompt et même base de connaissances publiée que le chatbot du site (/api/assistant), plafond
 * global partagé. Sans IA ou au-delà du plafond : fiche la plus proche, sinon réponse prédéfinie.
 */
import { AI_ENABLED } from '@/lib/supabase/config'
import { rateLimit } from '@/lib/data/server/rate-limit'
import { AI_MODEL, fallbackParams, getAnthropic, logAiCall, mapAiError } from '@/lib/ai/client'
import {
  ASSISTANT_PROMPT_VERSION, assistantSystemPrompt, detectTopic, fallbackAssistantAnswer, neutralizeVisitorText, splitAnswer,
  trimAssistantHistory, type AssistantAction, type AssistantTurn,
} from '@/lib/ai/assistant'
import { kbForPrompt, matchKb, type AgentLocale, type Channel } from './core'
import { insertEvent } from './repo'
import { liveKb } from './server'

const MODEL = process.env.ASSISTANT_MODEL?.trim() || AI_MODEL
const GLOBAL_PER_DAY = Math.max(0, Number(process.env.ASSISTANT_DAILY_CAP) || 1_500)

export const INTENT: Record<ReturnType<typeof detectTopic>, string> = {
  pricing: 'PRICING', features: 'FEATURE', guide: 'NAVIGATION', signup: 'ACCOUNT_HELP', contact: 'HUMAN',
  security: 'FEATURE', legal: 'SENSITIVE', default: 'PRESENTATION',
}

export type AgentAnswer = { text: string; cta: boolean; actions: AssistantAction[]; source: 'ai' | 'kb' | 'fallback' }

export async function answerQuestion(turns: AssistantTurn[], locale: AgentLocale, channel: Exclude<Channel, 'web'>, opts: { allowAi?: boolean } = {}): Promise<AgentAnswer> {
  const history = trimAssistantHistory(turns)
  const question = history[history.length - 1]
  if (!question || question.role !== 'user') return { ...splitAnswer(fallbackAssistantAnswer('', locale)), source: 'fallback' }
  const kb = await liveKb(locale).catch(() => [])
  const intent = INTENT[detectTopic(question.content)]
  const offline = (): AgentAnswer => {
    const hit = matchKb(question.content, kb, locale)
    void insertEvent({ channel, locale, kind: hit ? 'answer_kb' : 'answer_fallback', intent })
    return { ...splitAnswer(hit ? hit.answer : fallbackAssistantAnswer(question.content, locale)), source: hit ? 'kb' : 'fallback' }
  }
  // allowAi false : plafond IA atteint pour cet interlocuteur (le budget partagé avec le site est préservé).
  if (!AI_ENABLED || opts.allowAi === false) return offline()
  const global = await rateLimit('assistant-global:all', GLOBAL_PER_DAY, 86_400_000, { failClosed: true })
  if (!global.ok) return offline()
  const started = Date.now()
  try {
    const msg = await getAnthropic().beta.messages.create(
      {
        model: MODEL,
        max_tokens: 1_000,
        system: [{ type: 'text', text: assistantSystemPrompt(locale, kbForPrompt(kb, locale), 'whatsapp'), cache_control: { type: 'ephemeral' } }],
        messages: history.map((t) =>
          t.role === 'assistant'
            ? { role: 'assistant' as const, content: t.content }
            : { role: 'user' as const, content: `<question_visiteur>\n${neutralizeVisitorText(t.content)}\n</question_visiteur>` },
        ),
        output_config: { effort: 'low' },
        ...fallbackParams(),
      },
      { timeout: 20_000, maxRetries: 0 },
    )
    logAiCall({ route: 'assistant', model: msg.model, promptVersion: ASSISTANT_PROMPT_VERSION, effort: 'low', latencyMs: Date.now() - started, stopReason: msg.stop_reason, usage: msg.usage })
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
    if (msg.stop_reason === 'refusal' || !text) return offline()
    const answer = splitAnswer(text)
    void insertEvent({ channel, locale, kind: answer.actions.includes('humain') ? 'answer_escalated' : 'answer_ai', intent })
    return { ...answer, source: 'ai' }
  } catch (err) {
    const f = mapAiError(err)
    logAiCall({ route: 'assistant', model: MODEL, promptVersion: ASSISTANT_PROMPT_VERSION, effort: 'low', latencyMs: Date.now() - started, stopReason: null, error: f.code })
    void insertEvent({ channel, locale, kind: 'ai_error', intent })
    return offline()
  }
}
