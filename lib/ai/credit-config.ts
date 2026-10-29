// Catalogue des crédits IA (cahier V6) : SOURCE UNIQUE des valeurs PAR DÉFAUT et validation.
// Module PUR : importable par les routes, l'admin, les écrans et les tests.
//
// La configuration ACTIVE vit en base (public.credit_config, 0520), VERSIONNÉE : chaque
// modification depuis l'administration crée une nouvelle version (aucune écrasée), lue par les
// fonctions SQL de réservation et par lib/ai/credit-config-server.ts. Sans base (démonstration)
// ou si la lecture échoue : DEFAULT_CREDIT_CONFIG (= version 1 insérée par la migration).
//
// Unités : les coûts sont des CRÉDITS (unités commerciales internes), jamais des tokens.
// Les prix d'ABONNEMENT ne sont PAS ici : ils restent dans le code (components/profil/pricing.ts)
// et dans Stripe (un Price Stripe est immuable ; changer un prix = nouveau Price + déploiement).
import { z } from 'zod'
import type { PlanId } from '@/components/profil/pricing'

/** Actions IA du catalogue (identifiants stables, jamais traduits). */
export const CREDIT_ACTIONS = ['chat_question', 'situation_analysis', 'document_analysis', 'custom_letter', 'full_dossier'] as const
export type CreditAction = (typeof CREDIT_ACTIONS)[number]

export type ActionConfig = {
  /** Coût en crédits, débité à la réservation, confirmé au succès, rendu en cas d'échec. */
  cost: number
  /** Inactive : refusée côté serveur (fonctionnalité absente ou suspendue). */
  active: boolean
  /** Plafond de tokens de sortie (réflexion comprise) envoyé au modèle. */
  maxOutputTokens: number
  /** Délai maximal de l'appel au modèle ; la réservation expire après ce délai + marge. */
  timeoutMs: number
}

export type PackConfig = { id: string; credits: number; priceCents: number; active: boolean }

export type ModelPrice = { input: number; output: number; cacheWrite: number; cacheRead: number }

export type CreditConfig = {
  /** Crédits mensuels inclus par formule (solde A), remis à zéro à chaque période, sans report. */
  monthlyCredits: Record<PlanId, number>
  actions: Record<CreditAction, ActionConfig>
  /** Packs de recharge (solde B). Le montant facturé est construit côté serveur depuis cette liste. */
  packs: PackConfig[]
  /** Validité des crédits achetés, en mois calendaires après l'achat. */
  purchasedValidityMonths: number
  limits: {
    /** Taille maximale d'un PDF et d'une image, en octets. */
    pdfMaxBytes: number
    imageMaxBytes: number
    /** Nombre maximal de pages d'un PDF (contrôlé AVANT la réservation). */
    pdfMaxPages: number
    /** Texte brut (.txt) : caractères transmis au modèle. */
    plainMaxChars: number
    /** Anti-abus du chat : requêtes par minute et par jour (par compte). */
    chatPerMinute: number
    chatPerDay: number
    /** Plafonds de dépense IA estimée (€) par jour (UTC) : par compte et global. 0 = aucun plafond. */
    dailySpendEurUser: number
    dailySpendEurGlobal: number
  }
  pricing: {
    /** Conversion USD → EUR appliquée au coût fournisseur estimé. */
    usdToEur: number
    /** Tarifs fournisseur en $ par million de tokens, par modèle. */
    models: Record<string, ModelPrice>
  }
}

/** Valeurs V6 validées par le porteur du projet (« Appliquer le V6 »). */
export const DEFAULT_CREDIT_CONFIG: CreditConfig = {
  monthlyCredits: { gratuit: 5, premium: 60, coparentalite: 200 },
  actions: {
    chat_question: { cost: 1, active: true, maxOutputTokens: 8_000, timeoutMs: 80_000 },
    situation_analysis: { cost: 2, active: true, maxOutputTokens: 12_000, timeoutMs: 110_000 },
    document_analysis: { cost: 3, active: true, maxOutputTokens: 12_000, timeoutMs: 110_000 },
    // Au catalogue mais SANS fonctionnalité (consigne produit : pas de nouveau module) : inactives.
    custom_letter: { cost: 3, active: false, maxOutputTokens: 8_000, timeoutMs: 90_000 },
    full_dossier: { cost: 5, active: false, maxOutputTokens: 16_000, timeoutMs: 110_000 },
  },
  packs: [
    { id: 'pack10', credits: 10, priceCents: 249, active: true },
    { id: 'pack30', credits: 30, priceCents: 599, active: true },
    { id: 'pack75', credits: 75, priceCents: 1199, active: true },
    { id: 'pack150', credits: 150, priceCents: 1999, active: true },
  ],
  purchasedValidityMonths: 24,
  limits: {
    pdfMaxBytes: 10 * 1024 * 1024,
    imageMaxBytes: 5 * 1024 * 1024,
    pdfMaxPages: 30,
    plainMaxChars: 20_000,
    chatPerMinute: 12,
    chatPerDay: 100,
    dailySpendEurUser: 3,
    dailySpendEurGlobal: 100,
  },
  pricing: {
    usdToEur: 0.92,
    models: { 'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 } },
  },
}

// --- Validation (édition admin, lecture en base) ------------------------------------------------

const int = (min: number, max: number) => z.number().int().min(min).max(max)
const actionSchema = z.object({
  cost: int(0, 50),
  active: z.boolean(),
  maxOutputTokens: int(256, 64_000),
  timeoutMs: int(5_000, 280_000),
}).strict()
const priceSchema = z.object({
  input: z.number().min(0).max(1000),
  output: z.number().min(0).max(1000),
  cacheWrite: z.number().min(0).max(1000),
  cacheRead: z.number().min(0).max(1000),
}).strict()

export const creditConfigSchema = z.object({
  monthlyCredits: z.object({ gratuit: int(0, 10_000), premium: int(0, 10_000), coparentalite: int(0, 10_000) }).strict(),
  actions: z.object(Object.fromEntries(CREDIT_ACTIONS.map((a) => [a, actionSchema])) as Record<CreditAction, typeof actionSchema>).strict(),
  packs: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]{1,32}$/),
    credits: int(1, 1000),
    priceCents: int(50, 100_000),
    active: z.boolean(),
  }).strict()).min(1).max(8)
    .refine((p) => new Set(p.map((x) => x.id)).size === p.length, 'Identifiants de packs en double.')
    .refine((p) => p.some((x) => x.active), 'Au moins un pack doit rester actif.'),
  purchasedValidityMonths: int(1, 36),
  limits: z.object({
    pdfMaxBytes: int(100_000, 32 * 1024 * 1024),
    imageMaxBytes: int(100_000, 10 * 1024 * 1024),
    pdfMaxPages: int(1, 100),
    plainMaxChars: int(1_000, 100_000),
    chatPerMinute: int(1, 60),
    chatPerDay: int(1, 1000),
    dailySpendEurUser: z.number().min(0).max(1000),
    dailySpendEurGlobal: z.number().min(0).max(100_000),
  }).strict(),
  pricing: z.object({
    usdToEur: z.number().min(0.1).max(10),
    models: z.record(z.string().regex(/^[a-z0-9._-]{1,64}$/), priceSchema)
      .refine((m) => Object.keys(m).length >= 1 && Object.keys(m).length <= 10, '1 à 10 modèles.'),
  }).strict(),
}).strict()

