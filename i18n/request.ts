import type { AbstractIntlMessages } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { defaultLocale, isLocale, LOCALE_COOKIE } from '@/lib/i18n/config'
import { LOCALE_HEADER } from '@/lib/i18n/routing'

/**
 * Catalogues par module (messages/{locale}/{module}.json), chacun sous sa propre clé racine
 * (ex. { "vault": { … } }). Un fichier par module = des équipes/agents peuvent traduire en
 * parallèle sans se marcher dessus. Le catalogue « cœur » (messages/{locale}.json) garde le
 * site public, l'onboarding, la navigation et le tableau de bord.
 */
const MODULES = ['messaging', 'calendar', 'vault', 'family', 'coach', 'account', 'billing', 'public', 'media', 'auth', 'server', 'shared', 'email', 'ai'] as const

type Tree = AbstractIntlMessages
const isTree = (v: unknown): v is Tree => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Fusion profonde : deux catalogues qui partagent une clé racine s'additionnent au lieu
 * de s'écraser (un écrasement silencieux faisait disparaître des textes entiers).
 */
function deepMerge(target: Tree, source: Tree): Tree {
  for (const [k, v] of Object.entries(source)) {
    target[k] = isTree(v) && isTree(target[k]) ? deepMerge({ ...(target[k] as Tree) }, v) : v
  }
  return target
}

/**
 * Résolution de la locale pour chaque requête :
 * 1. en-tête interne `x-lp-locale`, posé par la middleware (lib/i18n/routing.ts) : `en`/`pt` sur
 *    `/en|pt/<page publique>`, `fr` sur une page publique SANS préfixe (l'URL décide, le cookie est
 *    ignoré). La middleware supprime toujours cet en-tête quand il vient du client ;
 * 2. sinon (espace connecté, API, admin, onboarding…) : cookie lp_locale, repli sur le français.
 */
export default getRequestConfig(async () => {
  const forced = (await headers()).get(LOCALE_HEADER)
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(forced) ? forced : isLocale(cookieLocale) ? cookieLocale : defaultLocale
  const core = (await import(`../messages/${locale}.json`)).default
  const parts = await Promise.all(MODULES.map(async (m) => (await import(`../messages/${locale}/${m}.json`)).default))
  return {
    locale,
    messages: parts.reduce<Tree>((acc, part) => deepMerge(acc, part), deepMerge({}, core)),
  }
})
