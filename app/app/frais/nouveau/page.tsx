import { redirect } from 'next/navigation'

// Ancien formulaire « Ajouter une dépense » → formulaire du Journal, type Dépense / Paiement.
export default function NouvelleDepenseRedirect(): never {
  redirect('/app/journal/nouveau?type=depense')
}
