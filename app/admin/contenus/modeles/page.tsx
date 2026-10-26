import { redirect } from 'next/navigation'

// Les modèles de documents sont administrés dans /admin/modeles (base de données, chantier E).
export default function ContenusModelesRedirect() {
  redirect('/admin/modeles')
}
