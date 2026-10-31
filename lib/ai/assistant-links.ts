/**
 * Liens [libellé](/chemin) produits par l'assistant public (components/assistant/AssistantWidget.tsx).
 * Module pur et léger : importé côté client sans embarquer le prompt ni les tarifs.
 */

/**
 * Chemin interne uniquement : refuse `//hôte` et `/\hôte` (relatifs au protocole), les antislashs
 * et les espaces. null = afficher le libellé en texte brut.
 */
export function safeInternalPath(path: string): string | null {
  return /^\/(?![/\\])[^\s\\]{0,120}$/.test(path) ? path : null
}
