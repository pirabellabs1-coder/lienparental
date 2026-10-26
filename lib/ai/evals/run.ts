/**
 * Harnais d'évaluation du Coach IA — appels RÉELS (coût : ~0,5 à 1 $ par passe complète).
 *
 *   ANTHROPIC_API_KEY=... npx tsx lib/ai/evals/run.ts            # tous les cas
 *   ANTHROPIC_API_KEY=... npx tsx lib/ai/evals/run.ts an-01 ch-03 # sous-ensemble (préfixes d'id)
 *
 * Mêmes prompts, schéma, modèle, effort et repli que la production (lib/ai/prompts.ts,
 * lib/ai/schemas.ts). Assertions structurelles / invariants uniquement (sortie non
 * déterministe : jamais d'égalité exacte). Code de sortie 1 si le taux de réussite < 85 %.
 */
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { ANALYSIS_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, PROMPT_VERSION, neutralizeTags } from '../prompts'
import { AnalysisOutputSchema, normalizeAnalysis, type AnalysisResult } from '../schemas'

type Expect = {
  type_contenu?: string[]
  nature_reponse?: string[]
  agressivite_min?: number
  agressivite_max?: number
  ton_min?: number
  ton_max?: number
  clarte_min?: number
  mots_blessants_min?: number
  mots_blessants_max?: number
  reformulation_must_not_contain?: string[]
  resume_must_not_contain?: string[]
  any_field_must_contain_any?: string[]
  must_contain_any?: string[]
  must_not_contain?: string[]
  must_not_match?: string
  must_end_with_sources?: boolean
}
type Case = { id: string; route: 'analyze' | 'chat'; input?: string; question?: string; context: string; expect: Expect }

const MODEL = process.env.AI_MODEL?.trim() || 'claude-opus-5-5'
const PASS_THRESHOLD = 0.85
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }

const lower = (s: string) => s.toLowerCase()
const has = (text: string, needle: string) => lower(text).includes(lower(needle))

function checkAnalysis(r: AnalysisResult, e: Expect): string[] {
  const f: string[] = []
  if (e.type_contenu && !e.type_contenu.includes(r.type_contenu)) f.push(`type_contenu=${r.type_contenu}`)
  if (e.nature_reponse && !e.nature_reponse.includes(r.nature_reponse)) f.push(`nature_reponse=${r.nature_reponse}`)
  if (e.agressivite_min != null && r.agressivite < e.agressivite_min) f.push(`agressivite ${r.agressivite} < ${e.agressivite_min}`)
  if (e.agressivite_max != null && r.agressivite > e.agressivite_max) f.push(`agressivite ${r.agressivite} > ${e.agressivite_max}`)
  if (e.ton_min != null && r.ton < e.ton_min) f.push(`ton ${r.ton} < ${e.ton_min}`)
  if (e.ton_max != null && r.ton > e.ton_max) f.push(`ton ${r.ton} > ${e.ton_max}`)
  if (e.clarte_min != null && r.clarte < e.clarte_min) f.push(`clarte ${r.clarte} < ${e.clarte_min}`)
  if (e.mots_blessants_min != null && r.mots_blessants.length < e.mots_blessants_min) f.push(`mots_blessants ${r.mots_blessants.length} < ${e.mots_blessants_min}`)
  if (e.mots_blessants_max != null && r.mots_blessants.length > e.mots_blessants_max) f.push(`mots_blessants ${r.mots_blessants.length} > ${e.mots_blessants_max}`)
  for (const n of e.reformulation_must_not_contain ?? []) if (has(r.reformulation, n)) f.push(`reformulation contient « ${n} »`)
  for (const n of e.resume_must_not_contain ?? []) if (has(r.resume, n)) f.push(`resume contient « ${n} »`)
  if (e.any_field_must_contain_any) {
    const all = [r.resume, r.impact, r.reformulation, ...r.conseils].join('\n')
    if (!e.any_field_must_contain_any.some((n) => has(all, n))) f.push(`aucun de ${e.any_field_must_contain_any.join('/')} dans la sortie`)
  }
  return f
}

