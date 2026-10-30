'use client'

/**
 * Enfants — couche de données.
 * - Supabase : table `children` (RLS user_id = auth.uid()), soft delete via deleted_at.
 *   Les informations médicales sont chiffrées AES-256-GCM CÔTÉ SERVEUR
 *   (route /api/enfants/[id]/medical) : la clé ne quitte jamais le serveur.
 * - Démo : mockChildren + surcharges en sessionStorage (comportement historique).
 */
import { useMemo } from 'react'
import { z } from 'zod'
import { childProfileStatus, mockChildren, ageFromBirthDate, type Child } from '@/lib/mock-data'
import { DataError, LIVE, dataMsg, db, requireUserId, toDataError, useAsyncData } from './core'
import { demoId, hasId, readDemoList, writeDemoList } from './demo-session'
import { uploadAvatar } from '@/lib/auth/browser'

// --- Lignes Supabase (sous-ensemble utilisé) --------------------------------

type ChildRow = {
  id: string
  prenom: string
  nom: string | null
  date_naissance: string
  classe: string | null
  langue: string | null
  photo_url: string | null
  taille_cm: number | null
  poids_kg: number | string | null
  couleur_yeux: string | null
  couleur_cheveux: string | null
  profil_complet: boolean
  created_at: string
}

const COLUMNS = 'id, prenom, nom, date_naissance, classe, langue, photo_url, taille_cm, poids_kg, couleur_yeux, couleur_cheveux, profil_complet, created_at'

export const MEDICAL_KEYS = ['allergies', 'autresAllergies', 'infosMedicales', 'groupeSanguin', 'traitement', 'medecinTraitant'] as const
export type MedicalKey = (typeof MEDICAL_KEYS)[number]
export type ChildMedical = Pick<Child, MedicalKey>

function fromRow(r: ChildRow, medical?: ChildMedical): Child {
  const poids = r.poids_kg == null ? undefined : Number(r.poids_kg)
  return {
    id: r.id,
    prenom: r.prenom,
    age: ageFromBirthDate(r.date_naissance),
    classe: r.classe ?? '',
    dateNaissance: r.date_naissance,
    langue: r.langue ?? undefined,
    statut: 'actif',
    taille: r.taille_cm ?? undefined,
    poids: Number.isFinite(poids) ? poids : undefined,
    couleurYeux: r.couleur_yeux ?? undefined,
    couleurCheveux: r.couleur_cheveux ?? undefined,
    createdAt: r.created_at,
    ...medical,
  }
}

// --- Photo ------------------------------------------------------------------
// Bucket privé « avatars » (policy : premier segment = uid du parent), chemin `<uid>/child-<id>.jpg`
// enregistré dans children.photo_url ; affichage par URL signée (1 h).

const PHOTO_BUCKET = 'avatars'
const PHOTO_URL_SECONDS = 60 * 60

/** Remplace les chemins de stockage par des URL signées (une requête pour toute la liste). */
async function withPhotoUrls(rows: ChildRow[], children: Child[]): Promise<Child[]> {
  const paths = rows.map((r) => r.photo_url).filter((p): p is string => !!p && !/^https?:/.test(p))
  if (!paths.length) return children.map((c, i) => ({ ...c, photoUrl: rows[i].photo_url ?? undefined }))
  const { data } = await db().storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_SECONDS)
  const url = new Map<string, string>()
  for (const d of data ?? []) if (d.signedUrl && d.path) url.set(d.path, d.signedUrl)
  // Photo illisible (autre parent, fichier absent) : l'initiale s'affiche à la place.
  return children.map((c, i) => {
    const p = rows[i].photo_url
    return { ...c, photoUrl: !p ? undefined : /^https?:/.test(p) ? p : url.get(p) }
  })
}

/** Enregistre la photo de l'enfant (JPEG redimensionné, 2 Mo max). Renvoie l'URL à afficher. */
export async function setChildPhoto(id: string, file: File): Promise<string> {
  if (!LIVE) return URL.createObjectURL(file) // démo : aperçu local, rien n'est envoyé
  const up = await uploadAvatar(file, `child-${id}`)
  if (!up.ok) throw new DataError(up.error, 'upload')
  const { error } = await db().from('children').update({ photo_url: up.path }).eq('id', id)
  if (error) throw toDataError(error, 'children.update')
  const { data } = await db().storage.from(PHOTO_BUCKET).createSignedUrl(up.path, PHOTO_URL_SECONDS)
  if (!data?.signedUrl) throw new DataError(dataMsg('children.photoFailed'), 'upload')
  // Même chemin à chaque envoi : paramètre anti-cache pour afficher la nouvelle photo.
  return `${data.signedUrl}&v=${Date.now()}`
}

