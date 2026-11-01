'use client'

/**
 * Prénoms affichés par le planning de garde.
 * - Démonstration : prénoms fictifs des comptes de démo (inchangé).
 * - Compte réel : enfants du compte (lib/data/children, RLS) et parent lié
 *   (lib/coparents, route /api/coparents/contacts). S'il n'y a pas exactement un
 *   autre parent, ou si une source est indisponible : formulation neutre
 *   (« l'autre parent », « les enfants »). Jamais de prénom inventé.
 * Les formulations neutres et l'énumération des prénoms suivent la langue active.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LIVE } from '@/lib/data/core'
import { listChildren } from '@/lib/data/children'
import { listLinkedParents } from '@/lib/coparents/client'
import { intlLocale } from '@/lib/i18n/config'
import { DEMO_GARDE_NAMES, childrenLabel, type GardeNames } from '@/lib/garde'

/** Données brutes : prénoms des enfants et prénom de l'autre parent (null = inconnu). */
type RawNames = { prenoms: string[]; coParent: string | null }

const NEUTRAL_RAW: RawNames = { prenoms: [], coParent: null }
/** Démonstration : mêmes prénoms que DEMO_GARDE_NAMES (« Lina et Noah », « Thomas »). */
const DEMO_RAW: RawNames = { prenoms: ['Lina', 'Noah'], coParent: DEMO_GARDE_NAMES.coParent }

async function loadNames(): Promise<RawNames> {
  const [children, parents] = await Promise.allSettled([listChildren(), listLinkedParents()])
  const prenoms = children.status === 'fulfilled' ? children.value.map((c) => c.prenom) : []
  const others = parents.status === 'fulfilled' ? parents.value.filter((p) => p.prenom.trim()) : []
  return { prenoms, coParent: others.length === 1 ? others[0].prenom.trim() : null }
}

export function useGardeNames(): GardeNames {
  const locale = useLocale()
  const t = useTranslations('calendar.custody')
  const [raw, setRaw] = useState<RawNames>(LIVE ? NEUTRAL_RAW : DEMO_RAW)
  useEffect(() => {
    if (!LIVE) return
    let alive = true
    loadNames().then((n) => { if (alive) setRaw(n) }, () => { /* formulation neutre conservée */ })
    return () => { alive = false }
  }, [])

  return useMemo(() => {
    // Même règle que lib/garde → childrenLabel : 1 à 3 prénoms, sinon « les enfants ».
    // Prénoms identiques (enfant saisi deux fois) : un seul affiché, jamais « Lina, Noah et Lina ».
    const list = [...new Set(raw.prenoms.map((p) => p.trim()).filter(Boolean))]
    let kids: Pick<GardeNames, 'children' | 'childrenPlural'>
    if (list.length === 0 || list.length > 3) kids = { children: t('neutralChildren'), childrenPlural: true }
    else if (list.length === 1) kids = { children: list[0], childrenPlural: false }
    else if (locale === 'fr') kids = childrenLabel(list)
    else kids = { children: new Intl.ListFormat(intlLocale(locale), { style: 'long', type: 'conjunction' }).format(list), childrenPlural: true }
    return {
      ...kids,
      coParent: raw.coParent ?? t('neutralCoParent'),
      coParentKnown: raw.coParent !== null,
    }
  }, [raw, locale, t])
}
