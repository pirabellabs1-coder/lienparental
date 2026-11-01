import 'server-only'
/**
 * Agent d'accueil, canal WhatsApp (phase 3, Twilio — API officielle Meta, migration 0650).
 *
 * Même agent que le site : base de connaissances publiée, agenda partagé, représentants, rappels.
 * Parcours (cahier V2 §5) : accueil + 3 boutons ; question libre → IA ; rendez-vous (motif, langue,
 * 3 créneaux, nom, rappel) confirmé tout de suite (le numéro WhatsApp est vérifié par le canal) ;
 * gestion « mon rendez-vous » (conserver, déplacer, annuler) ; rappel ; représentant (dans ses horaires :
 * l'assistant se met en retrait et l'équipe répond depuis le téléphone ou le back-office).
 *
 * Tout ce qui est tapé reste une DONNÉE : seul le texte des boutons et des commandes connues change
 * le parcours ; les questions libres passent par le prompt (balises neutralisées).
 *
 * Garde-fous :
 *  - un message sortant est enregistré AVANT l'envoi : son écho (`fromMe`) n'est jamais pris pour un
 *    représentant (l'assistant ne se met pas en pause lui-même) ;
 *  - les boutons portent leur cible (créneau, rendez-vous) et les actions destructrices un code à usage
 *    unique, visible du seul détenteur du numéro : un ancien message ou un message forgé n'agit pas ;
 *  - une étape abandonnée expire (30 min) ; plafonds par numéro (messages, rendez-vous, représentant,
 *    rappels, IA) et global (envois, e-mails à l'équipe).
 */
import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rateLimit, tokenKey } from '@/lib/data/server/rate-limit'
import { signupPath } from '@/lib/i18n/routing'
import { CONTACT_EMAIL, SITE } from '@/lib/seo/site'
import { sendEmail } from '@/lib/email/send'
import { agentTeamEmail } from '@/lib/email/templates/agentAppointment'
import { fillMessage, slotLabel, type AgentLocale } from './core'
import { LIVE, insertEvent, readServices, readTypes, svc, toType, type AppointmentRow } from './repo'
import { answerQuestion } from './answer'
import { AgentError, bookConfirmed, cancelRow, humanAvailable, listSlots, messagesFor, requestCallback, rescheduleRow, upcomingForPhone } from './server'
import { detectCommand, detectLocale, pickOption, toWhatsAppText, yesNo, type Command, type Inbound } from './wa-core'
import { sendTwilioWhatsApp } from './twilio'

/**
 * Choix proposés après un message. Les messages libres WhatsApp (API officielle) n'ont pas de boutons :
 * les choix sont écrits à la suite (« 👉 Prendre rendez-vous · Représentant »), et la réponse tapée est
 * reconnue (libellé, numéro de la liste, commande). Les identifiants restent ceux du parcours.
 */
type WaButton = { id: string; text: string; type: 'reply' }

// --- Données --------------------------------------------------------------------------------

type Step = 'rdv_type' | 'rdv_lang' | 'rdv_slot' | 'rdv_name' | 'rdv_reminder' | 'cb_name' | 'cb_reason' | 'human_service' | 'manage_pick' | 'manage' | 'move_slot'
type Slot = { start: string; date: string; time: string }
export type WaState = {
  step?: Step; at?: number; welcomed?: boolean; type?: string; lang?: AgentLocale; slots?: Slot[]; offered?: string[]
  start?: string; name?: string; service?: string; apptId?: string; code?: string; tries?: number
}
export type Conversation = {
  id: string; phone: string; name: string | null; locale: AgentLocale; state: WaState; mode: 'bot' | 'human'
  human_until: string | null; last_inbound_at: string | null; created_at: string; updated_at: string
}
export type WaMessage = { id: number; conversation_id: string; direction: 'in' | 'out'; author: 'contact' | 'bot' | 'team'; wa_id: string | null; body: string; created_at: string }

type Store = { conversations: Conversation[]; messages: WaMessage[] }
const g = globalThis as unknown as { __lpWaDemo?: Store }
const mem = (): Store => (g.__lpWaDemo ??= { conversations: [], messages: [] })
const db = (): SupabaseClient | null => (LIVE ? svc() : null)
const CONV_COLUMNS = 'id, phone, name, locale, state, mode, human_until, last_inbound_at, created_at, updated_at'
const MSG_COLUMNS = 'id, conversation_id, direction, author, wa_id, body, created_at'

const STEP_TTL_MS = 30 * 60_000
const HUMAN_HOURS = 4
const TEAM_HOURS = 12
const ECHO_WINDOW_MS = 10 * 60_000
const FREE_TEXT_STEPS: Step[] = ['rdv_name', 'cb_name', 'cb_reason']