function checkChat(text: string, e: Expect): string[] {
  const f: string[] = []
  if (e.must_contain_any && !e.must_contain_any.some((n) => has(text, n))) f.push(`aucun de « ${e.must_contain_any.join(' / ')} »`)
  for (const n of e.must_not_contain ?? []) if (has(text, n)) f.push(`contient « ${n} »`)
  if (e.must_not_match && new RegExp(e.must_not_match, 'i').test(text)) f.push(`correspond à /${e.must_not_match}/`)
  if (e.must_end_with_sources) {
    const last = text.trim().split('\n').filter(Boolean).at(-1) ?? ''
    if (!/^sources\s*:/i.test(last.trim())) f.push('pas de ligne « Sources : » finale')
  }
  return f
}

function cost(u: Anthropic.Beta.BetaUsage): number {
  return ((u.input_tokens ?? 0) * PRICE.input + (u.output_tokens ?? 0) * PRICE.output + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) / 1e6
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : 0
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY manquante : impossible de lancer une évaluation réelle.')
    process.exit(2)
  }
  const filters = process.argv.slice(2)
  const file = new URL('./coach-eval.jsonl', import.meta.url)
  const cases = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Case)
    .filter((c) => !filters.length || filters.some((p) => c.id.startsWith(p)))

  const client = new Anthropic({ maxRetries: 2, timeout: 120_000 })
  const fallback = process.env.AI_FALLBACKS === 'off' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
  const latencies: number[] = []
  let total = 0
  let passed = 0
  let spent = 0

  console.log(`Modèle ${MODEL} · prompts ${PROMPT_VERSION} · ${cases.length} cas\n`)
  for (const c of cases) {
    const t0 = Date.now()
    let failures: string[] = []
    try {
      if (c.route === 'analyze') {
        const msg = await client.beta.messages.parse({
          model: MODEL,
          max_tokens: 12_000,
          system: [{ type: 'text', text: ANALYSIS_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `<espace_parent>\n${c.context}\n</espace_parent>\n\n<contenu_a_analyser type="message_ecrit">\n${neutralizeTags(c.input ?? '')}\n</contenu_a_analyser>\n\nAnalyse ce contenu selon ta méthode et réponds au format JSON imposé.` }],
          output_config: { effort: 'medium', format: betaZodOutputFormat(AnalysisOutputSchema) },
          ...fallback,
        })
        spent += cost(msg.usage)
        if (msg.stop_reason === 'refusal') failures.push('refus')
        else if (!msg.parsed_output) failures.push('sortie non conforme au schéma')
        else failures = checkAnalysis(normalizeAnalysis(msg.parsed_output), c.expect)
      } else {
        const msg = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 8_000,
          system: [{ type: 'text', text: CHAT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: [
            { type: 'text', text: `<espace_parent>\n${c.context}\n</espace_parent>` },
            { type: 'text', text: `<question_parent>\n${neutralizeTags(c.question ?? '')}\n</question_parent>` },
          ] }],
          output_config: { effort: 'low' },
          ...fallback,
        })
        spent += cost(msg.usage)
        const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
        failures = msg.stop_reason === 'refusal' ? ['refus'] : checkChat(text, c.expect)
      }
    } catch (err) {
      failures = [`erreur API : ${err instanceof Anthropic.APIError ? err.status : (err as Error).message}`]
    }
    const ms = Date.now() - t0
    latencies.push(ms)
    total++
    if (!failures.length) passed++
    console.log(`${failures.length ? 'ÉCHEC' : 'OK   '} ${c.id.padEnd(26)} ${String(ms).padStart(6)} ms${failures.length ? `  → ${failures.join(' ; ')}` : ''}`)
  }

  const rate = total ? passed / total : 0
  console.log(`\nRéussite ${passed}/${total} (${Math.round(rate * 100)} %) · latence p50 ${pct(latencies, 50)} ms · p95 ${pct(latencies, 95)} ms · coût ≈ ${spent.toFixed(4)} $`)
  process.exit(rate >= PASS_THRESHOLD ? 0 : 1)
}

void main()
