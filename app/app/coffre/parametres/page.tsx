'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { TopBar } from '@/components/mobile/TopBar'
import { Card } from '@/components/ui/Card'
import { RadioGroup, Select, Switch } from '@/components/ui'
import { useFolders, useVaultSettings } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { flattenFolders, folderAudience, folderPath, type VaultSettings } from '@/lib/data/vault-folders'

/** Messagerie → coffre-fort : rangement automatique (désactivé par défaut, 0420). */
function MessagingSection() {
  const t = useTranslations('vault.settings')
  const { settings, loading, error, save } = useVaultSettings()
  const { folders, shares } = useFolders()
  const { announce, node } = useAnnounce()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const options = [
    { value: '', label: t('rootOption') },
    // Sous-dossiers : chemin complet (lisible tel quel par les lecteurs d'écran).
    ...flattenFolders(folders.filter((f) => f.mine)).map((f) => ({
      value: f.id,
      label: folderPath(folders, f.id).map((x) => x.name).join(' / ')
        + (folderAudience(folders, shares, f.id).length ? t('sharedSuffix', { names: folderAudience(folders, shares, f.id).join(', ') }) : ''),
    })),
  ]

  // Dossier cible visible par l'autre parent (partage du dossier ou d'un parent) : on
  // prévient clairement plutôt que d'interdire (choix possible et assumé, ex. un dossier
  // « Échanges » commun), car TOUTES les pièces de TOUTES les conversations y iront.
  const audience = settings.autoImportMessages ? folderAudience(folders, shares, settings.autoImportFolderId) : []

  const update = async (next: VaultSettings, done: string) => {
    setSaving(true)
    setSaveError(null)
    try {
      await save(next)
      announce(done)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="messagerie-coffre">
      <h2 id="messagerie-coffre" className="font-display text-sm font-semibold text-night-900 mb-2 px-1">
        {t('messaging')}
      </h2>
      <Card className="p-2">
        <div className="px-3">
          <Switch
            label={t('autoImportLabel')}
            description={t('autoImportDesc')}
            checked={settings.autoImportMessages}
            disabled={loading || saving || Boolean(error)}
            onChange={(e) => void update(
              { ...settings, autoImportMessages: e.target.checked },
              e.target.checked ? t('autoImportOn') : t('autoImportOff'),
            )}
          />
        </div>
        {settings.autoImportMessages && (
          <div className="px-3 pb-3 pt-1">
            <Select
              label={t('destination')}
              hint={t('destinationHint')}
              value={settings.autoImportFolderId ?? ''}
              disabled={saving}
              options={options}
              onChange={(e) => void update(
                { ...settings, autoImportFolderId: e.target.value || null },
                t('destinationSaved'),
              )}
            />
            {audience.length > 0 && (
              <p role="note" className="mt-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-semibold text-night-900">
                {t('sharedWarning', { names: audience.join(', '), count: audience.length })}
              </p>
            )}
          </div>
        )}
        {(error || saveError) && (
          <p role="alert" className="px-3 pb-3 text-xs font-semibold text-alert-600">{saveError ?? error?.message}</p>
        )}
      </Card>
      {node}
    </section>
  )
}

export default function CoffreParametresPage() {
  const t = useTranslations('vault.settings')
  const [bio, setBio] = useState(true)
  const [sharesByLink, setSharesByLink] = useState(true)
  const [scanAllowed, setScanAllowed] = useState(true)
  const [ttl, setTtl] = useState('15')

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/coffre" />
      <div className="w-full px-5 pb-6 pt-4 space-y-4">
        <MessagingSection />

        <section aria-labelledby="securite">
          <h2 id="securite" className="font-display text-sm font-semibold text-night-900 mb-2 px-1">
            {t('security')}
          </h2>
          <Card className="p-2 divide-y divide-night-100">
            <div className="px-3">
              <Switch
                label={t('bioLabel')}
                description={t('bioDesc')}
                checked={bio}
                onChange={(e) => setBio(e.target.checked)}
              />
            </div>
            <div className="px-3">
              <Switch
                label={t('linksLabel')}
                description={t('linksDesc')}
                checked={sharesByLink}
                onChange={(e) => setSharesByLink(e.target.checked)}
              />
            </div>
            <div className="px-3">
              <Switch
                label={t('scanLabel')}
                description={t('scanDesc')}
                checked={scanAllowed}
                onChange={(e) => setScanAllowed(e.target.checked)}
              />
            </div>
          </Card>
        </section>

        <section aria-labelledby="ttl">
          <h2 id="ttl" className="font-display text-sm font-semibold text-night-900 mb-2 px-1">
            {t('ttlTitle')}
          </h2>
          <Card className="p-4">
            <RadioGroup
              name="ttl-lien"
              value={ttl}
              onChange={setTtl}
              aria-label={t('ttlAria')}
              options={[
                { value: '5', label: t('ttl5') },
                { value: '15', label: t('ttl15') },
                { value: '60', label: t('ttl60') },
                { value: '1440', label: t('ttl1440') },
              ]}
            />
            <p className="text-xs text-night-500 mt-3">
              {t('ttlHint')}
            </p>
          </Card>
        </section>
      </div>
    </>
  )
}
