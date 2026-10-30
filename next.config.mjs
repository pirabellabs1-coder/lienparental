import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import createNextIntlPlugin from 'next-intl/plugin'

// i18n (next-intl) : charge i18n/request.ts pour résoudre la locale (cookie) par requête.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */

const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' uniquement en dev (rechargement à chaud de Next) ; jamais en production.
  // 'wasm-unsafe-eval' : compilation WebAssembly seulement (pas d'eval JS), requise par le moteur de mise en
  // page des PDF générés dans le navigateur (@react-pdf → yoga-layout) : attestation du témoin, exports.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // Notes vocales de la messagerie (enregistrements locaux blob: et fichiers du stockage Supabase).
  "media-src 'self' blob: https://*.supabase.co",
  // wss:// : temps réel Supabase (messagerie). Sans lui, les nouveaux messages n'arrivent qu'au rechargement.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.resend.com https://api.anthropic.com${process.env.NODE_ENV === 'development' ? ' ws://localhost:*' : ''}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  'upgrade-insecure-requests',
].join('; ')

// Chemins privés : jamais indexés, même si un lien externe y mène (complète robots.txt, qui n'empêche que l'exploration).
const NOINDEX = { key: 'X-Robots-Tag', value: 'noindex, nofollow' }
// « /x/:path* » couvre aussi « /x ».
const PRIVATE_PATHS = ['/app/:path*', '/admin/:path*', '/console/:path*', '/api/:path*', '/abonner']

const nextConfig = {
  // Racine du projet explicite : un package-lock.json parasite dans le dossier utilisateur trompait Next.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  reactStrictMode: true,
  devIndicators: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Images du blog stockées dans le bucket public Supabase (app/blog/_components/image.ts).
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
  // Robots qui n'exécutent pas le JavaScript : métadonnées rendues dans le <head> (pas de streaming dans le <body>).
  htmlLimitedBots: /bot|crawler|spider|slurp|facebookexternalhit|facebookcatalog|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegram|skype|discord|linkedin|mastodon|bluesky|google-extended|gptbot|chatgpt-user|oai-searchbot|claude|perplexity|applebot|meta-externalagent|bingpreview|yandex|baidu|duckduck|petal|ia_archiver/i,
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
      // Micro autorisé pour l'origine du site uniquement, sur TOUTE l'app connectée (« /app/:path* » couvre
      // aussi « /app ») : la navigation côté client ne recharge pas la page, donc l'en-tête reçu à l'entrée
      // vaut pour toute la session ; une liste de sous-routes rendait la dictée / les notes vocales
      // dépendantes de la page d'arrivée. Le site public garde microphone=().
      {
        source: '/app/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(self)' }],
      },
      ...PRIVATE_PATHS.map((source) => ({ source, headers: [NOINDEX] })),
    ]
  },
}
export default withNextIntl(nextConfig)
