'use client'
import { useState } from 'react'
import { Card, CardBody, CardHeader, Button, Input } from '@/components/ui'
import { Save, Settings2 } from 'lucide-react'

// TODO: Supabase service_role — persister dans une table `settings` (clé/valeur)
// À brancher en V1.1 : lecture via createServiceClient(), écriture via Server Action
type Quotas = {
  gratuitStockageGo: number
  gratuitAnalyseIA: number
  premiumStockageGo: number
  premiumAnalyseIA: number
  prixMensuel: number
  prixAnnuel: number
}

const defaults: Quotas = {
  gratuitStockageGo: 1,
  gratuitAnalyseIA: 3,
  premiumStockageGo: 20,
  premiumAnalyseIA: 50,
  prixMensuel: 7.9,
  prixAnnuel: 79,
}

export default function ParametresPage() {
  const [q, setQ] = useState<Quotas>(defaults)
  const [saved, setSaved] = useState(false)

  const update = (k: keyof Quotas, v: string) => {
    setQ((prev) => ({ ...prev, [k]: Number(v) || 0 }))
    setSaved(false)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Supabase service_role — UPSERT settings
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-night-900">Paramètres</h1>
        <p className="text-sm text-night-600 mt-1">Quotas et tarifs modifiables à chaud, sans redéploiement.</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg text-night-900 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-night-500" aria-hidden="true" /> Offre Gratuite
            </h2>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="number" min={0} step={0.5}
              label="Stockage (Go)"
              value={q.gratuitStockageGo}
              onChange={(e) => update('gratuitStockageGo', e.target.value)}
              hint="Volume maximum du coffre pour les comptes gratuits."
            />
            <Input
              type="number" min={0} step={1}
              label="Analyses IA / cycle"
              value={q.gratuitAnalyseIA}
              onChange={(e) => update('gratuitAnalyseIA', e.target.value)}
              hint="Nombre d’analyses IA par cycle de 30 jours."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-display text-lg text-night-900 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-gold-400" aria-hidden="true" /> Offre Premium
            </h2>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="number" min={0} step={0.5}
              label="Stockage (Go)"
              value={q.premiumStockageGo}
              onChange={(e) => update('premiumStockageGo', e.target.value)}
            />
            <Input
              type="number" min={0} step={1}
              label="Analyses IA / cycle"
              value={q.premiumAnalyseIA}
              onChange={(e) => update('premiumAnalyseIA', e.target.value)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-display text-lg text-night-900">Tarifs Premium</h2>
            <p className="text-xs text-night-500 mt-1">Les montants sont synchronisés avec Stripe au prochain déclenchement du webhook.</p>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="number" min={0} step={0.1}
              label="Prix mensuel (€)"
              value={q.prixMensuel}
              onChange={(e) => update('prixMensuel', e.target.value)}
            />
            <Input
              type="number" min={0} step={1}
              label="Prix annuel (€)"
              value={q.prixAnnuel}
              onChange={(e) => update('prixAnnuel', e.target.value)}
            />
          </CardBody>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <p role="status" aria-live="polite" className={`text-sm font-medium ${saved ? 'text-leaf-700' : 'text-transparent'}`}>
            Paramètres enregistrés.
          </p>
          <Button type="submit" variant="primary">
            <Save className="h-4 w-4" /> Enregistrer les modifications
          </Button>
        </div>
      </form>
    </div>
  )
}
