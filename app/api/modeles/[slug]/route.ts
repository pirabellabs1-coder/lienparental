/**
 * GET /api/modeles/[slug] → { data: PublishedTemplate } | 404
 * Modèle publié complet (champs, corps, mise en page) pour la génération côté navigateur.
 * Langue du cookie `lp_locale` : titre, description, libellés et aides des champs traduits ; `corps`,
 * `miseEnPage`, `exemple` et `options` restent en français (document destiné à une administration française).
 */
import { NextResponse } from 'next/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { getPublishedTemplate } from '@/lib/modeles/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getPublishedTemplate(slug, await getLocale())
  if (!t) {
    const tr = await getTranslations('server.modeles')
    return NextResponse.json(
      { error: { code: 'not_found', message: tr('notFound') } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return NextResponse.json({ data: t }, { headers: { 'Cache-Control': 'private, max-age=60', Vary: 'Cookie' } })
}
