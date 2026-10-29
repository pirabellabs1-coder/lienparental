import 'server-only'
import { cookies } from 'next/headers'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/session'
import { GUIDE_TERRITORY_COOKIE, isTerritoryCode, preferredTerritoire } from './territories'

/** Territoire choisi à l'inscription ou dans le profil (preferences.ui.territoire), sinon `undefined`. */
async function profileTerritoire(): Promise<string | undefined> {
  if (!SUPABASE_ENABLED) return undefined
  try {
    const user = await getCurrentUser()
    if (!user) return undefined
    const supabase = await createClient()
    const { data } = await supabase.from('preferences').select('ui').eq('user_id', user.id).maybeSingle()
    const ui = (data?.ui && typeof data.ui === 'object' ? data.ui : {}) as Record<string, unknown>
    return isTerritoryCode(ui.territoire) ? ui.territoire : undefined
  } catch {
    return undefined // base indisponible : territoire par défaut
  }
}

/**
 * Territoire demandé pour une page du Guide : `?territoire=`, sinon le dernier territoire consulté
 * (cookie lp_guide_territoire, posé par RememberGuideTerritory et à l'enregistrement du profil),
 * sinon le territoire du profil, sinon `undefined` → Guyane par défaut.
 * Lit les cookies : réservé aux pages rendues à la requête.
 */
export async function wantedTerritoire(param?: string | string[]): Promise<string | undefined> {
  const jar = await cookies()
  return preferredTerritoire(param, jar.get(GUIDE_TERRITORY_COOKIE)?.value) ?? (await profileTerritoire())
}
