'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { syncLocaleFromProfile } from '@/lib/i18n/actions'

/**
 * Espace connecté : sur un appareil sans choix de langue (pas de cookie lp_locale),
 * reprend la langue enregistrée sur le compte puis rafraîchit l'affichage.
 * Ne rend rien ; un seul appel par chargement de l'app (le layout persiste entre les pages).
 */
export function LocaleSync() {
  const router = useRouter()
  useEffect(() => {
    let alive = true
    syncLocaleFromProfile()
      .then((changed) => { if (alive && changed) router.refresh() })
      .catch(() => undefined)
    return () => { alive = false }
  }, [router])
  return null
}