// --- Validation -------------------------------------------------------------

const isoDay = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, dataMsg('children.invalidDate'))
const shortText = (max: number) => z.string().trim().max(max)

const createSchema = () => z.object({
  prenom: shortText(60).min(1, dataMsg('children.firstNameRequired')),
  dateNaissance: isoDay(),
  classe: shortText(40).optional(),
})

const updateSchema = () => z.object({
  prenom: shortText(60).min(1).optional(),
  dateNaissance: isoDay().optional(),
  classe: shortText(40).optional(),
  langue: shortText(40).optional(),
  taille: z.number().int().min(20).max(250).optional(),
  poids: z.number().min(1).max(200).optional(),
  couleurYeux: shortText(30).optional(),
  couleurCheveux: shortText(30).optional(),
  allergies: z.array(shortText(60)).max(30).optional(),
  autresAllergies: shortText(300).optional(),
  infosMedicales: shortText(1000).optional(),
  groupeSanguin: shortText(10).optional(),
  traitement: shortText(300).optional(),
  medecinTraitant: shortText(200).optional(),
})

function invalid(e: z.ZodError): DataError {
  return new DataError(e.issues[0]?.message && e.issues[0].message !== 'Required' ? e.issues[0].message : dataMsg('errors.invalid'), 'invalid')
}

// --- Démo : surcharges sessionStorage ---------------------------------------

const overrideKey = (id: string) => `lp:child-edit:${id}`

function readOverride(id: string): Partial<Child> {
  try {
    const raw = window.sessionStorage.getItem(overrideKey(id))
    return raw ? (JSON.parse(raw) as Partial<Child>) : {}
  } catch {
    return {}
  }
}

function saveOverride(id: string, patch: Partial<Child>) {
  try {
    window.sessionStorage.setItem(overrideKey(id), JSON.stringify({ ...readOverride(id), ...patch }))
  } catch {
    /* stockage indisponible : la modification reste en mémoire pour cette vue */
  }
}

/** L'âge affiché découle toujours de la date de naissance (même calcul que « Mes enfants »). */
function withAge(c: Child): Child {
  return c.dateNaissance ? { ...c, age: ageFromBirthDate(c.dateNaissance) } : c
}

// --- Démo : enfants ajoutés pendant la session (même mécanisme que le journal) ---

const DEMO_CHILDREN_KEY = 'lp_demo_children_v1'
const isDemoChild = (v: unknown): v is Child =>
  hasId(v) && typeof (v as Child).prenom === 'string' && typeof (v as Child).dateNaissance === 'string'
const demoChildren = () => readDemoList(DEMO_CHILDREN_KEY, isDemoChild)
const allDemoChildren = (): Child[] => [...mockChildren, ...demoChildren()]

// --- API --------------------------------------------------------------------

export async function listChildren(): Promise<Child[]> {
  if (!LIVE) return allDemoChildren().map((c) => withAge({ ...c, ...readOverride(c.id) }))
  const { data, error } = await db()
    .from('children')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw toDataError(error, 'children.list')
  const rows = (data ?? []) as ChildRow[]
  return withPhotoUrls(rows, rows.map((r) => fromRow(r)))
}

/** Profil complet (y compris médical déchiffré côté serveur). */
export async function getChild(id: string): Promise<Child | null> {
  if (!LIVE) {
    const base = allDemoChildren().find((c) => c.id === id)
    return base ? withAge({ ...base, ...readOverride(id) }) : null
  }
  if (!z.string().uuid().safeParse(id).success) return null
  const { data, error } = await db().from('children').select(COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) throw toDataError(error, 'children.get')
  if (!data) return null
  const medical = await fetchMedical(id)
  const row = data as ChildRow
  return (await withPhotoUrls([row], [fromRow(row, medical)]))[0]
}

async function fetchMedical(id: string): Promise<ChildMedical | undefined> {
  try {
    const res = await fetch(`/api/enfants/${encodeURIComponent(id)}/medical`, { cache: 'no-store' })
    if (!res.ok) return undefined
    const body = (await res.json()) as { medical?: ChildMedical | null }
    return body.medical ?? undefined
  } catch {
    return undefined // le profil s'affiche quand même ; les champs médicaux restent « Non renseigné »
  }
}

