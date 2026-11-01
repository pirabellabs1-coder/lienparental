/**
 * Agent d'accueil Lien Parental — règles pures (migration 0640), partagées par le chatbot du site et,
 * plus tard, WhatsApp et le standard téléphonique. Aucun accès réseau ni base : testé par
 * tests/agent.test.ts.
 *
 *  - créneaux : horaires des représentants (heure de Cayenne), durée + tampon, délai minimum,
 *    horizon, indisponibilités, rendez-vous déjà pris ; 3 propositions, une par jour ;
 *  - disponibilité d'un représentant « maintenant » (jamais hors horaires) ;
 *  - base de connaissances : version active (publiée, ou programmée et arrivée à échéance),
 *    extrait pour le prompt, recherche simple pour les réponses sans IA ;
 *  - textes par défaut FR / EN / PT (modifiables dans le back-office).
 */
import { addDaysToKey, dayKeyInTz, timeInTz, wallTimeToIso } from '@/lib/tz'

export const AGENDA_TZ = 'America/Cayenne'
export const LOCALES = ['fr', 'en', 'pt'] as const
export type AgentLocale = (typeof LOCALES)[number]
export type Channel = 'web' | 'whatsapp' | 'voice'

// --- Horaires et représentants -------------------------------------------------------------

/** "1" (lundi) … "7" (dimanche) → plages ["HH:mm", "HH:mm"] en heure de Cayenne. */
export type WeeklyHours = Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', [string, string][]>>

export type Representative = {
  id: string
  name: string
  languages: AgentLocale[]
  services: string[]
  hours: WeeklyHours
  status: 'auto' | 'unavailable'
  priority: number
  active: boolean
}

export type AppointmentType = {
  code: string
  service: string
  labels: Record<AgentLocale, string>
  durationMin: number
  bufferMin: number
  minNoticeMin: number
  horizonDays: number
  active: boolean
}

