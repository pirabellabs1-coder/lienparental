'use client'

import Link from 'next/link'
import { ChevronRight, Ellipsis } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useTranslations } from 'next-intl'
import { getVaultCategory, type VaultDocument } from '@/lib/mock-vault'
import { useVaultI18n } from './i18n'
import { FileIcon } from './FileIcon'
import { SharedByBadge } from '@/components/famille/SharedByBadge'

/** Sources d'import automatique (documents.source posé par vault_add_from_source, 0330). */
const IMPORT_SOURCES = new Set(['Messagerie', 'Témoignage'])

type Props = {
  doc: VaultDocument
  /** Affiche la catégorie dans la ligne méta (liste « Tous les documents »). */
  showCategory?: boolean
  /** Nom de catégorie résolu par l'appelant (catégories Supabase) ; sinon catalogue de démo. */
  categoryName?: string
  /** Action « ⋯ » (ouvre un menu) ; sinon chevron. */
  onMore?: (doc: VaultDocument) => void
  className?: string
}

/**
 * Ligne document des maquettes : icône fichier colorée, nom en gras,
 * « PDF • 1,2 Mo », date. La ligne entière est un lien ; le bouton « ⋯ »
 * est un frère (pas imbriqué dans le lien) pour rester un contrôle distinct.
 */
export function DocRow({ doc, showCategory, categoryName, onMore, className }: Props) {
  const t = useTranslations('vault.ui.docRow')
  const f = useVaultI18n()
  const rawCat = showCategory ? (categoryName ?? getVaultCategory(doc.categoryId)?.name) : undefined
  const cat = rawCat ? f.category(rawCat) : undefined
  const meta = [cat, doc.ext, doc.size > 0 ? f.size(doc.size) : null].filter(Boolean).join(' • ')
  const imported = IMPORT_SOURCES.has(doc.source)
  return (
    <div className={cn('relative flex items-center gap-3 rounded-2xl border border-night-100 bg-white px-3.5 py-3 shadow-soft transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]', className)}>
      <FileIcon tone={doc.tone} label={doc.ext === 'DOCX' ? 'W' : doc.ext} framed size="md" />
      <div className="min-w-0 flex-1">
        <Link href={`/app/coffre/documents/${doc.id}`} className="block truncate text-[14px] font-bold text-night-900 after:absolute after:inset-0 after:rounded-2xl after:content-['']">
          {doc.name}
        </Link>
        <p className="truncate text-[12px] text-night-500">{meta}</p>
        <p className="text-[12px] text-night-500">{f.date(doc.docDate)}</p>
        {(doc.sharedBy || imported) && (
          <p className="mt-1 flex flex-wrap gap-1">
            {doc.sharedBy && <SharedByBadge prenom={doc.sharedBy.prenom} />}
            {imported && (
              <span className="inline-flex items-center rounded-md bg-night-50 px-1.5 py-0.5 text-[10.5px] font-bold text-night-700">
                <span className="sr-only">{t('sourceSr')}</span>{f.source(doc.source)}
              </span>
            )}
          </p>
        )}
      </div>
      {onMore ? (
        <button
          type="button"
          onClick={() => onMore(doc)}
          aria-label={t('actionsAria', { name: doc.name })}
          className="relative z-10 -mr-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-500 hover:bg-night-50"
        >
          <Ellipsis className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-night-400" aria-hidden="true" />
      )}
    </div>
  )
}
