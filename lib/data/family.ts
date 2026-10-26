'use client'

/**
 * Famille (0340, docs/FAMILLE.md) : petites aides partagées par le calendrier et le coffre.
 * - `familyAuthorNames()` : prénoms des adultes liés (RPC list_family_contacts, SECURITY DEFINER
 *   + MFA), pour le badge « Partagé par {prénom} ». Mémoïsé 60 s ; base sans 0340 → carte vide.
 * - `useSharedChildIds()` : enfants ayant au moins un autre adulte lié (choix par défaut de
 *   l'interrupteur « Partager avec la famille »).
 * Aucune donnée n'est écrite ici ; la RLS reste le garde-fou.
 */
import { useEffect, useState } from 'react'
import { LIVE, db } from './core'

const TTL = 60_000
let namesCache: { at: number; value: Promise<Map<string, string>> } | null = null

export function familyAuthorNames(): Promise<Map<string, string>> {
  if (!LIVE) return Promise.resolve(new Map())
  if (namesCache && Date.now() - namesCache.at < TTL) return namesCache.value
  const value = (async () => {
    const { data, error } = await db().rpc('list_family_contacts')
    if (error) {
      // 0340 absente, MFA non satisfaite… : le badge affiche « un parent lié ».
      console.warn(`[data] family.contacts indisponible (code ${error.code ?? 'unknown'})`)
      return new Map<string, string>()
    }
    return new Map(((data ?? []) as { user_id: string; prenom: string | null }[]).map((r) => [r.user_id, (r.prenom ?? '').trim()]))
  })()
  namesCache = { at: Date.now(), value }
  return value
}

/** Libellé de l'auteur : prénom s'il est connu, sinon formulation neutre. */
export function sharedByLabel(prenom: string | undefined): string {
  return prenom && prenom.length > 0 ? prenom : 'un parent lié'
}

async function loadSharedChildIds(): Promise<string[]> {
  if (!LIVE) {
    const { loadFamilyOverview } = await import('@/lib/coparents/client')
    const o = await loadFamilyOverview()
    return o.children.filter((c) => c.members.length > 1).map((c) => c.id)
  }
  // RLS child_guardians_select : mes liens + ceux des enfants de ma famille.
  const { data, error } = await db().from('child_guardians').select('child_id').eq('status', 'active').limit(500)
  if (error) {
    console.warn(`[data] family.sharedChildren indisponible (code ${error.code ?? 'unknown'})`)
    return []
  }
  return [...new Set(((data ?? []) as { child_id: string }[]).map((r) => r.child_id))]
}

/** `null` pendant le chargement. */
export function useSharedChildIds(): string[] | null {
  const [ids, setIds] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    loadSharedChildIds().then((v) => { if (alive) setIds(v) }, () => { if (alive) setIds([]) })
    return () => { alive = false }
  }, [])
  return ids
}
