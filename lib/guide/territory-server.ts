import 'server-only'
import { cookies } from 'next/headers'
import { GUIDE_TERRITORY_COOKIE, preferredTerritoire } from './territories'

/**
 * Territoire demandé pour une page du Guide : `?territoire=` sinon le dernier territoire consulté
 * (cookie lp_guide_territoire, posé par RememberGuideTerritory), sinon `undefined` → Guyane par défaut.
 * Lit les cookies : réservé aux pages rendues à la requête.
 */
export async function wantedTerritoire(param?: string | string[]): Promise<string | undefined> {
  const jar = await cookies()
  return preferredTerritoire(param, jar.get(GUIDE_TERRITORY_COOKIE)?.value)
}
