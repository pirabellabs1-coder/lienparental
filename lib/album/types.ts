/**
 * Album de l'enfant (V1) — logique PURE, partagée par les écrans, la route des vignettes et les tests.
 * Une photo est un document du coffre (0530) : voir lib/data/album.ts.
 */
import { z } from 'zod'

/** Albums thématiques (contrainte chk_documents_album, 0530). Libellés : vault.album.albums.* */
export const ALBUMS = ['ecole', 'vacances', 'anniversaires', 'famille', 'activites', 'sante', 'autre'] as const
export type AlbumKey = (typeof ALBUMS)[number]
export const isAlbumKey = (v: unknown): v is AlbumKey => typeof v === 'string' && (ALBUMS as readonly string[]).includes(v)

/** Note d'une photo : limite de documents.description (0210). */
export const NOTE_MAX = 280

/** Photos par envoi (spécification V4 § 2 : 20 fichiers par lot). */
export const MAX_PHOTOS_PER_BATCH = 20
/** Vignettes signées par requête (route /api/coffre/album/vignettes). */
export const MAX_THUMBS_PER_REQUEST = 60

export type AlbumPhoto = {
  id: string
  title: string
  /** Petite note libre (documents.description, 280 caractères au plus, 0210). */
  note?: string
  /** Jour de prise de vue (AAAA-MM-JJ). */
  date: string
  /** Jour et heure d'ajout (AAAA-MM-JJ, HH:mm), pour départager deux photos du même jour. */
  addedAt: string
  addedTime: string
  childIds: string[]
  album: AlbumKey | null
  important: boolean
  /** Partagée avec l'autre parent (documents.family_shared). */
  shared: boolean
  /** Photo d'un autre parent : lecture et téléchargement seulement. */
  sharedBy?: { prenom: string }
  size: number
  /** Démo uniquement : URL d'affichage directe (aucun fichier réel). */
  demoSrc?: string
}

export type AlbumFilter = {
  childId?: string
  album?: AlbumKey | 'all'
  /** 'important' : moments importants ; 'shared' : partagées ; 'private' : privées ; 'theirs' : de l'autre parent. */
  view?: 'all' | 'important' | 'shared' | 'private' | 'theirs'
}

export function filterPhotos(photos: readonly AlbumPhoto[], f: AlbumFilter): AlbumPhoto[] {
  return photos.filter((p) =>
    (!f.childId || p.childIds.includes(f.childId)) &&
    (!f.album || f.album === 'all' || p.album === f.album) &&
    (!f.view || f.view === 'all'
      || (f.view === 'important' && p.important)
      || (f.view === 'shared' && p.shared && !p.sharedBy)
      || (f.view === 'private' && !p.shared && !p.sharedBy)
      || (f.view === 'theirs' && Boolean(p.sharedBy))),
  )
}

/** Tri de l'album : date de prise de vue décroissante, puis ajout le plus récent (spécification § 12). */
export const byPhotoDateDesc = (a: AlbumPhoto, b: AlbumPhoto) =>
  b.date.localeCompare(a.date) || `${b.addedAt} ${b.addedTime}`.localeCompare(`${a.addedAt} ${a.addedTime}`)

export type TimelineMonth = { key: string; year: number; month: number; photos: AlbumPhoto[] }
export type TimelineYear = { year: number; months: TimelineMonth[]; count: number }

/** Chronologie année > mois (spécification § 12), années et mois les plus récents d'abord. */
export function timeline(photos: readonly AlbumPhoto[]): TimelineYear[] {
  const sorted = [...photos].sort(byPhotoDateDesc)
  const years: TimelineYear[] = []
  for (const p of sorted) {
    const year = Number(p.date.slice(0, 4))
    const month = Number(p.date.slice(5, 7))
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue
    let y = years[years.length - 1]
    if (!y || y.year !== year) { y = { year, months: [], count: 0 }; years.push(y) }
    let m = y.months[y.months.length - 1]
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (!m || m.key !== key) { m = { key, year, month, photos: [] }; y.months.push(m) }
    m.photos.push(p)
    y.count++
  }
  return years
}

/** Corps de la route des vignettes. */
export const thumbsRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_THUMBS_PER_REQUEST),
})

/** Métadonnées modifiables par le propriétaire. */
export const photoPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(NOTE_MAX).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  album: z.enum(ALBUMS).nullable().optional(),
  important: z.boolean().optional(),
  shared: z.boolean().optional(),
})
export type PhotoPatch = z.infer<typeof photoPatchSchema>
