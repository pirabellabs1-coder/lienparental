// lib/email/theme.ts — Tokens de marque pour les emails transactionnels Lien Parental.
// Note : les emails n'utilisent PAS de variables CSS (support client erratique).
// On exporte des valeurs littérales à inliner dans les templates.

export const emailTheme = {
  colors: {
    night: '#0b1a3f',   // Bleu nuit — fond principal / header
    leaf: '#1faf5c',    // Vert — succès, CTA principal
    iris: '#8347d1',    // Violet — accent secondaire
    gold: '#d49918',    // Doré — mise en avant, avertissement doux
    alert: '#c42727',   // Rouge — alerte sécurité
    text: '#1a1a1a',    // Texte principal sur fond clair
    textMuted: '#5a5a5a',
    cardBg: '#ffffff',
    pageBg: '#f4f5f7',  // Fond de page — compatible dark-mode (clients adaptent)
    border: '#e4e6ec',
    footerText: '#8a8f99',
  },
  font: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  maxWidth: 560, // px
  logoUrl: 'https://lienparental.fr/icons/icon-512.png',
  brandName: 'Lien Parental',
  brandDomain: 'lienparental.fr',
  supportEmail: 'contact@lienparental.fr',
  addressPlaceholder: 'Lien Parental — Adresse postale à compléter, France',
  unsubscribeUrlPlaceholder: 'https://lienparental.fr/compte/notifications',
  legalUrl: 'https://lienparental.fr/mentions-legales',
} as const

export type EmailTheme = typeof emailTheme
