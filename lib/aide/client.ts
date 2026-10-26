'use client'
/**
 * Lecture des conseils du jour côté navigateur (tableau de bord parent).
 * Source : GET /api/aide/conseils (jamais d'import de lib/aide/public, module serveur).
 */
import { useEffect, useState } from 'react'
import type { Tip } from '@/lib/mock-data'

type State = { status: 'loading' | 'ready' | 'error'; data: Tip[] }

export function useDailyTips(): State {
  const [state, setState] = useState<State>({ status: 'loading', data: [] })
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/aide/conseils', { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { data: Tip[] }) => setState({ status: 'ready', data: Array.isArray(j.data) ? j.data : [] }))
      .catch((e) => { if (!ac.signal.aborted) { console.warn('[aide] conseils indisponibles', e); setState({ status: 'error', data: [] }) } })
    return () => ac.abort()
  }, [])
  return state
}
