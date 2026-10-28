/**
 * Mémoire des fichiers déjà déposés par le témoin (module pur, testé par tests/temoin-upload-cache.test.ts).
 *
 * Le dépôt est limité à 15 envois / 10 min par IP (app/api/temoin/[token]/upload) : une nouvelle
 * tentative d'envoi (erreur réseau, RPC refusée…) ne doit renvoyer QUE les fichiers pas encore
 * déposés. Chaque fichier a une clé stable (rôle + nom + taille + date de modification ; pour la
 * signature, empreinte de son image) associée au chemin renvoyé par le serveur.
 * Les validations restent côté serveur (chemins distincts, objet présent dans le bucket…).
 */

/** Rôle d'un fichier dans l'envoi : les chemins doivent rester distincts entre rôles (contrôle serveur). */
export type UploadRole = 'identity' | 'signature' | 'attachment'

/** Clé stable d'un fichier choisi : même fichier (nom, taille, date) ⇒ même clé. */
export const fileUploadKey = (role: UploadRole, f: { name: string; size: number; lastModified: number }) =>
  `${role}:${f.size}:${f.lastModified}:${f.name}`

/**
 * Rend uniques les clés d'une liste (même fichier choisi deux fois en pièce jointe) :
 * la n-ième occurrence reçoit le suffixe `#n`, pour obtenir deux dépôts distincts comme avant.
 */
export function uniqueKeys(keys: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return keys.map((k) => {
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    return n === 0 ? k : `${k}#${n}`
  })
}

/** Empreinte SHA-256 (hex) d'un texte — identité de la signature (data URL de son image). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Clé de la signature : empreinte de son image (data URL PNG). Une signature retracée ou modifiée
 * change de clé (nouveau dépôt). Sans WebCrypto (contexte non sécurisé), la data URL sert de clé.
 */
export async function signatureUploadKey(dataUrl: string): Promise<string> {
  try {
    return `signature:${await sha256Hex(dataUrl)}`
  } catch {
    return `signature:${dataUrl}`
  }
}

/**
 * Chemin déjà déposé pour `key`, sinon dépôt via `upload()` puis mémorisation.
 * Un dépôt en échec n'est jamais mémorisé (il sera retenté à l'envoi suivant).
 */
export async function uploadOnce(cache: Map<string, string>, key: string, upload: () => Promise<string>): Promise<string> {
  const known = cache.get(key)
  if (known) return known
  const path = await upload()
  cache.set(key, path)
  return path
}
