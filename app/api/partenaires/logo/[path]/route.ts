import { NextResponse } from 'next/server'
import { demoPublishedLogo } from '@/lib/partenaires/server'

// GET /api/partenaires/logo/<id>.<ext> — DÉMONSTRATION uniquement (sans Supabase) : logo d'un partenaire
// VALIDÉ, gardé en mémoire du serveur. En production, les logos validés sont servis par le bucket public
// Supabase `partner-logos` et cette route répond 404.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) return new NextResponse(null, { status: 404 })
  const logo = demoPublishedLogo(path)
  if (!logo) return new NextResponse(null, { status: 404 })
  return new NextResponse(Buffer.from(logo.bytes), {
    headers: { 'Content-Type': logo.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
