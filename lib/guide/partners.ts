'use client'

/**
 * Offres partenaires du Guide (bloc « Offres disponibles en … »).
 * - Supabase : table publique `guide_partners` (lecture seule côté client, écriture admin, migration 0250).
 * - Démonstration : exemples fictifs de `content/guide/<territoire>/partenaires.demo.json`, transmis par le serveur.
 * Toute ligne reçue est revalidée : une offre mal formée n'est jamais affichée.
 */
import { useEffect, useState } from 'react'
import { LIVE, db, toDataError } from '@/lib/data/core'
import { partenaireSchema, type GuideCategoryKey, type Partenaire } from './types'

type Row = { id: string; territoire: string; categorie: string; nom: string; type: string; description: string; criteres: unknown; lien: string | null }

export function usePartners(territoire: string, categorie: GuideCategoryKey, demo: Partenaire[]) {
  const [items, setItems] = useState<Partenaire[]>(LIVE ? [] : demo.filter((p) => p.categorie === categorie))

  useEffect(() => {
    if (!LIVE) return
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await db()
          .from('guide_partners')
          .select('id, territoire, categorie, nom, type, description, criteres, lien')
          .eq('territoire', territoire)
          .eq('categorie', categorie)
          .eq('actif', true)
          .order('nom')
          .limit(6)
        if (error) throw error
        const valid = ((data ?? []) as Row[])
          .map((r) => partenaireSchema.safeParse({ ...r, demo: false }))
          .flatMap((r) => (r.success ? [r.data] : []))
        if (alive) setItems(valid)
      } catch (e) {
        toDataError(e, 'guide_partners.select')
      }
    })()
    return () => { alive = false }
  }, [territoire, categorie])

  return items
}
