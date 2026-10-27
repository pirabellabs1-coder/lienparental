import { legacyRedirect } from '@/app/app/abonnement/_components/legacy-redirect'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// Ancienne URL : les factures sont dans « Mon abonnement », section Factures.
export default async function LegacyInvoicesPage({ searchParams }: PageProps) {
  legacyRedirect('/app/abonnement', await searchParams, { section: 'factures' })
}
