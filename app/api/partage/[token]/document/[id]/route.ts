/**
 * GET /api/partage/[token]/document/[id]?k=<clé d'accès>
 * Téléchargement d'un document inclus dans un partage avocat.
 * Vérifie : jeton actif (non expiré, non révoqué), clé d'accès (remise après
 * saisie du code), document dans le périmètre ET appartenant au parent.
 * Supabase : redirection vers une URL signée de 60 s (service_role).
 * Démo : PDF de substitution généré à la volée.
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import React from 'react'
import { Document, Page, Text, View } from '@react-pdf/renderer'
import { getTranslations } from 'next-intl/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { VAULT_DOCS } from '@/lib/mock-vault'
import { pdfResponse, renderPdfToBuffer } from '@/lib/pdf/render'
import { clientIp, ipKey, rateLimit } from '@/lib/data/server/rate-limit'
import { documentForShare, resolveShare, signedDocumentUrl, TOKEN_RE, verifyAccessKey } from '../../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }

function deny(status: number, message: string) {
  return new NextResponse(message, { status, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params
  const t = await getTranslations('server.partage')

  const limited = await rateLimit(ipKey('partage:doc', clientIp(req.headers)), 60, 15 * 60_000, { failClosed: true })
  if (!limited.ok) {
    return limited.reason === 'unavailable'
      ? deny(503, t('serviceUnavailable'))
      : deny(429, t('tooManyRequests'))
  }

  if (!TOKEN_RE.test(token) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return deny(404, t('documentNotFound'))
  if (!verifyAccessKey(token, req.nextUrl.searchParams.get('k'))) {
    return deny(403, t('accessExpired'))
  }

  let share
  try {
    share = await resolveShare(token)
  } catch {
    return deny(503, t('serviceUnavailable'))
  }
  if (!share || !share.scope.documentIds.includes(id)) return deny(404, t('documentNotFound'))

  if (!SUPABASE_ENABLED) {
    const doc = VAULT_DOCS.find((d) => d.id === id)
    if (!doc) return deny(404, t('documentNotFound'))
    const pdf = React.createElement(
      Document,
      { title: doc.name, creator: 'Lien Parental' },
      React.createElement(
        Page,
        { size: 'A4', style: { padding: 56, fontFamily: 'Helvetica', fontSize: 11, color: '#1c2333' } },
        React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 18, color: '#0b2d5b', marginBottom: 12 } }, doc.name),
        React.createElement(
          View,
          { style: { padding: 12, backgroundColor: '#f6f7fb', borderRadius: 6 } },
          React.createElement(Text, null, t('demoPdf.title')),
          React.createElement(Text, null, t('demoPdf.source', { source: doc.source })),
          React.createElement(Text, null, t('demoPdf.date', { date: doc.docDate })),
        ),
        React.createElement(Text, { style: { marginTop: 16, fontSize: 9, color: '#5b6275' } }, t('demoPdf.footer', { owner: share.ownerName })),
      ),
    )
    const buffer = await renderPdfToBuffer(pdf)
    const res = pdfResponse(buffer, `${doc.name}.pdf`)
    Object.entries(HEADERS).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }

  const doc = await documentForShare(share, id)
  if (!doc) return deny(404, t('documentNotFound'))
  const { data, error } = await signedDocumentUrl(doc.storagePath, doc.name, share.userId)
  if (error || !data?.signedUrl) return deny(503, t('documentUnavailable'))
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: HEADERS })
}
