/**
 * Agent d'accueil, canal WhatsApp (Twilio, API officielle Meta) — règles pures, testées par
 * tests/agent-whatsapp.test.ts.
 *
 *  - lecture du webhook Twilio (formulaire : From « whatsapp:+… », Body, MessageSid, ProfileName,
 *    ButtonPayload) ; les rappels de statut (MessageStatus, sans texte) sont ignorés ;
 *  - lecture tolérante d'autres formes JSON courantes (extractInbound), gardée pour un éventuel
 *    changement de fournisseur ;
 *  - numéro au format international (chiffres seuls), langue du premier message, choix de l'utilisateur
 *    (bouton, numéro « 2 », ou libellé tapé) ;
 *  - texte du site converti pour WhatsApp (liens absolus, pas de Markdown).
 */
import type { AgentLocale } from './core'

export type Inbound = {
  /** Identifiant du message chez le fournisseur (déduplication des webhooks rejoués). */
  id: string | null
  /** Numéro de l'interlocuteur, chiffres seuls. */
  phone: string
  /** Nom de profil WhatsApp, si fourni. */
  name: string | null
  /** Texte tapé, ou libellé du bouton. */
  text: string
  /** Identifiant du bouton de réponse rapide, si c'est un clic. */
  buttonId: string | null
  /** Message envoyé depuis le téléphone de l'association (un représentant répond lui-même). */
  fromMe: boolean
}

const str = (v: unknown, max = 4000): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** « 594694123456@s.whatsapp.net », « +594 694… » → « 594694123456 » ; groupes, diffusions → null. */
export function normalizePhone(raw: unknown): string | null {
  const s = str(raw, 120)
  if (!s || /@(g\.us|broadcast|newsletter|lid)\b/.test(s) || s.startsWith('status@')) return null
  const digits = s.split('@')[0]!.split(':')[0]!.replace(/[^\d]/g, '')
  return /^\d{6,15}$/.test(digits) ? digits : null
}

/** Texte d'un message Baileys (`message`), y compris réponses à boutons et listes. */
function baileysText(m: Record<string, unknown>): { text: string | null; buttonId: string | null } {
  const ext = obj(m.extendedTextMessage)
  const btn = obj(m.buttonsResponseMessage)
  const tpl = obj(m.templateButtonReplyMessage)
  const list = obj(m.listResponseMessage)
  const interactive = obj(obj(m.interactiveResponseMessage)?.nativeFlowResponseMessage)
  let nativeId: string | null = null
  if (interactive && typeof interactive.paramsJson === 'string') {
    try {
      nativeId = str((JSON.parse(interactive.paramsJson) as Record<string, unknown>).id, 120)
    } catch {
      nativeId = null
    }
  }
  const buttonId = str(btn?.selectedButtonId, 120) ?? str(tpl?.selectedId, 120) ?? str(obj(list?.singleSelectReply)?.selectedRowId, 120) ?? nativeId
  const text = str(m.conversation) ?? str(ext?.text) ?? str(btn?.selectedDisplayText) ?? str(tpl?.selectedDisplayText) ?? str(list?.title)
    ?? str(obj(m.imageMessage)?.caption) ?? str(obj(m.videoMessage)?.caption) ?? str(obj(m.documentMessage)?.caption)
  return { text, buttonId }
}

function fromBaileys(entry: Record<string, unknown>): Inbound | null {
  const key = obj(entry.key)
  const message = obj(entry.message)
  if (!key || !message) return null
  const phone = normalizePhone(key.remoteJid)
  if (!phone) return null
  const { text, buttonId } = baileysText(message)
  if (!text && !buttonId) return null
  return { id: str(key.id, 200), phone, name: str(entry.pushName, 120), text: text ?? buttonId ?? '', buttonId, fromMe: key.fromMe === true }
}

function fromFlat(m: Record<string, unknown>): Inbound | null {
  const fromMe = m.fromMe === true || m.from_me === true || m.isFromMe === true
  const phone = normalizePhone(fromMe ? m.to ?? m.chatId ?? m.remoteJid : m.from ?? m.sender ?? m.phone ?? m.number ?? m.chatId ?? m.remoteJid)
  if (!phone) return null
  const body = obj(m.text) ? str(obj(m.text)!.body) : null
  const buttonId = str(m.buttonId ?? m.button_id ?? m.selectedButtonId ?? obj(m.button)?.id ?? obj(m.reply)?.id, 120)
  const text = str(m.body) ?? body ?? str(m.text) ?? str(m.message) ?? str(m.content) ?? str(m.caption) ?? str(obj(m.button)?.text)
  if (!text && !buttonId) return null
  return { id: str(m.id ?? m.messageId ?? m.message_id ?? m.wa_id, 200), phone, name: str(m.pushName ?? m.notifyName ?? m.senderName ?? m.name, 120), text: text ?? buttonId ?? '', buttonId, fromMe }
}

/** Message reçu dans un webhook Twilio (paramètres du formulaire POST), ou null (statut, média seul…). */
export function fromTwilioForm(p: Record<string, string>): Inbound | null {
  if (!p.MessageSid && !p.SmsMessageSid) return null
  const from = (p.From ?? '').replace(/^whatsapp:/, '')
  const phone = normalizePhone(from)
  if (!phone) return null
  const buttonId = str(p.ButtonPayload, 120)
  const text = str(p.Body) ?? str(p.ButtonText)
  if (!text && !buttonId) return null
  return { id: str(p.MessageSid ?? p.SmsMessageSid, 200), phone, name: str(p.ProfileName, 120), text: text ?? buttonId ?? '', buttonId, fromMe: false }
}

