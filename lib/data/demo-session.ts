/**
 * Démo : listes d'éléments créés pendant la session (sessionStorage), même mécanisme que le
 * journal (lib/data/journal.ts) : enfants, événements et documents ajoutés restent visibles
 * d'un écran à l'autre jusqu'à la fermeture de l'onglet. Jamais utilisé avec Supabase (LIVE).
 *
 * À lire APRÈS montage (loaders de useAsyncData, effets) : côté serveur la liste est vide.
 * Toute lecture est revalidée (`valid`) : une valeur corrompue est ignorée, jamais affichée.
 */
export function readDemoList<T>(key: string, valid: (v: unknown) => v is T): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(key)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(valid) : []
  } catch {
    return []
  }
}

export function writeDemoList<T>(key: string, list: T[], max = 200): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(list.slice(0, max)))
  } catch {
    /* stockage plein ou désactivé : la démo reste utilisable sans persistance */
  }
}

/** Identifiant d'un élément créé en démo (préfixe reconnaissable, jamais un UUID de la base). */
export function demoId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${rnd}`
}

export const hasId = (v: unknown): v is { id: string } =>
  !!v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string'