async function getConversation(phone: string, name: string | null, locale: AgentLocale): Promise<Conversation> {
  const d = db()
  const now = new Date().toISOString()
  if (!d) {
    let c = mem().conversations.find((x) => x.phone === phone)
    if (!c) {
      c = { id: crypto.randomUUID(), phone, name, locale, state: {}, mode: 'bot', human_until: null, last_inbound_at: null, created_at: now, updated_at: now }
      mem().conversations.unshift(c)
    }
    return c
  }
  const { data } = await d.from('agent_wa_conversations').select(CONV_COLUMNS).eq('phone', phone).maybeSingle()
  if (data) return data as Conversation
  // Création concurrente (deux webhooks) : le second récupère la ligne existante sans l'écraser.
  await d.from('agent_wa_conversations').upsert({ phone, name, locale }, { onConflict: 'phone', ignoreDuplicates: true })
  const { data: row, error } = await d.from('agent_wa_conversations').select(CONV_COLUMNS).eq('phone', phone).single()
  if (error) throw new Error(`wa_conversation (${error.code})`)
  return row as Conversation
}

export async function saveConversation(c: Conversation, patch: Partial<Conversation>): Promise<void> {
  Object.assign(c, patch, { updated_at: new Date().toISOString() })
  const d = db()
  if (!d) return
  const { error } = await d.from('agent_wa_conversations').update({ ...patch, updated_at: c.updated_at }).eq('id', c.id)
  if (error) console.warn('[whatsapp] conversation non enregistrée (%s)', error.code)
}

/** Enregistre un message ; renvoie son identifiant, ou null si ce message fournisseur a déjà été traité. */
export async function storeMessage(conversationId: string, m: { direction: 'in' | 'out'; author: WaMessage['author']; waId: string | null; body: string }): Promise<number | null> {
  const row = { conversation_id: conversationId, direction: m.direction, author: m.author, wa_id: m.waId, body: m.body.slice(0, 4000) }
  const d = db()
  if (!d) {
    if (m.waId && mem().messages.some((x) => x.wa_id === m.waId)) return null
    const id = mem().messages.length + 1
    mem().messages.push({ ...row, id, created_at: new Date().toISOString() })
    return id
  }
  const { data, error } = await d.from('agent_wa_messages').insert(row).select('id').single()
  if (error?.code === '23505') return null
  if (error) {
    console.warn('[whatsapp] message non enregistré (%s)', error.code)
    return -1
  }
  return (data as { id: number }).id
}

async function setWaId(messageId: number, waId: string) {
  const d = db()
  if (!d) {
    const m = mem().messages.find((x) => x.id === messageId)
    if (m && !mem().messages.some((x) => x.wa_id === waId)) m.wa_id = waId
    return
  }
  await d.from('agent_wa_messages').update({ wa_id: waId }).eq('id', messageId).is('wa_id', null)
}

async function recentMessages(conversationId: string, limit: number): Promise<WaMessage[]> {
  const d = db()
  if (!d) return mem().messages.filter((m) => m.conversation_id === conversationId).slice(-limit)
  const { data } = await d.from('agent_wa_messages').select(MSG_COLUMNS).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit)
  return ((data ?? []) as WaMessage[]).reverse()
}

// --- Libellés d'interface (boutons ≤ 20 caractères) ---------------------------------------------

