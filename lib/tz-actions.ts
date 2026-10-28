'use server'
/**
 * Préférence « Fuseau horaire » : écrite dans preferences.ui.fuseau (compte réel, RLS : sa
 * propre ligne) et dans le cookie lp_tz (mode démo, premier rendu serveur sur cet appareil).
 * Validation côté serveur : "auto" ou fuseau IANA accepté (lib/timezones#isAllowedTz).
 */
import { cookies } from 'next/headers'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireAuthedUser } from '@/lib/auth/guard'
import { TZ_COOKIE, isAllowedTz, isTzPreference } from '@/lib/timezones'

async function setTzCookie(value: string): Promise<void> {
  ;(await cookies()).set(TZ_COOKIE, value, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })
}

/** Fusionne `patch` dans preferences.ui de l'utilisateur connecté. Hors compte réel : no-op. */
async function mergeUi(patch: Record<string, string>): Promise<boolean> {
  if (!SUPABASE_ENABLED) return true
  const auth = await requireAuthedUser()
  if (!auth.ok) return false
  const { data: current, error: readError } = await auth.supabase.from('preferences').select('ui').eq('user_id', auth.user.id).maybeSingle()
  if (readError) return false
  const ui = { ...((current?.ui as Record<string, unknown> | undefined) ?? {}) }
  if (Object.entries(patch).every(([k, v]) => ui[k] === v)) return true
  Object.assign(ui, patch)
  const { error } = current
    ? await auth.supabase.from('preferences').update({ ui }).eq('user_id', auth.user.id)
    : await auth.supabase.from('preferences').insert({ user_id: auth.user.id, ui })
  return !error
}

/**
 * Choix du fuseau (Préférences, adoption automatique du fuseau de l'appareil à la première
 * ouverture, bandeau « votre appareil est à l'heure de… »). `device` : fuseau de l'appareil,
 * mémorisé pour le mode "auto" (rappels et e-mails envoyés hors navigateur).
 */
export async function applyTimeZone(value: string, device?: string | null): Promise<boolean> {
  if (!isTzPreference(value)) return false
  await setTzCookie(value)
  const patch: Record<string, string> = { fuseau: value }
  if (isAllowedTz(device)) patch.fuseauAppareil = device
  return mergeUi(patch)
}

/** Mode "auto" : dernier fuseau vu sur un appareil de l'utilisateur. */
export async function reportDeviceTimeZone(device: string): Promise<boolean> {
  if (!isAllowedTz(device)) return false
  return mergeUi({ fuseauAppareil: device })
}
