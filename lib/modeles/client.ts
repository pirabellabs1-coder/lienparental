'use client'
/**
 * Lecture des modèles publiés côté navigateur (écrans parent « Documents prêts à l'emploi »).
 * Source : GET /api/modeles et /api/modeles/[slug] (Supabase ou back-office de démonstration).
 */
import { useEffect, useState } from 'react'
import type { ModelCard } from '@/lib/mock-data'
import type { PublishedTemplate, PublishedTemplateSummary } from './server'
import { templateCategoryLabel } from './template'

type State<T> = { status: 'loading' | 'ready' | 'error'; data: T }

export function usePublishedTemplates(): State<PublishedTemplateSummary[]> {
  const [state, setState] = useState<State<PublishedTemplateSummary[]>>({ status: 'loading', data: [] })
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/modeles', { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { data: PublishedTemplateSummary[] }) => setState({ status: 'ready', data: j.data }))
      .catch((e) => { if (!ac.signal.aborted) { console.warn('[modeles] liste indisponible', e); setState({ status: 'error', data: [] }) } })
    return () => ac.abort()
  }, [])
  return state
}

export function usePublishedTemplate(slug: string): State<PublishedTemplate | null> {
  const [state, setState] = useState<State<PublishedTemplate | null>>({ status: 'loading', data: null })
  useEffect(() => {
    const ac = new AbortController()
    setState({ status: 'loading', data: null })
    fetch(`/api/modeles/${encodeURIComponent(slug)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { data: PublishedTemplate }) => setState({ status: 'ready', data: j.data }))
      .catch(() => { if (!ac.signal.aborted) setState({ status: 'error', data: null }) })
    return () => ac.abort()
  }, [slug])
  return state
}

const ICON_BY_CATEGORY: Record<string, ModelCard['icon']> = { juridique: 'scale', scolaire: 'school', communication: 'mail', autre: 'file' }
// Le sujet précis du modèle (repéré dans son slug) l'emporte sur la catégorie : logement, santé, chronologie.
const ICON_BY_TOPIC: [RegExp, ModelCard['icon']][] = [[/heberg|logement/, 'home'], [/medic|sante|soin/, 'health'], [/chrono/, 'clock']]
const iconFor = (slug: string, categorie: string): ModelCard['icon'] =>
  ICON_BY_TOPIC.find(([re]) => re.test(slug))?.[1] ?? ICON_BY_CATEGORY[categorie] ?? 'file'
const ACCENT_BY_CATEGORY: Record<string, ModelCard['accent']> = { juridique: 'iris', scolaire: 'leaf', communication: 'gold', autre: 'orange' }

/** Tuile du tableau de bord (components/dashboard/ModelCardsGrid) à partir d'un modèle publié. */
export function toModelCard(t: PublishedTemplateSummary): ModelCard & { href: string } {
  return {
    id: t.slug,
    title: t.titre,
    description: t.description,
    icon: iconFor(t.slug, t.categorie),
    accent: ACCENT_BY_CATEGORY[t.categorie] ?? 'night',
    category: templateCategoryLabel(t.categorie),
    href: `/app/modeles/${t.slug}`,
    lang: t.lang,
  }
}
