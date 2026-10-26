'use client'
/** Appels aux routes /api/admin/contenus/** depuis le back-office (même origine, cookies de session). */
import type { ContentKind, ContentRecord, ContentStatus, ContentVersion } from '@/lib/contenus/types'

export type Issue = { path: string; message: string }

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly issues: Issue[] = []) {
    super(message)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
      credentials: 'same-origin',
    })
  } catch {
    throw new AdminApiError(0, 'network', 'Connexion impossible. Vérifiez votre réseau.')
  }
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => null) as { data?: T; error?: { code: string; message: string; issues?: Issue[] } } | null
  if (!res.ok || !json) {
    throw new AdminApiError(res.status, json?.error?.code ?? 'unknown', json?.error?.message ?? 'Une erreur est survenue.', json?.error?.issues ?? [])
  }
  return json.data as T
}

const base = (kind: ContentKind) => `/api/admin/contenus/${kind}`

export const contenusApi = {
  create: <K extends ContentKind>(kind: K, data: unknown, statut: ContentStatus = 'brouillon', publishedAt?: string | null) =>
    call<ContentRecord<K>>(base(kind), { method: 'POST', body: JSON.stringify({ data, statut, publishedAt }) }),
  update: <K extends ContentKind>(kind: K, id: string, version: number, patch: { data?: unknown; statut?: ContentStatus; publishedAt?: string | null }) =>
    call<ContentRecord<K>>(`${base(kind)}/${id}`, { method: 'PATCH', body: JSON.stringify({ version, ...patch }) }),
  remove: (kind: ContentKind, id: string) => call<void>(`${base(kind)}/${id}`, { method: 'DELETE' }),
  duplicate: <K extends ContentKind>(kind: K, id: string) => call<ContentRecord<K>>(`${base(kind)}/${id}/dupliquer`, { method: 'POST' }),
  versions: (kind: ContentKind, id: string) => call<ContentVersion[]>(`${base(kind)}/${id}/versions`),
  restore: <K extends ContentKind>(kind: K, id: string, versionId: string, version: number) =>
    call<ContentRecord<K>>(`${base(kind)}/${id}/versions/${versionId}/restaurer`, { method: 'POST', body: JSON.stringify({ version }) }),
  importSeeds: (what: 'guide' | 'modeles' | 'blog' | 'aide') =>
    call<{ created: number; skipped: number; errors: string[] }>('/api/admin/contenus/import', { method: 'POST', body: JSON.stringify({ what }) }),
  saveTerritoire: (t: { code: string; nom: string; disponible: boolean; ordre: number }) =>
    call<unknown>('/api/admin/guides/territoires', { method: 'POST', body: JSON.stringify(t) }),
  uploadImage: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return call<{ url: string; path: string }>('/api/admin/blog/image', { method: 'POST', body: fd })
  },
}

export const ADMIN_PATHS: Record<ContentKind, { list: string; edit: (id: string) => string }> = {
  fiche: { list: '/admin/guides?onglet=fiches', edit: (id) => `/admin/guides/fiches/${id}` },
  parcours: { list: '/admin/guides?onglet=parcours', edit: (id) => `/admin/guides/parcours/${id}` },
  partenaire: { list: '/admin/guides?onglet=partenaires', edit: (id) => `/admin/guides/partenaires/${id}` },
  modele: { list: '/admin/modeles', edit: (id) => `/admin/modeles/${id}` },
  article: { list: '/admin/blog', edit: (id) => `/admin/blog/${id}` },
  faq: { list: '/admin/contenus/faq', edit: (id) => `/admin/contenus/faq/${id}` },
  tutoriel: { list: '/admin/contenus/tutoriels', edit: (id) => `/admin/contenus/tutoriels/${id}` },
  conseil: { list: '/admin/contenus/conseils', edit: (id) => `/admin/contenus/conseils/${id}` },
}
