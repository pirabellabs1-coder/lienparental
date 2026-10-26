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
import { getCurrentUser } from '@/lib/auth/session'
import { AI_ENABLED, SUPABASE_ENABLED } from '@/lib/supabase/config'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { AI_MODEL, CHAT_EFFORT, CHAT_MAX_TOKENS, fallbackParams, fallbackServed, getAnthropic, logAiCall, mapAiError } from '@/lib/ai/client'
import { buildContextText } from '@/lib/ai/context'
import { CHAT_SYSTEM_PROMPT, PROMPT_VERSION, REFUSAL_MESSAGE_FR, TRUNCATED_NOTE_FR, neutralizeTags } from '@/lib/ai/prompts'
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
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Connectez-vous pour utiliser le Coach IA.')
  // Compte réel sans clé d'IA : pas de réponse simulée (prénoms et faits fictifs), message explicite.
  if (!AI_ENABLED && SUPABASE_ENABLED) return jsonError(503, 'ai_not_configured', 'Le Coach IA n’est pas encore disponible : le service de réponse n’est pas configuré.')

  const rl = await rateLimit(userKey('coach-chat', user.id), 12, 60_000)
  if (!rl.ok) return jsonError(429, 'rate_limited', 'Trop de messages rapprochés. Patientez un instant.', { 'Retry-After': String(rl.retryAfter) })

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return jsonError(413, 'payload_too_large', 'Conversation trop longue.')
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return jsonError(413, 'payload_too_large', 'Conversation trop longue.')
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return jsonError(400, 'bad_json', 'Requête invalide.')
  }
  const parsed = ChatBodySchema.safeParse(json)
  if (!parsed.success) return jsonError(422, 'invalid_body', 'Message invalide : il doit se terminer par votre question (4000 caractères maximum par message).')

  const history = trimHistory(parsed.data.messages)
  const question = history[history.length - 1]
  if (!question || question.role !== 'user') return jsonError(422, 'invalid_body', 'Message invalide.')
  const includeMedical = parsed.data.includeMedical === true

  let analysis: StoredAnalysis | null = null
  if (parsed.data.analysisId) {
    analysis = await getAnalysis(user, parsed.data.analysisId)
    if (!analysis) return jsonError(404, 'analysis_not_found', 'Cette analyse est introuvable ou a été supprimée.')
  }

  const quota = consumeChatMessage(user.id)
  if (!quota.ok) {
    return jsonError(429, 'chat_daily_limit', `Vous avez atteint la limite de ${quota.limit} messages pour aujourd’hui. Le compteur repart demain.`)
  }

  // --- Mode démonstration --------------------------------------------------------------
  if (!AI_ENABLED) {
    const answer = mockChatAnswer(question.content, { aboutAnalysis: Boolean(analysis), userId: user.id })
    return sseResponse(async (send, signal) => {
      await sleep(450, signal)
      for (const chunk of answer.match(/\S+\s*/g) ?? []) {
        if (signal.aborted) return
        send('delta', { t: chunk })
        await sleep(28, signal)
      }
      send('done', { stopReason: 'end_turn', demo: true, truncated: false })
    })
  }

  let contextText: string
  try {
    contextText = await buildContextText(user, { includeMedical, scope: 'full' })
  } catch {
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
          system: [{ type: 'text', text: CHAT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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
        send('refusal', { message: REFUSAL_MESSAGE_FR })
        send('done', { stopReason: 'refusal', demo: false, truncated: false })
        return
      }
      const truncated = final.stop_reason === 'max_tokens'
      if (truncated) {
        const note = `${text ? '\n\n' : ''}${TRUNCATED_NOTE_FR}`
        text += note
        send('delta', { t: note })
      }
      if (!text.trim()) {
        refundChatMessage(user.id)
        send('error', { code: 'empty', message: 'Le Coach IA n’a pas pu répondre. Reformulez votre question.' })
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
      const f = mapAiError(err)
      refundChatMessage(user.id)
      logAiCall({ route: 'chat', model: AI_MODEL, promptVersion: PROMPT_VERSION, effort: CHAT_EFFORT, latencyMs: Date.now() - started, ttftMs: ttft, stopReason: null, error: f.code })
      if (f.code !== 'aborted') send('error', { code: f.code, message: f.message })
    }
  })
}
