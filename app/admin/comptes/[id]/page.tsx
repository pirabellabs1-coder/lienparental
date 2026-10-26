'use client'
import { useState, use } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader, Button, Badge, Avatar, ConfirmDialog } from '@/components/ui'
import { ChevronLeft, Download, UserX, HardDrive, CreditCard } from 'lucide-react'

// TODO: Supabase service_role — SELECT user by id + jointures stripe, storage, audit_log

export default function CompteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = {
    id,
    prenom: 'Camille',
    nom: 'Durand',
    email: 'camille.d@mail.fr',
    plan: 'premium' as const,
    inscritLe: '2025-11-02',
    stripeCustomer: 'cus_PxZ…9Q',
    abonnement: 'Premium mensuel · 7,90 € / mois',
    renouvellement: '2026-11-02',
    statutAbonnement: 'actif' as const,
    stockageGo: 3.4,
    stockageLimiteGo: 10,
    suspendu: false,
  }

  const activity = [
    { when: 'Il y a 5 min',  what: 'Connexion depuis Paris, FR' },
    { when: 'Il y a 2 h',    what: 'Ajout d’un document au coffre' },
    { when: 'Hier, 18:42',   what: 'Création d’un événement de calendrier' },
    { when: '12/10/2026',    what: 'Mise à niveau Premium (mensuel)' },
    { when: '02/11/2025',    what: 'Création du compte' },
  ]

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = () => {
    setExporting(true)
    // TODO: Supabase service_role — déclencher export RGPD (JSON + fichiers)
    setTimeout(() => setExporting(false), 1200)
  }

  const handleSuspend = () => {
    // TODO: Supabase service_role — UPDATE users SET suspended = true + audit_log
    setConfirmOpen(false)
  }

  const pct = Math.round((user.stockageGo / user.stockageLimiteGo) * 100)

  return (
    <div className="space-y-6">
      <Link href="/admin/comptes" className="inline-flex items-center gap-1 text-sm text-night-600 hover:text-night-900">
        <ChevronLeft className="h-4 w-4" /> Retour aux comptes
      </Link>

      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={`${user.prenom} ${user.nom}`} size="lg" tone="iris" />
          <div>
            <h1 className="font-display text-3xl text-night-900">{user.prenom} {user.nom}</h1>
            <p className="text-sm text-night-600">{user.email} · <span className="font-mono text-xs">{user.id}</span></p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" /> {exporting ? 'Export en cours…' : 'Exporter les données (RGPD)'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            <UserX className="h-4 w-4" /> Suspendre
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg text-night-900">Profil</h2>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row k="Prénom" v={user.prenom} />
            <Row k="Nom" v={user.nom} />
            <Row k="Email" v={user.email} />
            <Row k="Plan" v={<Badge variant="premium">{user.plan}</Badge>} />
            <Row k="Inscrit le" v={user.inscritLe} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-display text-lg text-night-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-iris-500" /> Abonnement Stripe
            </h2>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row k="Customer" v={<span className="font-mono text-xs">{user.stripeCustomer}</span>} />
            <Row k="Formule" v={user.abonnement} />
            <Row k="Statut" v={<Badge variant="success" dot>{user.statutAbonnement}</Badge>} />
            <Row k="Renouvellement" v={user.renouvellement} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-display text-lg text-night-900 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-leaf-600" /> Stockage
            </h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-display text-2xl text-night-900 tabular-nums">
                {user.stockageGo.toFixed(1)} Go
              </span>
              <span className="text-night-500">sur {user.stockageLimiteGo} Go</span>
            </div>
            <div
              className="h-2 w-full rounded-full bg-night-100 overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Stockage utilisé"
            >
              <div className="h-full bg-leaf-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-night-500">{pct}% utilisé</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg text-night-900">Activité récente</h2>
        </CardHeader>
        <CardBody>
          <ol className="divide-y divide-night-100">
            {activity.map((e, i) => (
              <li key={i} className="py-3 flex items-start gap-3 text-sm">
                <span className="mt-1 h-2 w-2 rounded-full bg-leaf-500 shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-night-800">{e.what}</p>
                  <p className="text-xs text-night-500 mt-0.5">{e.when}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSuspend}
        title="Suspendre ce compte ?"
        description={`Le compte de ${user.prenom} ${user.nom} ne pourra plus se connecter. Cette action est consignée dans le journal d'audit.`}
        confirmLabel="Suspendre"
        tone="danger"
      />
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-night-500">{k}</dt>
      <dd className="text-night-900 font-medium text-right">{v}</dd>
    </div>
  )
}
