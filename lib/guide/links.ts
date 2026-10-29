/**
 * Ajoute TOUJOURS `?territoire=` aux liens internes du Guide (Guyane comprise) : sans paramètre, la page
 * s'ouvre sur le territoire mémorisé (cookie lp_guide_territoire), qui peut différer de celui affiché.
 */
export function guideHref(path: string, territoire: string): string {
  return `${path}?${new URLSearchParams({ territoire }).toString()}`
}

export const ficheHref = (slug: string, t: string) => guideHref(`/app/guide/${slug}`, t)
export const categoryHref = (cat: string, t: string) => guideHref(`/app/guide/categorie/${cat}`, t)
export const parcoursHref = (slug: string, t: string) => guideHref(`/app/guide/parcours/${slug}`, t)
export const homeHref = (t: string) => guideHref('/app/guide', t)

/** Recherche insensible à la casse et aux accents. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
