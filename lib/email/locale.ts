import 'server-only'
// lib/email/locale.ts — Langue du DESTINATAIRE d'un e-mail ou d'une notification (côté serveur).
// Source : public.preferences.langue (lue en service_role, jamais d'après la requête) ;
// valeur absente ou inconnue → français. Les lectures ne lèvent jamais : en cas d'erreur, français.
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'
import { toLocale, type Locale } from './i18n'

function adminDb(): SupabaseClient | null {
  try {
    return createServiceClient() as unknown as SupabaseClient
  } catch {
    return null
  }
}

/** Langues de plusieurs utilisateurs en UNE requête (envois groupés). Absent de la Map : français. */
export async function localesForUsers(userIds: readonly string[], db: SupabaseClient | null = adminDb()): Promise<Map<string, Locale>> {
  const out = new Map<string, Locale>()
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!db || ids.length === 0) return out
  try {
    const { data } = await db.from('preferences').select('user_id, langue').in('user_id', ids)
    for (const row of (data ?? []) as { user_id: string; langue: string | null }[]) out.set(row.user_id, toLocale(row.langue))
  } catch { /* repli : français */ }
  return out
}

/** Langue d'un utilisateur (français par défaut). */
export async function localeForUser(userId: string, db: SupabaseClient | null = adminDb()): Promise<Locale> {
  return (await localesForUsers([userId], db)).get(userId) ?? 'fr'
}

/**
 * Langue du compte associé à une adresse e-mail, ou null si aucun compte (actif) n'utilise cette adresse.
 * Sert aux envois dont l'appelant ne connaît que l'adresse (facturation, invitation d'un autre parent).
 */
export async function localeForEmail(email: string, db: SupabaseClient | null = adminDb()): Promise<Locale | null> {
  const addr = email.trim().toLowerCase()
  if (!db || !addr.includes('@')) return null
  try {
    const variants = [...new Set([addr, email.trim()])]
    const { data } = await db.from('users').select('id').in('email', variants).is('deleted_at', null).limit(1).maybeSingle()
    const id = (data as { id?: string } | null)?.id
    if (!id) return null
    return await localeForUser(id, db)
  } catch {
    return null
  }
}

/** Langue d'affichage de la requête en cours (cookie lp_locale), ou null hors requête / sans cookie valide. */
export async function requestLocale(): Promise<Locale | null> {
  try {
    const v = (await cookies()).get(LOCALE_COOKIE)?.value
    return isLocale(v) ? v : null
  } catch {
    return null
  }
}
