import { DEFAULT_TERRITOIRE } from './types'

/** Ajoute `?territoire=` aux liens internes du guide quand ce n'est pas le territoire par défaut. */
export function guideHref(path: string, territoire: string): string {
  return territoire === DEFAULT_TERRITOIRE ? path : `${path}?${new URLSearchParams({ territoire }).toString()}`
}

export const ficheHref = (slug: string, t: string) => guideHref(`/app/guide/${slug}`, t)
export const categoryHref = (cat: string, t: string) => guideHref(`/app/guide/categorie/${cat}`, t)
export const parcoursHref = (slug: string, t: string) => guideHref(`/app/guide/parcours/${slug}`, t)
export const homeHref = (t: string) => guideHref('/app/guide', t)

/** Recherche insensible à la casse et aux accents. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
