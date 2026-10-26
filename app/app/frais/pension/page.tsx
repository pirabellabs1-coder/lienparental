import { redirect } from 'next/navigation'

// Pension alimentaire = simple catégorie (« Pension / contribution ») des dépenses du Journal.
export default function PensionRedirect(): never {
  redirect('/app/journal?filtre=finances')
}
