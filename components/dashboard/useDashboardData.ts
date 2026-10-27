'use client'

/**
 * Données de l'accueil (M03).
 * - Compte réel (Supabase) : événements à venir (lib/data/calendar), derniers documents du
 *   coffre (lib/data/vault, chargés UNIQUEMENT coffre ouvert), RLS côté base.
 * - Démonstration : événements du calendrier de démo (mêmes identifiants que /app/calendrier),
 *   documents récents fictifs de lib/mock-data.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LIVE, toDataError, type DataError } from '@/lib/data/core'
import { useEvents } from '@/lib/data/calendar'
import { listDocuments, type VaultDocumentRecord } from '@/lib/data/vault'
import { frDate } from '@/lib/mock-vault'
import { timeInTz } from '@/lib/tz'
import { mockRecentlyViewed, type AppEvent, type RecentlyViewedDoc } from '@/lib/mock-data'
import type { CalendarEvent } from '@/lib/calendrier'

type Loadable<T> = { data: T; loading: boolean; error: DataError | null; retry: () => void }

const HOME_TYPE: Partial<Record<CalendarEvent['type'], AppEvent['type']>> = {
  sante: 'medical',
  rdv: 'rdv',
  ecole: 'ecole',
  appel: 'appel',
  visite: 'garde',
}

/** `timeLabel` : « 14h30 » en français (notation des maquettes), « 14:30 » sinon. */
function toAppEvent(e: CalendarEvent, locale: string): AppEvent {
  return {
    id: e.id,
    title: e.title,
    date: e.start,
    location: e.location,
    type: HOME_TYPE[e.type] ?? 'autre',
    timeLabel: locale === 'fr' ? timeInTz(e.start).replace(':', 'h') : timeInTz(e.start),
  }
}

/** Trois prochains événements (à partir de maintenant). */
export function useUpcomingEvents(): Loadable<AppEvent[]> {
  const live = useEvents()
  const locale = useLocale()
  const data = useMemo(() => {
    const now = Date.now()
    return (live.data ?? [])
      .filter((e) => new Date(e.end).getTime() >= now)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 3)
      .map((e) => toAppEvent(e, locale))
  }, [live.data, locale])
  return { data, loading: LIVE && live.loading, error: LIVE ? live.error : null, retry: () => void live.refresh() }
}

function toRecent(d: VaultDocumentRecord, locale: string, addedOn: (date: string) => string): RecentlyViewedDoc {
  return {
    id: d.id,
    title: d.name,
    viewedLabel: addedOn(frDate(d.addedAt, 'short', locale)),
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
  const [docs, setDocs] = useState<VaultDocumentRecord[]>([])
  const [loading, setLoading] = useState(LIVE)
  const [error, setError] = useState<DataError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const locale = useLocale()
  const t = useTranslations('shared.dashboard')

  useEffect(() => {
    if (!LIVE || !vaultOpen) return
    let alive = true
    setLoading(true)
    setError(null)
    listDocuments()
      .then((list) => { if (alive) setDocs(list.slice(0, 3)) })
      .catch((e: unknown) => { if (alive) setError(toDataError(e, 'home.recentDocs')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vaultOpen, attempt])

  // Libellés calculés au rendu (langue courante), pas dans l'effet de chargement.
  const data = useMemo(
    () => (LIVE ? docs.map((d) => toRecent(d, locale, (date) => t('addedOn', { date }))) : mockRecentlyViewed),
    [docs, locale, t],
  )
  return { data, loading, error, retry: () => setAttempt((n) => n + 1) }
}
