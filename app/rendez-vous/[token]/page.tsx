import type { Metadata } from 'next'
import { ManageAppointment } from './ManageAppointment'

// Lien de l'e-mail de confirmation d'un rendez-vous (agent d'accueil) : voir, déplacer, annuler.
export const metadata: Metadata = { title: 'Votre rendez-vous', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ManageAppointment token={token} />
}
