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
  // Logo officiel (public/brand/logo.svg) sur une pastille BLANCHE OPAQUE à coins arrondis,
  // rendu en PNG 480 × 308 (2x), affiché à 168 × 108. Le fond blanc intégré garde « Lien »
  // (bleu nuit) lisible en mode sombre, y compris quand Gmail / Outlook inversent les couleurs
  // (les images ne sont jamais inversées). Hors de la pastille : transparent.
  // Nouveau nom de fichier (v2) pour contourner les caches d'images des clients mail.
  logoUrl: 'https://lienparental.fr/brand/logo-email-v2.png',
  logoWidth: 168,
  logoHeight: 108,
  /** Palette du mode sombre (Apple Mail, iOS Mail, Outlook.com/app via [data-ogsc]). */
  dark: {
    pageBg: '#121417',
    cardBg: '#1c1f24',
    boxBg: '#262a31',
    border: '#2e333b',
    text: '#e6e8eb',
    textMuted: '#b4b9c1',
    night: '#a9c4ff',
    link: '#7fcf83',
    footerText: '#9aa0aa',
    alert: '#ff8a8a',
  },
  brandName: 'Lien Parental',
  brandDomain: 'lienparental.fr',
  supportEmail: 'contact@lienparental.fr',
  addressPlaceholder: 'Lien Parental · lienparental.fr',
  unsubscribeUrlPlaceholder: 'https://lienparental.fr/app/profil/preferences/notifications',
  legalUrl: 'https://lienparental.fr/legal/mentions',
} as const

export type EmailTheme = typeof emailTheme
