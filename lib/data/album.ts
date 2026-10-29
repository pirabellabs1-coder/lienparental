'use client'

/**
 * Album de l'enfant (V1) : les photos SONT des documents du coffre (migration 0530).
 *
 * - Fichiers dans le bucket privé `documents` : version web (JPEG ≤ 2560 px, sans métadonnées,
 *   donc sans GPS) + vignette (`thumb_path`, 480 px), préparées dans le navigateur
 *   (lib/vault/photo-process). Même verrou du coffre, même corbeille 30 jours.
 * - Partage : `family_shared` (0340). Privé par défaut ; « Partagée avec l'autre parent » = lecture
 *   et téléchargement par les gardiens `parent` d'un enfant commun ; jamais un proche ; jamais de
 *   modification par un autre adulte (écritures filtrées sur user_id = moi, comme le coffre).
 * - Affichage : vignettes signées par lot (POST /api/coffre/album/vignettes), photo en grand par la
 *   route du coffre (GET /api/coffre/fichier/[id]?mode=apercu). Le navigateur ne signe rien.
 * - Seules les photos ajoutées depuis l'album (thumb_path renseigné) y figurent : les scans de
 *   pièces d'identité ou d'ordonnances restent dans Documents.
 *
 * Démo : photos d'exemple + photos ajoutées pendant la session (affichées depuis la mémoire).
 */
import { z } from 'zod'
import { DOCUMENTS_BUCKET, DataError, LIVE, dataMsg, db, requireUserId, toDataError, uuid } from './core'
import { DOC_COLUMNS, docFromRow, documentFileRoute, trashDocument, viewer, type DocumentRow } from './vault'
import { preparePhoto } from '@/lib/vault/photo-process'
import { NOTE_MAX, isAlbumKey, photoPatchSchema, type AlbumKey, type AlbumPhoto, type PhotoPatch } from '@/lib/album/types'
import { todayKey } from '@/lib/tz'

const ALBUM_COLUMNS = `${DOC_COLUMNS}, album, important, thumb_path`
type AlbumRow = DocumentRow & { album: string | null; important: boolean | null; thumb_path: string | null }

function photoFromRow(r: AlbumRow, who: Awaited<ReturnType<typeof viewer>>): AlbumPhoto {
  const d = docFromRow(r, who)
  return {
    id: d.id,
    title: d.name,
    ...(d.description ? { note: d.description } : {}),
    date: d.docDate,
    addedAt: d.addedAt,
    addedTime: d.addedTime,
    childIds: d.childIds ?? [],
    album: isAlbumKey(r.album) ? r.album : null,
    important: Boolean(r.important),
    shared: Boolean(r.family_shared),
    ...(d.sharedBy ? { sharedBy: d.sharedBy } : {}),
    size: d.size,
  }
}

// --- Démonstration -------------------------------------------------------------

const DEMO_SEED: AlbumPhoto[] = [
  { id: 'ph_demo_1', title: 'Rentrée en moyenne section', date: '2026-09-01', addedAt: '2026-09-01', addedTime: '18:10', childIds: ['c_1'], album: 'ecole', important: true, shared: true, size: 410_000, demoSrc: '/images/home/parent-enfant-calme.jpg' },
  { id: 'ph_demo_2', title: 'Pique-nique au parc', date: '2026-08-15', addedAt: '2026-08-16', addedTime: '09:02', childIds: ['c_1', 'c_2'], album: 'famille', important: false, shared: true, size: 380_000, demoSrc: '/images/home/famille-parc.jpg' },
  { id: 'ph_demo_3', title: 'Moment calme', date: '2026-07-20', addedAt: '2026-07-21', addedTime: '20:40', childIds: ['c_1'], album: 'vacances', important: false, shared: false, size: 350_000, demoSrc: '/images/home/moment-partage.jpg' },
  { id: 'ph_demo_4', title: 'Tous ensemble', date: '2026-06-02', addedAt: '2026-06-02', addedTime: '19:15', childIds: ['c_1', 'c_2'], album: 'anniversaires', important: true, shared: true, size: 330_000, demoSrc: '/images/onboarding/ensemble.webp', sharedBy: { prenom: 'Thomas' } },
  { id: 'ph_demo_5', title: 'Balade avec papa', date: '2026-05-10', addedAt: '2026-05-11', addedTime: '08:30', childIds: ['c_2'], album: 'activites', important: false, shared: true, size: 300_000, demoSrc: '/images/home/pere-enfant.jpg', sharedBy: { prenom: 'Thomas' } },
  { id: 'ph_demo_6', title: 'Petites mains', date: '2025-12-24', addedAt: '2025-12-26', addedTime: '11:00', childIds: ['c_1'], album: 'famille', important: false, shared: false, size: 290_000, demoSrc: '/images/home/mains-enfant.jpg' },
]
// Photos ajoutées pendant la session de démo (URL objet en mémoire, jamais envoyées).
let demoAdded: AlbumPhoto[] = []
const demoPatches = new Map<string, Partial<AlbumPhoto>>()
const demoTrashed = new Set<string>()

