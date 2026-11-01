'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, Download, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Button, Card, Checkbox, ConfirmDialog, Input } from '@/components/ui'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { signOutAndRedirect } from '@/lib/auth/browser'
import { saveBlob } from '@/lib/download'

type ApiError = { error?: { code?: string; message?: string } }

async function readError(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as ApiError
    return body.error?.message ?? fallback
  } catch {
    return fallback
  }
}

// Mot de confirmation vérifié aussi côté serveur : identique dans toutes les langues.
// Mot de confirmation dans la langue de l'interface (le serveur accepte les trois).
const CONFIRM_WORDS = { fr: 'SUPPRIMER', en: 'DELETE', pt: 'EXCLUIR' } as const

export default function SuppressionPage() {
  const t = useTranslations('account.security.deletion')
  const locale = useLocale()
  const CONFIRM_WORD = CONFIRM_WORDS[locale as keyof typeof CONFIRM_WORDS] ?? CONFIRM_WORDS.fr
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
  const canDelete = allChecked && confirmText.trim().toUpperCase() === CONFIRM_WORD && (!SUPABASE_ENABLED || password.length > 0)

  const exportData = async () => {
    if (!SUPABASE_ENABLED) {
      alert(t('exportDemo'))
      return
    }
    setExporting(true)
    setExportStatus(null)
    try {
      const res = await fetch('/api/account/export', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) { setExportStatus(await readError(res, t('exportError'))); return }
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'lien-parental-export.json'
      saveBlob(blob, name)
      setExportStatus(t('exportDone'))
    } catch {
      setExportStatus(t('networkError'))
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
          setError(await readError(res, t('deleteError')))
          setLoading(false)
          setSecondConfirmOpen(false)
          return
        }
      } catch {
        setError(t('networkError'))
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
      <TopBar title={t('title')} showBack backHref="/app/profil/securite" />
      <div className="w-full px-5 pb-8 pt-4 space-y-5">
        <Card className="p-5 border-alert-200 bg-alert-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-alert-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-semibold text-alert-700">
                {t('warningTitle')}
              </h2>
              <p className="text-sm text-alert-700/90 mt-1">
                {t('warningText')}
              </p>
            </div>
          </div>
        </Card>

        {/* Export */}
        <Card className="p-5">
          <h3 className="font-display text-base font-semibold text-night-900">{t('exportTitle')}</h3>
          <p className="text-sm text-night-600 mt-1">
            {t('exportText')}
          </p>
          <Button variant="secondary" full className="mt-3" onClick={() => void exportData()} disabled={exporting} aria-busy={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? t('exporting') : t('export')}
          </Button>
          {exportStatus && <p role="status" className="mt-2 text-sm text-night-700">{exportStatus}</p>}
        </Card>

        {/* Checklist */}
        <Card className="p-5 space-y-1">
          <h3 className="font-display text-base font-semibold text-night-900 mb-2">
            {t('understand')}
          </h3>
          <Checkbox
            label={t('checks.vault')}
            checked={checks.coffre}
            onChange={(e) => setChecks(c => ({ ...c, coffre: e.target.checked }))}
          />
          <Checkbox
            label={t('checks.subscription')}
            checked={checks.abo}
            onChange={(e) => setChecks(c => ({ ...c, abo: e.target.checked }))}
          />
          <Checkbox
            label={t('checks.irreversible')}
            checked={checks.irreversible}
            onChange={(e) => setChecks(c => ({ ...c, irreversible: e.target.checked }))}
          />
        </Card>

        {/* Confirmation textuelle */}
        <Card className="p-5">
          <Input
            label={t('typeToConfirm', { word: CONFIRM_WORD })}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoCapitalize="characters"
          />
          {SUPABASE_ENABLED && (
            <Input
              containerClassName="mt-4"
              label={t('password')}
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
          {t('deleteForever')}
        </Button>
      </div>

      <ConfirmDialog
        open={firstConfirmOpen}
        onClose={() => setFirstConfirmOpen(false)}
        onConfirm={() => { setFirstConfirmOpen(false); setSecondConfirmOpen(true) }}
        title={t('confirm1Title')}
        description={t('confirm1Text')}
        confirmLabel={t('confirm1Button')}
        tone="danger"
      />
      <ConfirmDialog
        open={secondConfirmOpen}
        onClose={() => setSecondConfirmOpen(false)}
        onConfirm={deleteAccount}
        title={t('confirm2Title')}
        description={t('confirm2Text')}
        confirmLabel={t('confirm2Button')}
        tone="danger"
        loading={loading}
      />
    </>
  )
}
