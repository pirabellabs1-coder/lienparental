'use client'

import Link from 'next/link'
import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TriangleAlert } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { FileIcon } from '@/components/coffre/FileIcon'
import { btn } from '@/components/coffre/buttons'
import { useDeletedDocs, useVaultDoc } from '@/components/coffre/store'
import { LoadingState } from '@/components/mobile/StateScreens'
import { LIVE } from '@/lib/data/core'
import { useVaultI18n } from '@/components/coffre/i18n'

/**
 * Maquette « Supprimer le document ». Cet écran EST l'étape de confirmation
 * de l'action irréversible : focus initial sur « Annuler », action destructive
 * explicitement libellée.
 */
export default function DeleteDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const t = useTranslations('vault.docDelete')
  const tc = useTranslations('vault.common')
  const f = useVaultI18n()
  const { doc, loading } = useVaultDoc(id)
  const { remove } = useDeletedDocs()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const cancelRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => { cancelRef.current?.focus() }, [doc?.id])

  if (!doc && loading) {
    return (
      <>
        <ScreenHeader title={t('title')} backHref="/app/coffre/documents" />
        <LoadingState compact title={t('loading')} description="" />
      </>
    )
  }

  if (!doc) {
    return (
      <>
        <ScreenHeader title={t('title')} backHref="/app/coffre/documents" />
        <p className="px-6 pt-16 text-center text-[14px] text-night-600">{t('gone')}</p>
      </>
    )
  }

  // Document partagé par un autre adulte : jamais supprimable ici (la base le refuse aussi,
  // soft_delete_document filtre sur le propriétaire).
  if (doc.sharedBy) {
    return (
      <>
        <ScreenHeader title={t('title')} backHref={`/app/coffre/documents/${doc.id}`} />
        <div className="px-6 pt-16 text-center">
          <p className="text-[16px] font-bold text-night-900">{t('readOnlyTitle')}</p>
          <p className="mx-auto mt-1 max-w-[320px] text-[13px] leading-relaxed text-night-600">
            {t('readOnlyText', { name: doc.sharedBy.prenom })}
          </p>
          <Link href={`/app/coffre/documents/${doc.id}`} className="mt-5 inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-bold text-leaf-600 hover:bg-leaf-50">
            {t('backToDoc')}
          </Link>
        </div>
      </>
    )
  }

  // Supabase : mise à la corbeille (restaurable 30 jours). Démo : masqué pour la session.
  const onDelete = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await remove(doc.id)
      router.replace('/app/coffre/documents/tous')
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('failed'))
      setBusy(false)
    }
  }

  return (
    <>
      <ScreenHeader title={t('title')} backHref={`/app/coffre/documents/${doc.id}`} />
      <div className="px-5 pt-2">
        <div className="flex items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
          <FileIcon tone={doc.tone} label={doc.ext === 'DOCX' ? 'W' : doc.ext} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-night-900">{doc.name}</p>
            <p className="text-[12.5px] text-night-500">{doc.ext} <span aria-hidden="true">•</span> {f.size(doc.size)}</p>
          </div>
        </div>

        <div role="note" className="mt-4 flex gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />
          <div className="text-[13.5px] leading-relaxed text-night-800">
            {LIVE ? (
              <>
                <p className="font-bold text-night-900">{t('trashTitle')}</p>
                <p className="mt-1">{t('trashText')}</p>
              </>
            ) : (
              <>
                <p className="font-bold text-night-900">{t('irreversible')}</p>
                <p className="mt-1">{t('permanentText')}</p>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {failure && <p role="alert" className="text-center text-[13px] font-semibold text-alert-600">{failure}</p>}
          <button type="button" onClick={() => void onDelete()} disabled={busy} className={btn({ variant: 'danger' })}>
            {busy ? t('deleting') : LIVE ? t('toTrash') : t('permanent')}
          </button>
          <Link ref={cancelRef} href={`/app/coffre/documents/${doc.id}`} className={btn({ variant: 'secondary' })}>
            {tc('cancel')}
          </Link>
        </div>
      </div>
    </>
  )
}
