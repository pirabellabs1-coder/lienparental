'use client'

import { useState } from 'react'
import { TopBar } from '@/components/mobile/TopBar'
import { Card } from '@/components/ui/Card'
import { RadioGroup, Select, Switch } from '@/components/ui'
import { useFolders, useVaultSettings } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { flattenFolders, folderAudience, folderPath, type VaultSettings } from '@/lib/data/vault-folders'

/** Messagerie → coffre-fort : rangement automatique (désactivé par défaut, 0420). */
function MessagingSection() {
  const { settings, loading, error, save } = useVaultSettings()
  const { folders, shares } = useFolders()
  const { announce, node } = useAnnounce()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const options = [
    { value: '', label: 'Coffre-fort (sans dossier)' },
    // Sous-dossiers : chemin complet (lisible tel quel par les lecteurs d'écran).
    ...flattenFolders(folders.filter((f) => f.mine)).map((f) => ({
      value: f.id,
      label: folderPath(folders, f.id).map((x) => x.name).join(' / ')
        + (folderAudience(folders, shares, f.id).length ? ` (partagé avec ${folderAudience(folders, shares, f.id).join(', ')})` : ''),
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
      setSaveError(e instanceof Error ? e.message : 'Réglage non enregistré. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="messagerie-coffre">
      <h2 id="messagerie-coffre" className="font-display text-sm font-semibold text-night-900 mb-2 px-1">
        Messagerie
      </h2>
      <Card className="p-2">
        <div className="px-3">
          <Switch
            label="Ranger automatiquement les pièces jointes dans le coffre-fort"
            description="Désactivé par défaut : rien n'est ajouté sans votre accord, utilisez alors « Mettre au coffre-fort » sur chaque pièce jointe à conserver."
            checked={settings.autoImportMessages}
            disabled={loading || saving || Boolean(error)}
            onChange={(e) => void update(
              { ...settings, autoImportMessages: e.target.checked },
              e.target.checked ? 'Rangement automatique activé' : 'Rangement automatique désactivé',
            )}
          />
        </div>
        {settings.autoImportMessages && (
          <div className="px-3 pb-3 pt-1">
            <Select
              label="Dossier de destination"
              hint="Les nouvelles pièces jointes reçues ou envoyées y sont rangées."
              value={settings.autoImportFolderId ?? ''}
              disabled={saving}
              options={options}
              onChange={(e) => void update(
                { ...settings, autoImportFolderId: e.target.value || null },
                'Dossier de destination enregistré',
              )}
            />
            {audience.length > 0 && (
              <p role="note" className="mt-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-semibold text-night-900">
                Ce dossier est partagé avec {audience.join(', ')} : les pièces jointes de toutes vos conversations y seront visibles par {audience.length > 1 ? 'ces parents' : 'ce parent'}.
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
  const [bio, setBio] = useState(true)
  const [sharesByLink, setSharesByLink] = useState(true)
  const [scanAllowed, setScanAllowed] = useState(true)
  const [ttl, setTtl] = useState('15')

  return (
    <>
      <TopBar title="Paramètres du coffre" showBack backHref="/app/coffre" />
      <div className="w-full px-5 pb-6 pt-4 space-y-4">
        <MessagingSection />

        <section aria-labelledby="securite">
          <h2 id="securite" className="font-display text-sm font-semibold text-night-900 mb-2 px-1">
            Sécurité
          </h2>
          <Card className="p-2 divide-y divide-night-100">
            <div className="px-3">
              <Switch
                label="Déverrouillage biométrique"
                description="Face ID / empreinte pour ouvrir le coffre."
                checked={bio}
                onChange={(e) => setBio(e.target.checked)}
              />
            </div>
            <div className="px-3">
              <Switch
                label="Autorisation des partages par lien"
                description="Génération de liens signés expirables."
                checked={sharesByLink}
                onChange={(e) => setSharesByLink(e.target.checked)}
              />
            </div>
            <div className="px-3">
              <Switch
                label="Autorisation du scan de documents"
                description="Caméra et OCR via l'application mobile."
                checked={scanAllowed}
                onChange={(e) => setScanAllowed(e.target.checked)}
              />
            </div>
          </Card>
        </section>

        <section aria-labelledby="ttl">
          <h2 id="ttl" className="font-display text-sm font-semibold text-night-900 mb-2 px-1">
            Durée de vie des liens signés
          </h2>
          <Card className="p-4">
            <RadioGroup
              name="ttl-lien"
              value={ttl}
              onChange={setTtl}
              aria-label="Durée de vie par défaut d'un lien signé"
              options={[
                { value: '5', label: '5 minutes' },
                { value: '15', label: '15 minutes (par défaut)' },
                { value: '60', label: '1 heure' },
                { value: '1440', label: '24 heures' },
              ]}
            />
            <p className="text-xs text-night-500 mt-3">
              Le destinataire perd l&rsquo;accès automatiquement une fois ce délai écoulé.
            </p>
          </Card>
        </section>
      </div>
    </>
  )
}
