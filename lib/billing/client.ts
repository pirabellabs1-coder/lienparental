// Helpers navigateur des écrans abonnement (aucune dépendance serveur).
// Les routes /api/stripe/* renvoient { error: { code, message, correlation_id } } en cas d'échec.

export const BILLING_ERROR_MESSAGES: Record<string, string> = {
  billing_disabled: 'Le paiement en ligne n’est pas encore disponible.',
  unauthenticated: 'Votre session a expiré. Reconnectez-vous puis réessayez.',
  invalid_origin: 'Requête refusée. Rechargez la page puis réessayez.',
  invalid_cycle: 'Formule inconnue. Choisissez Mensuel ou Annuel.',
  invalid_plan: 'Formule inconnue. Choisissez Premium ou Coparentalité+.',
  already_subscribed: 'Vous avez déjà un abonnement en cours. Changez de formule depuis Profil, Abonnement.',
  payment_failed: 'Le paiement de la différence a été refusé. Vérifiez votre moyen de paiement puis réessayez.',
  no_subscription: 'Aucun abonnement en cours.',
  no_customer: 'Aucun moyen de paiement n’est encore enregistré.',
  cancel_pending: 'Annulez d’abord la résiliation pour changer de formule.',
  subscription_not_active: 'Régularisez d’abord votre paiement pour changer de formule.',
  stripe_unavailable: 'Le service de paiement est momentanément indisponible. Réessayez dans un instant.',
  misconfigured: 'Le service de paiement est momentanément indisponible.',
  network: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
}

export function billingErrorMessage(code: string | null | undefined): string {
  return (code && BILLING_ERROR_MESSAGES[code]) || 'Une erreur est survenue. Réessayez dans un instant.'
}

export type PostResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

/** POST JSON same-origin (l'en-tête Origin est ajouté par le navigateur). */
export async function postBilling<T>(url: string, body: Record<string, unknown> = {}): Promise<PostResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as unknown
    if (!res.ok) {
      const code = (json as { error?: { code?: string } } | null)?.error?.code ?? 'unknown'
      return { ok: false, code, message: billingErrorMessage(code) }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, code: 'network', message: billingErrorMessage('network') }
  }
}

/** Ouvre le portail client Stripe (navigation hors formulaire : compatible CSP form-action). */
export async function openBillingPortal(): Promise<PostResult<{ url: string }>> {
  const res = await postBilling<{ url: string }>('/api/stripe/portal')
  if (res.ok) {
    try {
      const u = new URL(res.data.url)
      if (u.protocol === 'https:' && (u.hostname === 'billing.stripe.com' || u.hostname.endsWith('.stripe.com'))) {
        window.location.assign(u.toString())
        return res
      }
    } catch {
      /* URL invalide → erreur ci-dessous */
    }
    return { ok: false, code: 'stripe_unavailable', message: billingErrorMessage('stripe_unavailable') }
  }
  return res
}
