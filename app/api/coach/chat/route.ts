/**
 * POST /api/coach/chat — assistant du parent, en streaming, sur sa base de connaissances.
 *
 * Corps JSON (≤ 128 Ko) :
 *   { messages: [{ role: 'user'|'assistant', content }...] (dernier = user),
 *     analysisId?: string   // discuter d'une analyse précise
 *     includeMedical?: bool // OFF par défaut, vaut pour CETTE requête uniquement }
 * Sortie SSE :
 *   - delta   { t }                         fragments de texte
 *   - refusal { message }                   la chaîne (modèle + repli) a refusé : remplacer le texte partiel
 *   - done    { stopReason, demo, truncated }
 *   - error   { code, message }
 * Quota : non décompté des analyses ; limite douce de 50 messages / jour.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { getLocale, getTranslations } from 'next-intl/server'
import { defaultLocale, isLocale, type Locale } from '@/lib/i18n/config'
import { getCurrentUser } from '@/lib/auth/session'
import { AI_ENABLED, SUPABASE_ENABLED } from '@/lib/supabase/config'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { AI_MODEL, CHAT_EFFORT, CHAT_MAX_TOKENS, fallbackParams, fallbackServed, getAnthropic, logAiCall, mapAiError } from '@/lib/ai/client'
import { buildContextText } from '@/lib/ai/context'
import { PROMPT_VERSION, chatSystemPrompt, neutralizeTags } from '@/lib/ai/prompts'
import { CHAT_MAX_TOTAL_CHARS, CHAT_MAX_TURNS, ChatBodySchema, type ChatTurn } from '@/lib/ai/schemas'
import { appendAnalysisMessages, getAnalysis, type StoredAnalysis } from '@/lib/ai/analyses'
import { consumeChatMessage, refundChatMessage } from '@/lib/ai/quota'
import { mockChatAnswer } from '@/lib/ai/mock'
import { sleep, sseResponse } from '@/lib/ai/sse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

const MAX_BODY = 128 * 1024

/** Garde les derniers tours, commence par une question, borne le volume total. */
function trimHistory(turns: ChatTurn[]): ChatTurn[] {
  let kept = turns.slice(-CHAT_MAX_TURNS)
  while (kept.length && kept[0]!.role !== 'user') kept = kept.slice(1)
  let total = kept.reduce((n, t) => n + t.content.length, 0)
  while (kept.length > 1 && total > CHAT_MAX_TOTAL_CHARS) {
    total -= kept[0]!.content.length
    kept = kept.slice(1)
    while (kept.length && kept[0]!.role !== 'user') {
      total -= kept[0]!.content.length
      kept = kept.slice(1)
    }
  }
  return kept
}

function analysisBlock(a: StoredAnalysis): string {
  const r = a.result
  if (!r) return ''
  return [
    '<analyse_en_cours>',
    `Type : ${r.type_contenu} · titre : ${neutralizeTags(a.title)}`,
    `Texte lu :\n${neutralizeTags(r.texte_lu) || '(aucun texte lisible)'}`,
    `Scores (0-100) : ton ${r.ton} (100 = apaisé), agressivité ${r.agressivite}, clarté ${r.clarte}, respect ${r.respect}`,
    `Mots blessants relevés : ${r.mots_blessants.length ? r.mots_blessants.map(neutralizeTags).join(' ; ') : 'aucun'}`,
    `Impact : ${neutralizeTags(r.impact)}`,
    `Résumé : ${neutralizeTags(r.resume)}`,
    `Proposition (${r.nature_reponse}) : ${neutralizeTags(r.reformulation) || '(aucune)'}`,
    `Conseils donnés : ${r.conseils.map(neutralizeTags).join(' ; ')}`,
    '</analyse_en_cours>',
    'Le parent pose des questions sur cette analyse.',
  ].join('\n')
}

