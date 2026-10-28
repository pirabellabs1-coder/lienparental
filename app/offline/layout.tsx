import { ScopedIntlProvider } from '@/components/i18n/ScopedIntlProvider'
import { CLIENT_NS_OFFLINE } from '@/lib/i18n/client-namespaces'

// Page hors ligne (PWA) : seuls les textes de ses composants client sont sérialisés dans le HTML (audit C3).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider namespaces={CLIENT_NS_OFFLINE}>{children}</ScopedIntlProvider>
}
