/**
 * Territoires du Guide : logique PURE (ni `server-only` ni `node:fs`, importable côté client), partagée
 * par le chargeur serveur (lib/guide/load.ts), le pied de page et l'accueil, le sélecteur, le script de
 * semences SQL et les tests. Lecture des dossiers : lib/guide/territories-fs.ts.
 *
 * Disponibilité d'un territoire = champ `disponible` de son territoire.json (fichiers) ou de sa ligne
 * guide_territoires (base, prioritaire quand Supabase est actif). Rien n'est codé en dur ici : un
 * territoire passe « Disponible » dès que son contenu le dit.
 */
import { DEFAULT_TERRITOIRE, type Territoire } from './types'

export const TERRITORY_CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const isTerritoryCode = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && TERRITORY_CODE_RE.test(v)

/** Cookie du territoire choisi dans le Guide (public et espace parent). Préférence fonctionnelle, non sensible. */
export const GUIDE_TERRITORY_COOKIE = 'lp_guide_territoire'
const ONE_YEAR = 60 * 60 * 24 * 365

/** Ordre d'affichage : `ordre`, puis nom (français). */
export const sortTerritoires = (list: Territoire[]): Territoire[] =>
  [...list].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))

/**
 * Territoire voulu : paramètre d'URL `?territoire=` s'il est valide, sinon le choix mémorisé (cookie).
 * `undefined` = laisser le chargeur prendre le territoire par défaut (Guyane).
 */
export function preferredTerritoire(param: string | string[] | undefined, remembered: string | undefined): string | undefined {
  const p = Array.isArray(param) ? param[0] : param
  if (isTerritoryCode(p)) return p
  return isTerritoryCode(remembered) ? remembered : undefined
}

/** Territoire disponible le plus proche de la demande : voulu, sinon défaut, sinon le premier. */
export function pickAvailable(all: Territoire[], wanted: string | undefined): Territoire | undefined {
  const dispo = all.filter((t) => t.disponible)
  return dispo.find((t) => t.code === wanted) ?? dispo.find((t) => t.code === DEFAULT_TERRITOIRE) ?? dispo[0]
}

/** En-tête Set-Cookie / document.cookie du choix de territoire (1 an, tout le site). */
export function territoryCookieString(code: string, secure: boolean): string {
  return `${GUIDE_TERRITORY_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure ? '; secure' : ''}`
}

/**
 * Catalogue d'affichage (silhouettes) × territoires réellement disponibles.
 * Les territoires disponibles passent en tête (ordre du catalogue conservé à l'intérieur de chaque groupe).
 */
export function withAvailability<T extends { code: string }>(catalog: readonly T[], territoires: Pick<Territoire, 'code' | 'disponible'>[]): (T & { available: boolean })[] {
  const on = new Set(territoires.filter((t) => t.disponible).map((t) => t.code))
  const rows = catalog.map((t) => ({ ...t, available: on.has(t.code) }))
  return [...rows.filter((r) => r.available), ...rows.filter((r) => !r.available)]
}

/**
 * SQL d'import d'un territoire : création, ou mise à jour du nom, de la disponibilité et de l'ordre
 * si le code existe déjà (un territoire semé « Bientôt » doit pouvoir passer « Disponible »).
 */
export function territoireUpsertSql(t: Territoire): string {
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`
  return `insert into public.guide_territoires (code, nom, disponible, ordre) values (${q(t.code)}, ${q(t.nom)}, ${t.disponible ? 'true' : 'false'}, ${Math.trunc(t.ordre)}) `
    + 'on conflict (code) do update set nom = excluded.nom, disponible = excluded.disponible, ordre = excluded.ordre;'
}