/** Intervalle bloqué : rendez-vous [début, fin + tampon) ou indisponibilité ; representativeId null = tous. */
export type Busy = { representativeId: string | null; startMs: number; endMs: number }
export type Slot = { start: string; end: string; representativeId: string }

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
/** « 8:00 » ou « 8h00 » → « 08:00 » ; sinon la valeur telle quelle (refusée ensuite). */
const normTime = (v: unknown) => String(v).trim().replace(/^(\d)[:h]/, '0$1:').replace(/^(\d\d)h/, '$1:')
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Horaires saisis (JSON libre) → plages valides et triées. Le reste est ignoré. */
export function parseHours(raw: unknown): WeeklyHours {
  const out: WeeklyHours = {}
  if (!raw || typeof raw !== 'object') return out
  for (const day of ['1', '2', '3', '4', '5', '6', '7'] as const) {
    const list = (raw as Record<string, unknown>)[day]
    if (!Array.isArray(list)) continue
    const ranges = list
      .filter((r): r is unknown[] => Array.isArray(r) && r.length === 2)
      .map((r) => [normTime(r[0]), normTime(r[1])] as [string, string])
      .filter((r) => HHMM.test(r[0]) && HHMM.test(r[1]) && toMin(r[0]) < toMin(r[1]))
      .sort((a, b) => toMin(a[0]) - toMin(b[0]))
    if (ranges.length) out[day] = ranges
  }
  return out
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date « jour seul ». */
export function isoWeekday(dayKey: string): '1' | '2' | '3' | '4' | '5' | '6' | '7' {
  const d = new Date(`${dayKey}T12:00:00Z`).getUTCDay()
  return String(d === 0 ? 7 : d) as '1'
}

function serves(rep: Representative, service: string, language: AgentLocale) {
  return rep.active && rep.status !== 'unavailable' && rep.services.includes(service) && rep.languages.includes(language)
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd
}

/** Pas de la grille des créneaux (minutes) : un rendez-vous commence à l'heure ou à la demie. */
const STEP_MIN = 30

/**
 * Créneaux libres pour un type de rendez-vous et une langue. Une proposition par jour (choix
 * réel pour l'utilisateur), `count` au plus, à partir de `afterMs` (« autres créneaux »).
 * Le représentant retenu est le premier libre par ordre de priorité.
 */
export function computeSlots(args: {
  type: AppointmentType
  language: AgentLocale
  reps: Representative[]
  busy: Busy[]
  nowMs: number
  afterMs?: number
  count?: number
}): Slot[] {
  const { type, language, busy, nowMs } = args
  const count = args.count ?? 3
  const reps = args.reps.filter((r) => serves(r, type.service, language)).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  if (!reps.length || !type.active) return []
  const earliest = Math.max(nowMs + type.minNoticeMin * 60_000, args.afterMs ?? 0)
  const latest = nowMs + type.horizonDays * 86_400_000
  const out: Slot[] = []
  let day = dayKeyInTz(earliest, AGENDA_TZ)
  for (let i = 0; i <= type.horizonDays + 1 && out.length < count; i++, day = addDaysToKey(day, 1)) {
    const wd = isoWeekday(day)
    let best: Slot | null = null
    for (const rep of reps) {
      for (const [from, to] of rep.hours[wd] ?? []) {
        // Départ aligné sur la grille (08:15 → 08:30) : même règle que repsForStart.
        for (let m = Math.ceil(toMin(from) / STEP_MIN) * STEP_MIN; m + type.durationMin <= toMin(to); m += STEP_MIN) {
          const start = Date.parse(wallTimeToIso(day, fromMin(m), AGENDA_TZ))
          const end = start + type.durationMin * 60_000
          if (start < earliest || start > latest) continue
          if (best && start >= Date.parse(best.start)) break
          const blockEnd = end + type.bufferMin * 60_000
          const taken = busy.some((b) => (b.representativeId === null || b.representativeId === rep.id) && overlaps(start, blockEnd, b.startMs, b.endMs))
          if (taken) continue
          best = { start: new Date(start).toISOString(), end: new Date(end).toISOString(), representativeId: rep.id }
          break
        }
      }
    }
    if (best) out.push(best)
  }
  return out
}

/**
 * Représentants pouvant prendre le créneau `startMs` exact (vérification au moment de réserver :
 * le créneau proposé a pu être pris entre-temps). Ordre de priorité.
 */
export function repsForStart(args: { type: AppointmentType; language: AgentLocale; reps: Representative[]; busy: Busy[]; nowMs: number; startMs: number }): Representative[] {
  const { type, language, busy, nowMs, startMs } = args
  if (!type.active) return []
  if (startMs < nowMs + type.minNoticeMin * 60_000 || startMs > nowMs + type.horizonDays * 86_400_000) return []
  const day = dayKeyInTz(startMs, AGENDA_TZ)
  const startMin = toMin(timeInTz(startMs, AGENDA_TZ))
  if ((startMin % STEP_MIN) !== 0) return []
  const end = startMs + type.durationMin * 60_000
  return args.reps
    .filter((r) => serves(r, type.service, language))
    .filter((r) => (r.hours[isoWeekday(day)] ?? []).some(([f, t]) => startMin >= toMin(f) && startMin + type.durationMin <= toMin(t)))
    .filter((r) => !busy.some((b) => (b.representativeId === null || b.representativeId === r.id) && overlaps(startMs, end + type.bufferMin * 60_000, b.startMs, b.endMs)))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}

/** Un représentant du service et de la langue est-il joignable maintenant (dans ses horaires) ? */
export function availableNow(reps: Representative[], service: string, language: AgentLocale, nowMs: number, blackouts: Busy[] = []): Representative[] {
  const day = dayKeyInTz(nowMs, AGENDA_TZ)
  const min = toMin(timeInTz(nowMs, AGENDA_TZ))
  return reps
    .filter((r) => serves(r, service, language))
    .filter((r) => (r.hours[isoWeekday(day)] ?? []).some(([f, t]) => min >= toMin(f) && min < toMin(t)))
    .filter((r) => !blackouts.some((b) => (b.representativeId === null || b.representativeId === r.id) && nowMs >= b.startMs && nowMs < b.endMs))
    .sort((a, b) => a.priority - b.priority)
}

/** Référence lisible d'un rendez-vous : RDV-XXXXXX (sans 0/O/1/I). */
export function makeRef(random: Uint8Array): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return `RDV-${Array.from(random.slice(0, 6), (b) => A[b % A.length]).join('')}`
}

