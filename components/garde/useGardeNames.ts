'use client'

/**
 * Prénoms affichés par le planning de garde.
 * - Démonstration : prénoms fictifs des comptes de démo (inchangé).
 * - Compte réel : enfants du compte (lib/data/children, RLS) et parent lié
 *   (lib/coparents, route /api/coparents/contacts). S'il n'y a pas exactement un
 *   autre parent, ou si une source est indisponible : formulation neutre
 *   (« l'autre parent », « les enfants »). Jamais de prénom inventé.
 */
import { useEffect, useState } from 'react'
import { LIVE } from '@/lib/data/core'
import { listChildren } from '@/lib/data/children'
import { listLinkedParents } from '@/lib/coparents/client'
import { DEMO_GARDE_NAMES, NEUTRAL_GARDE_NAMES, childrenLabel, type GardeNames } from '@/lib/garde'

async function loadNames(): Promise<GardeNames> {
  const [children, parents] = await Promise.allSettled([listChildren(), listLinkedParents()])
  const kids = children.status === 'fulfilled' ? childrenLabel(children.value.map((c) => c.prenom)) : childrenLabel([])
  const others = parents.status === 'fulfilled' ? parents.value.filter((p) => p.prenom.trim()) : []
  const coParent = others.length === 1 ? others[0].prenom.trim() : null
  return {
    ...kids,
    coParent: coParent ?? NEUTRAL_GARDE_NAMES.coParent,
    coParentKnown: coParent !== null,
  }
}

export function useGardeNames(): GardeNames {
  const [names, setNames] = useState<GardeNames>(LIVE ? NEUTRAL_GARDE_NAMES : DEMO_GARDE_NAMES)
  useEffect(() => {
    if (!LIVE) return
    let alive = true
    loadNames().then((n) => { if (alive) setNames(n) }, () => { /* formulation neutre conservée */ })
    return () => { alive = false }
  }, [])
  return names
}
