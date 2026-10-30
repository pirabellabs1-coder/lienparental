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
 * En-tête `Idempotency-Key` : clé fournie par le client pour CHAQUE question (même clé rejouée =
 * aucun second débit, 409 duplicate_request).
 * Crédits (cahier V6) : 1 crédit par réponse PRODUITE (« question au Coach »), réservé avant l'appel,
 * confirmé quand une réponse est livrée, restitué si le modèle refuse, échoue, ne répond rien ou si
 * le parent interrompt AVANT tout texte reçu (une réponse déjà envoyée en partie est décomptée). Le coût
 * fournisseur d'un appel restitué est conservé (plafonds de dépense). Solde insuffisant → 402
 * insufficient_credits (la question est conservée à l'écran). Anti-abus : `chatPerMinute` et
 * `chatPerDay` (limiteur partagé en base).
 */
import type Anthropic from '@anthropic-ai/sdk'
import { getLocale, getTranslations } from 'next-intl/server'
import { defaultLocale, isLocale, type Locale } from '@/lib/i18n/config'
import { getCurrentUser } from '@/lib/auth/session'
import { AI_ENABLED, SUPABASE_ENABLED } from '@/lib/supabase/config'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { AI_MODEL, CHAT_EFFORT, fallbackParams, fallbackServed, getAnthropic, logAiCall, mapAiError } from '@/lib/ai/client'
import { buildContextText } from '@/lib/ai/context'
import { PROMPT_VERSION, chatSystemPrompt, neutralizeTags } from '@/lib/ai/prompts'
import { CHAT_MAX_TOTAL_CHARS, CHAT_MAX_TURNS, ChatBodySchema, type ChatTurn } from '@/lib/ai/schemas'
import { appendAnalysisMessages, getAnalysis, listRecentAnalyses, type StoredAnalysis } from '@/lib/ai/analyses'
import { getCreditConfig } from '@/lib/ai/credit-config-server'
import { confirmCredits, releaseCredits, reserveCredits } from '@/lib/ai/wallet'
import { parseIdempotencyKey } from '@/lib/ai/wallet-core'
import { newAnalysisId } from '@/lib/ai/analyses'
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

/** Analyses précédentes résumées : le Coach s'en souvient d'une conversation à l'autre. */
const PAST_ANALYSES = 8

/** Une ligne par analyse : pas de retour à la ligne venu d'un titre ou d'un résumé. */
const oneLine = (s: string) => neutralizeTags(s).replace(/\s+/g, ' ').trim()

function pastAnalysesBlock(list: StoredAnalysis[], currentId?: string): string {
  // Vérifications du ton de la messagerie et analyses de démonstration exclues : seules les analyses demandées au Coach.
  const past = list.filter((a) => a.result && a.id !== currentId && !a.draft && !a.demo).slice(0, PAST_ANALYSES)
  if (!past.length) return ''
  const lines = past.map((a) => {
    const r = a.result!
    const date = a.createdAt.slice(0, 10)
    return `- ${date} · ${oneLine(a.title)} (${r.type_contenu}) · ton ${r.ton}/100, agressivité ${r.agressivite}/100 · ${oneLine(r.resume)}`
  })
  return ['<analyses_precedentes>', 'Analyses déjà faites par le parent (les plus récentes d’abord) :', ...lines, '</analyses_precedentes>'].join('\n')
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

  const { config: cfg } = await getCreditConfig()
  const rl = await rateLimit(userKey('coach-chat', user.id), cfg.limits.chatPerMinute, 60_000)
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

  const rawKey = req.headers.get('idempotency-key')
  const key = rawKey === null ? `srv_${newAnalysisId()}` : parseIdempotencyKey(rawKey)
  if (!key) return jsonError(422, 'invalid_idempotency_key', t('badRequest'))

  // Anti-abus quotidien (limiteur partagé en base, toutes instances) : chaque tentative compte.
  const daily = await rateLimit(userKey('coach-chat-day', user.id), cfg.limits.chatPerDay, 86_400_000)
  if (!daily.ok) {
    return jsonError(429, 'chat_daily_limit', t('chatDailyLimit', { limit: cfg.limits.chatPerDay }), { 'Retry-After': String(daily.retryAfter) })
  }

  // --- Crédits : 1 crédit réservé avant l'appel (jamais sur la foi du client) ---------------
  const reservation = await reserveCredits(user, 'chat_question', key).catch((err) => {
    console.error('[credits] réservation impossible', err instanceof Error ? err.message : 'unknown')
    return null
  })
  if (!reservation) return jsonError(503, 'credits_unavailable', t('internal'))
  if (!reservation.ok) {
    const headers = { 'Cache-Control': 'no-store' }
    if (reservation.reason === 'insufficient') {
      const b = reservation.balance
      return Response.json(
        {
          error: { code: 'insufficient_credits', message: t('chatInsufficientCredits', { cost: reservation.cost, total: b.total }) },
          credits: { cost: reservation.cost, monthly: b.monthly, purchased: b.purchased, total: b.total },
          upgrade: b.plan === 'gratuit',
        },
        { status: 402, headers },
      )
    }
    if (reservation.reason === 'duplicate') return Response.json({ error: { code: 'duplicate_request', message: t('chatDuplicate') }, status: reservation.status }, { status: 409, headers })
    if (reservation.reason === 'spend_cap') return Response.json({ error: { code: 'ai_spend_cap', message: t('chatSpendCap') } }, { status: 503, headers: { ...headers, 'Retry-After': '3600' } })
    return Response.json({ error: { code: 'action_inactive', message: t('chatInactive') } }, { status: 403, headers })
  }
  const actionId = reservation.actionId

  // --- Mode démonstration --------------------------------------------------------------
  if (!AI_ENABLED) {
    await confirmCredits(user, actionId, { model: 'demo', usage: null, latencyMs: 0 })
    const answer = mockChatAnswer(question.content, { aboutAnalysis: Boolean(analysis), userId: user.id, locale })
    // Comme en production : le fil d'une analyse est conservé (réaffiché à la réouverture).
    if (analysis) {
      const at = new Date().toISOString()
      await appendAnalysisMessages(user, analysis.id, [{ role: 'user', content: question.content, at }, { role: 'assistant', content: answer, at }]).catch(() => undefined)
    }
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
  // Lectures en parallèle : contexte de l'espace et analyses récentes (brouillons filtrés ensuite, d'où la marge).
  const [ctx, recent] = await Promise.allSettled([
    buildContextText(user, { includeMedical, scope: 'full' }),
    listRecentAnalyses(user, 30),
  ])
  const past = pastAnalysesBlock(recent.status === 'fulfilled' ? recent.value : [], analysis?.id)
  try {
    if (ctx.status === 'rejected') throw ctx.reason
    contextText = ctx.value
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
    if (past) blocks.push({ type: 'text', text: past })
    if (analysis) blocks.push({ type: 'text', text: analysisBlock(analysis) })
    blocks.push({ type: 'text', text: q })
    return { role: 'user', content: blocks }
  })

  return sseResponse(async (send, signal) => {
    const started = Date.now()
    let ttft: number | undefined
    let text = ''
    let charged = false
    let reason: 'failed' | 'refused' | 'aborted' | 'empty' = 'failed'
    // Dernier état connu de l'appel (modèle, tokens) : coût conservé même en cas d'échec.
    let call: { model: string; usage?: Anthropic.Beta.BetaUsage | null } | null = null
    let stream: ReturnType<ReturnType<typeof getAnthropic>['beta']['messages']['stream']> | null = null
    try {
      const client = getAnthropic()
      stream = client.beta.messages.stream(
        {
          model: AI_MODEL,
          // Plafond de tokens de sortie et délai : catalogue actif (garde-fous de coût).
          max_tokens: cfg.actions.chat_question.maxOutputTokens,
          system: [{ type: 'text', text: chatSystemPrompt(locale), cache_control: { type: 'ephemeral' } }],
          messages,
          output_config: { effort: CHAT_EFFORT },
          ...fallbackParams(),
        },
        { signal, timeout: cfg.actions.chat_question.timeoutMs },
      )
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          ttft ??= Date.now() - started
          text += event.delta.text
          send('delta', { t: event.delta.text })
        }
      }
      const final = await stream.finalMessage()
      const latencyMs = Date.now() - started
      call = { model: final.model, usage: final.usage }
      logAiCall({
        route: 'chat', model: final.model, promptVersion: PROMPT_VERSION, effort: CHAT_EFFORT, latencyMs, ttftMs: ttft,
        stopReason: final.stop_reason, fallbackServed: fallbackServed(final), usage: final.usage,
      })

      if (final.stop_reason === 'refusal') {
        reason = 'refused'
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
        reason = 'empty'
        send('error', { code: 'empty', message: t('emptyAnswer') })
        return
      }
      // Réponse produite : 1 crédit confirmé (une seule fois), coût fournisseur mesuré.
      charged = true
      await confirmCredits(user, actionId, { model: final.model, usage: final.usage, latencyMs }).catch((err) => {
        console.error('[credits] confirmation impossible', { action: actionId.slice(-8), msg: err instanceof Error ? err.message : 'unknown' })
      })
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
      if (f.code === 'aborted') reason = 'aborted'
      const snapshot = stream?.currentMessage
      if (snapshot) call = { model: snapshot.model, usage: snapshot.usage }
      // Interruption après qu'une réponse a été envoyée au parent : elle est produite, donc décomptée
      // (sinon couper le flux juste avant la fin donnerait des réponses gratuites).
      if (f.code === 'aborted' && text.trim()) {
        charged = true
        await confirmCredits(user, actionId, { model: call?.model ?? AI_MODEL, usage: call?.usage, latencyMs: Date.now() - started }).catch(() => undefined)
      }
      logAiCall({ route: 'chat', model: AI_MODEL, promptVersion: PROMPT_VERSION, effort: CHAT_EFFORT, latencyMs: Date.now() - started, ttftMs: ttft, stopReason: null, error: f.code })
      if (f.code !== 'aborted') send('error', { code: f.code, message: f.message })
    } finally {
      if (!charged) await releaseCredits(user, actionId, reason, call)
    }
  }, { errorMessage: t('internal') })
}
