import 'server-only'
import { listGuideTerritoires } from '@/lib/guide/load'
import { withAvailability } from '@/lib/guide/territories'
import { DEFAULT_TERRITOIRE } from '@/lib/guide/types'
import { TERRITORIES } from './territories'

export type TerritoryStatus = (typeof TERRITORIES)[number] & { available: boolean }

/**
 * Territoires du catalogue (silhouettes) avec leur disponibilité RÉELLE : base guide_territoires quand
 * Supabase est actif, sinon content/guide/<code>/territoire.json (`disponible`). Disponibles en tête.
 * Lecture impossible : le territoire par défaut seul est annoncé disponible plutôt qu'une erreur de page.
 */
export async function territoryStatuses(): Promise<TerritoryStatus[]> {
  try {
    return withAvailability(TERRITORIES, (await listGuideTerritoires('fr')).territoires)
  } catch (e) {
    console.warn('[guide] disponibilité des territoires illisible :', e instanceof Error ? e.message : e)
    return withAvailability(TERRITORIES, [{ code: DEFAULT_TERRITOIRE, disponible: true }])
  }
}
