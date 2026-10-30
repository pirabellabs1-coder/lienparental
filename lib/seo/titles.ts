/**
 * Titres et descriptions des pages publiques (module pur, testé par tests/seo-titles.test.ts) :
 * longueur maximale, gabarit « %s · Lien Parental » et territoire des fiches du Guide.
 */
import type { Metadata } from 'next'

/** Coupe un texte au dernier mot entier avant `max` caractères (points de suspension inclus). */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`
}

export const SUFFIX = ' · Lien Parental'
export const TITLE_MAX = 60

/**
 * Titre ≤ 60 caractères, gabarit du site compris (« %s · Lien Parental », app/layout.tsx).
 * Trop long avec le suffixe : titre absolu, sans suffixe, tronqué proprement.
 */
export function pageTitle(title: string): Metadata['title'] {
  if (title.length + SUFFIX.length <= TITLE_MAX) return title
  return { absolute: truncate(title, TITLE_MAX) }
}

/**
 * Titre d'une fiche ou d'un parcours suivi de son territoire (« Médiation familiale en Guyane ») : les territoires
 * partagent les mêmes titres, le territoire les distingue dans les résultats de recherche. Un titre qui cite déjà
 * le territoire reste tel quel. Trop long : le suffixe du site saute, puis le titre est raccourci, jamais le territoire.
 * - `where` : complément de lieu dans la langue du contenu (« en Guyane », « à La Réunion », « in French Guiana »).
 */
export function localTitle(title: string, where: string, territoryName: string): Metadata['title'] {
  const lower = title.toLowerCase()
  if (!where || lower.includes(territoryName.toLowerCase()) || lower.includes(where.toLowerCase())) return pageTitle(title)
  const full = `${title} ${where}`
  if (full.length + SUFFIX.length <= TITLE_MAX) return full
  if (full.length <= TITLE_MAX) return { absolute: full }
  return { absolute: `${truncate(title, TITLE_MAX - where.length - 1)} ${where}` }
}
