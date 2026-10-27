'use client'

/**
 * Offres partenaires du Guide (bloc « Offres disponibles en … »).
 * - Supabase : table publique `guide_partners` (lecture seule côté client, écriture admin, migration 0250).
 * - Démonstration : exemples fictifs de `content/guide/<territoire>/partenaires.demo.json`, transmis par le serveur.
 * Toute ligne reçue est revalidée : une offre mal formée n'est jamais affichée.
 * Langue (interface EN/PT) : traduction de la colonne `translations` (0490) superposée au français,
 * invariants (catégorie, type, lien…) forcés depuis le français ; invalide ou absente → français.
 */
import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { LIVE, db, toDataError } from '@/lib/data/core'
import { isTranslationLocale } from '@/lib/contenus/locale'
import { isPlainObject, overlayTranslation } from '@/lib/contenus/i18n-overlay'
import { partenaireSchema, type GuideCategoryKey, type Partenaire } from './types'

type Row = { id: string; territoire: string; categorie: string; nom: string; type: string; description: string; criteres: unknown; lien: string | null; translations?: unknown }

/** Offre dans la langue demandée (sinon française). */
function localize(fr: Partenaire, translations: unknown, locale: string): Partenaire {
  if (!isTranslationLocale(locale) || !isPlainObject(translations) || !isPlainObject(translations[locale])) return fr
  const o = overlayTranslation(fr, translations[locale])
  if (o.mismatch) return fr
  const r = partenaireSchema.safeParse(o.value)
  return r.success ? r.data : fr
}

export function usePartners(territoire: string, categorie: GuideCategoryKey, demo: Partenaire[]) {
  const locale = useLocale()
  const [items, setItems] = useState<Partenaire[]>(LIVE ? [] : demo.filter((p) => p.categorie === categorie))

  useEffect(() => {
    if (!LIVE) return
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await db()
          .from('guide_partners')
          .select('id, territoire, categorie, nom, type, description, criteres, lien, translations')
          .eq('territoire', territoire)
          .eq('categorie', categorie)
          .eq('actif', true)
          .order('nom')
          .limit(6)
        if (error) throw error
        const valid = ((data ?? []) as Row[])
          .map((r) => ({ row: r, parsed: partenaireSchema.safeParse({ ...r, translations: undefined, demo: false }) }))
          .flatMap(({ row, parsed }) => (parsed.success ? [localize(parsed.data, row.translations, locale)] : []))
        if (alive) setItems(valid)
      } catch (e) {
        toDataError(e, 'guide_partners.select')
      }
    })()
    return () => { alive = false }
  }, [territoire, categorie, locale])

  return items
}
