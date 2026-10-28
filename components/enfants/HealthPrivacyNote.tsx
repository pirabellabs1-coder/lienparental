'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { loadFamilyOverview } from '@/lib/coparents/client'

/**
 * Qui voit la santé de cet enfant, selon le partage RÉEL (liaison des parents, 0340) :
 * le titulaire de la fiche et les adultes au rôle « parent » ; jamais les « proches ».
 * Tant que la liste n'est pas connue (chargement, erreur), on affiche la règle générale.
 */
export function HealthPrivacyNote({ childId }: { childId: string }) {
  const t = useTranslations('family.children.healthPrivacy')
  const [others, setOthers] = useState<string[] | null>(null)

  useEffect(() => {
    let alive = true
    loadFamilyOverview()
      .then((o) => {
        if (!alive) return
        const child = o.children.find((c) => c.id === childId)
        // Enfant absent de la vue famille : partage inconnu, on garde la règle générale
        // (afficher « vous seul(e) » serait une affirmation non vérifiée).
        if (!child) return setOthers(null)
        setOthers(child.members.filter((m) => !m.isMe && (m.role === 'owner' || m.role === 'parent')).map((m) => m.prenom).filter(Boolean))
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [childId])

  if (others === null) return <>{t('generic')}</>
  if (others.length === 0) return <>{t('onlyYou')}</>
  return <>{t('shared', { names: others.join(', '), count: others.length })}</>
}