/** Réservation depuis le site : créneau tenu 30 min, le temps de cliquer sur le lien reçu par e-mail. */
export const PENDING_MS = 30 * 60_000

/** Modification / annulation possible jusqu'à 2 h avant le début. */
export const CHANGE_LIMIT_MS = 2 * 3_600_000
export function canChange(startIso: string, nowMs: number): boolean {
  return Date.parse(startIso) - nowMs >= CHANGE_LIMIT_MS
}

/** Rappels : 24 h et 2 h avant, seulement si le rendez-vous a été pris avant ce moment. */
export function dueReminder(a: { starts_at: string; created_at: string; reminder_24_sent_at: string | null; reminder_2_sent_at: string | null }, nowMs: number): '24h' | '2h' | null {
  const start = Date.parse(a.starts_at)
  const created = Date.parse(a.created_at)
  if (start <= nowMs) return null
  const left = start - nowMs
  if (left <= 2 * 3_600_000) return !a.reminder_2_sent_at && start - created > 2 * 3_600_000 ? '2h' : null
  if (left <= 24 * 3_600_000) return !a.reminder_24_sent_at && start - created > 24 * 3_600_000 ? '24h' : null
  return null
}

// --- Base de connaissances ----------------------------------------------------------------

export const KB_CATEGORIES = ['presentation', 'fonctionnalites', 'tarifs', 'compte', 'paiement', 'technique', 'partenariats', 'contact', 'escalade', 'liens'] as const
export type KbCategory = (typeof KB_CATEGORIES)[number]
export type KbStatus = 'draft' | 'review' | 'published' | 'scheduled' | 'archived'

export type KbEntry = {
  id: string
  entry_key: string
  locale: AgentLocale
  category: KbCategory
  version: number
  status: KbStatus
  title: string
  questions: string
  answer: string
  source: string | null
  effective_at: string | null
  author: string | null
  created_at: string
  updated_at: string
}

/** Version active de chaque fiche (par langue) : publiée, ou programmée dont la date est passée. */
export function liveEntries(entries: KbEntry[], nowMs: number): KbEntry[] {
  const best = new Map<string, KbEntry>()
  for (const e of entries) {
    const live = e.status === 'published' || (e.status === 'scheduled' && e.effective_at !== null && Date.parse(e.effective_at) <= nowMs)
    if (!live) continue
    const k = `${e.entry_key}|${e.locale}`
    const cur = best.get(k)
    if (!cur || e.version > cur.version) best.set(k, e)
  }
  return [...best.values()].sort((a, b) => a.category.localeCompare(b.category) || a.entry_key.localeCompare(b.entry_key))
}

/** Extrait de la base pour le prompt : fiches de la langue, bornées (~12 000 caractères). */
export function kbForPrompt(entries: KbEntry[], locale: AgentLocale, max = 12_000): string {
  let out = ''
  for (const e of entries.filter((x) => x.locale === locale)) {
    // Balises neutralisées : une fiche ne peut pas fermer son bloc ni celui de la base.
    const clean = (t: string) => t.replace(/<\s*\/?\s*(fiche|base_connaissances|faits_produit|question_visiteur)\b[^>]*>/gi, '')
    const block = `<fiche cle="${e.entry_key}" categorie="${e.category}">\n${clean(e.title)}\n${clean(e.answer)}\n</fiche>\n`
    if (out.length + block.length > max) break
    out += block
  }
  return out.trim()
}

const words = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3)

/** Réponse sans IA : la fiche dont le titre et les questions partagent le plus de mots (≥ 2). */
export function matchKb(question: string, entries: KbEntry[], locale: AgentLocale): KbEntry | null {
  const q = new Set(words(question))
  let best: { e: KbEntry; score: number } | null = null
  for (const e of entries) {
    if (e.locale !== locale) continue
    const score = new Set(words(`${e.title} ${e.questions}`).filter((w) => q.has(w))).size
    if (score >= 2 && (!best || score > best.score)) best = { e, score }
  }
  return best?.e ?? null
}

