'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Eye, FolderInput, Share2, Trash2 } from 'lucide-react'
import { ActionSheet } from '@/components/ui'
import type { VaultDocument } from '@/lib/mock-vault'
import { LIVE } from '@/lib/data/core'
import { createShare, downloadDocument, previewDocument, type VaultDocumentRecord } from '@/lib/data/vault'

/** Partage natif si disponible, sinon copie du lien. Renvoie un message de retour.
 *  Supabase : un document « Partageable » génère un lien sécurisé expirable (7 jours, révocable
 *  dans « Partages actifs ») ; un document « Privé » ne partage que le lien interne (connexion requise). */
export async function shareDocument(doc: Pick<VaultDocument, 'id' | 'name'> & Partial<Pick<VaultDocument, 'confidentialite'>>): Promise<string | null> {
  let url = `${window.location.origin}/app/coffre/documents/${doc.id}`
  if (LIVE && doc.confidentialite === 'partage') {
    try {
      url = (await createShare(doc.id, { days: 7 })).url
    } catch (e) {
      return e instanceof Error ? e.message : 'Création du lien impossible'
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: doc.name, text: `Document « ${doc.name} » — Lien Parental`, url })
      return null
    } catch {
      return null // annulation utilisateur
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'Lien du document copié'
  } catch {
    return 'Partage indisponible sur cet appareil'
  }
}

/** Téléchargement : URL signée 60 s émise par le serveur (Supabase) ; démo : simple annonce. */
export async function startDownload(doc: VaultDocument | VaultDocumentRecord, announce: (m: string) => void) {
  if (!LIVE) {
    announce(`Téléchargement de « ${doc.name} » lancé`)
    return
  }
  try {
    await downloadDocument(doc)
    announce(`Téléchargement de « ${doc.name} » lancé`)
  } catch (e) {
    announce(e instanceof Error ? e.message : 'Téléchargement impossible')
  }
}

/** Aperçu dans un nouvel onglet (même route serveur) ; démo : aucun fichier réel. */
export async function startPreview(doc: VaultDocument | VaultDocumentRecord, announce: (m: string) => void) {
  if (!LIVE) {
    announce('Aperçu indisponible en mode démonstration : aucun fichier réel n’est stocké.')
    return
  }
  try {
    await previewDocument(doc)
  } catch (e) {
    announce(e instanceof Error ? e.message : 'Aperçu impossible')
  }
}

/** Menu « ⋯ » d'un document (Voir, Télécharger, Partager, Déplacer, Supprimer). */
export function useDocActions(announce: (m: string) => void) {
  const router = useRouter()
  const [doc, setDoc] = useState<VaultDocument | null>(null)

  const sheet = (
    <ActionSheet
      open={doc !== null}
      onClose={() => setDoc(null)}
      title={doc?.name}
      actions={doc ? [
        { key: 'voir', label: 'Voir le détail', icon: <Eye className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/documents/${doc.id}`) },
        { key: 'dl', label: 'Télécharger', icon: <Download className="h-5 w-5" />, onClick: () => { void startDownload(doc, announce) } },
        // Document partagé par un autre parent (docs/FAMILLE.md) : lecture et téléchargement seulement.
        ...(doc.sharedBy ? [] : [
          { key: 'share', label: 'Partager', icon: <Share2 className="h-5 w-5" />, onClick: () => { void shareDocument(doc).then((m) => m && announce(m)) } },
          { key: 'move', label: 'Déplacer', icon: <FolderInput className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/documents/${doc.id}?deplacer=1`) },
          { key: 'del', label: 'Supprimer', icon: <Trash2 className="h-5 w-5" />, variant: 'danger' as const, onClick: () => router.push(`/app/coffre/documents/${doc.id}/supprimer`) },
        ]),
      ] : []}
    />
  )

  return { openActions: setDoc, sheet }
}