function demoList(): AlbumPhoto[] {
  return [...demoAdded, ...DEMO_SEED]
    .filter((p) => !demoTrashed.has(p.id))
    .map((p) => ({ ...p, ...demoPatches.get(p.id) }))
}

// --- Lecture --------------------------------------------------------------------

export async function listAlbumPhotos(): Promise<AlbumPhoto[]> {
  if (!LIVE) return demoList()
  const who = await viewer()
  const { data, error } = await db()
    .from('documents')
    .select(ALBUM_COLUMNS)
    .is('deleted_at', null)
    .not('thumb_path', 'is', null)
    .like('mime', 'image/%')
    .order('doc_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw toDataError(error, 'album.list')
  return ((data ?? []) as unknown as AlbumRow[])
    // Photos d'un autre parent : seulement celles qu'il a explicitement partagées (pas via un dossier).
    .filter((r) => r.user_id === who.userId || r.family_shared)
    .map((r) => photoFromRow(r, who))
}

/** URL signées (5 min) des vignettes, par identifiant ; les photos refusées sont absentes. */
export async function albumThumbUrls(ids: string[]): Promise<Record<string, string>> {
  if (!LIVE) return Object.fromEntries(demoList().filter((p) => ids.includes(p.id) && p.demoSrc).map((p) => [p.id, p.demoSrc!]))
  if (ids.length === 0) return {}
  const res = await fetch('/api/coffre/album/vignettes', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).catch(() => { throw new DataError(dataMsg('errors.network'), 'network') })
  const body = (await res.json().catch(() => null)) as { data?: { urls?: Record<string, string> }; error?: { code?: string; message?: string } } | null
  if (!res.ok) throw new DataError(body?.error?.message ?? dataMsg('album.thumbsFailed'), body?.error?.code ?? String(res.status))
  return body?.data?.urls ?? {}
}

/** Photo en grand : route du coffre (session, verrou, droit d'accès, URL signée 60 s). Démo : image d'exemple. */
export function albumPhotoSrc(p: AlbumPhoto): string {
  return p.demoSrc ?? documentFileRoute(p.id, 'apercu')
}

// --- Ajout ----------------------------------------------------------------------

const addSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(NOTE_MAX).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  childId: z.string().min(1).max(64),
  album: z.string().nullable(),
  important: z.boolean(),
  shared: z.boolean(),
})
export type AddPhotoMeta = { title: string; note?: string; date: string; childId: string; album: AlbumKey | null; important: boolean; shared: boolean }

