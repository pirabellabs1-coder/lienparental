import 'server-only'
/**
 * Mode démonstration (ANTHROPIC_API_KEY absente) : réponses simulées, déterministes,
 * calculées à partir des données de démo pour rester plausibles. Aucune requête externe.
 * Disponibles en français (texte historique, inchangé), anglais et portugais du Brésil.
 */
import { mockCoachAnalysis, mockCoachCapture } from '@/lib/mock-data'
import { CO_PARENT_PRENOM } from '@/lib/garde'
import { demoDepenseEntries, formatSolde, formatTotals, monthKeyOf, totalsByFlux, type Totals } from '@/lib/journal-finances'
import { monthKeyInTz } from '@/lib/tz'
import { intlLocale, type Locale } from '@/lib/i18n/config'
import { LEGAL_DISCLAIMER, type AnalysisResult } from './schemas'

type Kind = 'capture' | 'pdf' | 'word' | 'document' | 'message'

/** Textes de l'analyse simulée hors français (le français vient de lib/mock-data, inchangé). */
const ANALYSIS_TEXT: Record<Exclude<Locale, 'fr'>, { otherParent: string; impact: string; resume: string; proposal: string; tips: string[]; disclaimer: string }> = {
  en: {
    otherParent: 'Other parent: ',
    impact: 'The tone is aggressive and contains accusations. These words can harm the dialogue and increase tension.',
    resume: 'The message contains accusations and generalizations; above all, it expresses fatigue and a need to be heard.',
    proposal:
      "I'd like us to find solutions together for our daughter's well-being. I need us to communicate calmly and listen to each other so we can move in the same direction.",
    tips: ['Describe the facts without interpreting them', 'Use “I” statements', "Express your child's needs", 'Suggest a concrete, dated solution'],
    disclaimer: 'The AI Coach does not give legal advice.',
  },
  pt: {
    otherParent: 'Outro genitor: ',
    impact: 'O tom é agressivo e contém acusações. Essas palavras podem prejudicar o diálogo e aumentar as tensões.',
    resume: 'A mensagem contém acusações e generalizações; ela expressa sobretudo cansaço e a necessidade de ser ouvido.',
    proposal:
      'Gostaria que encontrássemos juntos soluções para o bem-estar da nossa filha. Preciso que a gente se comunique com calma e se escute para seguirmos na mesma direção.',
    tips: ['Descreva os fatos sem interpretá-los', 'Use frases com “eu”', 'Expresse a necessidade do seu filho ou filha', 'Proponha uma solução concreta e com data'],
    disclaimer: 'O Coach com IA não dá aconselhamento jurídico.',
  },
}

