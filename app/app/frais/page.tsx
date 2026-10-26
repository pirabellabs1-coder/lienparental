import { redirect } from 'next/navigation'

// Ancien module « Frais partagés » : les finances vivent désormais dans le Journal
// (récap fonctionnel v2, « Nouveauté 1 »). Les anciens liens restent valides.
export default function FraisRedirect(): never {
  redirect('/app/journal?filtre=finances')
}
