/**
 * Schémas zod du Coach IA (sans 'server-only' : importables par le harnais d'évaluation).
 *
 * - AnalysisOutputSchema : contrat de sortie STRUCTURÉE demandé au modèle
 *   (output_config.format). On n'y met pas de bornes numériques/longueurs, que les
 *   structured outputs ne garantissent pas : on borne APRÈS coup (normalizeAnalysis).
 * - ChatBodySchema : corps validé de POST /api/coach/chat.
 * - HistoryPatchSchema / HistoryDeleteSchema : actions sur l'historique.
 */
import * as z from 'zod/v4'

export const CONTENT_TYPES = ['message_ecrit', 'capture_conversation', 'document', 'autre'] as const
export const RESPONSE_NATURES = ['reformulation', 'reponse_suggeree', 'aucune'] as const

export const AnalysisOutputSchema = z.object({
  type_contenu: z.enum(CONTENT_TYPES).describe(
    "Nature du contenu analysé : message rédigé par le parent, capture d'écran de conversation, document, ou autre (illisible / hors sujet).",
  ),
  texte_lu: z.string().describe(
    "Transcription fidèle du texte lu (OCR pour une image, extrait principal pour un document). Chaîne vide si rien n'est lisible.",
  ),
  ton: z.number().int().describe('Ton général, entier de 0 (très hostile) à 100 (très apaisé et cordial).'),
  agressivite: z.number().int().describe("Niveau d'agressivité, entier de 0 (aucune) à 100 (très agressif)."),
  mots_blessants: z.array(z.string()).describe('Expressions blessantes, accusatrices ou réactives, citées telles quelles (8 au maximum).'),
  clarte: z.number().int().describe('Clarté du message, entier de 0 (confus) à 100 (très clair et concret).'),
  respect: z.number().int().describe('Respect et bienveillance, entier de 0 (irrespectueux) à 100 (très respectueux).'),
  impact: z.string().describe("Une ou deux phrases sur l'impact probable sur la communication entre les parents et sur l'enfant."),
  resume: z.string().describe('Résumé neutre du contenu en deux ou trois phrases.'),
  nature_reponse: z.enum(RESPONSE_NATURES).describe(
    "reformulation : le contenu est un brouillon du parent, reformulé ; reponse_suggeree : le contenu est un message reçu, une réponse apaisée est proposée ; aucune : rien à proposer.",
  ),
  reformulation: z.string().describe(
    'Texte prêt à envoyer (reformulation apaisée ou réponse suggérée), centré sur l’intérêt de l’enfant. Chaîne vide si nature_reponse = aucune.',
  ),
  conseils: z.array(z.string()).describe('Trois à cinq conseils de communication courts et concrets.'),
})

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>

/** Résultat stocké / renvoyé au client : sortie normalisée + métadonnées. */
export type AnalysisResult = AnalysisOutput & {
  disclaimer: string
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 50)))
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export const LEGAL_DISCLAIMER = 'Le Coach IA ne donne pas de conseil juridique.'

/** Bornes appliquées après parsing : on ne fait jamais confiance aveuglément à la sortie du modèle. */
export function normalizeAnalysis(raw: AnalysisOutput, disclaimer: string = LEGAL_DISCLAIMER): AnalysisResult {
  return {
    type_contenu: raw.type_contenu,
    texte_lu: cut(raw.texte_lu.trim(), 6000),
    ton: clamp100(raw.ton),
    agressivite: clamp100(raw.agressivite),
    mots_blessants: raw.mots_blessants.map((m) => cut(m.trim(), 120)).filter(Boolean).slice(0, 8),
    clarte: clamp100(raw.clarte),
    respect: clamp100(raw.respect),
    impact: cut(raw.impact.trim(), 600),
    resume: cut(raw.resume.trim(), 800),
    nature_reponse: raw.nature_reponse,
    reformulation: cut(raw.reformulation.trim(), 2500),
    conseils: raw.conseils.map((c) => cut(c.trim(), 240)).filter(Boolean).slice(0, 6),
    disclaimer,
  }
}

/** Validation souple d'un résultat relu depuis la base (jsonb) ou le sessionStorage. */
export const StoredAnalysisResultSchema = AnalysisOutputSchema.extend({ disclaimer: z.string().optional() })

// --- Chat ---------------------------------------------------------------

export const CHAT_MAX_TURNS = 20
export const CHAT_MAX_CHARS_PER_TURN = 4000
export const CHAT_MAX_TOTAL_CHARS = 30_000

export const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(CHAT_MAX_CHARS_PER_TURN),
})
export type ChatTurn = z.infer<typeof ChatTurnSchema>

export const ChatBodySchema = z
  .object({
    messages: z.array(ChatTurnSchema).min(1).max(40),
    analysisId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
    includeMedical: z.boolean().optional().default(false),
  })
  .refine((b) => b.messages[b.messages.length - 1]?.role === 'user', { message: 'Le dernier message doit être une question.' })

// --- Historique -----------------------------------------------------------

const IdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)

export const HistoryPatchSchema = z.object({ id: IdSchema, archived: z.boolean() })

export const HistoryDeleteSchema = z.union([
  z.object({ id: IdSchema }),
  z.object({ all: z.literal(true), archived: z.boolean() }),
])
