import 'server-only'
// Titres des fiches du Guide pour le tableau de bord : d'abord les fichiers du dépôt
// (content/guide), puis le contenu publié en base via loadGuide (back-office, prioritaire),
// qui couvre les fiches créées ou renommées dans /admin/guides. Toute source en échec est
// ignorée : le slug sera alors affiché lisiblement.
import { getFiches, loadGuide } from '@/lib/guide/load'

export async function resolveGuideTitles(refs: { slug: string; territoire: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const territoires = [...new Set(refs.map((r) => r.territoire))]
  for (const t of territoires) {
    try {
      for (const f of getFiches(t)) out.set(`${t}/${f.slug}`, f.titre)
    } catch {
      // Territoire absent des fichiers ou contenu illisible.
    }
    try {
      const g = await loadGuide(t)
      // loadGuide se rabat sur le territoire par défaut si `t` est indisponible : on ne garde que le bon.
      if (g.territoire.code === t) for (const f of g.fiches) out.set(`${t}/${f.slug}`, f.titre)
    } catch {
      // Base indisponible : titres des fichiers seulement.
    }
  }
  return out
}
