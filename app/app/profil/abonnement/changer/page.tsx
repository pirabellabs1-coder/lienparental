import { legacyRedirect } from '@/app/app/abonnement/_components/legacy-redirect'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// Ancienne URL : tout l'abonnement est désormais regroupé dans « Mon abonnement » (/app/abonnement).
export default async function LegacySubscriptionPage({ searchParams }: PageProps) {
  legacyRedirect('/app/abonnement', await searchParams)
}
