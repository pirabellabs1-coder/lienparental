// lib/email/theme.ts — Tokens de marque pour les emails transactionnels Lien Parental.
// Note : les emails n'utilisent PAS de variables CSS (support client erratique).
// On exporte des valeurs littérales à inliner dans les templates.

export const emailTheme = {
  colors: {
    night: '#0b2d5b',   // Bleu marine de la charte (night-900)
    leaf: '#2e7d32',    // Vert des boutons (leaf-500, contraste AA avec le blanc)
    link: '#256a29',    // Liens (leaf-600)
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
  // Logo officiel (public/brand/logo.svg rendu en PNG 360 px, affiché à 120 px de large).
  logoUrl: 'https://lienparental.fr/brand/logo-email.png',
  logoWidth: 120,
  logoHeight: 73,
  brandName: 'Lien Parental',
  brandDomain: 'lienparental.fr',
  supportEmail: 'contact@lienparental.fr',
  addressPlaceholder: 'Lien Parental · lienparental.fr',
  unsubscribeUrlPlaceholder: 'https://lienparental.fr/app/profil/preferences/notifications',
  legalUrl: 'https://lienparental.fr/legal/mentions',
} as const

export type EmailTheme = typeof emailTheme
