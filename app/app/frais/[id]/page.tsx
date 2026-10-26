import { redirect } from 'next/navigation'

// Ancien détail d'une dépense. Démo : les dépenses `f_N` ont été reprises comme entrées
// Journal `jd_f_N` (lib/journal-finances → demoDepenseEntries) ; sinon, vue Finances.
export default async function DepenseRedirect({ params }: { params: Promise<{ id: string }> }): Promise<never> {
  const { id } = await params
  if (/^f_[1-8]$/.test(id)) redirect(`/app/journal/jd_${id}`)
  redirect('/app/journal?filtre=finances')
}
