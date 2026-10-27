import { legacyRedirect } from '@/app/app/abonnement/_components/legacy-redirect'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// Ancienne success_url Stripe (sessions Checkout créées avant la refonte) : session_id conservé.
export default async function LegacyConfirmationPage({ searchParams }: PageProps) {
  legacyRedirect('/app/abonnement/confirmation', await searchParams)
}
