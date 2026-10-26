import { redirect } from 'next/navigation'

// Ancienne route d'édition par section : l'édition se fait désormais dans « Modifier le profil » (2 étapes).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/app/enfants/${id}/modifier`)
}
