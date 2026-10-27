/**
 * i18n du coffre-fort : libellés système (catégories par défaut, sources d'import)
 * et formats (dates, tailles) selon la locale courante.
 * Les noms saisis par l'utilisateur restent tels quels (données) ; seuls les libellés
 * livrés par l'application (catégories créées par défaut, sources système) sont traduits.
 * En français, les formats délèguent aux fonctions historiques (rendu identique).
 */
import { useLocale, useTranslations } from 'next-intl'
import { intlLocale } from '@/lib/i18n/config'
import { frDate, frNumericDate, frSize } from '@/lib/mock-vault'
import type { FolderShare, VaultFolder } from '@/lib/data/vault-folders'

/** Catégories créées par défaut (lib/data/vault.ts, migrations) : nom stocké → clé. */
const DEFAULT_CATEGORY_KEYS: Record<string, string> = {
  'Dossier JAF': 'jaf',
  'Scolarité': 'school',
  'Santé': 'health',
  'Finances': 'finances',
  'Courriers': 'mail',
  'Autres': 'other',
}

/** Sources système (import automatique 0330/0430 + liste « Source » de l'ajout) : valeur stockée → clé. */
const SOURCE_KEYS: Record<string, string> = {
  'Messagerie': 'messaging',
  'Témoignage': 'testimony',
  'Journal': 'journal',
  'Import': 'import',
  'Tribunal judiciaire de Cayenne': 'court',
  'Avocat': 'lawyer',
  'École / établissement scolaire': 'school',
  'Médecin / professionnel de santé': 'doctor',
  'CAF': 'caf',
  'Autre parent': 'otherParent',
  'Rédigé par moi': 'byMe',
  'Autre': 'other',
}

function parseYmd(ymd: string): Date | null {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

/** Formats et libellés système du coffre pour la locale courante (composants client ou serveur non async). */
export function useVaultI18n() {
  const locale = useLocale()
  const t = useTranslations('vault.system')
  const fr = locale === 'fr'
  const tag = intlLocale(locale)

  const category = (name: string) => {
    const k = DEFAULT_CATEGORY_KEYS[name]
    return k && !fr ? t(`categories.${k}`) : name
  }
  const source = (value: string) => {
    const k = SOURCE_KEYS[value]
    return k && !fr ? t(`sources.${k}`) : value
  }
  const date = (ymd: string, style: 'long' | 'short' = 'long') => {
    if (fr) return frDate(ymd, style)
    const dt = parseYmd(ymd)
    if (!dt) return ymd
    return new Intl.DateTimeFormat(tag, { day: 'numeric', month: style, year: 'numeric', timeZone: 'UTC' }).format(dt)
  }
  const numericDate = (ymd: string) => {
    if (fr) return frNumericDate(ymd)
    const dt = parseYmd(ymd)
    if (!dt) return ymd
    return new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(dt)
  }
  const size = (bytes: number) => {
    if (fr) return frSize(bytes)
    if (bytes < 1024) return t('size.bytes', { n: bytes })
    if (bytes < 1_048_576) return t('size.kb', { n: Math.round(bytes / 1024) })
    const mb = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1_048_576)
    return t('size.mb', { n: mb })
  }
  return { locale, intl: tag, category, source, date, numericDate, size }
}

/**
 * Sous-titre d'un dossier traduit (équivalent de folderSubtitle de lib/vault/folder-tree) :
 * « 2 sous-dossiers · 3 documents ici · Partagé avec Thomas ».
 */
export function useFolderSubtitle() {
  const t = useTranslations('vault.folders')
  return (f: VaultFolder, folders: VaultFolder[], docCount: number, shares: FolderShare[]): string => {
    const subs = folders.filter((x) => x.parentId === f.id).length
    const parts = [
      subs > 0 ? t('subCount', { count: subs }) : null,
      t('docsHere', { count: docCount }),
    ]
    const with_ = shares.filter((s) => s.folderId === f.id).map((s) => s.granteePrenom)
    if (with_.length) parts.push(t('sharedWith', { names: with_.join(', ') }))
    return parts.filter(Boolean).join(' · ')
  }
}
