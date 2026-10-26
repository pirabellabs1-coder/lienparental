import { redirect } from 'next/navigation'

// Ancienne route « médical » : l'espace Santé de l'enfant la remplace
// (l'édition des informations médicales reste dans « Modifier le profil »).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/app/enfants/${encodeURIComponent(id)}/sante`)
}