// --- Textes par défaut (cahier V2 §14-15), modifiables dans le back-office -------------------

export const MESSAGE_KEYS = [
  'WELCOME_WEB', 'OFFER_CHANNELS', 'OFFER_HUMAN', 'HUMAN_AVAILABLE', 'HUMAN_UNAVAILABLE', 'OFFER_APPOINTMENT',
  'ASK_APPOINTMENT_REASON', 'ASK_LANGUAGE', 'ASK_SLOT', 'NO_SLOTS', 'ASK_CONTACT', 'ASK_CALLBACK', 'CALLBACK_DONE',
  'APPT_PENDING', 'APPT_CONFIRMED', 'WELCOME_WHATSAPP', 'WA_HINT', 'ASK_SERVICE', 'ASK_NAME', 'ASK_REMINDER', 'HUMAN_HANDOFF',
  'NO_UPCOMING', 'UPCOMING', 'WA_REMINDER', 'APPT_CANCELLED', 'APPT_CHANGED', 'AGENDA_DOWN', 'TECH_ISSUE', 'UNKNOWN', 'EMAIL_SLA', 'END',
] as const
export type MessageKey = (typeof MESSAGE_KEYS)[number]

export const DEFAULT_MESSAGES: Record<MessageKey, Record<AgentLocale, string>> = {
  WELCOME_WEB: {
    fr: 'Bonjour 👋 Je suis l’assistant Lien Parental. Comment puis-je vous aider ?',
    en: 'Hello 👋 I’m the Lien Parental assistant. How can I help you today?',
    pt: 'Olá 👋 Sou o assistente da Lien Parental. Como posso ajudar?',
  },
  OFFER_CHANNELS: {
    fr: 'Je peux aussi vous mettre en relation avec Lien Parental. Que préférez-vous ?',
    en: 'I can also put you in touch with Lien Parental. What would you prefer?',
    pt: 'Também posso colocá-lo em contato com a Lien Parental. O que prefere?',
  },
  OFFER_HUMAN: {
    fr: 'Souhaitez-vous parler à un représentant de l’association ?',
    en: 'Would you like to speak with a representative?',
    pt: 'Gostaria de falar com um representante?',
  },
  HUMAN_AVAILABLE: {
    fr: 'Un représentant de Lien Parental est disponible maintenant. Vous pouvez l’appeler ou lui écrire sur WhatsApp.',
    en: 'A Lien Parental representative is available now. You can call or message them on WhatsApp.',
    pt: 'Um representante da Lien Parental está disponível agora. Pode ligar ou escrever pelo WhatsApp.',
  },
  HUMAN_UNAVAILABLE: {
    fr: 'Nos représentants ne sont pas disponibles actuellement. Je peux vous proposer un rendez-vous, un rappel ou notre adresse e-mail.',
    en: 'Our representatives are not available right now. I can offer you an appointment, a callback or our e-mail address.',
    pt: 'Nossos representantes não estão disponíveis no momento. Posso propor uma reunião, um retorno de ligação ou nosso e-mail.',
  },
  OFFER_APPOINTMENT: {
    fr: 'Souhaitez-vous prendre rendez-vous avec un représentant ?',
    en: 'Would you like to book an appointment?',
    pt: 'Gostaria de marcar uma reunião?',
  },
  ASK_APPOINTMENT_REASON: {
    fr: 'Quel est le motif de votre rendez-vous ?',
    en: 'What is your appointment about?',
    pt: 'Qual é o motivo da reunião?',
  },
  ASK_LANGUAGE: {
    fr: 'Dans quelle langue souhaitez-vous l’échange ?',
    en: 'Which language would you like to use?',
    pt: 'Em que idioma prefere a conversa?',
  },
  ASK_SLOT: {
    fr: 'Voici les prochains créneaux disponibles (heure de Cayenne) :',
    en: 'Here are the next available slots (Cayenne time):',
    pt: 'Estes são os próximos horários disponíveis (hora de Caiena):',
  },
  NO_SLOTS: {
    fr: 'Aucun créneau n’est disponible pour le moment. Puis-je prendre vos coordonnées pour qu’un représentant vous rappelle ?',
    en: 'No slot is available right now. May I take your details so that a representative calls you back?',
    pt: 'Nenhum horário está disponível no momento. Posso anotar seus dados para um representante retornar a ligação?',
  },
  ASK_CONTACT: {
    fr: 'Pour confirmer, indiquez votre nom et un moyen de vous joindre.',
    en: 'To confirm, please give your name and a way to reach you.',
    pt: 'Para confirmar, informe seu nome e um contato.',
  },
  ASK_CALLBACK: {
    fr: 'Puis-je prendre votre nom et le numéro sur lequel vous souhaitez être rappelé ?',
    en: 'May I take your name and the number we should call you back on?',
    pt: 'Posso anotar seu nome e o número para retornarmos a ligação?',
  },
  CALLBACK_DONE: {
    fr: 'Merci. Votre demande de rappel est bien enregistrée.',
    en: 'Thank you. Your callback request has been recorded.',
    pt: 'Obrigado. Seu pedido de retorno foi registrado.',
  },
  WELCOME_WHATSAPP: {
    fr: 'Bonjour 👋 Bienvenue chez Lien Parental. Je suis l’assistant de l’association. Posez votre question, ou choisissez :',
    en: 'Hello 👋 Welcome to Lien Parental. I’m the association’s assistant. Ask your question, or choose:',
    pt: 'Olá 👋 Bem-vindo à Lien Parental. Sou o assistente da associação. Faça sua pergunta ou escolha:',
  },
  WA_HINT: {
    fr: 'À tout moment : « menu », « mon rendez-vous », ou écrivez « FR », « EN », « PT » pour changer de langue.',
    en: 'At any time: “menu”, “my appointment”, or type “FR”, “EN”, “PT” to change language.',
    pt: 'A qualquer momento: «menu», «minha reunião», ou escreva «FR», «EN», «PT» para mudar de idioma.',
  },
  ASK_SERVICE: {
    fr: 'Pour quel sujet souhaitez-vous parler à un représentant ?',
    en: 'What would you like to talk to a representative about?',
    pt: 'Sobre qual assunto quer falar com um representante?',
  },
  ASK_NAME: {
    fr: 'À quel nom dois-je enregistrer la demande ?',
    en: 'What name should I use for your request?',
    pt: 'Em que nome devo registrar o pedido?',
  },
  ASK_REMINDER: {
    fr: 'Souhaitez-vous un rappel ici 24 h et 2 h avant le rendez-vous ?',
    en: 'Would you like a reminder here 24 hours and 2 hours before the appointment?',
    pt: 'Quer um lembrete aqui 24 h e 2 h antes da reunião?',
  },
  HUMAN_HANDOFF: {
    fr: 'Très bien. Un représentant de Lien Parental va vous répondre ici dès que possible.',
    en: 'All right. A Lien Parental representative will reply here as soon as possible.',
    pt: 'Muito bem. Um representante da Lien Parental vai responder aqui assim que possível.',
  },
  NO_UPCOMING: {
    fr: 'Je ne trouve aucun rendez-vous à venir pris avec ce numéro.',
    en: 'I can’t find any upcoming appointment booked with this number.',
    pt: 'Não encontro nenhuma reunião futura marcada com este número.',
  },
  UPCOMING: {
    fr: 'Votre rendez-vous : [DATE] à [HEURE]. Souhaitez-vous le conserver, le déplacer ou l’annuler ?',
    en: 'Your appointment: [DATE] at [HEURE]. Would you like to keep, move or cancel it?',
    pt: 'Sua reunião: [DATE] às [HEURE]. Quer manter, remarcar ou cancelar?',
  },
  WA_REMINDER: {
    fr: 'Rappel : votre rendez-vous avec Lien Parental est prévu [DATE] à [HEURE] (heure de Cayenne).',
    en: 'Reminder: your appointment with Lien Parental is on [DATE] at [HEURE] (Cayenne time).',
    pt: 'Lembrete: sua reunião com a Lien Parental está marcada para [DATE] às [HEURE] (hora de Caiena).',
  },
  APPT_PENDING: {
    fr: 'Créneau réservé le [DATE] à [HEURE]. Pour le confirmer, cliquez sur le lien que nous venons de vous envoyer par e-mail (valable 30 minutes).',
    en: 'Slot held for [DATE] at [HEURE]. To confirm it, click the link we have just e-mailed you (valid for 30 minutes).',
    pt: 'Horário reservado para [DATE] às [HEURE]. Para confirmar, clique no link que acabamos de enviar por e-mail (válido por 30 minutos).',
  },
  APPT_CONFIRMED: {
    fr: 'Votre rendez-vous est confirmé le [DATE] à [HEURE].',
    en: 'Your appointment is confirmed for [DATE] at [HEURE].',
    pt: 'Sua reunião está confirmada para [DATE] às [HEURE].',
  },
  APPT_CANCELLED: {
    fr: 'Votre rendez-vous a bien été annulé.',
    en: 'Your appointment has been cancelled.',
    pt: 'Sua reunião foi cancelada.',
  },
  APPT_CHANGED: {
    fr: 'Votre rendez-vous a bien été déplacé au [DATE] à [HEURE].',
    en: 'Your appointment has been moved to [DATE] at [HEURE].',
    pt: 'Sua reunião foi remarcada para [DATE] às [HEURE].',
  },
  AGENDA_DOWN: {
    fr: 'Je ne peux pas consulter les créneaux actuellement. Puis-je prendre vos coordonnées pour qu’un représentant vous recontacte ?',
    en: 'I can’t check the calendar right now. May I take your details so that a representative gets back to you?',
    pt: 'Não consigo consultar a agenda agora. Posso anotar seus dados para um representante entrar em contato?',
  },
  TECH_ISSUE: {
    fr: 'Je rencontre un problème technique. Vous pouvez continuer sur WhatsApp, appeler ou prendre rendez-vous.',
    en: 'I’m having a technical issue. You can continue on WhatsApp, call us or book an appointment.',
    pt: 'Estou com um problema técnico. Pode continuar pelo WhatsApp, ligar ou marcar uma reunião.',
  },
  UNKNOWN: {
    fr: 'Je n’ai pas suffisamment d’informations pour vous répondre avec certitude. Je peux vous orienter vers un représentant.',
    en: 'I don’t have enough information to answer with certainty. I’d prefer to refer you to a representative.',
    pt: 'Não tenho informações suficientes para responder com certeza. Prefiro encaminhá-lo a um representante.',
  },
  EMAIL_SLA: {
    fr: 'Vous pouvez nous écrire à [EMAIL]. Nous vous répondrons sous 48 heures ouvrées.',
    en: 'You can write to us at [EMAIL]. We reply within 2 working days.',
    pt: 'Pode nos escrever em [EMAIL]. Respondemos em até 48 horas úteis.',
  },
  END: {
    fr: 'Merci d’avoir contacté Lien Parental. Bonne journée.',
    en: 'Thank you for contacting Lien Parental.',
    pt: 'Obrigado por entrar em contato com a Lien Parental.',
  },
}

/** Textes effectifs : valeur du back-office si présente, sinon texte par défaut. */
export function mergeMessages(overrides: { msg_key: string; locale: string; text: string }[], locale: AgentLocale): Record<MessageKey, string> {
  const out = {} as Record<MessageKey, string>
  for (const k of MESSAGE_KEYS) {
    out[k] = overrides.find((o) => o.msg_key === k && o.locale === locale)?.text ?? DEFAULT_MESSAGES[k][locale]
  }
  return out
}

/** Date et heure d'un créneau pour l'utilisateur, en heure de Cayenne (libellé du fuseau ajouté ailleurs). */
export function slotLabel(iso: string, locale: AgentLocale): { date: string; time: string } {
  const lang = locale === 'pt' ? 'pt-BR' : locale === 'en' ? 'en-GB' : 'fr-FR'
  const d = new Date(iso)
  return {
    date: new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: AGENDA_TZ }).format(d),
    time: new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone: AGENDA_TZ }).format(d),
  }
}

export function fillMessage(text: string, vars: { date?: string; time?: string; email?: string }): string {
  return text.replace('[DATE]', vars.date ?? '').replace('[HEURE]', vars.time ?? '').replace('[EMAIL]', vars.email ?? '')
}
