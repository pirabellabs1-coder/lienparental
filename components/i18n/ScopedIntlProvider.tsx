import 'server-only'
import { NextIntlClientProvider, useMessages } from 'next-intl'
import { pick } from '@/lib/i18n/pick'

/**
 * Fournit aux composants client d'une zone les seuls namespaces listés (lib/i18n/client-namespaces.ts).
 * Composant serveur : locale, fuseau horaire et `now` sont repris de la configuration de la requête
 * (mêmes valeurs, mises en cache, que le provider racine). Remplace les messages du provider parent.
 */
export function ScopedIntlProvider({ namespaces, children }: { namespaces: readonly string[]; children: React.ReactNode }) {
  const messages = useMessages()
  return <NextIntlClientProvider messages={pick(messages, namespaces)}>{children}</NextIntlClientProvider>
}
