/**
 * Standard téléphonique IA (phase 4, Twilio Voice) — règles pures, testées par tests/agent-voice.test.ts.
 *
 * Fonctionnement « tour par tour » (compatible Vercel, sans serveur permanent) : Twilio joue un texte
 * (<Say>, voix neuronales), écoute la réponse (<Gather> parole ou touches), transcrit en temps réel et
 * rappelle notre webhook avec le texte. Aucun enregistrement audio (cahier V2 §30 : 0 jour).
 *
 *  - TwiML échappé (aucune donnée de l'appelant ne peut injecter de balise) ;
 *  - textes FR / EN / PT pensés pour l'oral (phrases courtes) ;
 *  - réponse de l'agent nettoyée pour la parole (liens, puces, emojis, longueur).
 */
import type { AgentLocale } from './core'

export const VOICE: Record<AgentLocale, { voice: string; lang: string }> = {
  fr: { voice: 'Polly.Lea-Neural', lang: 'fr-FR' },
  en: { voice: 'Polly.Joanna-Neural', lang: 'en-US' },
  pt: { voice: 'Polly.Camila-Neural', lang: 'pt-BR' },
}

export const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function say(text: string, locale: AgentLocale): string {
  return `<Say voice="${VOICE[locale].voice}" language="${VOICE[locale].lang}">${xml(text)}</Say>`
}

export function twiml(...parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join('')}</Response>`
}

/** Écoute de la parole (ou des touches) puis appel de `action` ; sans réponse : `onSilence`. */
export function gather(opts: { action: string; locale: AgentLocale; prompt: string; input?: 'speech' | 'dtmf speech'; numDigits?: number; hints?: string; onSilence: string; timeout?: number }): string {
  const attrs = [
    `input="${opts.input ?? 'speech'}"`, `action="${xml(opts.action)}"`, 'method="POST"', `language="${VOICE[opts.locale].lang}"`,
    'speechTimeout="auto"', `timeout="${opts.timeout ?? 6}"`, 'actionOnEmptyResult="false"',
    ...(opts.numDigits ? [`numDigits="${opts.numDigits}"`] : []), ...(opts.hints ? [`hints="${xml(opts.hints)}"`] : []),
  ]
  return `<Gather ${attrs.join(' ')}>${say(opts.prompt, opts.locale)}</Gather><Redirect method="POST">${xml(opts.onSilence)}</Redirect>`
}

export function dial(number: string, action: string, callerId: string): string {
  return `<Dial timeout="20" action="${xml(action)}" method="POST"${callerId ? ` callerId="${xml(callerId)}"` : ''}><Number>${xml(number)}</Number></Dial>`
}

export const hangup = () => '<Hangup/>'

/** Réponse écrite (site) → phrase à dire : sans liens, puces, emojis ni jetons, 600 caractères au plus. */
export function forSpeech(text: string): string {
  const cleaned = text
    .replace(/\[([^\]]{1,80})\]\((\/[^)\s]{0,120})\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'lienparental.fr')
    .replace(/\[\[[A-Z]+\]\]/g, '')
    .replace(/^\s*[-•*✅]\s+/gm, '')
    .replace(/[*_#`]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/:\s*\n+\s*/g, ' : ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim()
    .replace(/([^?!])$/, '$1.')
  if (cleaned.length <= 600) return cleaned
  const cut = cleaned.slice(0, 600)
  return cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? ')) + 1) || cut
}

