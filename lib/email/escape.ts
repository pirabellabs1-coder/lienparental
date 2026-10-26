// lib/email/escape.ts
// Helpers d'injection sûre de variables dans les templates email HTML.
//
// Règle d'or : TOUTE variable `${x}` injectée dans du HTML DOIT être
// passée par `escapeHtml`. Les URLs utilisées dans `href="${u}"` DOIVENT
// passer par `safeUrl` pour prévenir `javascript:`, `data:`, etc.

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Échappe les 5 caractères sensibles HTML (XSS en contexte texte). */
export function escapeHtml(input: unknown): string {
  const s = input == null ? '' : String(input)
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c)
}

/**
 * Valide qu'une URL est bien `https://<APP_URL host>/...` (ou un hôte de
 * `extraHosts`, liste blanche exacte) ; sinon
 * retourne la valeur de secours (par défaut : l'URL de l'app ou '#').
 * On refuse strictement tout autre schéma (`javascript:`, `data:`,
 * `mailto:` ici car on parle de liens cliquables de boutons CTA).
 */
export function safeUrl(url: unknown, fallback?: string, extraHosts: readonly string[] = []): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const fb = fallback ?? appUrl ?? '#'
  if (typeof url !== 'string' || url.length === 0) return fb
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return fb
    // Hôtes tiers explicitement autorisés (ex. factures hébergées Stripe).
    if (extraHosts.includes(u.host)) return escapeHtml(u.toString())
    if (appUrl) {
      try {
        const expected = new URL(appUrl)
        if (u.host !== expected.host) return fb
      } catch {
        return fb
      }
    }
    // Après validation, on échappe pour injection en attribut HTML.
    return escapeHtml(u.toString())
  } catch {
    return fb
  }
}

/** Hôtes Stripe autorisés dans les liens d'e-mails (factures hébergées / PDF). */
export const STRIPE_LINK_HOSTS = ['invoice.stripe.com', 'pay.stripe.com', 'billing.stripe.com'] as const
