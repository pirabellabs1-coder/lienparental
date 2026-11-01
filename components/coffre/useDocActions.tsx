'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Download, Eye, Folder, FolderInput, Share2, Trash2 } from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { useDeletedDocs } from './store'
import type { VaultDocument } from '@/lib/mock-vault'
import { LIVE } from '@/lib/data/core'
import { createShare, downloadDocument, previewDocument, type VaultDocumentRecord } from '@/lib/data/vault'

/** Traducteur de l'espace « vault.docActions » (useTranslations('vault.docActions')). */
export type DocActionsT = (key: string, values?: Record<string, string | number>) => string

/** Repli français (appelants sans traducteur) : textes historiques à l'identique. */
const FR_FALLBACK: DocActionsT = (key, values) => {
  const name = String(values?.name ?? '')
  switch (key) {
    case 'linkFailed': return 'Création du lien impossible'
    case 'shareText': return `Document « ${name} » — Lien Parental`
    case 'linkCopied': return 'Lien du document copié'
    case 'shareUnavailable': return 'Partage indisponible sur cet appareil'
    case 'tapAgain': return 'Lien prêt : touchez « Partager » à nouveau.'
    case 'downloadStarted': return `Téléchargement de « ${name} » lancé`
    case 'downloadFailed': return 'Téléchargement impossible'
    case 'previewDemo': return 'Aperçu indisponible en mode démonstration : aucun fichier réel n’est stocké.'
    case 'previewFailed': return 'Aperçu impossible'
    default: return key
  }
}

/** Liens sécurisés déjà créés (par document) : le second appui partage sans attendre le réseau. */
const createdLinks = new Map<string, string>()

/** Partage natif si disponible, sinon copie du lien. Renvoie un message de retour.
 *  Supabase : un document « Partageable » génère un lien sécurisé expirable (7 jours, révocable
 *  dans « Partages actifs ») ; un document « Privé » ne partage que le lien interne (connexion requise). */
export async function shareDocument(doc: Pick<VaultDocument, 'id' | 'name'> & Partial<Pick<VaultDocument, 'confidentialite'>>, t: DocActionsT = FR_FALLBACK): Promise<string | null> {
  let url = `${window.location.origin}/app/coffre/documents/${doc.id}`
  if (LIVE && doc.confidentialite === 'partage') {
    const known = createdLinks.get(doc.id)
    if (known) url = known
    else {
      try {
        url = (await createShare(doc.id, { days: 7 })).url
        createdLinks.set(doc.id, url)
      } catch (e) {
        return e instanceof Error ? e.message : t('linkFailed')
      }
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: doc.name, text: t('shareText', { name: doc.name }), url })
      return null
    } catch (e) {
      // Safari iPhone refuse le partage après l'attente du réseau (appui « expiré ») : le lien est
      // prêt, un nouvel appui le partage aussitôt. Toute autre erreur = annulation de l'utilisateur.
      return e instanceof Error && e.name === 'NotAllowedError' ? t('tapAgain') : null
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return t('linkCopied')
  } catch {
    return t('shareUnavailable')
  }
}

/** Téléchargement : URL signée 60 s émise par le serveur (Supabase) ; démo : simple annonce. */
export async function startDownload(doc: VaultDocument | VaultDocumentRecord, announce: (m: string) => void, t: DocActionsT = FR_FALLBACK) {
  if (!LIVE) {
    announce(t('downloadStarted', { name: doc.name }))
    return
  }
  try {
    await downloadDocument(doc)
    announce(t('downloadStarted', { name: doc.name }))
  } catch (e) {
    announce(e instanceof Error ? e.message : t('downloadFailed'))
  }
}

/** Aperçu dans un nouvel onglet (même route serveur) ; démo : aucun fichier réel. */
export async function startPreview(doc: VaultDocument | VaultDocumentRecord, announce: (m: string) => void, t: DocActionsT = FR_FALLBACK) {
  if (!LIVE) {
    announce(t('previewDemo'))
    return
  }
  try {
    await previewDocument(doc)
  } catch (e) {
    announce(e instanceof Error ? e.message : t('previewFailed'))
  }
}

/**
 * Menu « ⋯ » d'un document (Voir, Télécharger, Partager, Ranger dans un dossier, Déplacer, Supprimer).
 * « Supprimer » = mise à la corbeille (30 jours, restaurable), confirmée sur place : même
 * comportement que depuis la fiche du document. `onRemoved` : rechargement de la liste (Supabase).
 */
export function useDocActions(announce: (m: string) => void, opts: { onRemoved?: () => void | Promise<void> } = {}) {
  const router = useRouter()
  const t = useTranslations('vault.docActions')
  const tc = useTranslations('vault.common')
  const td = useTranslations('vault.docDelete')
  const [doc, setDoc] = useState<VaultDocument | null>(null)
  const [toTrash, setToTrash] = useState<VaultDocument | null>(null)
  const { remove } = useDeletedDocs()

  const confirmTrash = async () => {
    const target = toTrash
    if (!target) return
    try {
      await remove(target.id)
      setToTrash(null)
      announce(t('movedToTrash', { name: target.name }))
      await opts.onRemoved?.()
    } catch (e) {
      setToTrash(null)
      announce(e instanceof Error ? e.message : td('failed'))
    }
  }

  const sheet = (
    <ActionSheet
      open={doc !== null}
      onClose={() => setDoc(null)}
      title={doc?.name}
      actions={doc ? [
        { key: 'voir', label: t('view'), icon: <Eye className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/documents/${doc.id}`) },
        { key: 'dl', label: tc('download'), icon: <Download className="h-5 w-5" />, onClick: () => { void startDownload(doc, announce, t) } },
        // Document partagé par un autre parent (docs/FAMILLE.md) : lecture et téléchargement seulement.
        ...(doc.sharedBy ? [] : [
          { key: 'share', label: tc('share'), icon: <Share2 className="h-5 w-5" />, onClick: () => { void shareDocument(doc, t).then((m) => m && announce(m)) } },
          { key: 'folder', label: t('toFolder'), icon: <Folder className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/documents/${doc.id}?dossier=1`) },
          { key: 'move', label: t('changeCategory'), icon: <FolderInput className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/documents/${doc.id}?deplacer=1`) },
          { key: 'del', label: tc('delete'), icon: <Trash2 className="h-5 w-5" />, variant: 'danger' as const, onClick: () => setToTrash(doc) },
        ]),
      ] : []}
    />
  )
  const dialog = (
    <ConfirmDialog
      open={toTrash !== null}
      onClose={() => setToTrash(null)}
      onConfirm={confirmTrash}
      title={td('trashTitle')}
      description={toTrash ? `${toTrash.name} — ${td('trashText')}` : ''}
      confirmLabel={td('toTrash')}
      tone="danger"
    />
  )

  return { openActions: setDoc, sheet: <>{sheet}{dialog}</> }
}
