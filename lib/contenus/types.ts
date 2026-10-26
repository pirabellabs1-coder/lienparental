/**
 * Contenus éditoriaux administrables (chantier E) : types communs.
 *
 * Module PUR (ni React, ni serveur) : partagé par les routes API admin, le dépôt
 * (lib/contenus/repo.ts), les éditeurs du back-office et les pages publiques.
 *
 * Cinq familles de contenus, un seul cycle de vie :
 *   brouillon → publié ⇄ dépublié (= brouillon) → archivé → supprimé
 * Chaque écriture produit une version (historique, restauration).
 */
import { z } from 'zod'
import { ficheSchema, parcoursSchema, partenaireSchema, territoireSchema } from '@/lib/guide/types'
import { documentTemplateSchema } from '@/lib/modeles/template'
import { blogPostSchema } from '@/lib/blog/types'
import { conseilSchema, faqSchema, tutorielSchema } from '@/lib/aide/types'

export const CONTENT_KINDS = ['fiche', 'parcours', 'partenaire', 'modele', 'article', 'faq', 'tutoriel', 'conseil'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]

export function isContentKind(v: string): v is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(v)
}

export const CONTENT_KIND_LABEL: Record<ContentKind, { one: string; many: string; feminine: boolean }> = {
  fiche: { one: 'fiche', many: 'fiches', feminine: true },
  parcours: { one: 'parcours', many: 'parcours', feminine: false },
  partenaire: { one: 'offre partenaire', many: 'offres partenaires', feminine: true },
  modele: { one: 'modèle', many: 'modèles', feminine: false },
  article: { one: 'article', many: 'articles', feminine: false },
  faq: { one: 'question', many: 'questions', feminine: true },
  tutoriel: { one: 'tutoriel', many: 'tutoriels', feminine: false },
  conseil: { one: 'conseil', many: 'conseils', feminine: false },
}

export const CONTENT_STATUSES = ['brouillon', 'publie', 'archive'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const STATUS_LABEL: Record<ContentStatus, string> = {
  brouillon: 'Brouillon',
  publie: 'Publié',
  archive: 'Archivé',
}

// --- Données propres à chaque famille ------------------------------------------

/** Offre partenaire telle qu'éditée par l'admin (pas d'exemple fictif hors démonstration). */
export const partenaireInputSchema = partenaireSchema
  .omit({ demo: true })
  .extend({ demo: z.boolean().default(false) })
  .superRefine((p, ctx) => {
    // Règle éditoriale (récap v2, contrainte SQL chk_guide_partners_wording) : jamais « meilleur ».
    for (const [field, value] of [['nom', p.nom], ['description', p.description]] as const) {
      if (/meilleur/i.test(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Le mot « meilleur » est interdit : restez factuel.' })
      }
    }
    p.criteres.forEach((c, i) => {
      if (/meilleur/i.test(`${c.libelle} ${c.valeur}`)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['criteres', i, 'valeur'], message: 'Le mot « meilleur » est interdit : restez factuel.' })
      }
    })
    if (p.criteres.length > 8) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['criteres'], message: '8 critères au maximum.' })
  })

export const CONTENT_SCHEMAS = {
  fiche: ficheSchema,
  parcours: parcoursSchema,
  partenaire: partenaireInputSchema,
  modele: documentTemplateSchema,
  article: blogPostSchema,
  faq: faqSchema,
  tutoriel: tutorielSchema,
  conseil: conseilSchema,
} as const

export type ContentData = {
  fiche: z.output<typeof ficheSchema>
  parcours: z.output<typeof parcoursSchema>
  partenaire: z.output<typeof partenaireInputSchema>
  modele: z.output<typeof documentTemplateSchema>
  article: z.output<typeof blogPostSchema>
  faq: z.output<typeof faqSchema>
  tutoriel: z.output<typeof tutorielSchema>
  conseil: z.output<typeof conseilSchema>
}

export { territoireSchema }

/** Enregistrement générique (enveloppe éditoriale + données validées). */
export type ContentRecord<K extends ContentKind = ContentKind> = {
  id: string
  kind: K
  statut: ContentStatus
  /** Jeton de concurrence optimiste : incrémenté à chaque écriture. */
  version: number
  titre: string
  slug: string
  territoire: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  data: ContentData[K]
}

/** Ligne d'historique (instantané complet de l'élément après l'écriture). */
export type ContentVersion = {
  id: string
  version: number
  action: 'creation' | 'modification' | 'suppression'
  statut: ContentStatus | null
  titre: string
  actor: string | null
  createdAt: string
  snapshot: unknown
}

/** Titre et slug d'affichage, quel que soit le type de contenu. */
export function describe<K extends ContentKind>(kind: K, data: ContentData[K]): { titre: string; slug: string; territoire: string | null } {
  switch (kind) {
    case 'fiche': {
      const d = data as ContentData['fiche']
      return { titre: d.titre, slug: d.slug, territoire: d.territoire }
    }
    case 'parcours': {
      const d = data as ContentData['parcours']
      return { titre: d.titre, slug: d.slug, territoire: d.territoire }
    }
    case 'partenaire': {
      const d = data as ContentData['partenaire']
      return { titre: d.nom, slug: d.id, territoire: d.territoire }
    }
    case 'modele': {
      const d = data as ContentData['modele']
      return { titre: d.titre, slug: d.slug, territoire: null }
    }
    case 'faq': {
      const d = data as ContentData['faq']
      return { titre: d.question, slug: d.slug, territoire: null }
    }
    case 'tutoriel':
    case 'conseil': {
      const d = data as ContentData['tutoriel'] | ContentData['conseil']
      return { titre: d.titre, slug: d.slug, territoire: null }
    }
    default: {
      const d = data as ContentData['article']
      return { titre: d.titre, slug: d.slug, territoire: null }
    }
  }
}

/** Vrai si l'élément est visible du public à l'instant `now` (article programmé = pas encore). */
export function isLive(r: Pick<ContentRecord, 'statut' | 'publishedAt'>, now = Date.now()): boolean {
  if (r.statut !== 'publie') return false
  return !r.publishedAt || new Date(r.publishedAt).getTime() <= now
}

/** Message d'erreur zod lisible, champ par champ (pour l'éditeur). */
export function zodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Slug ASCII à partir d'un titre (« Rentrée scolaire 2026 » → « rentree-scolaire-2026 »). */
export function slugify(input: string, max = 80): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}
