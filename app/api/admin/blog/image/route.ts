/**
 * POST /api/admin/blog/image  (multipart, champ `file`) → 201 { data: { url, path } }
 * Dépose une image de couverture ou d'illustration dans le bucket public `blog-images`
 * (lecture publique, écriture admin : politiques de 0300_admin_contenus.sql).
 * Type réel vérifié sur les premiers octets (JPEG, PNG, WebP), 5 Mo au maximum.
 * Démonstration : pas de stockage de fichiers, l'admin indique un chemin /images/… .
 */
import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { adminRoute, apiError, apiOk } from '@/lib/contenus/api'
import { sniffMime } from '@/lib/data/server/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'blog-images'
const MAX_BYTES = 5 * 1024 * 1024
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const

export async function POST(req: NextRequest) {
  return adminRoute(req, async (ctx) => {
    if (ctx.mode === 'demo') {
      return apiError(409, 'demo', 'En démonstration, les images ne sont pas stockées : indiquez un chemin du site, par exemple /images/hero-pere-fille.jpg.')
    }
    const cl = Number(req.headers.get('content-length') ?? '0')
    if (cl > MAX_BYTES + 64 * 1024) return apiError(413, 'too_large', 'Image trop lourde (5 Mo au maximum).')

    let file: File | null = null
    try {
      const form = await req.formData()
      const f = form.get('file')
      file = f instanceof File ? f : null
    } catch {
      return apiError(400, 'bad_request', 'Envoi invalide.')
    }
    if (!file) return apiError(400, 'bad_request', 'Aucun fichier reçu.')
    if (file.size > MAX_BYTES) return apiError(413, 'too_large', 'Image trop lourde (5 Mo au maximum).')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = sniffMime(bytes.subarray(0, 16))
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
      return apiError(415, 'bad_type', 'Format refusé : JPEG, PNG ou WebP uniquement.')
    }

    const now = new Date()
    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXT[mime]}`
    const { error } = await ctx.db.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) {
      console.warn('[blog] dépôt d’image refusé', error.message)
      return apiError(403, 'upload_refused', 'Dépôt refusé par le stockage (droits administrateur ou bucket blog-images manquant).')
    }
    const { data } = ctx.db.storage.from(BUCKET).getPublicUrl(path)
    return apiOk({ data: { url: data.publicUrl, path } }, 201)
  })
}