export async function POST(req: Request) {
  // Langue d'affichage (cookie lp_locale) : messages d'erreur, consigne de langue du prompt, démo.
  const rawLocale = await getLocale().catch(() => defaultLocale)
  const locale: Locale = isLocale(rawLocale) ? rawLocale : defaultLocale
  const t = await getTranslations({ locale, namespace: 'ai.errors' })

  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', t('unauthenticated'))
  // Compte réel sans clé d'IA : pas de réponse simulée (prénoms et faits fictifs), message explicite.
  if (!AI_ENABLED && SUPABASE_ENABLED) return jsonError(503, 'ai_not_configured', t('notConfiguredChat'))

  const rl = await rateLimit(userKey('coach-chat', user.id), 12, 60_000)
  if (!rl.ok) return jsonError(429, 'rate_limited', t('rateLimitedChat'), { 'Retry-After': String(rl.retryAfter) })

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return jsonError(413, 'payload_too_large', t('chatTooLong'))
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return jsonError(413, 'payload_too_large', t('chatTooLong'))
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return jsonError(400, 'bad_json', t('badRequest'))
  }
  const parsed = ChatBodySchema.safeParse(json)
  if (!parsed.success) return jsonError(422, 'invalid_body', t('invalidChatBody'))

  const history = trimHistory(parsed.data.messages)
  const question = history[history.length - 1]
  if (!question || question.role !== 'user') return jsonError(422, 'invalid_body', t('invalidMessage'))
  const includeMedical = parsed.data.includeMedical === true

  let analysis: StoredAnalysis | null = null
  if (parsed.data.analysisId) {
    analysis = await getAnalysis(user, parsed.data.analysisId)
    if (!analysis) return jsonError(404, 'analysis_not_found', t('analysisNotFound'))
  }

  const quota = consumeChatMessage(user.id)
  if (!quota.ok) {
    return jsonError(429, 'chat_daily_limit', t('chatDailyLimit', { limit: quota.limit }))
  }

  // --- Mode démonstration --------------------------------------------------------------
  if (!AI_ENABLED) {
    const answer = mockChatAnswer(question.content, { aboutAnalysis: Boolean(analysis), userId: user.id, locale })
    return sseResponse(async (send, signal) => {
      await sleep(450, signal)
      for (const chunk of answer.match(/\S+\s*/g) ?? []) {
        if (signal.aborted) return
        send('delta', { t: chunk })
        await sleep(28, signal)
      }
      send('done', { stopReason: 'end_turn', demo: true, truncated: false })
    }, { errorMessage: t('internal') })
  }

  let contextText: string
  try {
    contextText = await buildContextText(user, { includeMedical, scope: 'full' })
  } catch {
    // Destiné au modèle (non affiché) : reste en français comme le reste du contexte.
    contextText = '(Les données de votre espace sont momentanément indisponibles.)'
  }

  // Premier tour : contexte (mis en cache) + analyse éventuelle + question.
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t, i) => {
    if (t.role === 'assistant') return { role: 'assistant', content: t.content }
    const q = `<question_parent>\n${neutralizeTags(t.content)}\n</question_parent>`
    if (i !== 0) return { role: 'user', content: q }
    const blocks: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: `<espace_parent>\n${contextText}\n</espace_parent>`, cache_control: { type: 'ephemeral' } },
    ]
    if (analysis) blocks.push({ type: 'text', text: analysisBlock(analysis) })
    blocks.push({ type: 'text', text: q })
    return { role: 'user', content: blocks }
  })

  return sseResponse(async (send, signal) => {
    const started = Date.now()
    let ttft: number | undefined
    let text = ''
    try {
      const client = getAnthropic()
      const stream = client.beta.messages.stream(
        {
          model: AI_MODEL,
          max_tokens: CHAT_MAX_TOKENS,
          system: [{ type: 'text', text: chatSystemPrompt(locale), cache_control: { type: 'ephemeral' } }],
          messages,
          output_config: { effort: CHAT_EFFORT },
          ...fallbackParams(),
        },
        { signal, timeout: 80_000 },
      )
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          ttft ??= Date.now() - started
          text += event.delta.text
          send('delta', { t: event.delta.text })
        }
      }
      const final = await stream.finalMessage()
      logAiCall({
        route: 'chat', model: final.model, promptVersion: PROMPT_VERSION, effort: CHAT_EFFORT, latencyMs: Date.now() - started, ttftMs: ttft,
        stopReason: final.stop_reason, fallbackServed: fallbackServed(final), usage: final.usage,
      })

      if (final.stop_reason === 'refusal') {
        // Texte partiel éventuel à écarter (refus en cours de flux).
        send('refusal', { message: t('refusal') })
        send('done', { stopReason: 'refusal', demo: false, truncated: false })
        return
      }
      const truncated = final.stop_reason === 'max_tokens'
      if (truncated) {
        const note = `${text ? '\n\n' : ''}${t('truncatedNote')}`
        text += note
        send('delta', { t: note })
      }
      if (!text.trim()) {
        refundChatMessage(user.id)
        send('error', { code: 'empty', message: t('emptyAnswer') })
        return
      }
      send('done', { stopReason: final.stop_reason, demo: false, truncated })
      if (analysis) {
        const at = new Date().toISOString()
        await appendAnalysisMessages(user, analysis.id, [
          { role: 'user', content: question.content, at },
          { role: 'assistant', content: text.slice(0, 8000), at },
        ]).catch(() => undefined)
      }
    } catch (err) {
      const f = mapAiError(err, (code) => t(code))
      refundChatMessage(user.id)
      logAiCall({ route: 'chat', model: AI_MODEL, promptVersion: PROMPT_VERSION, effort: CHAT_EFFORT, latencyMs: Date.now() - started, ttftMs: ttft, stopReason: null, error: f.code })
      if (f.code !== 'aborted') send('error', { code: f.code, message: f.message })
    }
  }, { errorMessage: t('internal') })
}