/** Configuration d'une entrée non fiable (base, formulaire) ; null si invalide. */
export function parseCreditConfig(value: unknown): CreditConfig | null {
  const r = creditConfigSchema.safeParse(value)
  return r.success ? (r.data as CreditConfig) : null
}

// --- Correspondances ---------------------------------------------------------------------------

/** Type d'entrée du Coach (lib/ai/analyses.ts#CoachKind) → action facturée. */
export function actionForKind(kind: 'capture' | 'pdf' | 'word' | 'document' | 'message'): CreditAction {
  return kind === 'message' || kind === 'capture' ? 'situation_analysis' : 'document_analysis'
}

/** Seuil à partir duquel l'interface demande une confirmation explicite avant l'action. */
export const CONFIRM_COST_THRESHOLD = 3

export function needsConfirmation(cost: number): boolean {
  return cost >= CONFIRM_COST_THRESHOLD
}

/** Packs proposés à l'achat (actifs), du plus petit au plus grand. */
export function activePacks(cfg: CreditConfig): PackConfig[] {
  return cfg.packs.filter((p) => p.active).sort((a, b) => a.credits - b.credits)
}

/**
 * Coût fournisseur estimé d'un appel, en euros (6 décimales). Modèle inconnu du catalogue :
 * tarif du premier modèle configuré (jamais 0 : un coût sous-estimé fausserait les plafonds).
 */
export function estimateCostEur(
  cfg: CreditConfig,
  model: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | null | undefined,
): number {
  if (!usage) return 0
  const price = cfg.pricing.models[model] ?? Object.values(cfg.pricing.models)[0]
  if (!price) return 0
  const usd =
    ((usage.input_tokens ?? 0) * price.input +
      (usage.output_tokens ?? 0) * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1_000_000
  return Math.round(usd * cfg.pricing.usdToEur * 1e6) / 1e6
}

// --- Garde-fous des documents (AVANT réservation) --------------------------------------------

/**
 * Nombre de pages d'un PDF, estimé sans dépendance : objets `/Type /Page` (hors `/Pages`).
 * Un PDF compressé en flux d'objets peut échapper au comptage : on retient alors le compteur
 * `/Count` de l'arbre des pages (le plus grand). 0 = inconnu (le modèle refusera s'il est illisible).
 */
export function pdfPageCount(buf: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(buf)
  const pages = (text.match(/\/Type\s{0,8}\/Page(?![s\w])/g) ?? []).length
  let count = 0
  // Fenêtres bornées (256 caractères) : aucun retour arrière quadratique sur un fichier piégé.
  for (const m of text.matchAll(/\/Type\s{0,8}\/Pages[^>]{0,256}?\/Count\s{1,8}(\d{1,6})/g)) count = Math.max(count, Number(m[1]))
  for (const m of text.matchAll(/\/Count\s{1,8}(\d{1,6})[^>]{0,256}?\/Type\s{0,8}\/Pages/g)) count = Math.max(count, Number(m[1]))
  return Math.max(pages, count)
}

export type DocumentRefusal = 'pdf_too_large' | 'pdf_too_many_pages' | 'image_too_large'

/** Contrôle taille / pages d'un fichier selon la configuration ; null si accepté. */
export function documentRefusal(
  cfg: CreditConfig,
  file: { kind: 'pdf' | 'image'; bytes: number; pages?: number },
): DocumentRefusal | null {
  if (file.kind === 'image') return file.bytes > cfg.limits.imageMaxBytes ? 'image_too_large' : null
  if (file.bytes > cfg.limits.pdfMaxBytes) return 'pdf_too_large'
  if ((file.pages ?? 0) > cfg.limits.pdfMaxPages) return 'pdf_too_many_pages'
  return null
}
