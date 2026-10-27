'use client'
/**
 * Mot de passe choisi à l'inscription, gardé UNIQUEMENT en mémoire (jamais localStorage,
 * sessionStorage ni cookie) entre l'écran d'inscription et la vérification du code.
 * Le compte est créé par le serveur avec un mot de passe aléatoire (anti pré-détournement) ;
 * celui-ci n'est posé (updateUser) qu'une fois l'adresse prouvée. Rechargement de la page :
 * la valeur est perdue et l'utilisateur la choisit à l'étape « Choisissez votre mot de passe ».
 */
let pending: { email: string; password: string } | null = null

export function setPendingPassword(email: string, password: string): void {
  pending = { email: email.trim().toLowerCase(), password }
}

/** Renvoie puis efface le mot de passe en attente pour cette adresse. */
export function takePendingPassword(email: string): string | null {
  const p = pending
  pending = null
  return p && p.email === email.trim().toLowerCase() ? p.password : null
}
