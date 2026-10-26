'use client'

import { useState } from 'react'
import { TopBar } from '@/components/mobile/TopBar'
import { Card } from '@/components/ui/Card'
import { RadioGroup, Switch } from '@/components/ui'

export default function CoffreParametresPage() {
  const [bio, setBio] = useState(true)
  const [sharesByLink, setSharesByLink] = useState(true)
  const [scanAllowed, setScanAllowed] = useState(true)
  const [ttl, setTtl] = useState('15')

  return (
    <>
      <TopBar title="Paramètres du coffre" showBack backHref="/app/coffre" />
      <div className="w-full px-5 pb-6 pt-4 space-y-4">
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
