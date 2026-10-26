'use client'
/**
 * État du verrou du coffre pour les écrans HORS du coffre qui en affichent des données
 * (accueil, recherche, espace Santé, partage familial).
 *
 * Fail closed : tant que l'état n'est pas connu, ou en cas d'erreur, les données du coffre
 * ne sont pas affichées. Le serveur (cookie signé) et la base (0370, vault_unlocked) restent
 * l'autorité : ce hook ne sert qu'à afficher un message juste au lieu d'une liste vide.
 *
 * - `open`    : coffre déverrouillé, verrou désactivé, ou verrou non configuré sur le serveur ;
 * - `locked`  : verrou actif, pas de déverrouillage en cours ;
 * - `unknown` : vérification impossible (réseau, session…) ;
 * - `loading` : première vérification en cours.
 *
 * Suit les verrouillages / déverrouillages des autres onglets (canal de VaultGate).
 */
import { useCallback, useEffect, useState } from 'react'
import { VaultApiError, vaultApi } from './api'

export type VaultLockState = 'loading' | 'open' | 'locked' | 'unknown'

const CHANNEL = 'lp-vault-lock'

export function useVaultLockState(opts: { enabled?: boolean } = {}): { state: VaultLockState; refresh: () => void } {
  const enabled = opts.enabled ?? true
  const [state, setState] = useState<VaultLockState>('loading')

  const refresh = useCallback(() => {
    vaultApi.status()
      .then((s) => setState(s.unlocked ? 'open' : 'locked'))
      .catch((e: unknown) => {
        // Verrou non configuré : le coffre est ouvert sans verrou (même règle que la garde serveur).
        if (e instanceof VaultApiError && e.code === 'not_configured') setState('open')
        else setState(e instanceof VaultApiError && e.status !== 0 && e.code !== 'rate_limited' ? 'locked' : 'unknown')
      })
  }, [])

  useEffect(() => {
    if (!enabled) return
    setState('loading')
    refresh()
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(CHANNEL)
    bc.onmessage = (ev: MessageEvent<{ type?: string }>) => {
      if (ev.data?.type === 'locked') setState('locked')
      if (ev.data?.type === 'unlocked') refresh()
    }
    return () => bc.close()
  }, [enabled, refresh])

  return { state, refresh }
}
