import 'server-only'
/**
 * Fuseau de l'utilisateur pendant une REQUÊTE (Server Components, Server Actions, routes API).
 * Hors requête (cron, notifications, Google Agenda) : `tzFromPreferencesRow` (lib/timezones)
 * sur la ligne preferences du DESTINATAIRE.
 *
 * Source : preferences.ui.fuseau (compte réel) ; cookie lp_tz (mode démo, ou repli si la
 * ligne est absente). Repli : DEFAULT_TZ. Mémoïsé par requête (React cache).
 */
import { cache } from 'react'
import { cookies } from 'next/headers'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/session'
import { DEFAULT_TZ } from '@/lib/tz'
import { TZ_COOKIE, normalizeTzPreference, resolveTz } from '@/lib/timezones'

export type RequestTz = {
  /** Fuseau effectif côté serveur (préférence résolue, sans le navigateur). */
  tz: string
  /** Préférence brute validée : "auto", un nom IANA, ou null (jamais choisie). */
  preference: string | null
}

export const getRequestTzInfo = cache(async (): Promise<RequestTz> => {
  const cookieRaw = (await cookies()).get(TZ_COOKIE)?.value
  const cookiePref = normalizeTzPreference(cookieRaw ? decodeURIComponent(cookieRaw) : null)
  if (SUPABASE_ENABLED) {
    try {
      const user = await getCurrentUser()
      if (user) {
        const supabase = await createClient()
        const { data } = await supabase.from('preferences').select('ui').eq('user_id', user.id).maybeSingle()
        const ui = (data?.ui && typeof data.ui === 'object' ? data.ui : {}) as Record<string, unknown>
        const preference = normalizeTzPreference(ui.fuseau)
        if (preference) return { tz: resolveTz(ui), preference }
        // Jamais choisie en base : le cookie (choix fait sur cet appareil) sert de repli.
        return { tz: resolveTz({ fuseau: cookiePref, fuseauAppareil: ui.fuseauAppareil }), preference: null }
      }
    } catch { /* base indisponible : repli cookie */ }
  }
  return { tz: cookiePref && cookiePref !== 'auto' ? cookiePref : DEFAULT_TZ, preference: cookiePref }
})

/** Fuseau effectif de l'utilisateur de la requête (à passer explicitement aux fonctions de lib/tz). */
export async function getRequestTz(): Promise<string> {
  return (await getRequestTzInfo()).tz
}