/** Messages reçus dans un appel du webhook (0, 1 ou plusieurs). */
export function extractInbound(payload: unknown): Inbound[] {
  const out: Inbound[] = []
  const seen = new Set<unknown>()
  const visit = (node: unknown, depth: number) => {
    if (depth > 5 || !node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      node.slice(0, 50).forEach((n) => visit(n, depth + 1))
      return
    }
    const o = node as Record<string, unknown>
    const b = fromBaileys(o)
    if (b) return void out.push(b)
    // Objet plat : seulement s'il porte un expéditeur ET un contenu (pas une enveloppe).
    if ((o.from || o.sender || o.remoteJid || o.chatId) && (o.body || o.text || o.message || o.content || o.buttonId || o.button)) {
      const f = fromFlat(o)
      if (f) return void out.push(f)
    }
    for (const k of ['data', 'messages', 'message', 'payload', 'body']) if (k in o) visit(o[k], depth + 1)
  }
  visit(payload, 0)
  // Un même message ne compte qu'une fois (enveloppes redondantes).
  const ids = new Set<string>()
  return out.filter((m) => (m.id ? !ids.has(m.id) && ids.add(m.id) : true))
}

/** Liste des clés d'un objet (sans valeurs) : journal de diagnostic d'un format inconnu, sans contenu. */
export function shapeOf(v: unknown, depth = 0): unknown {
  if (depth > 3) return '…'
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0], depth + 1)] : []
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).slice(0, 30).map((k) => [k, shapeOf((v as Record<string, unknown>)[k], depth + 1)]))
  return typeof v
}

const PT = /\b(olá|ola|bom dia|boa tarde|boa noite|obrigad[oa]|você|voce|quero|preciso|não|reunião|agendar)\b/i
const EN = /\b(hello|hi|hey|good (morning|afternoon|evening)|thanks|thank you|please|i need|i want|appointment|how much|can you)\b/i

/** Langue du premier message (français par défaut, cahier V2 §3.2). */
export function detectLocale(text: string): AgentLocale {
  if (PT.test(text)) return 'pt'
  if (EN.test(text)) return 'en'
  return 'fr'
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim()

/** Choix parmi des options : identifiant de bouton, numéro (« 2 », « 2. »), ou libellé tapé. */
export function pickOption<T extends { id: string; label: string }>(input: { text: string; buttonId: string | null }, options: T[]): T | null {
  if (input.buttonId) {
    const b = options.find((o) => o.id === input.buttonId)
    if (b) return b
  }
  const t = fold(input.text)
  const n = /^(\d{1,2})\b/.exec(t)
  if (n) return options[Number(n[1]) - 1] ?? null
  return options.find((o) => fold(o.label) === t) ?? options.find((o) => t.length >= 3 && fold(o.label).startsWith(t)) ?? null
}

const YES = /^(oui|o|yes|y|sim|s|ok|d accord|daccord|volontiers|claro)$/
const NO = /^(non|n|no|nao|pas besoin|merci non)$/
export function yesNo(input: { text: string; buttonId: string | null }): boolean | null {
  if (input.buttonId === 'yes') return true
  if (input.buttonId === 'no') return false
  const t = fold(input.text)
  return YES.test(t) ? true : NO.test(t) ? false : null
}

export type Command = 'menu' | 'rdv' | 'rappel' | 'humain' | 'mes-rdv' | 'stop-human' | 'cancel' | null
const COMMANDS: [Command, RegExp][] = [
  ['menu', /^(menu|aide|help|ajuda|accueil|start|commencer|bonjour|bonsoir|salut|hello|hi|ola|oi)$/],
  ['cancel', /^(annuler|stop|retour|cancel|back|cancelar|voltar|sortir|quitter)$/],
  ['mes-rdv', /\b(mon|mes|my|meu|minha) (rendez vous|rdv|appointment|reuniao)s?\b|\b(annuler|deplacer|modifier|cancel|reschedule|move|remarcar) (mon |le |my |a )?(rendez vous|rdv|appointment|reuniao)\b/],
  ['rdv', /\b(prendre|reserver|book|marcar|agendar) (un |an |uma )?(rendez vous|rdv|appointment|reuniao)\b|^(rendez vous|rdv|appointment|reuniao)$/],
  ['rappel', /\b(rappel(er|ez|e)?|etre rappele|me rappeler|call ?back|call me back|ligue?m me|retorno)\b/],
  ['humain', /\b(humain|conseill(er|ere)|representant|representative|representante|human|agent humain|person|pessoa|atendente|parler a quelqu un)\b/],
  ['stop-human', /^(assistant|robot|bot|assistente)$/],
]

/** Commande reconnue dans le texte tapé (hors parcours), sinon null : question libre pour l'IA. */
export function detectCommand(text: string): Command {
  const t = fold(text)
  return COMMANDS.find(([, re]) => re.test(t))?.[0] ?? null
}

/** Texte du site → WhatsApp : liens internes en adresse complète, gras « *x* », pas d'autres balises. */
export function toWhatsAppText(text: string, site: string): string {
  return text
    .replace(/\[([^\]]{1,80})\]\((\/[^)\s]{0,120})\)/g, (_m, label: string, path: string) => `${label} : ${site}${path}`)
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^#+\s*/gm, '')
    .trim()
    .slice(0, 3500)
}

/** Libellé de bouton ≤ 20 caractères (contrainte WhatsApp). */
export function buttonLabel(s: string): string {
  return s.length <= 20 ? s : `${s.slice(0, 19).trimEnd()}…`
}
