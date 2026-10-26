/**
 * Contrat d'URL de pré-remplissage (docs/RECAP_FONCTIONNEL_V2.md).
 *
 * Tous les paramètres sont facultatifs. Chaque valeur est validée et bornée ;
 * une valeur invalide est IGNORÉE (jamais d'erreur bloquante, jamais injectée
 * comme HTML : les valeurs ne servent qu'à initialiser des champs contrôlés React).
 * Rien de médical ne doit transiter par ces URL : on n'y passe que des
 * identifiants, des types et un titre libre saisi par l'utilisateur.
 */
import type { EventTypeKey } from '@/lib/calendrier'
import { isDepenseCategorie, parseAmountToCents, type DepenseCategorie } from '@/lib/journal-finances'

export type RawParams = Record<string, string | string[] | undefined>

/** Première valeur d'un paramètre (Next fournit un tableau si répété). */
function first(p: RawParams, key: string): string | undefined {
  const v = p[key]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : undefined
}

// Caractères de contrôle / séparateurs invisibles retirés des textes libres.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g

/** Texte libre : contrôle retirés, espaces normalisés, borné à `max`. */
export function cleanText(raw: string | undefined, max: number): string | undefined {
  if (!raw) return undefined
  const s = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return s || undefined
}

/** YYYY-MM-DD d'une date réelle (rejette 2026-02-31), bornée 1900–2100. */
export function cleanDate(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined
  const [y, m, d] = raw.split('-').map(Number)
  if (y < 1900 || y > 2100) return undefined
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? raw : undefined
}

/** HH:MM 24 h. */
export function cleanTime(raw: string | undefined): string | undefined {
  return raw && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : undefined
}

/** Identifiant d'enfant plausible (UUID en production, `c_1` en démo). L'appartenance est vérifiée par l'appelant. */
export function cleanId(raw: string | undefined): string | undefined {
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : undefined
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `source=guide:<slug>` → chemin interne de retour. Toute autre forme est ignorée (pas de redirection ouverte). */
export function cleanSource(raw: string | undefined): { slug: string; href: string } | undefined {
  if (!raw || !raw.startsWith('guide:')) return undefined
  const slug = raw.slice('guide:'.length)
  if (slug.length === 0 || slug.length > 80 || !SLUG.test(slug)) return undefined
  return { slug, href: `/app/guide/${slug}` }
}

// --- Calendrier --------------------------------------------------------------

const EVENT_TYPE_KEYS: readonly EventTypeKey[] = [
  'visite', 'appel', 'message', 'sante', 'rdv', 'ecole', 'activite', 'sortie', 'repas', 'deplacement', 'anniversaire', 'autre',
]

export type CalendarPrefill = {
  type?: EventTypeKey
  titre?: string
  date?: string
  heure?: string
  enfant?: string
  rappel?: boolean
  source?: { slug: string; href: string }
}

/** `/app/calendrier/nouveau?type=sante&titre=…&date=YYYY-MM-DD&heure=HH:MM&enfant=<id>&rappel=1&source=guide:<slug>` */
export function parseCalendarPrefill(p: RawParams): CalendarPrefill {
  const type = first(p, 'type')
  return {
    type: (EVENT_TYPE_KEYS as readonly string[]).includes(type ?? '') ? (type as EventTypeKey) : undefined,
    titre: cleanText(first(p, 'titre'), 120),
    date: cleanDate(first(p, 'date')),
    heure: cleanTime(first(p, 'heure')),
    enfant: cleanId(first(p, 'enfant')),
    rappel: first(p, 'rappel') === '1' ? true : undefined,
    source: cleanSource(first(p, 'source')),
  }
}

// --- Journal ----------------------------------------------------------------

export const JOURNAL_PREFILL_TYPES = ['visite', 'appel', 'message', 'sante', 'depense', 'autre'] as const
export type JournalPrefillType = (typeof JOURNAL_PREFILL_TYPES)[number]

export type JournalPrefill = {
  type?: JournalPrefillType
  titre?: string
  montantCents?: number
  categorie?: DepenseCategorie
  /** Identifiant brut : à confronter à la liste réelle des enfants avant usage. */
  enfant?: string
  date?: string
  /** Slug du guide (`source=guide:<slug>`) → lien « Retour au guide ». */
  guideSlug?: string
}

/**
 * `/app/journal/nouveau?type=depense&titre=…&montant=12,50&categorie=sante&enfant=<id>&date=YYYY-MM-DD&source=guide:<slug>`
 * `today` ("yyyy-mm-dd", DEFAULT_TZ) borne la date : pas de futur, pas plus de 10 ans en arrière.
 */
export function parseJournalPrefill(p: RawParams, today?: string): JournalPrefill {
  const out: JournalPrefill = {}
  const type = first(p, 'type')
  if (type && (JOURNAL_PREFILL_TYPES as readonly string[]).includes(type)) out.type = type as JournalPrefillType

  const titre = cleanText(first(p, 'titre'), 120)
  if (titre) out.titre = titre

  const montant = first(p, 'montant')
  const cents = montant && montant.length <= 20 ? parseAmountToCents(montant) : null
  if (cents !== null) out.montantCents = cents

  const categorie = first(p, 'categorie')
  if (isDepenseCategorie(categorie)) out.categorie = categorie

  const enfant = cleanId(first(p, 'enfant'))
  if (enfant) out.enfant = enfant

  const date = cleanDate(first(p, 'date'))
  if (date) {
    const min = today ? `${Number(today.slice(0, 4)) - 10}${today.slice(4)}` : '1990-01-01'
    if ((!today || date <= today) && date >= min) out.date = date
  }

  const source = cleanSource(first(p, 'source'))
  if (source) out.guideSlug = source.slug
  return out
}

// --- Coffre-fort ------------------------------------------------------------

export const VAULT_CATEGORY_SLUGS = ['jaf', 'scolarite', 'sante', 'finances', 'courriers', 'autres'] as const
export type VaultCategorySlug = (typeof VAULT_CATEGORY_SLUGS)[number]

/** Nom des catégories par défaut (créées au 1er accès, cf. lib/data/vault) — sert à retrouver l'UUID en production. */
export const VAULT_CATEGORY_NAMES: Record<VaultCategorySlug, string> = {
  jaf: 'Dossier JAF',
  scolarite: 'Scolarité',
  sante: 'Santé',
  finances: 'Finances',
  courriers: 'Courriers',
  autres: 'Autres',
}

export type VaultPrefill = {
  categorie?: VaultCategorySlug
  titre?: string
  enfant?: string
  source?: { slug: string; href: string }
}

/** `/app/coffre/ajouter?categorie=<slug>&titre=…&enfant=<id>&source=guide:<slug>` */
export function parseVaultPrefill(p: RawParams): VaultPrefill {
  const cat = first(p, 'categorie')
  return {
    categorie: (VAULT_CATEGORY_SLUGS as readonly string[]).includes(cat ?? '') ? (cat as VaultCategorySlug) : undefined,
    titre: cleanText(first(p, 'titre'), 120),
    enfant: cleanId(first(p, 'enfant')),
    source: cleanSource(first(p, 'source')),
  }
}

/** Retrouve une catégorie par slug (démo : id = slug ; production : nom par défaut, insensible aux accents). */
export function matchCategory<T extends { id: string; name: string }>(cats: T[], slug: VaultCategorySlug): T | undefined {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const target = norm(VAULT_CATEGORY_NAMES[slug])
  return cats.find((c) => c.id === slug) ?? cats.find((c) => norm(c.name) === target)
}

/** Construit une URL interne de pré-remplissage (encodage systématique). */
export function prefillHref(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}
