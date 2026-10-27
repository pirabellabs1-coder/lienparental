/**
 * PUT /api/vault-lock/pin : définit, change ou réinitialise le code à 6 chiffres.
 *   { pin, currentPin? , password? }
 * Preuve exigée (une au choix) :
 *   - le code actuel ;
 *   - compte avec mot de passe : le mot de passe (= réinitialisation, remet à zéro le
 *     blocage), ou, pour un premier code, coffre déverrouillé sur cet appareil ;
 *   - compte SANS mot de passe (Google), m5 audit v3 : soit une ré-authentification de
 *     moins de 5 minutes (amr de la session ET last_sign_in_at), soit une empreinte
 *     (passkey) vérifiée sur ce compte il y a moins de 5 minutes. Plus aucun « premier
 *     code » accepté sur la seule foi de la session ou d'un déverrouillage ancien.
 *   Voir docs/SECURITY_FIXES.md (§ v3, m5).
 * Effet : empreinte scrypt enregistrée, autres appareils reverrouillés (époque), cet appareil déverrouillé.
 *
 * DELETE /api/vault-lock/pin : supprime le code (coffre déverrouillé requis ; refusé si
 * c'est la dernière méthode de déverrouillage).
 */
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { isWeakPin } from '@/lib/vault-lock/config'
import { hashPin } from '@/lib/vault-lock/crypto'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { factorFailure } from '@/lib/vault-lock/responses'
import { RECENT_LOGIN_MS } from '@/lib/vault-lock/context'
import { buildStatus, issueUnlock, readUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'
import { checkPassword, checkPin } from '@/lib/vault-lock/verify'
import { flushForActor } from '@/lib/notify/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const digits = z.string().regex(/^\d{6}$/, 'Le code comporte 6 chiffres.')
const schema = z.object({
  pin: digits,
  currentPin: digits.optional(),
  password: z.string().min(1).max(256).optional(),
}).strict()

export async function PUT(req: Request) {
  const g = await guardMutation(req, 'pin', 10)
  if (!g.ok) return g.res
  const body = await readJson(req, schema)
  if (!body.ok) return body.res
  const p = g.principal
  const store = vaultStore(p.mode)
  const { pin, currentPin, password } = body.data

  // Les codes trop simples sont refusés (sauf le code de démonstration documenté).
  if (isWeakPin(pin) && p.mode !== 'demo') {
    return jsonError(422, 'weak_pin', 'Ce code est trop simple. Évitez les chiffres identiques ou qui se suivent.')
  }

  try {
    const settings = await store.getSettings(p.userId)
    let proven = false
    if (password) {
      const r = await checkPassword(p, password)
      if (!r.ok) return factorFailure(r, 'password')
      proven = true
    } else if (currentPin) {
      const r = await checkPin(p, settings, currentPin)
      if (!r.ok) return factorFailure(r, 'pin')
      proven = true
    } else if (p.hasPassword) {
      if (!settings.pinHash && (!settings.enabled || (await readUnlock(p, settings)))) proven = true
    } else if (p.recentLogin) {
      proven = true
    } else {
      // Empreinte vérifiée récemment (last_used_at posé par la vérification WebAuthn serveur).
      const now = Date.now()
      proven = (await store.listPasskeys(p.userId)).some((k) => {
        const used = k.lastUsedAt ? Date.parse(k.lastUsedAt) : 0
        return used > 0 && now - used < RECENT_LOGIN_MS && used <= now + 60_000
      })
    }
    if (!proven) {
      if (!p.hasPassword) {
        return jsonError(403, 'reauth_required', settings.pinHash
          ? 'Saisissez votre code actuel, ou confirmez votre identité avec votre empreinte ou en vous reconnectant avec Google (moins de 5 minutes).'
          : 'Pour choisir un code, confirmez votre identité : empreinte, ou reconnexion avec Google (moins de 5 minutes).')
      }
      return jsonError(403, 'proof_required', settings.pinHash
        ? 'Saisissez votre code actuel ou le mot de passe de votre compte.'
        : 'Confirmez avec le mot de passe de votre compte.')
    }

    const next = await store.updateSettings(p.userId, { pinHash: await hashPin(pin), bumpEpoch: true })
    await store.clearAttempts(p.userId, 'pin')
    if (next.enabled) await issueUnlock(p, next)
    // Code remplacé : alerte de sécurité (déclencheur 0440) livrée tout de suite.
    if (p.mode !== 'demo' && settings.pinHash) await flushForActor(p.userId).catch(() => null)
    return jsonOk({ status: await buildStatus(p) })
  } catch {
    return serverError()
  }
}

export async function DELETE(req: Request) {
  const g = await guardMutation(req, 'pin', 10)
  if (!g.ok) return g.res
  const p = g.principal
  const store = vaultStore(p.mode)
  try {
    const settings = await store.getSettings(p.userId)
    if (settings.enabled && !(await readUnlock(p, settings))) {
      return jsonError(403, 'vault_locked', 'Déverrouillez le coffre-fort pour modifier ces réglages.')
    }
    const passkeys = await store.listPasskeys(p.userId)
    if (settings.enabled && !p.hasPassword && passkeys.length === 0) {
      return jsonError(409, 'last_method', 'Ce code est votre seule méthode de déverrouillage : enregistrez d’abord votre empreinte.')
    }
    const next = await store.updateSettings(p.userId, { pinHash: null, bumpEpoch: true })
    if (next.enabled) await issueUnlock(p, next)
    if (p.mode !== 'demo' && settings.pinHash) await flushForActor(p.userId).catch(() => null)
    return jsonOk({ status: await buildStatus(p) })
  } catch {
    return serverError()
  }
}