/** Choix de langue : touche 1/2/3, ou langue dite (« français », « English », « português »). */
export function pickLanguage(digits: string | undefined, speech: string | undefined): AgentLocale | null {
  if (digits === '1') return 'fr'
  if (digits === '2') return 'en'
  if (digits === '3') return 'pt'
  const s = (speech ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/franc|french|frances/.test(s)) return 'fr'
  if (/english|anglais|ingles/.test(s)) return 'en'
  if (/portug/.test(s)) return 'pt'
  return null
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim()

export type VoiceIntent = 'humain' | 'rappel' | 'rdv' | 'email' | 'fin' | null
/** Intention dite par l'appelant (hors question libre). */
export function voiceIntent(speech: string): VoiceIntent {
  const t = fold(speech)
  if (/\b(au revoir|c est tout|non merci|rien d autre|goodbye|bye|that s all|no thanks|nothing else|tchau|ate logo|e so isso|nao obrigad)\b/.test(t)) return 'fin'
  if (/\b(representant|representative|representante|conseill(er|ere)|humain|human|quelqu un|someone|alguem|atendente|une personne|a person|uma pessoa)\b/.test(t)) return 'humain'
  if (/\b(rappel(er|ez|e)?|me rappeler|call ?back|call me back|retorno|me ligue|ligar de volta)\b/.test(t)) return 'rappel'
  if (/\b(rendez vous|rdv|appointment|book|reuniao|marcar|agendar)\b/.test(t)) return 'rdv'
  if (/\b(e ?mail|courriel|adresse mail|endereco de e ?mail)\b/.test(t)) return 'email'
  return null
}

export const T: Record<AgentLocale, Record<string, string>> = {
  fr: {
    menu: 'Bonjour et bienvenue chez Lien Parental. Pour continuer en français, tapez 1.',
    sayLang: 'Vous pouvez aussi dire : français, English, ou português.',
    greeting: 'Je suis l’assistant téléphonique de l’association. Comment puis-je vous aider aujourd’hui ?',
    another: 'Avez-vous une autre question ? Vous pouvez aussi dire : représentant, rappel, ou rendez-vous.',
    still: 'Êtes-vous toujours avec moi ?',
    silenceEnd: 'Je n’entends plus de réponse. Vous pouvez rappeler à tout moment. Au revoir.',
    misunderstood1: 'Je n’ai pas bien compris. Pouvez-vous reformuler votre demande en quelques mots ?',
    misunderstood2: 'Souhaitez-vous une information, un rendez-vous, parler à un représentant, ou signaler un problème ?',
    escalate: 'Je préfère vous orienter vers un représentant.',
    transfer: 'Très bien. Je vous mets en relation avec un représentant de Lien Parental. Un instant, s’il vous plaît.',
    transferFailed: 'Le transfert n’a pas abouti.',
    unavailable: 'Nos représentants ne sont pas disponibles actuellement. Je peux enregistrer une demande de rappel.',
    smsFailed: 'Je n’ai pas pu envoyer le SMS. Vous pouvez prendre rendez-vous sur lienparental.fr, ou nous écrire à',
    callbackPrompt: 'Après ce message, dites votre nom et, en une phrase, le motif de votre appel.',
    hidden: 'Votre numéro est masqué : je ne peux pas vous rappeler ni vous envoyer de SMS. Vous pouvez nous écrire à',
    smsBooking: 'Je vous envoie par SMS le lien pour prendre rendez-vous.',
    smsEmail: 'Je vous envoie aussi cette adresse par SMS.',
    smsBookingText: 'Lien Parental : prenez rendez-vous sur https://lienparental.fr (bouton Assistant, puis Prendre rendez-vous), ou écrivez-nous sur WhatsApp à ce numéro.',
    smsEmailText: 'Lien Parental : écrivez-nous à',
    limit: 'Je ne peux pas traiter d’autre demande de ce type aujourd’hui.',
    tooLong: 'Merci pour votre appel. Pour aller plus loin, écrivez-nous ou prenez rendez-vous sur lienparental.fr. Au revoir.',
    smsReply: 'Lien Parental : pour échanger avec notre assistant, écrivez-nous sur WhatsApp à ce numéro, appelez-le, ou rendez-vous sur https://lienparental.fr',
  },
  en: {
    menu: 'Welcome to Lien Parental. For English, press 2.',
    sayLang: 'You can also say: français, English, or português.',
    greeting: 'I’m the association’s phone assistant. How can I help you today?',
    another: 'Do you have another question? You can also say: representative, callback, or appointment.',
    still: 'Are you still there?',
    silenceEnd: 'I can no longer hear you. You can call back at any time. Goodbye.',
    misunderstood1: 'I didn’t quite understand. Could you rephrase your request in a few words?',
    misunderstood2: 'Would you like information, an appointment, to speak with a representative, or to report a problem?',
    escalate: 'I’d prefer to refer you to a representative.',
    transfer: 'All right. I’m putting you through to a Lien Parental representative. One moment, please.',
    transferFailed: 'The transfer didn’t go through.',
    unavailable: 'Our representatives are not available right now. I can record a callback request.',
    smsFailed: 'I couldn’t send the text. You can book on lienparental.fr, or write to us at',
    callbackPrompt: 'After this message, please say your name and, in one sentence, the reason for your call.',
    hidden: 'Your number is hidden: I can’t call you back or send you a text. You can write to us at',
    smsBooking: 'I’m sending you a text with the link to book an appointment.',
    smsEmail: 'I’m also texting you this address.',
    smsBookingText: 'Lien Parental: book an appointment at https://lienparental.fr (Assistant button, then Book an appointment), or message us on WhatsApp at this number.',
    smsEmailText: 'Lien Parental: write to us at',
    limit: 'I can’t handle another request of this kind today.',
    tooLong: 'Thank you for calling. To go further, write to us or book an appointment at lienparental.fr. Goodbye.',
    smsReply: 'Lien Parental: to talk to our assistant, message us on WhatsApp at this number, call it, or visit https://lienparental.fr',
  },
  pt: {
    menu: 'Bem-vindo à Lien Parental. Para continuar em português, pressione 3.',
    sayLang: 'Também pode dizer: français, English ou português.',
    greeting: 'Sou o assistente telefônico da associação. Como posso ajudar hoje?',
    another: 'Tem outra pergunta? Também pode dizer: representante, retorno ou reunião.',
    still: 'Ainda está aí?',
    silenceEnd: 'Não ouço mais resposta. Pode ligar novamente a qualquer momento. Até logo.',
    misunderstood1: 'Não entendi bem. Pode reformular o pedido em poucas palavras?',
    misunderstood2: 'Deseja uma informação, uma reunião, falar com um representante ou relatar um problema?',
    escalate: 'Prefiro encaminhá-lo a um representante.',
    transfer: 'Muito bem. Vou transferi-lo para um representante da Lien Parental. Um momento, por favor.',
    transferFailed: 'A transferência não foi concluída.',
    unavailable: 'Nossos representantes não estão disponíveis no momento. Posso registrar um pedido de retorno.',
    smsFailed: 'Não consegui enviar o SMS. Pode marcar em lienparental.fr ou nos escrever em',
    callbackPrompt: 'Após esta mensagem, diga seu nome e, em uma frase, o motivo da ligação.',
    hidden: 'Seu número está oculto: não posso retornar a ligação nem enviar SMS. Pode nos escrever em',
    smsBooking: 'Vou enviar por SMS o link para marcar uma reunião.',
    smsEmail: 'Também vou enviar este endereço por SMS.',
    smsBookingText: 'Lien Parental: marque uma reunião em https://lienparental.fr (botão Assistente, depois Marcar uma reunião) ou escreva pelo WhatsApp para este número.',
    smsEmailText: 'Lien Parental: escreva para',
    limit: 'Não posso tratar outro pedido deste tipo hoje.',
    tooLong: 'Obrigado pela ligação. Para continuar, escreva para nós ou marque uma reunião em lienparental.fr. Até logo.',
    smsReply: 'Lien Parental: para falar com o nosso assistente, escreva pelo WhatsApp para este número, ligue para ele ou acesse https://lienparental.fr',
  },
}

/** Numéro d'appelant exploitable (rappel, SMS) : international, pas masqué ni « anonymous ». */
export function callerNumber(from: string | undefined): string | null {
  const d = (from ?? '').replace(/[^\d+]/g, '')
  return /^\+\d{8,15}$/.test(d) ? d : null
}
