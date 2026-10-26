'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader, Badge, Select, SearchField } from '@/components/ui'
import { DataTable, type Column } from '@/components/admin/DataTable'

// TODO: Supabase service_role — table `support_tickets`
type Ticket = {
  id: string
  sujet: string
  auteur: string
  statut: 'ouvert' | 'en_cours' | 'ferme'
  priorite: 'basse' | 'normale' | 'haute' | 'urgente'
  createdAt: string
  lastReply: string
}

const all: Ticket[] = [
  { id: '4821', sujet: 'Impossible d’ajouter un document > 20 Mo', auteur: 'camille.d@…', statut: 'ouvert', priorite: 'haute', createdAt: '2026-10-22', lastReply: 'Il y a 1 h' },
  { id: '4820', sujet: 'Export RGPD : relancer la génération', auteur: 'thomas.p@…', statut: 'en_cours', priorite: 'normale', createdAt: '2026-10-21', lastReply: 'Il y a 3 h' },
  { id: '4819', sujet: 'Facturation Premium — remboursement', auteur: 'lea.f@…', statut: 'ouvert', priorite: 'urgente', createdAt: '2026-10-21', lastReply: 'Hier' },
  { id: '4818', sujet: 'Le témoin n’a pas reçu l’email', auteur: 'sofia.m@…', statut: 'en_cours', priorite: 'normale', createdAt: '2026-10-20', lastReply: 'Il y a 2 j' },
  { id: '4817', sujet: 'Changer l’email du compte', auteur: 'n.ouali@…', statut: 'ferme', priorite: 'basse', createdAt: '2026-10-15', lastReply: 'Il y a 5 j' },
  { id: '4816', sujet: 'Suppression définitive demandée (RGPD)', auteur: 'h.bernard@…', statut: 'ferme', priorite: 'haute', createdAt: '2026-10-12', lastReply: 'Il y a 7 j' },
]

const prioTone: Record<Ticket['priorite'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  basse: 'neutral', normale: 'success', haute: 'warning', urgente: 'danger',
}

export default function SupportPage() {
  const [statut, setStatut] = useState<string>('')
  const [prio, setPrio] = useState<string>('')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    return all.filter((t) => {
      if (statut && t.statut !== statut) return false
      if (prio && t.priorite !== prio) return false
      if (q && !(`${t.sujet} ${t.auteur}`.toLowerCase().includes(q.toLowerCase()))) return false
      return true
    })
  }, [statut, prio, q])

  const columns: Column<Ticket>[] = [
    { key: 'id', header: '#', sortable: true, accessor: (r) => r.id, cell: (r) => <span className="font-mono text-xs text-night-500">#{r.id}</span>, className: 'w-16' },
    {
      key: 'sujet', header: 'Sujet', sortable: true, accessor: (r) => r.sujet,
      cell: (r) => (
        <Link href={`/admin/support/${r.id}`} className="font-medium text-night-900 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 rounded">
          {r.sujet}
        </Link>
      ),
    },
    { key: 'auteur', header: 'Auteur', sortable: true, accessor: (r) => r.auteur, cell: (r) => <span className="text-xs text-night-700">{r.auteur}</span> },
    {
      key: 'statut', header: 'Statut', sortable: true, accessor: (r) => r.statut,
      cell: (r) => (
        <Badge variant={r.statut === 'ouvert' ? 'warning' : r.statut === 'ferme' ? 'neutral' : 'iris'} dot>
          {r.statut === 'en_cours' ? 'en cours' : r.statut === 'ferme' ? 'fermé' : 'ouvert'}
        </Badge>
      ),
    },
    { key: 'priorite', header: 'Priorité', sortable: true, accessor: (r) => r.priorite, cell: (r) => <Badge variant={prioTone[r.priorite]}>{r.priorite}</Badge> },
    { key: 'createdAt', header: 'Créé le', sortable: true, accessor: (r) => r.createdAt },
    { key: 'lastReply', header: 'Dernière réponse', accessor: (r) => r.lastReply },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-night-900">Support</h1>
        <p className="text-sm text-night-600 mt-1">Tickets ouverts par les utilisateurs.</p>
      </header>

      <Card>
        <CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SearchField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un ticket…" aria-label="Rechercher" />
            <Select
              aria-label="Filtrer par statut"
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
              options={[
                { value: '', label: 'Tous les statuts' },
                { value: 'ouvert', label: 'Ouverts' },
                { value: 'en_cours', label: 'En cours' },
                { value: 'ferme', label: 'Fermés' },
              ]}
            />
            <Select
              aria-label="Filtrer par priorité"
              value={prio}
              onChange={(e) => setPrio(e.target.value)}
              options={[
                { value: '', label: 'Toutes les priorités' },
                { value: 'urgente', label: 'Urgente' },
                { value: 'haute', label: 'Haute' },
                { value: 'normale', label: 'Normale' },
                { value: 'basse', label: 'Basse' },
              ]}
            />
          </div>
        </CardHeader>
        <CardBody>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Tickets de support" />
        </CardBody>
      </Card>
    </div>
  )
}
