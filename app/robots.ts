import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/seo/site'

/**
 * robots.txt (docs/SEO-AUDIT.md, sprint 1 point 5).
 * - Moteurs et assistants IA autorisés sur les pages publiques ; CCBot et Bytespider bloqués.
 * - Chaque groupe répète les interdictions : un robot qui a son propre groupe ignore le groupe `*`.
 * - Espaces privés (`/app`, `/admin`, `/console`, `/api`…) : aussi `X-Robots-Tag: noindex` (next.config.mjs).
 */
const DISALLOW = ['/app/', '/admin/', '/console', '/api/', '/temoin/', '/partage/', '/abonner', '/auth/', '/offline', '/onboarding/', '/mot-de-passe-oublie', '/nouveau-mot-de-passe']
const ALLOW = ['/', '/onboarding/connexion', '/onboarding/inscription']

const AI_AND_SEARCH = [
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'PerplexityBot', 'Perplexity-User',
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot',
  'Google-Extended', 'Applebot-Extended', 'Bingbot', 'Meta-ExternalAgent',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ALLOW, disallow: DISALLOW },
      { userAgent: AI_AND_SEARCH, allow: ALLOW, disallow: DISALLOW },
      { userAgent: ['CCBot', 'Bytespider'], disallow: '/' },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