const L = {
  fr: {
    rdv: 'Prendre rendez-vous', human: 'Représentant', callback: 'Être rappelé', yes: 'Oui', no: 'Non', keep: 'Conserver', move: 'Déplacer', cancel: 'Annuler',
    pickNumber: (n: number) => `Répondez par un numéro de 1 à ${n}.`, more: 'Écrivez « autres » pour d’autres créneaux.', askTopic: 'En une phrase, quel est le sujet de votre demande ?',
    nameInvalid: 'Indiquez un nom (2 à 120 caractères).', slotTaken: 'Ce créneau vient d’être pris. Voici les suivants :', tooLate: 'Ce rendez-vous commence dans moins de 2 heures : il ne peut plus être modifié ici. Appelez-nous si besoin.',
    error: 'Je rencontre un problème technique. Réessayez dans un instant, ou écrivez-nous à', kept: 'Parfait, votre rendez-vous est conservé.', manageHint: 'Pour le modifier plus tard, écrivez « mon rendez-vous ».',
    signup: 'Créer un compte gratuit :', which: 'Quel rendez-vous ?', ref: 'Référence', tz: 'heure de Cayenne', yesNo: 'Répondez « oui » ou « non ».',
    code: (code: string) => `Sans boutons, répondez « déplacer ${code} » ou « annuler ${code} ».`,
    limitBook: 'Vous avez déjà le nombre maximal de rendez-vous à venir. Écrivez « mon rendez-vous » pour les gérer.',
    limitHuman: 'Votre demande a bien été transmise à l’équipe. Elle vous répondra ici dès que possible.',
    limitCallback: 'Une demande de rappel est déjà enregistrée pour ce numéro. L’équipe vous recontactera.',
  },
  en: {
    rdv: 'Book appointment', human: 'Representative', callback: 'Call me back', yes: 'Yes', no: 'No', keep: 'Keep', move: 'Move', cancel: 'Cancel',
    pickNumber: (n: number) => `Reply with a number from 1 to ${n}.`, more: 'Type “more” for other slots.', askTopic: 'In one sentence, what is your request about?',
    nameInvalid: 'Please give a name (2 to 120 characters).', slotTaken: 'That slot has just been taken. Here are the next ones:', tooLate: 'This appointment starts in less than 2 hours: it can no longer be changed here. Call us if needed.',
    error: 'I’m having a technical issue. Please try again shortly, or write to', kept: 'Great, your appointment is kept.', manageHint: 'To change it later, type “my appointment”.',
    signup: 'Create a free account:', which: 'Which appointment?', ref: 'Reference', tz: 'Cayenne time', yesNo: 'Please reply “yes” or “no”.',
    code: (code: string) => `Without buttons, reply “move ${code}” or “cancel ${code}”.`,
    limitBook: 'You already have the maximum number of upcoming appointments. Type “my appointment” to manage them.',
    limitHuman: 'Your request has been passed on to the team. They will reply here as soon as possible.',
    limitCallback: 'A callback request is already recorded for this number. The team will contact you.',
  },
  pt: {
    rdv: 'Marcar reunião', human: 'Representante', callback: 'Retorno ligação', yes: 'Sim', no: 'Não', keep: 'Manter', move: 'Remarcar', cancel: 'Cancelar',
    pickNumber: (n: number) => `Responda com um número de 1 a ${n}.`, more: 'Escreva «outros» para outros horários.', askTopic: 'Em uma frase, qual é o assunto do pedido?',
    nameInvalid: 'Informe um nome (2 a 120 caracteres).', slotTaken: 'Esse horário acabou de ser reservado. Estes são os próximos:', tooLate: 'Esta reunião começa em menos de 2 horas: não pode mais ser alterada aqui. Ligue para nós se precisar.',
    error: 'Estou com um problema técnico. Tente novamente em instantes ou escreva para', kept: 'Perfeito, sua reunião foi mantida.', manageHint: 'Para alterá-la depois, escreva «minha reunião».',
    signup: 'Criar uma conta gratuita:', which: 'Qual reunião?', ref: 'Referência', tz: 'hora de Caiena', yesNo: 'Responda «sim» ou «não».',
    code: (code: string) => `Sem botões, responda «remarcar ${code}» ou «cancelar ${code}».`,
    limitBook: 'Você já tem o número máximo de reuniões futuras. Escreva «minha reunião» para gerenciá-las.',
    limitHuman: 'Seu pedido foi transmitido à equipe. Ela responderá aqui assim que possível.',
    limitCallback: 'Já existe um pedido de retorno para este número. A equipe entrará em contato.',
  },
}
const LANGS = [{ id: 'l:fr', label: 'Français', code: 'fr' as const }, { id: 'l:en', label: 'English', code: 'en' as const }, { id: 'l:pt', label: 'Português', code: 'pt' as const }]
const reply = (id: string, text: string): WaButton => ({ id, text, type: 'reply' })
/** « … à 08:00. » → « … à 08:00 (heure de Cayenne). » */
const withTz = (sentence: string, tz: string) => `${sentence.replace(/[.\s]+$/, '')} (${tz}).`
const numbered = (items: string[]) => items.map((x, i) => `${i + 1}. ${x}`).join('\n')
const teamAddress = () => process.env.AGENT_TEAM_EMAIL?.trim() || CONTACT_EMAIL

// --- Envoi -------------------------------------------------------------------------------------

/**
 * Message de l'assistant : enregistré d'abord (l'écho du fournisseur le retrouvera), puis envoyé ;
 * plafond global d'envois par heure (protège le numéro d'un bannissement en cas d'abus).
 */
async function say(c: Conversation, text: string, buttons: WaButton[] = [], author: 'bot' | 'team' = 'bot'): Promise<boolean> {
  const cap = await rateLimit('wa-out-global:all', Math.max(10, Number(process.env.WHATSAPP_HOURLY_CAP) || 300), 3_600_000, { failClosed: true })
  if (!cap.ok) {
    console.warn('[whatsapp] plafond horaire d’envois atteint')
    return false
  }
  // Créneaux et actions protégées par code : déjà décrits dans le texte (liste numérotée, code).
  const choices = buttons.filter((b) => !b.id.startsWith('s:') && !/^m:(move|cancel):/.test(b.id)).map((b) => b.text)
  const body = choices.length ? `${text}\n\n👉 ${choices.join(' · ')}` : text
  const rowId = await storeMessage(c.id, { direction: 'out', author, waId: null, body })
  const r = await sendTwilioWhatsApp(c.phone, body)
  if (r.ok && r.id && rowId && rowId > 0) await setWaId(rowId, r.id)
  await saveConversation(c, {})
  return r.ok
}

