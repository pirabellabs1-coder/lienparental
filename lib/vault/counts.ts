/**
 * Compteurs du coffre (module pur, testable) : le nombre affiché pour une catégorie est
 * TOUJOURS le nombre de documents de la liste rangés dedans (jamais une valeur figée).
 */
export function withDemoCounts<C extends { id: string; count: number }>(categories: C[], docs: { categoryId: string }[]): C[] {
  const n = new Map<string, number>()
  for (const d of docs) n.set(d.categoryId, (n.get(d.categoryId) ?? 0) + 1)
  return categories.map((c) => ({ ...c, count: n.get(c.id) ?? 0 }))
}
