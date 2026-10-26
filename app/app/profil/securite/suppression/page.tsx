'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, Download, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Button, Card, Checkbox, ConfirmDialog, Input } from '@/components/ui'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { signOutAndRedirect } from '@/lib/auth/browser'

type ApiError = { error?: { code?: string; message?: string } }

async function readError(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as ApiError
    return body.error?.message ?? fallback
  } catch {
    return fallback
  }
}

export default function SuppressionPage() {
  const router = useRouter()
  const [checks, setChecks] = useState({
    coffre: false,
    abo: false,
    irreversible: false,
  })
  const [confirmText, setConfirmText] = useState('')
  const [firstConfirmOpen, setFirstConfirmOpen] = useState(false)
  const [secondConfirmOpen, setSecondConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const allChecked = checks.coffre && checks.abo && checks.irreversible
  // Supabase : ré-authentification par mot de passe exigée (vérifiée côté serveur).
  const canDelete = allChecked && confirmText.trim().toUpperCase() === 'SUPPRIMER' && (!SUPABASE_ENABLED || password.length > 0)

  const exportData = async () => {
    if (!SUPABASE_ENABLED) {
      alert('Un e-mail avec vos données vous sera envoyé sous 48 h.')
      return
    }
    setExporting(true)
    setExportStatus(null)
    try {
      const res = await fetch('/api/account/export', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) { setExportStatus(await readError(res, 'L’export a échoué. Réessayez dans un instant.')); return }
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'lien-parental-export.json'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportStatus('Vos données ont été téléchargées.')
    } catch {
      setExportStatus('Connexion au serveur impossible. Vérifiez votre connexion internet.')
    } finally {
      setExporting(false)
    }
  }

  const deleteAccount = async () => {
    setLoading(true)
    setError(null)
    if (SUPABASE_ENABLED) {
      try {
        const res = await fetch('/api/account/delete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, confirm: confirmText }),
        })
        if (!res.ok) {
          setError(await readError(res, 'La suppression a échoué. Réessayez dans un instant.'))
          setLoading(false)
          setSecondConfirmOpen(false)
          return
        }
      } catch {
        setError('Connexion au serveur impossible. Vérifiez votre connexion internet.')
        setLoading(false)
        setSecondConfirmOpen(false)
        return
      }
      setPassword('')
      // Session déjà révoquée côté serveur : on nettoie le navigateur et on quitte l'espace.
      await signOutAndRedirect('/')
      return
    }
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    setSecondConfirmOpen(false)
    router.push('/')
  }

  return (
    <>
      <TopBar title="Supprimer mon compte" showBack backHref="/app/profil/securite" />
      <div className="w-full px-5 pb-8 pt-4 space-y-5">
        <Card className="p-5 border-alert-200 bg-alert-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-alert-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-semibold text-alert-700">
                Action irréversible
              </h2>
              <p className="text-sm text-alert-700/90 mt-1">
                La suppression du compte efface définitivement vos données après un délai légal de 30 jours.
              </p>
            </div>
          </div>
        </Card>

        {/* Export */}
        <Card className="p-5">
          <h3 className="font-display text-base font-semibold text-night-900">Avant de partir</h3>
          <p className="text-sm text-night-600 mt-1">
            Téléchargez une copie de vos documents, témoignages et métadonnées.
          </p>
          <Button variant="secondary" full className="mt-3" onClick={() => void exportData()} disabled={exporting} aria-busy={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? 'Préparation de l’export…' : 'Exporter mes données'}
          </Button>
          {exportStatus && <p role="status" className="mt-2 text-sm text-night-700">{exportStatus}</p>}
        </Card>

        {/* Checklist */}
        <Card className="p-5 space-y-1">
          <h3 className="font-display text-base font-semibold text-night-900 mb-2">
            Je comprends que :
          </h3>
          <Checkbox
            label="Mon coffre-fort et tous ses documents seront supprimés"
            checked={checks.coffre}
            onChange={(e) => setChecks(c => ({ ...c, coffre: e.target.checked }))}
          />
          <Checkbox
            label="Mon abonnement Premium sera annulé immédiatement, sans remboursement"
            checked={checks.abo}
            onChange={(e) => setChecks(c => ({ ...c, abo: e.target.checked }))}
          />
          <Checkbox
            label="Cette action est irréversible après 30 jours"
            checked={checks.irreversible}
            onChange={(e) => setChecks(c => ({ ...c, irreversible: e.target.checked }))}
          />
        </Card>

        {/* Confirmation textuelle */}
        <Card className="p-5">
          <Input
            label="Pour confirmer, tapez SUPPRIMER"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoCapitalize="characters"
          />
          {SUPABASE_ENABLED && (
            <Input
              containerClassName="mt-4"
              label="Votre mot de passe"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Card>

        {error && <p role="alert" className="text-sm font-medium text-alert-600">{error}</p>}

        <Button
          full
          variant="danger"
          disabled={!canDelete}
          onClick={() => setFirstConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Supprimer définitivement
        </Button>
      </div>

      <ConfirmDialog
        open={firstConfirmOpen}
        onClose={() => setFirstConfirmOpen(false)}
        onConfirm={() => { setFirstConfirmOpen(false); setSecondConfirmOpen(true) }}
        title="Confirmer la suppression ?"
        description="Un dernier contrôle vous sera demandé."
        confirmLabel="Continuer"
        tone="danger"
      />
      <ConfirmDialog
        open={secondConfirmOpen}
        onClose={() => setSecondConfirmOpen(false)}
        onConfirm={deleteAccount}
        title="Supprimer le compte ?"
        description="Dernière confirmation. Vos données seront effacées."
        confirmLabel="Je supprime mon compte"
        tone="danger"
        loading={loading}
      />
    </>
  )
}
