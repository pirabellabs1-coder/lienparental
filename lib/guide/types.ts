/**
 * Guide Parent (territorialisé) : schémas de contenu et types.
 *
 * Le contenu vit dans `content/guide/<territoire>/` (JSON validé par zod au chargement) :
 *   territoire.json          métadonnées du territoire (nom, disponible, ordre)
 *   fiches/<slug>.json       une fiche pratique
 *   parcours/<slug>.json     un parcours / checklist
 *   partenaires.demo.json    (facultatif) exemples fictifs affichés en mode démonstration uniquement
 * Ajouter un territoire = ajouter un dossier ; aucun code à modifier.
 */
import { z } from 'zod'
import { VAULT_CATEGORY_SLUGS } from '@/lib/prefill'
import { DEPENSE_CATEGORIES } from '@/lib/journal-finances'

// --- Catégories (communes à tous les territoires, cf. récap v2) ---------------

export const GUIDE_CATEGORIES = [
  { key: 'ecole', label: 'École & scolarité', court: 'École' },
  { key: 'sante', label: 'Santé', court: 'Santé' },
  { key: 'aides', label: 'Aides & droits', court: 'Aides' },
  { key: 'argent', label: 'Banque & argent', court: 'Argent' },
  { key: 'assurances', label: 'Assurances', court: 'Assurances' },
  { key: 'naissance', label: 'Naissance & petite enfance', court: 'Naissance' },
  { key: 'separation', label: 'Séparation & parentalité', court: 'Séparation' },
  { key: 'loisirs', label: 'Loisirs & activités', court: 'Loisirs' },
  { key: 'logement', label: 'Logement & vie quotidienne', court: 'Logement' },
] as const

export type GuideCategoryKey = (typeof GUIDE_CATEGORIES)[number]['key']
export const GUIDE_CATEGORY_KEYS = GUIDE_CATEGORIES.map((c) => c.key) as [GuideCategoryKey, ...GuideCategoryKey[]]

export function getCategory(key: string) {
  return GUIDE_CATEGORIES.find((c) => c.key === key)
}

// --- Contrat d'URL (valeurs autorisées) ---------------------------------------

/** Catégories de dépense du Journal (récap v2, Nouveauté 1) : source unique lib/journal-finances. */
export { DEPENSE_CATEGORIES }

/** Types d'événement de calendrier proposés par le guide (sous-ensemble de EventTypeKey). */
export const GUIDE_EVENT_TYPES = ['sante', 'rdv', 'ecole', 'activite', 'autre'] as const

// --- Schémas ------------------------------------------------------------------

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug invalide').max(80)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ')
const httpsUrl = z.string().url().startsWith('https://', 'URL https attendue')
const text = (max: number) => z.string().trim().min(1).max(max)

export const sourceSchema = z.object({
  titre: text(200),
  url: httpsUrl,
  /** Date « Vérifié le » affichée par la source, si connue. */
  verifieLe: isoDate.optional(),
})

export const lienSchema = z.object({
  titre: text(160),
  url: httpsUrl,
})

export const documentSchema = z.object({
  id: slug,
  libelle: text(200),
  detail: text(300).optional(),
  /** Catégorie du coffre-fort suggérée pour ranger ce document. */
  coffre: z.enum(VAULT_CATEGORY_SLUGS).optional(),
})

export const etapeSchema = z.object({
  titre: text(200),
  detail: text(600).optional(),
})

export const organismeSchema = z.object({
  nom: text(160),
  detail: text(400).optional(),
  url: httpsUrl.optional(),
  telephone: z.string().regex(/^[0-9 +]{2,20}$/).optional(),
})

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('coffre'), titre: text(120), categorie: z.enum(VAULT_CATEGORY_SLUGS) }),
  z.object({ type: z.literal('calendrier'), titre: text(120), evenement: z.enum(GUIDE_EVENT_TYPES) }),
  z.object({ type: z.literal('rappel'), titre: text(120), evenement: z.enum(GUIDE_EVENT_TYPES) }),
  z.object({
    type: z.literal('depense'),
    titre: text(120),
    categorie: z.enum(DEPENSE_CATEGORIES),
    /** Montant en euros, uniquement s'il est connu ET sourcé (montantSource obligatoire). */
    montant: z.number().positive().max(100000).optional(),
    montantSource: httpsUrl.optional(),
  }),
]).superRefine((a, ctx) => {
  if (a.type === 'depense' && a.montant !== undefined && a.montantSource === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'un montant doit être accompagné de sa source (montantSource)' })
  }
})

export const ficheSchema = z.object({
  slug,
  territoire: slug,
  categorie: z.enum(GUIDE_CATEGORY_KEYS),
  titre: text(120),
  resume: text(300),
  aQuoiCaSert: text(1200),
  quiEstConcerne: z.array(text(400)).min(1),
  /** Points clés chiffrés ou réglementaires, tous couverts par les sources. */
  aSavoir: z.array(text(500)).default([]),
  documents: z.array(documentSchema).default([]),
  etapes: z.array(etapeSchema).min(1),
  ou: z.array(organismeSchema).min(1),
  liens: z.array(lienSchema).min(1),
  actions: z.array(actionSchema).default([]),
  datesLimites: z.array(z.object({ libelle: text(200), detail: text(400).optional() })).default([]),
  /** Informations locales incertaines, affichées comme « À confirmer ». */
  aConfirmer: z.array(text(400)).default([]),
  motsCles: z.array(text(40)).default([]),
  derniereVerification: isoDate,
  sources: z.array(sourceSchema).min(1),
})

export const parcoursSchema = z.object({
  slug,
  territoire: slug,
  titre: text(120),
  resume: text(300),
  /** Ordre d'affichage sur l'accueil du guide (croissant). */
  ordre: z.number().int().default(100),
  elements: z.array(z.object({
    id: slug,
    titre: text(160),
    detail: text(300).optional(),
    /** Slug de la fiche liée (même territoire). */
    fiche: slug.optional(),
  })).min(1),
})

export const territoireSchema = z.object({
  code: slug,
  nom: text(60),
  disponible: z.boolean(),
  ordre: z.number().int().default(100),
})

export const partenaireSchema = z.object({
  id: text(64),
  territoire: slug,
  categorie: z.enum(GUIDE_CATEGORY_KEYS),
  nom: text(120),
  type: z.enum(['partenaire', 'sponsorise']),
  description: text(400),
  criteres: z.array(z.object({ libelle: text(80), valeur: text(160) })).min(1),
  lien: httpsUrl.nullable().default(null),
  /** Exemple fictif (mode démonstration) : toujours étiqueté comme tel. */
  demo: z.boolean().default(false),
})

export type Fiche = z.infer<typeof ficheSchema>
export type FicheAction = z.infer<typeof actionSchema>
export type Parcours = z.infer<typeof parcoursSchema>
export type Territoire = z.infer<typeof territoireSchema>
export type Partenaire = z.infer<typeof partenaireSchema>

/** Vue allégée pour la recherche et les listes (envoyée au navigateur). */
export type FicheResume = Pick<Fiche, 'slug' | 'categorie' | 'titre' | 'resume' | 'motsCles'>

// --- Progression --------------------------------------------------------------

export const PROGRESS_STATUSES = ['a_faire', 'en_cours', 'termine'] as const
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number]
export type ProgressRefType = 'fiche' | 'parcours'
/** Élément réservé : la fiche entière (« Marquer comme terminé »). */
export const FICHE_ELEMENT = '_fiche'

export const STATUS_LABEL: Record<ProgressStatus, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  termine: 'Terminé',
}

export const DEFAULT_TERRITOIRE = 'guyane'
