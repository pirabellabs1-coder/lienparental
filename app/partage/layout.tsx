import { ScopedIntlProvider } from '@/components/i18n/ScopedIntlProvider'
import { CLIENT_NS_PARTAGE } from '@/lib/i18n/client-namespaces'

// Lien de partage du dossier JAF : seuls les textes de ses composants client sont sérialisés dans le HTML (audit C3).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider namespaces={CLIENT_NS_PARTAGE}>{children}</ScopedIntlProvider>
}
