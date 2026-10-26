/**
 * Redirections sûres et URL publique de l'application.
 * Utilisable côté client ET serveur.
 */

/**
 * N'accepte que des chemins internes (pas de redirection ouverte) :
 * commence par « / », pas par « // » ni « /\ », sans schéma ni retour ligne.
 */
export function safeNext(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (/[\r\n\t]/.test(value) || /^\/[a-z][a-z0-9+.-]*:/i.test(value)) return fallback
  return value
}

/**
 * URL publique (sans « / » final). En production, NEXT_PUBLIC_APP_URL doit
 * être définie et figurer dans les « Redirect URLs » Supabase.
 */
export function appUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  if (env) return env
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}
