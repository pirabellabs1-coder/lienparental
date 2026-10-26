'use client'

/**
 * Données de l'accueil (M03).
 * - Compte réel (Supabase) : événements à venir (lib/data/calendar), derniers documents du
 *   coffre (lib/data/vault, chargés UNIQUEMENT coffre ouvert), RLS côté base.
 * - Démonstration : jeux fictifs historiques de lib/mock-data (affichage inchangé).
 */
import { useEffect, useMemo, useState } from 'react'
import { LIVE, toDataError, type DataError } from '@/lib/data/core'
import { useEvents } from '@/lib/data/calendar'
import { listDocuments, type VaultDocumentRecord } from '@/lib/data/vault'
import { frDate } from '@/lib/mock-vault'
import { timeInTz } from '@/lib/tz'
import { mockEvents, mockRecentlyViewed, type AppEvent, type RecentlyViewedDoc } from '@/lib/mock-data'
import type { CalendarEvent } from '@/lib/calendrier'

type Loadable<T> = { data: T; loading: boolean; error: DataError | null; retry: () => void }

const HOME_TYPE: Partial<Record<CalendarEvent['type'], AppEvent['type']>> = {
  sante: 'medical',
  rdv: 'rdv',
  ecole: 'ecole',
  appel: 'appel',
  visite: 'garde',
}

function toAppEvent(e: CalendarEvent): AppEvent {
  return {
    id: e.id,
    title: e.title,
    date: e.start,
    location: e.location,
    type: HOME_TYPE[e.type] ?? 'autre',
    timeLabel: timeInTz(e.start).replace(':', 'h'),
  }
}

/** Trois prochains événements (à partir de maintenant). */
export function useUpcomingEvents(): Loadable<AppEvent[]> {
  const live = useEvents()
  const data = useMemo(() => {
    if (!LIVE) return mockEvents
    const now = Date.now()
    return (live.data ?? [])
      .filter((e) => new Date(e.end).getTime() >= now)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 3)
      .map(toAppEvent)
  }, [live.data])
  return { data, loading: LIVE && live.loading, error: LIVE ? live.error : null, retry: () => void live.refresh() }
}

function toRecent(d: VaultDocumentRecord): RecentlyViewedDoc {
  return {
    id: d.id,
    title: d.name,
    viewedLabel: `Ajouté le ${frDate(d.addedAt, 'short')}`,
    icon: 'file',
    accent: d.type === 'pdf' ? 'iris' : d.type === 'image' ? 'leaf' : 'night',
    href: `/app/coffre/documents/${d.id}`,
  }
}

/**
 * Trois derniers documents ajoutés au coffre. `vaultOpen` : aucune requête tant que le
 * coffre n'est pas déverrouillé (même règle que useVaultLockState, fail closed).
 */
export function useRecentVaultDocs(vaultOpen: boolean): Loadable<RecentlyViewedDoc[]> {
  const [data, setData] = useState<RecentlyViewedDoc[]>(LIVE ? [] : mockRecentlyViewed)
  const [loading, setLoading] = useState(LIVE)
  const [error, setError] = useState<DataError | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!LIVE || !vaultOpen) return
    let alive = true
    setLoading(true)
    setError(null)
    listDocuments()
      .then((docs) => { if (alive) setData(docs.slice(0, 3).map(toRecent)) })
      .catch((e: unknown) => { if (alive) setError(toDataError(e, 'home.recentDocs')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vaultOpen, attempt])

  return { data, loading, error, retry: () => setAttempt((n) => n + 1) }
}
