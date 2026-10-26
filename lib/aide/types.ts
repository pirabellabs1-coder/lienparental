/**
 * Centre d'aide administrable (mission M6) : FAQ, tutoriels, conseils du jour.
 * Module PUR (isomorphe) : schémas partagés par le back-office, le dépôt des contenus
 * (lib/contenus) et les lectures publiques du centre d'aide.
 * Tables : faq_items, tutorials, daily_tips (supabase/migrations/0400_admin_operations.sql).
 */
import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1, 'Champ obligatoire.').max(max, `${max} caractères au maximum.`)
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug : minuscules, chiffres et tirets.').max(80, '80 caractères au maximum.')
const ordre = z.coerce.number().int('Nombre entier.').min(0, 'Entre 0 et 10 000.').max(10000, 'Entre 0 et 10 000.').default(100)

// --- FAQ ---------------------------------------------------------------------------

/** Catégories du centre d'aide (miroir de content/faq/index.json et de la contrainte SQL). */
export const FAQ_CATEGORIES = [
  { key: 'prise-en-main', label: 'Prise en main' },
  { key: 'confidentialite-securite', label: 'Confidentialité & sécurité' },
  { key: 'coffre-fort', label: 'Coffre-fort' },
  { key: 'temoignages', label: 'Témoignages' },
  { key: 'coach-ia', label: 'Coach IA' },
  { key: 'abonnement', label: 'Abonnement' },
  { key: 'compte', label: 'Compte' },
] as const
export type FaqCategory = (typeof FAQ_CATEGORIES)[number]['key']
const FAQ_KEYS = FAQ_CATEGORIES.map((c) => c.key) as [FaqCategory, ...FaqCategory[]]

export function faqCategoryLabel(key: string): string {
  return FAQ_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export const faqSchema = z.object({
  slug,
  question: text(160),
  categorie: z.enum(FAQ_KEYS, { errorMap: () => ({ message: 'Choisissez une catégorie.' }) }),
  reponse: text(20000),
  ordre,
})
export type FaqItem = z.output<typeof faqSchema>

export function emptyFaq(): FaqItem {
  return { slug: 'nouvelle-question', question: 'Nouvelle question ?', categorie: 'prise-en-main', reponse: 'Réponse en quelques phrases claires.', ordre: 100 }
}

// --- Tutoriels ----------------------------------------------------------------------

export const TUTO_ICONS = [
  { key: 'rocket', label: 'Fusée (démarrage)' },
  { key: 'sparkles', label: 'Étincelles (Coach IA)' },
  { key: 'upload', label: 'Envoi (documents)' },
  { key: 'user-check', label: 'Personne (témoignage)' },
  { key: 'folder-down', label: 'Dossier (export)' },
  { key: 'star', label: 'Étoile (Premium)' },
] as const
export type TutoIcon = (typeof TUTO_ICONS)[number]['key']
const ICON_KEYS = TUTO_ICONS.map((c) => c.key) as [TutoIcon, ...TutoIcon[]]

export const tutorielSchema = z.object({
  slug,
  titre: text(120),
  resume: z.string().trim().max(300, '300 caractères au maximum.').default(''),
  dureeMin: z.coerce.number().int('Nombre entier.').min(1, 'Entre 1 et 60 minutes.').max(60, 'Entre 1 et 60 minutes.'),
  icone: z.enum(ICON_KEYS, { errorMap: () => ({ message: 'Choisissez une icône.' }) }),
  contenu: text(40000),
  ordre,
})
export type Tutoriel = z.output<typeof tutorielSchema>

export function emptyTutoriel(): Tutoriel {
  return { slug: 'nouveau-tutoriel', titre: 'Nouveau tutoriel', resume: '', dureeMin: 3, icone: 'rocket', contenu: '1. **Première étape.** Décrivez l’action.\n', ordre: 100 }
}

// --- Conseils du jour ----------------------------------------------------------------

export const TIP_CATEGORIES = [
  { key: 'communication', label: 'Communication' },
  { key: 'preuves', label: 'Preuves' },
  { key: 'enfant', label: 'Enfant' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'juridique', label: 'Juridique' },
  { key: 'empathie', label: 'Empathie' },
] as const
export type TipCategory = (typeof TIP_CATEGORIES)[number]['key']
const TIP_KEYS = TIP_CATEGORIES.map((c) => c.key) as [TipCategory, ...TipCategory[]]

export function tipCategoryLabel(key: string): string {
  return TIP_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export const conseilSchema = z.object({
  slug,
  titre: text(80),
  texte: text(280),
  categorie: z.enum(TIP_KEYS, { errorMap: () => ({ message: 'Choisissez une catégorie.' }) }),
  ordre,
})
export type Conseil = z.output<typeof conseilSchema>

export function emptyConseil(): Conseil {
  return { slug: 'nouveau-conseil', titre: 'Nouveau conseil', texte: 'Une phrase concrète, applicable aujourd’hui.', categorie: 'communication', ordre: 100 }
}
