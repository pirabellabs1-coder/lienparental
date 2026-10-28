import type { AbstractIntlMessages } from 'next-intl'

type Tree = AbstractIntlMessages
const isTree = (v: unknown): v is Tree => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Extrait d'un catalogue next-intl les seuls namespaces demandés, racine (`'lang'`) ou imbriqués
 * (`'coach.common'`), en conservant leur chemin : `pick(m, ['coach.common'])` → `{ coach: { common: … } }`.
 *
 * Sert à ne sérialiser dans le HTML que les textes dont les composants CLIENT d'une zone ont besoin
 * (les composants serveur lisent le catalogue complet via getTranslations). Un chemin absent du
 * catalogue est ignoré ; un namespace demandé avec l'un de ses descendants donne le namespace entier.
 * Le catalogue source n'est jamais modifié (seuls des nœuds neufs sont créés).
 */
export function pick(messages: Tree, namespaces: readonly string[]): Tree {
  const out: Tree = {}
  // Les plus courts d'abord : un ancêtre déjà copié couvre ses descendants.
  const sorted = [...new Set(namespaces)].map((ns) => ns.split('.')).sort((a, b) => a.length - b.length)
  const taken: string[][] = []
  for (const path of sorted) {
    if (taken.some((t) => t.every((k, i) => path[i] === k))) continue
    let src: unknown = messages
    for (const k of path) src = isTree(src) ? src[k] : undefined
    if (src === undefined) continue
    let dst = out
    for (const k of path.slice(0, -1)) {
      if (!isTree(dst[k])) dst[k] = {}
      dst = dst[k] as Tree
    }
    dst[path[path.length - 1]] = src as Tree[string]
    taken.push(path)
  }
  return out
}
