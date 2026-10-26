'use client'
import { useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, Select, SearchField, Badge } from '@/components/ui'
import { DataTable, type Column } from '@/components/admin/DataTable'

// TODO: Supabase service_role — table `audit_log`
type Audit = {
  id: string
  date: string
  user: string
  action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'login' | 'export' | 'suspend'
  ressource: string
}

const all: Audit[] = [
  { id: 'a1', date: '2026-10-25 09:14', user: 'claire.m@pirabellabs.com',       action: 'publish',   ressource: 'faq/dossier-jaf-pieces' },
  { id: 'a2', date: '2026-10-25 09:06', user: 'admin@pirabellabs.com',          action: 'update',    ressource: 'settings/quota_ia_gratuit (3 → 5)' },
  { id: 'a3', date: '2026-10-25 08:52', user: 'support@pirabellabs.com',        action: 'update',    ressource: 'support_ticket/4821' },
  { id: 'a4', date: '2026-10-25 08:40', user: 'system',                          action: 'delete',    ressource: 'trash/purge x14' },
  { id: 'a5', date: '2026-10-25 08:11', user: 'claire.m@pirabellabs.com',       action: 'create',    ressource: 'tutorial/partager-chronologie' },
  { id: 'a6', date: '2026-10-24 23:48', user: 'admin@pirabellabs.com',          action: 'suspend',   ressource: 'user/user_90213' },
  { id: 'a7', date: '2026-10-24 22:30', user: 'system',                          action: 'export',    ressource: 'rgpd/user_88021' },
  { id: 'a8', date: '2026-10-24 21:14', user: 'claire.m@pirabellabs.com',       action: 'unpublish', ressource: 'daily_tip/42' },
  { id: 'a9', date: '2026-10-24 20:02', user: 'camille.d@mail.fr',               action: 'login',     ressource: 'auth' },
  { id: 'a10', date: '2026-10-24 18:50', user: 'claire.m@pirabellabs.com',      action: 'update',    ressource: 'faq/residence-alternee-ou-exclusive' },
  { id: 'a11', date: '2026-10-24 17:34', user: 'admin@pirabellabs.com',         action: 'create',    ressource: 'faq/autorite-parentale-conjointe' },
  { id: 'a12', date: '2026-10-24 15:12', user: 'system',                        action: 'export',    ressource: 'rgpd/user_90488' },
]

const toneByAction: Record<Audit['action'], 'neutral' | 'success' | 'warning' | 'danger' | 'iris'> = {
  create: 'success', update: 'iris', delete: 'danger', publish: 'success',
  unpublish: 'warning', login: 'neutral', export: 'iris', suspend: 'danger',
}

export default function JournauxPage() {
  const [action, setAction] = useState('')
  const [q, setQ] = useState('')

  const rows = useMemo(() => all.filter((r) => {
    if (action && r.action !== action) return false
    if (q && !(`${r.user} ${r.ressource}`.toLowerCase().includes(q.toLowerCase()))) return false
    return true
  }), [action, q])

  const columns: Column<Audit>[] = [
    { key: 'date', header: 'Date', sortable: true, accessor: (r) => r.date, cell: (r) => <span className="font-mono text-xs text-night-700">{r.date}</span> },
    { key: 'user', header: 'Auteur', sortable: true, accessor: (r) => r.user, cell: (r) => <span className="text-xs text-night-800">{r.user}</span> },
    { key: 'action', header: 'Action', sortable: true, accessor: (r) => r.action, cell: (r) => <Badge variant={toneByAction[r.action]}>{r.action}</Badge> },
    { key: 'ressource', header: 'Ressource', sortable: true, accessor: (r) => r.ressource, cell: (r) => <span className="font-mono text-xs text-night-700">{r.ressource}</span> },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-night-900">Journaux d&rsquo;audit</h1>
        <p className="text-sm text-night-600 mt-1">Trace immuable des actions d&rsquo;administration (table <code className="font-mono text-xs">audit_log</code>).</p>
      </header>

      <Card>
        <CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SearchField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par auteur ou ressource…" aria-label="Rechercher" />
            <Select
              aria-label="Filtrer par action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              options={[
                { value: '', label: 'Toutes les actions' },
                { value: 'create', label: 'create' },
                { value: 'update', label: 'update' },
                { value: 'delete', label: 'delete' },
                { value: 'publish', label: 'publish' },
                { value: 'unpublish', label: 'unpublish' },
                { value: 'login', label: 'login' },
                { value: 'export', label: 'export' },
                { value: 'suspend', label: 'suspend' },
              ]}
            />
          </div>
        </CardHeader>
        <CardBody>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Journal d'audit" />
        </CardBody>
      </Card>
    </div>
  )
}
