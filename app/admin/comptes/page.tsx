'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader, SearchField, Button, Badge } from '@/components/ui'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Download, ChevronRight } from 'lucide-react'

// TODO: Supabase service_role — SELECT auth.users JOIN public.users
type User = {
  id: string
  prenom: string
  nom: string
  email: string
  plan: 'gratuit' | 'premium' | 'coparentalite' | 'admin'
  inscritLe: string
  stockageGo: number
}

const mock: User[] = [
  { id: 'u_001', prenom: 'Camille', nom: 'Durand',  email: 'camille.d@mail.fr',  plan: 'premium', inscritLe: '2025-11-02', stockageGo: 3.4 },
  { id: 'u_002', prenom: 'Nassim',  nom: 'Ouali',   email: 'n.ouali@mail.fr',    plan: 'gratuit', inscritLe: '2025-09-18', stockageGo: 0.4 },
  { id: 'u_003', prenom: 'Sofia',   nom: 'Martinez',email: 'sofia.m@proton.me',  plan: 'premium', inscritLe: '2025-12-14', stockageGo: 1.9 },
  { id: 'u_004', prenom: 'Thomas',  nom: 'Petit',   email: 't.petit@mail.fr',    plan: 'gratuit', inscritLe: '2026-01-04', stockageGo: 0.2 },
  { id: 'u_005', prenom: 'Léa',     nom: 'Fontaine',email: 'lea.f@mail.fr',      plan: 'coparentalite', inscritLe: '2025-07-21', stockageGo: 5.8 },
  { id: 'u_006', prenom: 'Hugo',    nom: 'Bernard', email: 'h.bernard@mail.fr',  plan: 'gratuit', inscritLe: '2026-02-12', stockageGo: 0.1 },
  { id: 'u_007', prenom: 'Yasmine', nom: 'El-Amrani',email: 'yas.ea@mail.fr',    plan: 'premium', inscritLe: '2025-10-30', stockageGo: 2.6 },
  { id: 'u_008', prenom: 'Paul',    nom: 'Girard',  email: 'paul.g@mail.fr',     plan: 'gratuit', inscritLe: '2025-08-05', stockageGo: 0.9 },
  { id: 'u_009', prenom: 'Inès',    nom: 'Lopez',   email: 'ines.l@mail.fr',     plan: 'premium', inscritLe: '2026-03-01', stockageGo: 4.1 },
  { id: 'u_010', prenom: 'Antoine', nom: 'Roche',   email: 'a.roche@mail.fr',    plan: 'gratuit', inscritLe: '2025-12-28', stockageGo: 0.0 },
  { id: 'u_011', prenom: 'Claire',  nom: 'Moreau',  email: 'c.moreau@mail.fr',   plan: 'premium', inscritLe: '2025-06-11', stockageGo: 7.2 },
  { id: 'u_012', prenom: 'Mehdi',   nom: 'Benali',  email: 'mehdi.b@mail.fr',    plan: 'gratuit', inscritLe: '2026-04-02', stockageGo: 0.3 },
]

function toCSV(rows: User[]) {
  const header = ['id', 'prenom', 'nom', 'email', 'plan', 'inscritLe', 'stockageGo']
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [header.join(';'), ...rows.map((r) => header.map((k) => esc((r as Record<string, unknown>)[k])).join(';'))]
  return lines.join('\n')
}

export default function ComptesPage() {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return mock
    return mock.filter((u) => u.email.toLowerCase().includes(needle))
  }, [q])

  const handleExport = () => {
    const csv = toCSV(rows)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comptes-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const columns: Column<User>[] = [
    { key: 'prenom', header: 'Prénom', sortable: true, accessor: (r) => r.prenom },
    { key: 'nom',    header: 'Nom',    sortable: true, accessor: (r) => r.nom },
    { key: 'email',  header: 'Email',  sortable: true, accessor: (r) => r.email, cell: (r) => <span className="font-mono text-xs text-night-700">{r.email}</span> },
    {
      key: 'plan', header: 'Plan', sortable: true, accessor: (r) => r.plan,
      cell: (r) => (
        <Badge className={r.plan === 'coparentalite' ? 'bg-night-900 text-white' : r.plan === 'premium' ? 'bg-gold-100 text-gold-700' : r.plan === 'admin' ? 'bg-iris-100 text-iris-700' : 'bg-night-100 text-night-700'}>
          {r.plan}
        </Badge>
      ),
    },
    { key: 'inscritLe', header: 'Inscrit le', sortable: true, accessor: (r) => r.inscritLe },
    {
      key: 'stockageGo', header: 'Stockage', sortable: true, accessor: (r) => r.stockageGo,
      cell: (r) => <span className="tabular-nums">{r.stockageGo.toFixed(1)} Go</span>,
    },
    {
      key: 'actions', header: '', className: 'text-right w-24',
      cell: (r) => (
        <Link
          href={`/admin/comptes/${r.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-leaf-700 hover:text-leaf-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 rounded"
        >
          Ouvrir <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-night-900">Comptes</h1>
          <p className="text-sm text-night-600 mt-1">Rechercher, consulter et exporter les comptes utilisateurs.</p>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <Download className="h-4 w-4" /> Exporter CSV
        </Button>
      </header>

      <Card>
        <CardHeader>
          <SearchField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par email…"
            aria-label="Rechercher un compte par email"
          />
        </CardHeader>
        <CardBody>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Liste des comptes" />
        </CardBody>
      </Card>
    </div>
  )
}
