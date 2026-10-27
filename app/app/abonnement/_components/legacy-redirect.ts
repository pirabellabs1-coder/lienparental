import { redirect } from 'next/navigation'

type SP = Record<string, string | string[] | undefined>

/** Paramètres conservés lors de la redirection d'une ancienne URL vers « Mon abonnement ». */
const KEPT = ['formule', 'cycle', 'raison', 'session_id', 'erreur'] as const

/**
 * Anciennes URLs (/app/premium, /app/premium/formule, /app/premium/paiement,
 * /app/profil/abonnement, …/changer, …/historique) : redirigées vers l'écran unique.
 * Seuls des paramètres connus et bornés sont recopiés.
 */
export function legacyRedirect(target: string, sp: SP, extra: Record<string, string> = {}): never {
  const qs = new URLSearchParams()
  for (const k of KEPT) {
    const v = Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]
    if (typeof v === 'string' && /^[A-Za-z0-9_]{1,220}$/.test(v)) qs.set(k, v)
  }
  // Ancien retour de Checkout annulé (?annule=1).
  if (sp.annule === '1') qs.set('info', 'checkout_canceled')
  for (const [k, v] of Object.entries(extra)) qs.set(k, v)
  const q = qs.toString()
  redirect(q ? `${target}?${q}` : target)
}
