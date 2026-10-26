import 'server-only'
/**
 * Suppression d'un compte (politique docs/SECURITY.md §7, 30 jours), partagée par :
 *  - POST /api/account/delete        (l'utilisateur, après ré-authentification) ;
 *  - DELETE /api/admin/comptes/[id]   (un administrateur, double confirmation + audit).
 *
 * Étapes, dans cet ordre (un échec avant l'étape 3 ne modifie rien) :
 *  1. Stripe configuré : abonnement en cours résilié IMMÉDIATEMENT (sans prorata).
 *  2. Google Agenda : autorisation révoquée (sans bloquer la suppression).
 *  3. public.users : deleted_at + anonymisation immédiate de l'identité.
 *  4. Photo de profil retirée du bucket « avatars ».
 *  5. auth.admin.deleteUser(id, true) : soft delete GoTrue (connexion impossible, sessions révoquées).
 * L'audit est écrit par l'appelant (acteur différent selon le parcours).
 */
import type { TypedSupabaseClient } from '@/lib/supabase/server'
import { BILLING_LIVE } from '@/lib/billing/config'
import { logError } from '@/lib/billing/http'
import { cancelSubscriptionNow } from '@/lib/billing/manage'
import { disconnect as disconnectGoogle } from '@/lib/integrations/google/sync'

export type DeletionResult =
  | { ok: true; hadActiveSubscription: boolean; stripeCanceled: boolean }
  | { ok: false; code: 'billing_unavailable' | 'delete_failed' | 'delete_partial' }

/** `admin` : client service_role (jamais exposé au navigateur). */
export async function softDeleteAccount(admin: TypedSupabaseClient, userId: string): Promise<DeletionResult> {
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .maybeSingle()

  // 1. Un compte supprimé ne doit plus jamais être prélevé. Échec → rien n'a encore été modifié.
  let stripeCanceled = false
  if (BILLING_LIVE) {
    try {
      const res = await cancelSubscriptionNow(userId)
      if (!res.ok) throw new Error(res.code)
      stripeCanceled = res.canceled
    } catch (e) {
      logError('account.delete cancel subscription', e)
      return { ok: false, code: 'billing_unavailable' }
    }
  }

  // 2. Google Agenda (sans bloquer la suppression).
  try {
    await disconnectGoogle(userId)
  } catch (e) {
    logError('account.delete google disconnect', e)
  }

  // 3. Marqueur de suppression + anonymisation de l'identité.
  const { data: profile } = await admin.from('users').select('photo_url').eq('id', userId).maybeSingle()
  const { error: markError } = await admin
    .from('users')
    .update({
      deleted_at: new Date().toISOString(),
      email: `deleted+${userId}@deleted.invalid`,
      prenom: null,
      nom: null,
      photo_url: null,
      date_naissance: null,
      genre: null,
      situation_familiale: null,
      telephone: null,
      adresse: null,
      code_postal: null,
      ville: null,
      pays: null,
    })
    .eq('id', userId)
  if (markError) return { ok: false, code: 'delete_failed' }

  // 4. Photo de profil (donnée d'identification) : retirée immédiatement.
  const avatarPaths = [`${userId}/avatar.jpg`, profile?.photo_url].filter((p): p is string => !!p && p.startsWith(`${userId}/`))
  if (avatarPaths.length) await admin.storage.from('avatars').remove([...new Set(avatarPaths)]).catch(() => undefined)

  // 5. Soft delete GoTrue : plus aucune connexion ni rafraîchissement de jeton possible.
  const { error: authError } = await admin.auth.admin.deleteUser(userId, true)
  if (authError) {
    // Le marqueur est posé : l'application traite déjà le compte comme supprimé
    // (getCurrentUser renvoie null). Reprise par le support.
    console.error('[account.delete] auth soft delete failed', { code: authError.code ?? authError.status })
    return { ok: false, code: 'delete_partial' }
  }

  return { ok: true, hadActiveSubscription: !!sub, stripeCanceled }
}
