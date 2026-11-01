import 'server-only'
/**
 * Envoi WhatsApp via WaChap (https://dev.wachap.com) : POST /v1/whatsapp/messages/send, texte et
 * jusqu'à 3 boutons (réponse rapide, lien, appel). Clé secrète côté serveur uniquement.
 *
 * Variables : WACHAP_SECRET_KEY (sk_…), WACHAP_ACCOUNT_ID. Absentes : aucun envoi (journal expurgé),
 * l'agent continue de fonctionner sur le site.
 */
import { buttonLabel } from './wa-core'

const BASE = 'https://api.wachap.com/v1'
const TIMEOUT_MS = 8_000

export type WaButton =
  | { id: string; text: string; type: 'reply' }
  | { id: string; text: string; type: 'url'; url: string }
  | { id: string; text: string; type: 'call'; phoneNumber: string }

export const WACHAP_ENABLED = Boolean(process.env.WACHAP_SECRET_KEY?.trim() && process.env.WACHAP_ACCOUNT_ID?.trim())

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string }

export async function sendWhatsApp(to: string, content: string, buttons: WaButton[] = [], footerText?: string): Promise<SendResult> {
  if (!WACHAP_ENABLED) {
    console.info('[wachap] désactivé (WACHAP_SECRET_KEY / WACHAP_ACCOUNT_ID absents) — non envoyé')
    return { ok: false, error: 'disabled' }
  }
  const data: Record<string, unknown> = {
    accountId: process.env.WACHAP_ACCOUNT_ID!.trim(),
    to: `+${to.replace(/[^\d]/g, '')}`,
    type: 'text',
    content: content.slice(0, 3500),
  }
  if (buttons.length) {
    data.buttons = buttons.slice(0, 3).map((b) => ({ ...b, text: buttonLabel(b.text) }))
    if (footerText) data.footerText = footerText.slice(0, 60)
  }
  try {
    const res = await fetch(`${BASE}/whatsapp/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WACHAP_SECRET_KEY!.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    const body = (await res.json().catch(() => null)) as { success?: boolean; messageId?: string; id?: string; data?: { messageId?: string; id?: string }; error?: { code?: string } | string } | null
    if (!res.ok || body?.success === false) {
      const code = typeof body?.error === 'string' ? body.error : body?.error?.code ?? String(res.status)
      // Jamais le numéro ni le contenu dans le journal.
      console.warn('[wachap] envoi refusé (%s)', code.slice(0, 60))
      return { ok: false, error: code.slice(0, 60) }
    }
    const id = body?.messageId ?? body?.data?.messageId ?? body?.data?.id ?? body?.id
    return { ok: true, id: typeof id === 'string' ? id.slice(0, 200) : null }
  } catch (e) {
    console.warn('[wachap] envoi impossible (%s)', e instanceof Error ? e.name : 'erreur')
    return { ok: false, error: 'network' }
  }
}