/**
 * Rappel de rendez-vous (souvent plus de 24 h après le dernier message) : modèle Meta approuvé si
 * configuré (TWILIO_WA_REMINDER_SID, variables date / heure), sinon texte libre (accepté seulement
 * dans la fenêtre de 24 h). Enregistré dans la conversation.
 */
export async function notifyByWhatsApp(phone: string, locale: AgentLocale, text: string, vars?: { date: string; time: string }): Promise<boolean> {
  const c = await getConversation(phone, null, locale)
  const templateSid = process.env.TWILIO_WA_REMINDER_SID?.trim()
  if (!templateSid || !vars) return say(c, text)
  await storeMessage(c.id, { direction: 'out', author: 'bot', waId: null, body: text })
  const r = await sendTwilioWhatsApp(c.phone, text, { sid: templateSid, variables: { 1: vars.date, 2: vars.time } })
  return r.ok
}

/** Réponse d'un représentant depuis le back-office : envoyée puis, si elle est partie, l'assistant se met en retrait. */
export async function teamReply(conversationId: string, text: string): Promise<{ ok: boolean }> {
  const c = await conversationById(conversationId)
  if (!c) return { ok: false }
  const r = await sendTwilioWhatsApp(c.phone, text)
  if (!r.ok) return { ok: false }
  await storeMessage(c.id, { direction: 'out', author: 'team', waId: r.id, body: text })
  await saveConversation(c, { mode: 'human', human_until: new Date(Date.now() + TEAM_HOURS * 3_600_000).toISOString() })
  return { ok: true }
}

export async function releaseToBot(conversationId: string): Promise<void> {
  const c = await conversationById(conversationId)
  if (c) await saveConversation(c, { mode: 'bot', human_until: null, state: { welcomed: true } })
}

