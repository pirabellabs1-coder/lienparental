import 'server-only'
/**
 * Contenu de /llms.txt (sommaire) et /llms-full.txt (texte intégral), en français, généré depuis le code :
 * fiches et parcours du Guide (lib/guide/load, URL publiques guidePaths), FAQ (lib/aide/public),
 * articles du blog, prix réels (components/profil/pricing). Le champ `aConfirmer` n'est JAMAIS lu.
 */
import { COACH_ANALYSES, PLAN_NAME, PRICING, formatPrice } from '@/components/profil/pricing'
import { AI_CREDIT_VALIDITY_MONTHS, packSummaries } from '@/lib/billing/credit-packs'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { getHelpFaq } from '@/lib/aide/public'
import { FAQ_CATEGORIES } from '@/lib/aide/types'
import { listPosts } from '@/lib/blog/queries'
import { loadGuide, type GuideSnapshot } from '@/lib/guide/load'
import { GUIDE_CATEGORIES, type Fiche } from '@/lib/guide/types'
import { CONTACT_EMAIL, PUBLISHER_NAME, SITE_NAME, abs, guidePaths } from './site'

const FEEDBACK_LINE = /\n*(Cet article a-t-il été utile\s?\?)\s*$/i
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const catLabel = (key: string) => GUIDE_CATEGORIES.find((c) => c.key === key)?.label ?? key
const faqCatLabel = (key: string) => FAQ_CATEGORIES.find((c) => c.key === key)?.label ?? key

/** Résumé fidèle de l'entité (identique dans les deux fichiers). */
function header(g: GuideSnapshot | null): string {
  const p = PRICING
  const territoire = g?.territoire.nom ?? 'Guyane'
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_NAME} est une application web (installable sur téléphone) pour les parents séparés : agenda partagé, journal, dépenses, coffre-fort de documents, témoignages, dossier JAF, Coach parental IA et un Guide parental de démarches pour le territoire « ${territoire} ». Elle ne remplace pas un avocat.`,
    '',
    'Faits essentiels :',
    `- Éditeur : ${PUBLISHER_NAME}. Contact : ${CONTACT_EMAIL}. Assistance : ${SUPPORT_EMAIL}.`,
    `- Public : parents séparés ou en cours de séparation, et familles qui cherchent une information fiable sur leurs démarches (${territoire} d'abord).`,
    `- Langues de l'interface : français, anglais, portugais (Brésil).`,
    `- Tarifs : ${PLAN_NAME.gratuit} (0 €) ; ${PLAN_NAME.premium} ${formatPrice(p.premium.monthly)} par mois ou ${formatPrice(p.premium.yearly)} par an ; ${PLAN_NAME.coparentalite} ${formatPrice(p.coparentalite.monthly)} par mois ou ${formatPrice(p.coparentalite.yearly)} par an.`,
    `- Coach IA : ${COACH_ANALYSES.gratuit} analyses par mois (${PLAN_NAME.gratuit}), ${COACH_ANALYSES.premium} (${PLAN_NAME.premium}), ${COACH_ANALYSES.coparentalite} (${PLAN_NAME.coparentalite}) ; au-delà, crédits d'analyses à l'achat pour toutes les formules (${packSummaries('fr-FR', (n, eur) => `${n} pour ${eur}`).join(', ')}), valables ${AI_CREDIT_VALIDITY_MONTHS} mois.`,
    '- Données hébergées dans l’Union européenne, chiffrées en transit et au repos.',
    `- ${SITE_NAME} informe et aide à s'organiser : ce n'est pas un conseil juridique et l'application ne remplace pas un avocat.`,
    `- Chaque fiche du Guide cite ses sources officielles et affiche sa date de dernière vérification.`,
    '',
  ].join('\n')
}

const PAGES: [string, string, string][] = [
  ['Accueil', '/', 'présentation des fonctionnalités et des tarifs'],
  ['À propos', '/a-propos', 'éditeur, public, méthode de vérification du Guide, contact'],
  ['Guide parental', guidePaths.index, 'fiches pratiques vérifiées, avec sources officielles'],
  ['Centre d’aide', '/aide', 'questions fréquentes'],
  ['Blog', '/blog', 'conseils pour les parents séparés'],
  ['Installer l’application', '/installer', 'installation sur iPhone et Android'],
  ['Mentions légales', '/legal/mentions', ''],
  ['Politique de confidentialité', '/legal/confidentialite', ''],
  ['Conditions générales d’utilisation', '/legal/cgu', ''],
]

/** Versions traduites du site public (URL par langue, lib/i18n/routing.ts). */
const LANGUAGES: [string, string, string][] = [
  ['English', '/en', 'version anglaise du site public (accueil, Guide, aide, blog)'],
  ['Português', '/pt', 'version portugaise (Brésil) du site public'],
]

const pagesSection = () => [
  '## Pages principales', '', ...PAGES.map(([t, p, d]) => `- [${t}](${abs(p)})${d ? ` : ${d}` : ''}`), '',
  '## Autres langues', '', ...LANGUAGES.map(([t, p, d]) => `- [${t}](${abs(p)}) : ${d}`), '',
].join('\n')