/** Ajoute UNE photo (déjà préparée ou non). Annule l'envoi si l'enregistrement échoue. */
export async function addAlbumPhoto(file: File, meta: AddPhotoMeta): Promise<AlbumPhoto> {
  const p = addSchema.safeParse(meta)
  if (!p.success || (p.data.album !== null && !isAlbumKey(p.data.album))) throw new DataError(dataMsg('errors.invalidShort'), 'invalid')
  const prepared = await preparePhoto(file, todayKey()).catch(() => { throw new DataError(dataMsg('album.unreadable'), 'invalid') })
  const now = new Date()

  if (!LIVE) {
    const photo: AlbumPhoto = {
      id: `ph_${uuid()}`, title: p.data.title, ...(p.data.note ? { note: p.data.note } : {}), date: p.data.date,
      addedAt: todayKey(), addedTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      childIds: [p.data.childId], album: p.data.album as AlbumKey | null, important: p.data.important, shared: p.data.shared,
      size: prepared.web.size, demoSrc: URL.createObjectURL(prepared.web),
    }
    demoAdded = [photo, ...demoAdded]
    return photo
  }

  if (!z.string().uuid().safeParse(p.data.childId).success) throw new DataError(dataMsg('errors.invalidShort'), 'invalid')
  const userId = await requireUserId()
  const base = `${userId}/${uuid()}`
  const path = `${base}.jpg`
  const thumbPath = `${base}-thumb.jpg`
  const bucket = db().storage.from(DOCUMENTS_BUCKET)
  const up1 = await bucket.upload(path, prepared.web, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' })
  if (up1.error) throw toDataError(up1.error, 'album.upload', dataMsg('vault.uploadFailed'))
  const up2 = await bucket.upload(thumbPath, prepared.thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' })
  if (up2.error) {
    await bucket.remove([path])
    throw toDataError(up2.error, 'album.upload', dataMsg('vault.uploadFailed'))
  }
  const { data, error } = await db()
    .from('documents')
    .insert({
      user_id: userId,
      category_id: null,
      name: p.data.title,
      mime: 'image/jpeg',
      size_bytes: prepared.web.size,
      confidentialite: p.data.shared ? 'standard' : 'confidentiel',
      storage_path: path,
      thumb_path: thumbPath,
      doc_date: p.data.date,
      description: p.data.note || null,
      children_ids: [p.data.childId],
      album: p.data.album,
      important: p.data.important,
      family_shared: p.data.shared,
    } as never)
    .select(ALBUM_COLUMNS)
    .single()
  if (error) {
    await bucket.remove([path, thumbPath])
    throw toDataError(error, 'album.insert')
  }
  return photoFromRow(data as unknown as AlbumRow, await viewer())
}

// --- Modification (propriétaire seulement) ------------------------------------------

export async function updateAlbumPhoto(id: string, patch: PhotoPatch): Promise<void> {
  const p = photoPatchSchema.safeParse(patch)
  if (!p.success) throw new DataError(dataMsg('errors.invalidShort'), 'invalid')
  if (!LIVE) {
    const { note, ...rest } = p.data
    demoPatches.set(id, { ...demoPatches.get(id), ...rest, ...(note !== undefined ? { note: note || undefined } : {}) })
    return
  }
  if (!z.string().uuid().safeParse(id).success) throw new DataError(dataMsg('errors.invalidShort'), 'invalid')
  const row: Record<string, unknown> = {}
  if (p.data.title !== undefined) row.name = p.data.title
  if (p.data.note !== undefined) row.description = p.data.note || null
  if (p.data.date !== undefined) row.doc_date = p.data.date
  if (p.data.album !== undefined) row.album = p.data.album
  if (p.data.important !== undefined) row.important = p.data.important
  if (p.data.shared !== undefined) {
    row.family_shared = p.data.shared
    row.confidentialite = p.data.shared ? 'standard' : 'confidentiel'
  }
  if (Object.keys(row).length === 0) return
  const userId = await requireUserId()
  const { data, error } = await db().from('documents').update(row as never).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw toDataError(error, 'album.update')
  if (!data || data.length === 0) throw new DataError(dataMsg('vault.notAuthor'), 'not_author')
}

/** Corbeille (30 jours, restauration depuis la corbeille du coffre). */
export async function trashAlbumPhoto(id: string): Promise<void> {
  if (!LIVE) { demoTrashed.add(id); return }
  await trashDocument(id)
}