export async function createChild(input: { prenom: string; dateNaissance: string; classe?: string }): Promise<Child | null> {
  const parsed = createSchema().safeParse(input)
  if (!parsed.success) throw invalid(parsed.error)
  // Démo : conservé pour la session (sessionStorage), comme les entrées du journal.
  if (!LIVE) {
    const v = parsed.data
    const child: Child = withAge({
      id: demoId('c'), prenom: v.prenom, age: 0, classe: v.classe ?? '', dateNaissance: v.dateNaissance,
      statut: 'actif', allergies: [], createdAt: new Date().toISOString(),
    })
    writeDemoList(DEMO_CHILDREN_KEY, [...demoChildren(), child], 20)
    return child
  }
  const userId = await requireUserId()
  const v = parsed.data
  const { data, error } = await db()
    .from('children')
    .insert({ user_id: userId, prenom: v.prenom, date_naissance: v.dateNaissance, classe: v.classe || null })
    .select(COLUMNS)
    .single()
  if (error) throw toDataError(error, 'children.create')
  return fromRow(data as ChildRow)
}

export async function updateChild(id: string, patch: Partial<Child>): Promise<void> {
  if (!LIVE) {
    saveOverride(id, patch)
    return
  }
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  const parsed = updateSchema().safeParse(clean)
  if (!parsed.success) throw invalid(parsed.error)
  const v = parsed.data

  const row: Record<string, unknown> = {}
  if ('prenom' in patch && v.prenom) row.prenom = v.prenom
  if ('dateNaissance' in patch && v.dateNaissance) row.date_naissance = v.dateNaissance
  if ('classe' in patch) row.classe = v.classe || null
  if ('langue' in patch) row.langue = v.langue || null
  if ('taille' in patch) row.taille_cm = v.taille ?? null
  if ('poids' in patch) row.poids_kg = v.poids ?? null
  if ('couleurYeux' in patch) row.couleur_yeux = v.couleurYeux || null
  if ('couleurCheveux' in patch) row.couleur_cheveux = v.couleurCheveux || null

  const current = await getChild(id)
  if (!current) throw new DataError(dataMsg('children.notFound'), 'not_found')

  const touchesMedical = MEDICAL_KEYS.some((k) => k in patch)
  if (touchesMedical) {
    // Fusion avec l'existant : un patch partiel n'efface pas les autres champs médicaux.
    const pick = <K extends MedicalKey>(k: K): ChildMedical[K] => (k in patch ? (v[k] as ChildMedical[K]) : current[k])
    const medical: ChildMedical = {
      allergies: pick('allergies') ?? [],
      autresAllergies: pick('autresAllergies') || undefined,
      infosMedicales: pick('infosMedicales') || undefined,
      groupeSanguin: pick('groupeSanguin') || undefined,
      traitement: pick('traitement') || undefined,
      medecinTraitant: pick('medecinTraitant') || undefined,
    }
    const res = await fetch(`/api/enfants/${encodeURIComponent(id)}/medical`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medical }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new DataError(body?.error?.message ?? dataMsg('children.medicalSaveFailed'), `http_${res.status}`)
    }
  }

  // Complétude : recalculée sur l'état fusionné (même règle que l'affichage).
  row.profil_complet = childProfileStatus({ ...current, ...patch }) === 'complet'

  if (Object.keys(row).length > 0) {
    const { error } = await db().from('children').update(row).eq('id', id)
    if (error) throw toDataError(error, 'children.update')
  }
}

/** Suppression logique (purge réelle par le job de rétention). */
export async function removeChild(id: string): Promise<void> {
  if (!LIVE) return // démo : comportement historique
  const { error } = await db().from('children').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw toDataError(error, 'children.remove')
}

// --- Hooks ------------------------------------------------------------------

export function useChildrenList() {
  return useAsyncData(listChildren, 'children', LIVE ? undefined : mockChildren)
}

export function useChildData(id: string) {
  // Démo : un enfant ajouté pendant la session n'est connu qu'après montage → état « chargement », pas « introuvable ».
  const seed = LIVE ? undefined : mockChildren.find((c) => c.id === id)
  return useAsyncData(() => getChild(id), `child:${id}`, seed ? withAge(seed) : undefined)
}

/** Options des sélecteurs « Enfants concernés » : « Lina (5 ans) ». */
export function useChildOptions() {
  const { data, loading } = useChildrenList()
  const options = useMemo(
    () => (data ?? []).map((c) => ({ id: c.id, prenom: c.prenom, age: c.age, classe: c.classe, label: `${c.prenom} (${c.age} ans)` })),
    [data],
  )
  return { options, loading }
}
