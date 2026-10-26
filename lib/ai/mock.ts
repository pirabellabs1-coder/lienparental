import 'server-only'
/**
 * Mode démonstration (ANTHROPIC_API_KEY absente) : réponses simulées, déterministes,
 * calculées à partir des données de démo pour rester plausibles. Aucune requête externe.
 */
import { mockCoachAnalysis, mockCoachCapture } from '@/lib/mock-data'
import { CO_PARENT_PRENOM } from '@/lib/garde'
import { demoDepenseEntries, formatSolde, formatTotals, monthKeyOf, totalsByFlux } from '@/lib/journal-finances'
import { monthKeyInTz } from '@/lib/tz'
import { LEGAL_DISCLAIMER, type AnalysisResult } from './schemas'

export function mockAnalysis(kind: 'capture' | 'pdf' | 'word' | 'document' | 'message', text?: string): AnalysisResult {
  const isMessage = kind === 'message' && text
  return {
    type_contenu: kind === 'capture' ? 'capture_conversation' : isMessage ? 'message_ecrit' : 'document',
    texte_lu: isMessage ? text : kind === 'capture' ? mockCoachCapture.messages.map((m) => `Autre parent : ${m.text}`).join('\n') : '',
    ton: 28,
    agressivite: 72,
    mots_blessants: ["Tu ne t'occupes jamais", "Elle ne t'aime même pas", "C'est toujours de ma faute"],
    clarte: 45,
    respect: 30,
    impact: mockCoachAnalysis.about[1] ?? '',
    resume: 'Le message contient des accusations et des généralisations ; il exprime surtout de la fatigue et un besoin d’être entendu.',
    nature_reponse: isMessage ? 'reformulation' : 'reponse_suggeree',
    reformulation: mockCoachAnalysis.proposal,
    conseils: [
      'Décrivez les faits sans les interpréter',
      'Utilisez des phrases en « je »',
      'Exprimez le besoin de votre enfant',
      'Proposez une solution concrète et datée',
    ],
    disclaimer: LEGAL_DISCLAIMER,
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Réponse simulée du chat, choisie par mots-clés. */
export function mockChatAnswer(question: string, opts: { aboutAnalysis: boolean; userId: string }): string {
  const q = norm(question)
  if (opts.userId === 'demo-nouveau') {
    return "Votre espace est encore vide : je ne trouve ni enfant, ni entrée de journal, ni événement. Commencez par ajouter vos enfants et vos premiers événements, je pourrai ensuite vous aider à partir de ces informations."
  }
  if (/doit|dette|rembours|frais|argent|combien|depense|paiement|pension|finance/.test(q)) {
    const today = new Date()
    const all = demoDepenseEntries(today)
    // Mois courant dans DEFAULT_TZ (et non dans le fuseau du serveur), mêmes totaux que la vue Finances.
    const key = monthKeyInTz(today)
    const month = all.filter((e) => monthKeyOf(e.date) === key)
    const t = totalsByFlux(month)
    const withProof = month.filter((e) => e.depense.justificatif || e.depense.autresJustificatifs?.length).length
    const n = month.length
    const tiers = t.tiers.length ? ` Réglé par l'autre parent ou un tiers (hors solde) : ${formatTotals(t.tiers)}.` : ''
    const reste = t.aRegler.length ? ` Reste à régler : ${formatTotals(t.aRegler)}.` : ''
    return `D'après les opérations enregistrées dans votre Journal ce mois-ci (${n} opération${n > 1 ? 's' : ''}), vous avez réglé ${formatTotals(t.sortie)} et reçu ${formatTotals(t.entree)}, soit un solde de ${formatSolde(t.solde)}.${tiers}${reste} ${withProof} opération${withProof > 1 ? 's ont' : ' a'} un justificatif joint.

Ces montants sont ceux que vous avez déclarés : Lien Parental ne certifie pas qu'un paiement a réellement été effectué. Si vous souhaitez faire le point avec ${CO_PARENT_PRENOM}, restez factuel : « Bonjour ${CO_PARENT_PRENOM}, je te propose de faire le point sur les dépenses des enfants de ce mois. Je t'envoie le récapitulatif avec les justificatifs. »

Sources : finances du journal`
  }
  if (/document|jaf|dossier|manque/.test(q)) {
    return "Dans votre coffre-fort, je vois notamment le jugement du 12 mai 2024, le carnet de santé, une attestation de scolarité et un courrier CAF.\n\nPour un dossier devant le juge aux affaires familiales, on retrouve souvent : justificatifs de domicile, attestations scolaires récentes, justificatifs de revenus et de charges, et éventuels témoignages. Je ne vois pas de justificatif de revenus récent dans votre espace. Un avocat ou un point-justice pourra vous confirmer la liste adaptée à votre situation.\n\nSources : coffre-fort"
  }
  if (/garde|changement|echange|week/.test(q)) {
    return `Voici une proposition de message :\n\n« Bonjour ${CO_PARENT_PRENOM}, serait-il possible d'échanger notre prochain week-end de garde avec le suivant ? [précisez la raison]. Je reste disponible pour en parler et trouver ce qui convient le mieux à Lina et Noah. »\n\nIl reste factuel, explique la raison et laisse la place à une contre-proposition.\n\nSources : planning de garde`
  }
  if (/resum|mois|evenement|visite/.test(q)) {
    return "Ce mois-ci, votre journal mentionne un week-end chez papa il y a deux jours, un appel vidéo serein avec Lina et un échange de messages sur le planning scolaire. Votre calendrier prévoit aussi une réunion parents-professeurs et une médiation familiale dans les deux prochaines semaines.\n\nJe ne vois pas de visite notée comme manquée dans votre journal.\n\nSources : journal, calendrier"
  }
  if (opts.aboutAnalysis) {
    return "Bonne question. Voici une piste pour avancer sereinement :\n- Décrivez les faits sans les interpréter\n- Exprimez le besoin de votre enfant\n- Proposez une solution concrète et datée"
  }
  return "Je peux vous aider à retrouver une information de votre espace (journal et ses dépenses, calendrier, garde, documents) ou à rédiger un message apaisé pour l'autre parent. Que souhaitez-vous faire ?"
}