async function safeGuide(): Promise<GuideSnapshot | null> {
  try {
    const g = await loadGuide(undefined, 'fr')
    return g.fiches.length ? g : null
  } catch {
    return null
  }
}

const ficheUrl = (g: GuideSnapshot, f: Fiche) => abs(guidePaths.fiche(g.territoire.code, f.slug))

export async function llmsTxt(): Promise<string> {
  const [g, faq, posts] = await Promise.all([safeGuide(), getHelpFaq('fr'), listPosts()])
  const out = [header(g), pagesSection()]
  if (g) {
    out.push(`## Guide parental : ${g.territoire.nom}`, '', `Index : ${abs(guidePaths.territoire(g.territoire.code))}`, '')
    for (const cat of GUIDE_CATEGORIES) {
      const fiches = g.fiches.filter((f) => f.categorie === cat.key)
      if (!fiches.length) continue
      out.push(`### ${cat.label}`, '', ...fiches.map((f) => `- [${f.titre}](${ficheUrl(g, f)}) : ${oneLine(f.resume)}`), '')
    }
    if (g.parcours.length) {
      out.push('### Parcours pas à pas', '', ...g.parcours.map((p) => `- [${p.titre}](${abs(guidePaths.parcours(g.territoire.code, p.slug))}) : ${oneLine(p.resume)}`), '')
    }
  }
  if (faq.length) out.push('## Questions fréquentes', '', ...faq.map((q) => `- ${oneLine(q.question)} (${abs('/aide')})`), '')
  if (posts.length) out.push('## Articles du blog', '', ...posts.map((p) => `- [${p.titre}](${abs(`/blog/${p.slug}`)})${p.extrait ? ` : ${oneLine(p.extrait)}` : ''}`), '')
  out.push('## Optionnel', '', `- [Texte intégral des fiches et de la FAQ](${abs('/llms-full.txt')})`, '')
  return out.join('\n')
}

function ficheFull(g: GuideSnapshot, f: Fiche): string {
  const list = (title: string, items: string[]) => (items.length ? [`${title} :`, ...items.map((i) => `- ${oneLine(i)}`), ''] : [])
  return [
    `### ${f.titre}`,
    '',
    `URL : ${ficheUrl(g, f)}`,
    `Catégorie : ${catLabel(f.categorie)} · Territoire : ${g.territoire.nom} · Dernière vérification : ${f.derniereVerification}`,
    '',
    oneLine(f.resume),
    '',
    `À quoi ça sert : ${oneLine(f.aQuoiCaSert)}`,
    '',
    ...list('Qui est concerné', f.quiEstConcerne),
    ...list('À savoir', f.aSavoir),
    ...list('Documents', f.documents.map((d) => (d.detail ? `${d.libelle} (${d.detail})` : d.libelle))),
    ...list('Étapes', f.etapes.map((e, i) => `${i + 1}. ${e.titre}${e.detail ? ` : ${e.detail}` : ''}`)),
    ...list('Où s’adresser', f.ou.map((o) => [o.nom, o.detail, o.telephone && `tél. ${o.telephone}`, o.url].filter(Boolean).join(' · '))),
    ...list('Dates limites', f.datesLimites.map((d) => (d.detail ? `${d.libelle} : ${d.detail}` : d.libelle))),
    ...list('Liens utiles', f.liens.map((l) => `${l.titre} : ${l.url}`)),
    ...list('Sources', f.sources.map((s) => `${s.titre} : ${s.url}${s.verifieLe ? ` (vérifié le ${s.verifieLe})` : ''}`)),
  ].join('\n')
}

export async function llmsFullTxt(): Promise<string> {
  const [g, faq] = await Promise.all([safeGuide(), getHelpFaq('fr')])
  const out = [header(g), pagesSection()]
  if (g) {
    out.push(`## Guide parental : ${g.territoire.nom}`, '')
    for (const cat of GUIDE_CATEGORIES) {
      const fiches = g.fiches.filter((f) => f.categorie === cat.key)
      if (fiches.length) out.push(...fiches.map((f) => ficheFull(g, f)))
    }
    if (g.parcours.length) {
      out.push('## Parcours pas à pas', '')
      const bySlug = new Map(g.fiches.map((f) => [f.slug, f]))
      for (const p of g.parcours) {
        out.push(`### ${p.titre}`, '', `URL : ${abs(guidePaths.parcours(g.territoire.code, p.slug))}`, '', oneLine(p.resume), '')
        p.elements.forEach((e, i) => {
          const f = e.fiche ? bySlug.get(e.fiche) : undefined
          out.push(`${i + 1}. ${e.titre}${e.detail ? ` : ${oneLine(e.detail)}` : ''}${f ? ` (fiche : ${ficheUrl(g, f)})` : ''}`)
        })
        out.push('')
      }
    }
  }
  if (faq.length) {
    out.push('## Questions fréquentes', '', `Source : ${abs('/aide')}`, '')
    for (const q of faq) out.push(`### ${oneLine(q.question)}`, '', `Thème : ${faqCatLabel(q.categorie)}`, '', q.reponse.replace(FEEDBACK_LINE, '').trim(), '')
  }
  return out.join('\n')
}

export const LLMS_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=86400',
} as const
