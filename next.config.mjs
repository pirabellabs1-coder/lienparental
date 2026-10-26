import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */

const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' uniquement en dev (rechargement à chaud de Next) ; jamais en production.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // Notes vocales de la messagerie (enregistrements locaux blob: et fichiers du stockage Supabase).
  "media-src 'self' blob: https://*.supabase.co",
  `connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.resend.com https://api.anthropic.com${process.env.NODE_ENV === 'development' ? ' ws://localhost:*' : ''}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig = {
  // Racine du projet explicite : un package-lock.json parasite dans le dossier utilisateur trompait Next.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  reactStrictMode: true,
  devIndicators: false,
  images: { formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera/mic désactivés par défaut ; ré-autorisés ci-dessous pour les seules routes qui en ont besoin
          // (une balise <meta> ne suffit pas : les navigateurs n'acceptent Permissions-Policy qu'en en-tête).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        // Notes vocales : micro autorisé pour l'origine du site uniquement, et seulement dans la messagerie.
        source: '/app/messages/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(self)' }],
      },
    ]
  },
}
export default nextConfig