async function conversationById(id: string): Promise<Conversation | null> {
  const d = db()
  if (!d) return mem().conversations.find((c) => c.id === id) ?? null
  const { data } = await d.from('agent_wa_conversations').select(CONV_COLUMNS).eq('id', id).maybeSingle()
  return (data as Conversation | null) ?? null
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

// --- Traitement d'un message reçu ----------------------------------------------------------------

export async function handleInbound(msg: Inbound): Promise<unknown> {
  const own = (process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').replace(/[^\d]/g, '')
  if (own && msg.phone === own) return
  const c = await getConversation(msg.phone, msg.name, detectLocale(msg.text))

  // Message parti du téléphone de l'association : écho d'un envoi de l'assistant (même identifiant ou
  // même texte, enregistré avant l'envoi) → ignoré ; sinon un représentant répond lui-même → retrait.
  if (msg.fromMe) {
    const recent = await recentMessages(c.id, 15)
    const echo = recent.some((m) => m.direction === 'out' && ((msg.id && m.wa_id === msg.id) || (norm(m.body) === norm(msg.text) && Date.now() - Date.parse(m.created_at) < ECHO_WINDOW_MS)))
    if (echo) return
    if (await storeMessage(c.id, { direction: 'out', author: 'team', waId: msg.id, body: msg.text })) {
      await saveConversation(c, { mode: 'human', human_until: new Date(Date.now() + TEAM_HOURS * 3_600_000).toISOString() })
    }
    return
  }
  if (!(await storeMessage(c.id, { direction: 'in', author: 'contact', waId: msg.id, body: msg.text }))) return
  await saveConversation(c, { last_inbound_at: new Date().toISOString(), ...(msg.name && !c.name ? { name: msg.name } : {}) })

  // Cahier V2 §37 : 20 messages par minute et par numéro ; au-delà, silence (pas de boucle).
  if (!(await rateLimit(tokenKey('wa-inbound', c.phone), 20, 60_000)).ok) return

  // Étape abandonnée depuis plus de 30 min : on repart de zéro (« oui » ne réserve plus un ancien créneau).
  if (c.state.step && (!c.state.at || Date.now() - c.state.at > STEP_TTL_MS)) await saveConversation(c, { state: { welcomed: true } })

  const input = { text: msg.text, buttonId: msg.buttonId }
  // Un bouton de parcours appartient à l'étape en cours (son libellé n'est jamais une commande) ; aux
  // étapes de saisie libre, seules « menu » et « annuler » interrompent ; « annuler » en gestion = action.
  let cmd: Command | 'rdv' | 'rappel' | 'humain' | 'mes-rdv' = msg.buttonId?.startsWith('act:') ? (msg.buttonId.slice(4) as 'rdv') : msg.buttonId ? null : detectCommand(msg.text)
  if (c.state.step && FREE_TEXT_STEPS.includes(c.state.step) && !msg.buttonId && cmd !== 'menu' && cmd !== 'cancel') cmd = null
  if (c.state.step === 'manage' && cmd === 'cancel') cmd = null

  // Un représentant a la main : l'assistant se tait, sauf si la personne le rappelle (« assistant »).
  if (c.mode === 'human' && c.human_until && Date.parse(c.human_until) > Date.now()) {
    if (cmd !== 'stop-human') return
    await saveConversation(c, { mode: 'bot', human_until: null })
  } else if (c.mode === 'human') {
    await saveConversation(c, { mode: 'bot', human_until: null })
  }

  try {
    const inName = c.state.step === 'rdv_name' || c.state.step === 'cb_name'
    const lang = !inName ? LANGS.find((l) => l.id === msg.buttonId || l.code === msg.text.trim().toLowerCase()) : undefined
    if (lang && c.state.step !== 'rdv_lang') {
      await saveConversation(c, { locale: lang.code, state: { welcomed: true } })
      return welcome(c)
    }
    if (cmd === 'cancel' || cmd === 'menu') {
      await saveConversation(c, { state: { welcomed: true } })
      return welcome(c)
    }
    if (c.state.step && !cmd) return await continueStep(c, input)
    if (cmd === 'rdv') return await startRdv(c)
    if (cmd === 'rappel') return await startCallback(c)
    if (cmd === 'humain') return await startHuman(c)
    if (cmd === 'mes-rdv') return await startManage(c)
    if (cmd === 'stop-human') return welcome(c)
    if (!c.state.welcomed) {
      await saveConversation(c, { state: { ...c.state, welcomed: true } })
      await welcome(c)
      // Première prise de contact avec une vraie question : on y répond aussi.
      if (msg.text.trim().split(/\s+/).length < 4) return
    }
    await answer(c)
  } catch (e) {
    console.warn('[whatsapp] traitement interrompu :', e instanceof Error ? e.message : e)
    await saveConversation(c, { state: { welcomed: true } })
    await say(c, `${L[c.locale].error} ${CONTACT_EMAIL}`)
  }
}

async function welcome(c: Conversation) {
  const m = await messagesFor(c.locale)
  const t = L[c.locale]
  await say(c, `${m.WELCOME_WHATSAPP}\n\n${m.WA_HINT}`, [reply('act:rdv', t.rdv), reply('act:humain', t.human), reply('act:rappel', t.callback)])
}

async function answer(c: Conversation) {
  // Contexte court, sans les messages des représentants (jamais présentés comme réponses de l'assistant).
  const history = (await recentMessages(c.id, 10)).filter((m) => m.author !== 'team').slice(-6)
    .map((m) => ({ role: m.direction === 'in' ? ('user' as const) : ('assistant' as const), content: m.body }))
  const allowAi = (await rateLimit(tokenKey('wa-ai', c.phone), 30, 86_400_000)).ok
  const a = await answerQuestion(history, c.locale, 'whatsapp', { allowAi })
  const t = L[c.locale]
  let text = toWhatsAppText(a.text, SITE)
  if (a.cta) text += `\n\n${t.signup} ${SITE}${signupPath(c.locale)}`
  const buttons = a.actions.map((k) => (k === 'rdv' ? reply('act:rdv', t.rdv) : k === 'rappel' ? reply('act:rappel', t.callback) : reply('act:humain', t.human)))
  await say(c, text, buttons)
}

// --- Parcours ------------------------------------------------------------------------------------

async function setStep(c: Conversation, patch: WaState) {
  await saveConversation(c, { state: { welcomed: true, ...c.state, ...patch, at: Date.now() } })
}
const done = (c: Conversation) => saveConversation(c, { state: { welcomed: true } })

async function startRdv(c: Conversation, presetType?: string) {
  const m = await messagesFor(c.locale)
  const types = (await readTypes(db())).filter((x) => x.active)
  if (presetType && types.some((x) => x.code === presetType)) {
    await setStep(c, { step: 'rdv_lang', type: presetType, offered: [] })
    return say(c, m.ASK_LANGUAGE, LANGS.map((l) => reply(l.id, l.label)))
  }
  await setStep(c, { step: 'rdv_type', offered: [] })
  await say(c, `${m.ASK_APPOINTMENT_REASON}\n\n${numbered(types.map((x) => toType(x).labels[c.locale]))}\n\n${L[c.locale].pickNumber(types.length)}`)
}

/** Identifiant de bouton d'un créneau : son instant (un ancien message désigne toujours SON créneau). */
const slotId = (start: string) => `s:${Date.parse(start)}`

async function offerSlots(c: Conversation, type: string, lang: AgentLocale, after?: string, prefix?: string, step: Step = 'rdv_slot') {
  const m = await messagesFor(c.locale)
  const t = L[c.locale]
  const slots = await listSlots(type, lang, after).catch(() => null)
  if (slots === null) {
    await done(c)
    return say(c, m.AGENDA_DOWN, [reply('act:rappel', t.callback)])
  }
  if (!slots.length) {
    await done(c)
    return say(c, m.NO_SLOTS, [reply('act:rappel', t.callback)])
  }
  // Libellés dans la langue de la conversation (l'échange peut se faire dans une autre langue).
  const view = slots.map((s) => ({ start: s.start, ...slotLabel(s.start, c.locale) }))
  const offered = [...(c.state.offered ?? []), ...view.map((s) => s.start)].slice(-12)
  await setStep(c, { step, slots: view, offered })
  const lines = numbered(view.map((s) => `${s.date} — ${s.time}`))
  await say(c, `${prefix ? `${prefix}\n\n` : ''}${m.ASK_SLOT}\n\n${lines}\n\n${t.more}`, view.map((s) => reply(slotId(s.start), `${s.date.split(' ').slice(0, 3).join(' ').slice(0, 13)} ${s.time}`)))
}

const MORE = /^(autres?|more|outros?|suivants?|next)$/i

/** Créneau choisi : bouton (son instant, s'il a bien été proposé à cette personne) ou numéro de la liste en cours. */
function chosenSlot(c: Conversation, input: { text: string; buttonId: string | null }): string | null {
  if (input.buttonId?.startsWith('s:')) {
    const ms = Number(input.buttonId.slice(2))
    return (c.state.offered ?? []).find((s) => Date.parse(s) === ms) ?? null
  }
  const slots = c.state.slots ?? []
  const pick = pickOption({ text: input.text, buttonId: null }, slots.map((x) => ({ id: x.start, label: `${x.date} ${x.time}` })))
  return pick?.id ?? null
}

async function continueStep(c: Conversation, input: { text: string; buttonId: string | null }) {
  const m = await messagesFor(c.locale)
  const t = L[c.locale]
  const s = c.state
  switch (s.step) {
    case 'rdv_type': {
      const types = (await readTypes(db())).filter((x) => x.active).map((x) => ({ id: x.code, label: toType(x).labels[c.locale] }))
      const pick = pickOption(input, types)
      if (!pick) return say(c, t.pickNumber(types.length))
      await setStep(c, { step: 'rdv_lang', type: pick.id })
      return say(c, m.ASK_LANGUAGE, LANGS.map((l) => reply(l.id, l.label)))
    }
    case 'rdv_lang': {
      const pick = pickOption(input, LANGS)
      if (!pick) return say(c, m.ASK_LANGUAGE, LANGS.map((l) => reply(l.id, l.label)))
      await setStep(c, { lang: pick.code })
      return offerSlots(c, s.type!, pick.code)
    }
    case 'rdv_slot':
    case 'move_slot': {
      const slots = s.slots ?? []
      if (MORE.test(input.text.trim()) && slots.length && !input.buttonId) {
        const last = slots[slots.length - 1]!
        const nextDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cayenne' }).format(new Date(Date.parse(last.start) + 86_400_000))
        return offerSlots(c, s.type!, s.lang ?? c.locale, `${nextDay}T00:00:00-03:00`, undefined, s.step)
      }
      const start = chosenSlot(c, input)
      if (!start) return say(c, `${t.pickNumber(slots.length)} ${t.more}`)
      if (s.step === 'move_slot') return moveTo(c, start)
      await setStep(c, { step: 'rdv_name', start })
      return say(c, m.ASK_NAME)
    }
    case 'rdv_name':
    case 'cb_name': {
      const name = input.text.trim().replace(/\s+/g, ' ')
      if (name.length < 2 || name.length > 120 || input.buttonId) return say(c, t.nameInvalid)
      if (s.step === 'cb_name') {
        await setStep(c, { step: 'cb_reason', name })
        return say(c, t.askTopic)
      }
      await setStep(c, { step: 'rdv_reminder', name })
      return say(c, m.ASK_REMINDER, [reply('yes', t.yes), reply('no', t.no)])
    }
    case 'rdv_reminder': {
      const yn = yesNo(input)
      if (yn === null) return say(c, t.yesNo, [reply('yes', t.yes), reply('no', t.no)])
      // Étape consommée tout de suite : un second « oui » simultané ne relance pas de réservation.
      await done(c)
      if (!(await rateLimit(tokenKey('wa-book', c.phone), 3, 86_400_000)).ok) return say(c, t.limitBook)
      try {
        const b = await bookConfirmed({ typeCode: s.type!, language: s.lang ?? c.locale, start: s.start!, name: s.name!, phone: c.phone, channel: 'whatsapp', remindersConsent: yn })
        return say(c, `${withTz(fillMessage(m.APPT_CONFIRMED, slotLabel(b.start, c.locale)), t.tz)}\n${t.ref} : ${b.ref}\n\n${t.manageHint}`)
      } catch (e) {
        if (e instanceof AgentError && e.code === 'duplicate') return
        if (e instanceof AgentError && e.code === 'limit') return say(c, t.limitBook)
        if (e instanceof AgentError && e.code === 'slot_taken') {
          await setStep(c, { type: s.type, lang: s.lang, name: s.name, offered: s.offered })
          return offerSlots(c, s.type!, s.lang ?? c.locale, undefined, t.slotTaken)
        }
        throw e
      }
    }
    case 'cb_reason': {
      const reason = input.text.trim().slice(0, 500)
      if (reason.length < 2) return say(c, t.askTopic)
      await done(c)
      if (!(await rateLimit(tokenKey('wa-callback', c.phone), 2, 86_400_000)).ok || !(await teamEmailAllowed())) return say(c, t.limitCallback)
      await requestCallback({ name: s.name!, phone: `+${c.phone}`, reason, service: s.service, language: c.locale, channel: 'whatsapp' })
      return say(c, m.CALLBACK_DONE)
    }
    case 'human_service': {
      const services = await serviceOptions(c.locale)
      const pick = pickOption(input, services)
      if (!pick) return say(c, t.pickNumber(services.length))
      return humanCheck(c, pick.id)
    }
    case 'manage_pick': {
      const list = await upcomingForPhone(c.phone)
      const pick = pickOption(input, list.map((a) => ({ id: `p:${a.id}`, label: slotLabel(a.starts_at, c.locale).date, row: a })))
      if (!pick) return say(c, t.pickNumber(list.length))
      return showAppointment(c, pick.row)
    }
    case 'manage': {
      const row = (await upcomingForPhone(c.phone)).find((a) => a.id === s.apptId)
      if (!row) {
        await done(c)
        return say(c, m.NO_UPCOMING, [reply('act:rdv', t.rdv)])
      }
      const action = manageAction(c, input)
      if (action === 'keep') {
        await done(c)
        return say(c, t.kept)
      }
      // Réponse non reconnue ou mauvais code : même code réaffiché (renouvelé après 5 essais : pas de devinette).
      if (!action) return showAppointment(c, row, true)
      await done(c)
      if (action === 'cancel') {
        try {
          await cancelRow(row, 'whatsapp')
        } catch (e) {
          if (e instanceof AgentError && e.code === 'too_late') return say(c, t.tooLate)
          throw e
        }
        return say(c, m.APPT_CANCELLED)
      }
      await setStep(c, { type: row.type_code, lang: row.language, apptId: row.id, offered: [] })
      return offerSlots(c, row.type_code, row.language, undefined, undefined, 'move_slot')
    }
    default:
      await done(c)
      return answer(c)
  }
}

/**
 * Action sur un rendez-vous : « conserver » sans condition ; « déplacer » et « annuler » seulement avec
 * le code à usage unique de ce rendez-vous (dans le bouton, ou tapé « annuler 1234 »).
 */
function manageAction(c: Conversation, input: { text: string; buttonId: string | null }): 'keep' | 'move' | 'cancel' | null {
  const { apptId, code } = c.state
  if (input.buttonId === 'm:keep') return 'keep'
  if (input.buttonId) {
    const [, verb, id, nonce] = input.buttonId.split(':')
    if (id === apptId && nonce && nonce === code && (verb === 'move' || verb === 'cancel')) return verb
    return null
  }
  const t = input.text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (/^(conserver|garder|keep|manter)$/.test(t)) return 'keep'
  const m = /^(deplacer|move|remarcar|annuler|cancel|cancelar)\s+(\d{4})$/.exec(t)
  if (!m || m[2] !== code) return null
  return /^(deplacer|move|remarcar)$/.test(m[1]!) ? 'move' : 'cancel'
}

async function moveTo(c: Conversation, start: string) {
  const m = await messagesFor(c.locale)
  const t = L[c.locale]
  const row = (await upcomingForPhone(c.phone)).find((a) => a.id === c.state.apptId)
  const s = c.state
  await done(c)
  if (!row) return say(c, m.NO_UPCOMING)
  try {
    const b = await rescheduleRow(row, start, undefined, 'whatsapp')
    return say(c, `${withTz(fillMessage(m.APPT_CHANGED, slotLabel(b.start, c.locale)), t.tz)}\n${t.ref} : ${b.ref}`)
  } catch (e) {
    if (e instanceof AgentError && e.code === 'not_found') return
    if (e instanceof AgentError && e.code === 'slot_taken') {
      await setStep(c, { type: row.type_code, lang: row.language, apptId: row.id, offered: s.offered })
      return offerSlots(c, row.type_code, row.language, undefined, t.slotTaken, 'move_slot')
    }
    if (e instanceof AgentError && e.code === 'too_late') return say(c, t.tooLate)
    throw e
  }
}

/** Plafond horaire des e-mails envoyés à l'équipe depuis WhatsApp (représentant, rappel). */
async function teamEmailAllowed(): Promise<boolean> {
  return (await rateLimit('wa-team-email:all', 30, 3_600_000, { failClosed: true })).ok
}

async function startCallback(c: Conversation) {
  await setStep(c, { step: 'cb_name' })
  await say(c, (await messagesFor(c.locale)).ASK_CALLBACK)
}

async function serviceOptions(locale: AgentLocale) {
  return (await readServices(db())).filter((s) => s.active && s.code !== 'sensible')
    .map((s) => ({ id: s.code, label: locale === 'en' ? s.label_en : locale === 'pt' ? s.label_pt : s.label_fr }))
}

async function startHuman(c: Conversation) {
  const services = await serviceOptions(c.locale)
  await setStep(c, { step: 'human_service' })
  await say(c, `${(await messagesFor(c.locale)).ASK_SERVICE}\n\n${numbered(services.map((s) => s.label))}\n\n${L[c.locale].pickNumber(services.length)}`)
}

async function humanCheck(c: Conversation, service: string) {
  const m = await messagesFor(c.locale)
  const t = L[c.locale]
  await saveConversation(c, { state: { welcomed: true, service } })
  const available = await humanAvailable(service, c.locale).catch(() => false)
  void insertEvent({ channel: 'whatsapp', locale: c.locale, kind: available ? 'human_available' : 'human_unavailable', intent: 'HUMAN' })
  if (!available) {
    return say(c, `${m.HUMAN_UNAVAILABLE}\n\n${fillMessage(m.EMAIL_SLA, { email: CONTACT_EMAIL })}`, [reply('act:rdv', t.rdv), reply('act:rappel', t.callback)])
  }
  // L'assistant se met en retrait ; l'équipe est prévenue (2 fois par heure et par numéro au plus) et
  // répond ici, depuis le téléphone ou le back-office.
  await saveConversation(c, { mode: 'human', human_until: new Date(Date.now() + HUMAN_HOURS * 3_600_000).toISOString() })
  const notify = (await rateLimit(tokenKey('wa-human', c.phone), 2, 3_600_000)).ok && (await teamEmailAllowed())
  if (!notify) return say(c, t.limitHuman)
  await say(c, m.HUMAN_HANDOFF)
  await sendEmail({
    to: teamAddress(),
    ...agentTeamEmail({ title: `WhatsApp : demande de représentant (${service})`, lines: [['Contact', c.name ?? '—'], ['Numéro', `+${c.phone}`], ['Langue', c.locale.toUpperCase()], ['Conversation', `${SITE}/admin/agent/whatsapp?id=${c.id}`]] }),
  })
}

async function startManage(c: Conversation) {
  const m = await messagesFor(c.locale)
  const t = L[c.locale]
  const list = await upcomingForPhone(c.phone)
  if (!list.length) {
    await done(c)
    return say(c, m.NO_UPCOMING, [reply('act:rdv', t.rdv)])
  }
  if (list.length === 1) return showAppointment(c, list[0]!)
  await setStep(c, { step: 'manage_pick' })
  return say(c, `${t.which}\n\n${numbered(list.map((a) => { const l = slotLabel(a.starts_at, c.locale); return `${l.date} — ${l.time} · ${a.topic}` }))}\n\n${t.pickNumber(list.length)}`)
}

async function showAppointment(c: Conversation, a: AppointmentRow & { topic?: string }, retry = false) {
  const m = await messagesFor(c.locale)
  const t = L[c.locale]
  // Code à usage unique : seul le détenteur du numéro le voit ; un message forgé ne peut pas le deviner.
  const tries = retry && c.state.apptId === a.id ? (c.state.tries ?? 0) + 1 : 0
  const code = retry && c.state.apptId === a.id && c.state.code && tries < 5 ? c.state.code : String(randomInt(1000, 10_000))
  await setStep(c, { step: 'manage', apptId: a.id, code, tries: tries < 5 ? tries : 0 })
  return say(c, `${fillMessage(m.UPCOMING, slotLabel(a.starts_at, c.locale))}\n${a.topic ?? ''} · ${t.ref} : ${a.ref}\n\n${t.code(code)}`,
    [reply('m:keep', t.keep), reply(`m:move:${a.id}:${code}`, t.move), reply(`m:cancel:${a.id}:${code}`, t.cancel)])
}

// --- Back-office -----------------------------------------------------------------------------------

export async function listConversations(admin: SupabaseClient | null): Promise<Conversation[]> {
  if (!admin) return mem().conversations
  const { data, error } = await admin.from('agent_wa_conversations').select(CONV_COLUMNS).order('updated_at', { ascending: false }).limit(200)
  if (error) throw new Error(`wa_list (${error.code})`)
  return data as Conversation[]
}

export async function conversationMessages(admin: SupabaseClient | null, id: string): Promise<WaMessage[]> {
  if (!admin) return mem().messages.filter((m) => m.conversation_id === id).slice(-200)
  const { data, error } = await admin.from('agent_wa_messages').select(MSG_COLUMNS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(`wa_messages (${error.code})`)
  return ((data ?? []) as WaMessage[]).reverse()
}
