'use client'
/**
 * Helpers d'authentification côté navigateur.
 * Chaque fonction choisit Supabase quand il est configuré, sinon le mode démo.
 */
import { useEffect, useState } from 'react'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { endDemoSession } from '@/lib/demo-auth'
import { intlLocale } from '@/lib/i18n/config'
import { clientLocale, libT } from '@/lib/i18n/runtime'

/** Libellé traduit du namespace `auth.browser` (langue de <html lang>). */
const msg = (key: 'sessionExpired' | 'imageUnreadable' | 'uploadFailed' | 'loadProfileFailed') => libT('auth.browser')(key)

/** Déconnexion de CET appareil puis retour à l'écran de connexion. */
export async function signOutAndRedirect(to = '/onboarding/connexion') {
  if (SUPABASE_ENABLED) {
    try {
      await createClient().auth.signOut({ scope: 'local' })
    } catch {
      /* réseau indisponible : les cookies locaux sont tout de même effacés par le SDK */
    }
    try { sessionStorage.clear() } catch { /* stockage indisponible */ }
  } else {
    endDemoSession()
  }
  window.location.assign(to)
}

// --- Avatars ----------------------------------------------------------------
const AVATAR_MAX_SIDE = 512
const AVATAR_BUCKET = 'avatars'
const SIGNED_URL_SECONDS = 15 * 60

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_decode_failed'))
    img.src = src
  })
}

/**
 * Redimensionne (512 px max) et ré-encode en JPEG : respecte les limites du
 * bucket (2 Mo, jpeg/png/webp) et retire les métadonnées EXIF (GPS…).
 */
export async function prepareAvatar(source: string | Blob): Promise<Blob> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, AVATAR_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_unavailable')
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob) throw new Error('encode_failed')
    return blob
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url)
  }
}

export type UploadResult = { ok: true; path: string } | { ok: false; error: string }

/**
 * Envoie une photo dans le bucket privé « avatars » sous `${uid}/<name>.jpg`.
 * La policy Storage impose que le premier segment soit l'uid de la session.
 */
export async function uploadAvatar(source: string | Blob, name = 'avatar'): Promise<UploadResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: msg('sessionExpired') }

  let blob: Blob
  try {
    blob = await prepareAvatar(source)
  } catch {
    return { ok: false, error: msg('imageUnreadable') }
  }
  const path = `${user.id}/${name}.jpg`
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '0',
  })
  if (error) return { ok: false, error: msg('uploadFailed') }
  return { ok: true, path }
}

export async function signedAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data } = await createClient().storage.from(AVATAR_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  return data?.signedUrl ?? null
}

// --- Profil affiché -----------------------------------------------------------
export type DisplayProfile = {
  prenom: string
  nom: string
  email: string
  avatarUrl?: string
  memberSince: string
  photoPath?: string | null
  telephone?: string | null
  adresse?: string | null
  codePostal?: string | null
  ville?: string | null
  pays?: string | null
  dateNaissance?: string | null
  genre?: string | null
  situation?: string | null
}

function monthYear(iso: string) {
  try {
    return new Intl.DateTimeFormat(intlLocale(clientLocale()), { month: 'long', year: 'numeric' }).format(new Date(iso))
  } catch {
    return ''
  }
}

/**
 * Profil de l'utilisateur connecté (public.users, RLS) — Supabase uniquement.
 * `fallback` = profil de démonstration renvoyé tel quel sans Supabase.
 */
export function useAccountProfile(fallback: DisplayProfile) {
  const [profile, setProfile] = useState<DisplayProfile>(fallback)
  const [loading, setLoading] = useState(SUPABASE_ENABLED)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) { setLoading(false); setError(msg('sessionExpired')) } return }
      const { data, error: e } = await supabase
        .from('users')
        .select('prenom, nom, email, photo_url, created_at, telephone, adresse, code_postal, ville, pays, date_naissance, genre, situation_familiale')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (e || !data) {
        setError(msg('loadProfileFailed'))
        setProfile({ ...fallback, prenom: '', nom: '', email: user.email ?? '', avatarUrl: undefined, memberSince: monthYear(user.created_at) })
        setLoading(false)
        return
      }
      const avatarUrl = (await signedAvatarUrl(data.photo_url)) ?? undefined
      if (cancelled) return
      setProfile({
        prenom: data.prenom ?? '',
        nom: data.nom ?? '',
        email: data.email,
        avatarUrl,
        memberSince: monthYear(data.created_at),
        photoPath: data.photo_url,
        telephone: data.telephone,
        adresse: data.adresse,
        codePostal: data.code_postal,
        ville: data.ville,
        pays: data.pays,
        dateNaissance: data.date_naissance,
        genre: data.genre,
        situation: data.situation_familiale,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
    // fallback volontairement ignoré : seul le premier rendu compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { profile, loading, error }
}
