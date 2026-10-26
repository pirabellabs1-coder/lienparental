'use client'
import { Card, CardBody, CardHeader, Badge } from '@/components/ui'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Lock, ShieldAlert } from 'lucide-react'

// TODO: Supabase service_role — table `temoignages_requests` : NEVER select `content` column
type DemandeTemoin = {
  reference: string
  parent: string
  parentEmail: string
  date: string
  statut: 'en_attente' | 'partiellement_recu' | 'complet' | 'expire'
  recus: number
  invitesTotal: number
}

const rows: DemandeTemoin[] = [
  { reference: 'TMG-24081', parent: 'C. Durand', parentEmail: 'camille.d@…', date: '2026-10-20', statut: 'partiellement_recu', recus: 2, invitesTotal: 4 },
  { reference: 'TMG-24082', parent: 'L. Fontaine', parentEmail: 'lea.f@…', date: '2026-10-18', statut: 'complet', recus: 3, invitesTotal: 3 },
  { reference: 'TMG-24083', parent: 'N. Ouali', parentEmail: 'n.ouali@…', date: '2026-10-15', statut: 'en_attente', recus: 0, invitesTotal: 2 },
  { reference: 'TMG-24084', parent: 'S. Martinez', parentEmail: 'sofia.m@…', date: '2026-10-12', statut: 'expire', recus: 1, invitesTotal: 3 },
  { reference: 'TMG-24085', parent: 'H. Bernard', parentEmail: 'h.bernard@…', date: '2026-10-10', statut: 'partiellement_recu', recus: 1, invitesTotal: 2 },
]

const statutLabel: Record<DemandeTemoin['statut'], { label: string; variant: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  en_attente: { label: 'en attente', variant: 'neutral' },
  partiellement_recu: { label: 'partiellement reçu', variant: 'warning' },
  complet: { label: 'complet', variant: 'success' },
  expire: { label: 'expiré', variant: 'danger' },
}

export default function TemoignagesPage() {
  const columns: Column<DemandeTemoin>[] = [
    { key: 'reference', header: 'Référence', sortable: true, accessor: (r) => r.reference, cell: (r) => <span className="font-mono text-xs text-night-700">{r.reference}</span> },
    {
      key: 'parent', header: 'Parent', sortable: true, accessor: (r) => r.parent,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-night-900 truncate">{r.parent}</p>
          <p className="text-xs text-night-500 truncate">{r.parentEmail}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', sortable: true, accessor: (r) => r.date },
    {
      key: 'statut', header: 'Statut', sortable: true, accessor: (r) => r.statut,
      cell: (r) => <Badge variant={statutLabel[r.statut].variant} dot>{statutLabel[r.statut].label}</Badge>,
    },
    {
      key: 'recus', header: 'Reçus', sortable: true, accessor: (r) => r.recus,
      cell: (r) => <span className="tabular-nums text-night-800">{r.recus} / {r.invitesTotal}</span>,
    },
    {
      key: 'contenu', header: 'Contenu', className: 'text-right',
      cell: () => (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-night-100 px-2.5 py-1 text-[11px] font-medium text-night-700">
          <Lock className="h-3 w-3" aria-hidden="true" /> inaccessible
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-night-900">Témoignages</h1>
        <p className="text-sm text-night-600 mt-1">Suivi des demandes initiées par les parents, sans accès au contenu.</p>
      </header>

      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl2 border border-alert-200 bg-alert-50 p-4 text-sm text-alert-700"
      >
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold">Confidentialité absolue — règle CDC §3.1</p>
          <p className="mt-1">
            Les contenus des témoignages sont chiffrés de bout en bout et <strong>inaccessibles à l&rsquo;administration</strong>.
            Seules les métadonnées de suivi (référence, destinataire, statut) sont visibles ici.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg text-night-900">Demandes récentes</h2>
        </CardHeader>
        <CardBody>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.reference} caption="Demandes de témoignages" />
        </CardBody>
      </Card>
    </div>
  )
}