export function mockAnalysis(kind: Kind, text?: string, locale: Locale = 'fr'): AnalysisResult {
  const isMessage = kind === 'message' && text
  const base = {
    type_contenu: kind === 'capture' ? 'capture_conversation' : isMessage ? 'message_ecrit' : 'document',
    ton: 28,
    agressivite: 72,
    // Citations telles qu'écrites dans le contenu analysé (non traduites, comme le modèle).
    mots_blessants: ["Tu ne t'occupes jamais", "Elle ne t'aime même pas", "C'est toujours de ma faute"],
    clarte: 45,
    respect: 30,
    nature_reponse: isMessage ? 'reformulation' : 'reponse_suggeree',
  } as const
  if (locale !== 'fr') {
    const l = ANALYSIS_TEXT[locale]
    return {
      ...base,
      mots_blessants: [...base.mots_blessants],
      texte_lu: isMessage ? text : kind === 'capture' ? mockCoachCapture.messages.map((m) => `${l.otherParent}${m.text}`).join('\n') : '',
      impact: l.impact,
      resume: l.resume,
      reformulation: l.proposal,
      conseils: [...l.tips],
      disclaimer: l.disclaimer,
    }
  }
  return {
    ...base,
    mots_blessants: [...base.mots_blessants],
    texte_lu: isMessage ? text : kind === 'capture' ? mockCoachCapture.messages.map((m) => `Autre parent : ${m.text}`).join('\n') : '',
    impact: mockCoachAnalysis.about[1] ?? '',
    resume: 'Le message contient des accusations et des généralisations ; il exprime surtout de la fatigue et un besoin d’être entendu.',
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

// Mots-clés par langue (le français garde exactement ses expressions historiques).
const KEYWORDS: Record<Locale, { money: RegExp; docs: RegExp; custody: RegExp; summary: RegExp }> = {
  fr: {
    money: /doit|dette|rembours|frais|argent|combien|depense|paiement|pension|finance/,
    docs: /document|jaf|dossier|manque/,
    custody: /garde|changement|echange|week/,
    summary: /resum|mois|evenement|visite/,
  },
  en: {
    money: /owe|debt|refund|repay|money|how much|expense|spend|paid|payment|support|finance|cost/,
    docs: /document|court|file|missing|paper/,
    custody: /custody|swap|change|exchange|week/,
    summary: /summar|month|event|visit/,
  },
  pt: {
    money: /deve|divida|reembols|dinheiro|quanto|despesa|gasto|pagamento|pensao|financ/,
    docs: /documento|processo|juiz|falta|papel/,
    custody: /guarda|troca|trocar|mudanc|fim de semana|semana/,
    summary: /resum|mes|evento|visita/,
  },
}

function totalsIn(t: Totals, intl: string, signed = false): string {
  const fmt = (cents: number, devise: string) => new Intl.NumberFormat(intl, { style: 'currency', currency: devise }).format(cents / 100)
  if (!t.length) return fmt(0, 'EUR')
  if (!signed) return t.map((x) => fmt(x.cents, x.devise)).join(' + ')
  return t.map((x) => (x.cents > 0 ? '+' : x.cents < 0 ? '−' : '') + fmt(Math.abs(x.cents), x.devise)).join(' · ')
}

/** Réponse simulée du chat, choisie par mots-clés, dans la langue d'affichage. */
export function mockChatAnswer(question: string, opts: { aboutAnalysis: boolean; userId: string; locale?: Locale }): string {
  const locale = opts.locale ?? 'fr'
  const q = norm(question)
  const kw = KEYWORDS[locale]
  const P = CO_PARENT_PRENOM
  if (opts.userId === 'demo-nouveau') {
    return {
      fr: "Votre espace est encore vide : je ne trouve ni enfant, ni entrée de journal, ni événement. Commencez par ajouter vos enfants et vos premiers événements, je pourrai ensuite vous aider à partir de ces informations.",
      en: "Your space is still empty: I can't find any child, journal entry or event. Start by adding your children and your first events, and I'll then be able to help you based on that information.",
      pt: 'O seu espaço ainda está vazio: não encontro nenhuma criança, nenhum registro no diário nem evento. Comece adicionando seus filhos e seus primeiros eventos; depois poderei ajudar você com base nessas informações.',
    }[locale]
  }
  if (kw.money.test(q)) {
    const today = new Date()
    const all = demoDepenseEntries(today)
    // Mois courant dans DEFAULT_TZ (et non dans le fuseau du serveur), mêmes totaux que la vue Finances.
    const key = monthKeyInTz(today)
    const month = all.filter((e) => monthKeyOf(e.date) === key)
    const t = totalsByFlux(month)
    const withProof = month.filter((e) => e.depense.justificatif || e.depense.autresJustificatifs?.length).length
    const n = month.length
    if (locale === 'en') {
      const intl = intlLocale(locale)
      const tiers = t.tiers.length ? ` Paid by the other parent or a third party (not in the balance): ${totalsIn(t.tiers, intl)}.` : ''
      const reste = t.aRegler.length ? ` Still to be paid: ${totalsIn(t.aRegler, intl)}.` : ''
      return `According to the transactions recorded in your Journal this month (${n} transaction${n > 1 ? 's' : ''}), you paid ${totalsIn(t.sortie, intl)} and received ${totalsIn(t.entree, intl)}, for a balance of ${totalsIn(t.solde, intl, true)}.${tiers}${reste} ${withProof} transaction${withProof > 1 ? 's have' : ' has'} a receipt attached.

These amounts are the ones you declared: Lien Parental does not certify that a payment was actually made. If you'd like to go over them with ${P}, stay factual: "Hi ${P}, I suggest we review the children's expenses for this month. I'm sending you the summary with the receipts."

Sources: journal finances`
    }
    if (locale === 'pt') {
      const intl = intlLocale(locale)
      const tiers = t.tiers.length ? ` Pago pelo outro genitor ou por terceiros (fora do saldo): ${totalsIn(t.tiers, intl)}.` : ''
      const reste = t.aRegler.length ? ` Ainda a pagar: ${totalsIn(t.aRegler, intl)}.` : ''
      return `De acordo com as operações registradas no seu Diário este mês (${n} operaç${n > 1 ? 'ões' : 'ão'}), você pagou ${totalsIn(t.sortie, intl)} e recebeu ${totalsIn(t.entree, intl)}, com um saldo de ${totalsIn(t.solde, intl, true)}.${tiers}${reste} ${withProof} operaç${withProof > 1 ? 'ões têm' : 'ão tem'} um comprovante anexado.

Esses valores são os que você declarou: Lien Parental não certifica que um pagamento foi realmente feito. Se quiser fazer um balanço com ${P}, seja objetivo: "Oi, ${P}, proponho fazermos um balanço das despesas das crianças deste mês. Vou te enviar o resumo com os comprovantes."

Fontes: finanças do diário`
    }
    const tiers = t.tiers.length ? ` Réglé par l'autre parent ou un tiers (hors solde) : ${formatTotals(t.tiers)}.` : ''
    const reste = t.aRegler.length ? ` Reste à régler : ${formatTotals(t.aRegler)}.` : ''
    return `D'après les opérations enregistrées dans votre Journal ce mois-ci (${n} opération${n > 1 ? 's' : ''}), vous avez réglé ${formatTotals(t.sortie)} et reçu ${formatTotals(t.entree)}, soit un solde de ${formatSolde(t.solde)}.${tiers}${reste} ${withProof} opération${withProof > 1 ? 's ont' : ' a'} un justificatif joint.

Ces montants sont ceux que vous avez déclarés : Lien Parental ne certifie pas qu'un paiement a réellement été effectué. Si vous souhaitez faire le point avec ${P}, restez factuel : « Bonjour ${P}, je te propose de faire le point sur les dépenses des enfants de ce mois. Je t'envoie le récapitulatif avec les justificatifs. »

Sources : finances du journal`
  }
  if (kw.docs.test(q)) {
    return {
      fr: "Dans votre coffre-fort, je vois notamment le jugement du 12 mai 2024, le carnet de santé, une attestation de scolarité et un courrier CAF.\n\nPour un dossier devant le juge aux affaires familiales, on retrouve souvent : justificatifs de domicile, attestations scolaires récentes, justificatifs de revenus et de charges, et éventuels témoignages. Je ne vois pas de justificatif de revenus récent dans votre espace. Un avocat ou un point-justice pourra vous confirmer la liste adaptée à votre situation.\n\nSources : coffre-fort",
      en: "In your Vault, I can see in particular the judgment of May 12, 2024, the health record, a school enrollment certificate and a letter from the CAF (family benefits office).\n\nA file for the family court judge often includes: proof of address, recent school certificates, proof of income and expenses, and any testimonials. I don't see any recent proof of income in your space. A lawyer or a free legal aid point (point-justice) can confirm the list that fits your situation.\n\nSources: Vault",
      pt: 'No seu Cofre, vejo principalmente a sentença de 12 de maio de 2024, a caderneta de saúde, um atestado de matrícula escolar e uma carta da CAF (caixa de benefícios familiares).\n\nUm processo perante o juiz de família costuma incluir: comprovantes de residência, atestados escolares recentes, comprovantes de renda e de despesas e eventuais depoimentos. Não vejo nenhum comprovante de renda recente no seu espaço. Um advogado ou um ponto de acesso à justiça gratuito (point-justice) poderá confirmar a lista adequada à sua situação.\n\nFontes: Cofre',
    }[locale]
  }
  if (kw.custody.test(q)) {
    return {
      fr: `Voici une proposition de message :\n\n« Bonjour ${P}, serait-il possible d'échanger notre prochain week-end de garde avec le suivant ? [précisez la raison]. Je reste disponible pour en parler et trouver ce qui convient le mieux à Lina et Noah. »\n\nIl reste factuel, explique la raison et laisse la place à une contre-proposition.\n\nSources : planning de garde`,
      en: `Here is a suggested message:\n\n"Hi ${P}, would it be possible to swap our next custody weekend with the following one? [give the reason]. I'm happy to talk about it and find what works best for Lina and Noah."\n\nIt stays factual, explains the reason and leaves room for a counter-proposal.\n\nSources: custody schedule`,
      pt: `Aqui está uma sugestão de mensagem:\n\n"Oi, ${P}, seria possível trocar o nosso próximo fim de semana de guarda pelo seguinte? [explique o motivo]. Estou à disposição para conversar e encontrar o que for melhor para Lina e Noah."\n\nEla é objetiva, explica o motivo e deixa espaço para uma contraproposta.\n\nFontes: agenda de guarda`,
    }[locale]
  }
  if (kw.summary.test(q)) {
    return {
      fr: "Ce mois-ci, votre journal mentionne un week-end chez papa il y a deux jours, un appel vidéo serein avec Lina et un échange de messages sur le planning scolaire. Votre calendrier prévoit aussi une réunion parents-professeurs et une médiation familiale dans les deux prochaines semaines.\n\nJe ne vois pas de visite notée comme manquée dans votre journal.\n\nSources : journal, calendrier",
      en: "This month, your journal mentions a weekend at dad's two days ago, a calm video call with Lina and an exchange of messages about the school schedule. Your calendar also has a parent-teacher meeting and a family mediation session in the next two weeks.\n\nI don't see any visit marked as missed in your journal.\n\nSources: journal, calendar",
      pt: 'Este mês, o seu diário menciona um fim de semana na casa do pai há dois dias, uma chamada de vídeo tranquila com Lina e uma troca de mensagens sobre o horário escolar. O seu calendário também prevê uma reunião de pais e professores e uma mediação familiar nas próximas duas semanas.\n\nNão vejo nenhuma visita registrada como perdida no seu diário.\n\nFontes: diário, calendário',
    }[locale]
  }
  if (opts.aboutAnalysis) {
    return {
      fr: "Bonne question. Voici une piste pour avancer sereinement :\n- Décrivez les faits sans les interpréter\n- Exprimez le besoin de votre enfant\n- Proposez une solution concrète et datée",
      en: "Good question. Here is a way to move forward calmly:\n- Describe the facts without interpreting them\n- Express your child's needs\n- Suggest a concrete, dated solution",
      pt: 'Boa pergunta. Aqui está um caminho para avançar com tranquilidade:\n- Descreva os fatos sem interpretá-los\n- Expresse a necessidade do seu filho ou filha\n- Proponha uma solução concreta e com data',
    }[locale]
  }
  return {
    fr: "Je peux vous aider à retrouver une information de votre espace (journal et ses dépenses, calendrier, garde, documents) ou à rédiger un message apaisé pour l'autre parent. Que souhaitez-vous faire ?",
    en: 'I can help you find information in your space (journal and its expenses, calendar, custody, documents) or write a calm message to the other parent. What would you like to do?',
    pt: 'Posso ajudar você a encontrar uma informação no seu espaço (diário e suas despesas, calendário, guarda, documentos) ou a redigir uma mensagem tranquila para o outro genitor. O que você gostaria de fazer?',
  }[locale]
}
