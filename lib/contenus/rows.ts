/**
 * Correspondance enregistrement ⇄ ligne Postgres (migration 0300_admin_contenus.sql).
 * Module PUR : utilisé par le dépôt serveur, les lectures publiques et le script de semences.
 */
import type { ContentData, ContentKind, ContentRecord, ContentStatus } from './types'
import { describe } from './types'

export const TABLE: Record<ContentKind, string> = {
  fiche: 'guide_fiches',
  parcours: 'guide_parcours',
  partenaire: 'guide_partners',
  modele: 'document_templates',
  article: 'blog_posts',
  faq: 'faq_items',
  tutoriel: 'tutorials',
  conseil: 'daily_tips',
}

/** Colonnes lues (jamais `*` : pas de colonne ajoutée plus tard exposée par mégarde). */
const ENVELOPE = 'id, version, created_at, updated_at'
export const COLUMNS: Record<ContentKind, string> = {
  fiche: `${ENVELOPE}, statut, published_at, territoire, slug, contenu`,
  parcours: `${ENVELOPE}, statut, published_at, territoire, slug, contenu`,
  partenaire: `${ENVELOPE}, actif, published_at, territoire, categorie, nom, type, description, criteres, lien`,
  modele: `${ENVELOPE}, statut, published_at, slug, titre, categorie, description, badge, champs, corps, mise_en_page`,
  article: `${ENVELOPE}, statut, published_at, slug, titre, extrait, contenu_md, couverture_url, couverture_alt, categorie, tags, auteur, seo_titre, seo_description`,
  faq: `${ENVELOPE}, statut, published_at, slug, question, categorie, reponse_md, ordre`,
  tutoriel: `${ENVELOPE}, statut, published_at, slug, titre, resume, duree_min, icone, contenu_md, ordre`,
  conseil: `${ENVELOPE}, statut, published_at, slug, titre, texte, categorie, ordre`,
}

export type Row = Record<string, unknown>

export function toRow<K extends ContentKind>(kind: K, data: ContentData[K], statut: ContentStatus, publishedAt: string | null): Row {
  switch (kind) {
    case 'fiche': {
      const d = data as ContentData['fiche']
      return { territoire: d.territoire, slug: d.slug, categorie: d.categorie, titre: d.titre, derniere_verification: d.derniereVerification, contenu: d, statut, published_at: publishedAt }
    }
    case 'parcours': {
      const d = data as ContentData['parcours']
      return { territoire: d.territoire, slug: d.slug, titre: d.titre, ordre: d.ordre, contenu: d, statut, published_at: publishedAt }
    }
    case 'partenaire': {
      const d = data as ContentData['partenaire']
      // guide_partners (0250) n'a pas de statut : « publié » = actif. Pas d'archivage pour les offres.
      return { territoire: d.territoire, categorie: d.categorie, nom: d.nom, type: d.type, description: d.description, criteres: d.criteres, lien: d.lien, actif: statut === 'publie', published_at: publishedAt }
    }
    case 'modele': {
      const d = data as ContentData['modele']
      return { slug: d.slug, titre: d.titre, categorie: d.categorie, description: d.description, badge: d.badge, champs: d.champs, corps: d.corps, mise_en_page: d.miseEnPage, statut, published_at: publishedAt }
    }
    case 'faq': {
      const d = data as ContentData['faq']
      return { slug: d.slug, question: d.question, categorie: d.categorie, reponse_md: d.reponse, ordre: d.ordre, statut, published_at: publishedAt }
    }
    case 'tutoriel': {
      const d = data as ContentData['tutoriel']
      return {
        slug: d.slug, titre: d.titre, resume: d.resume || null, duree_min: d.dureeMin, icone: d.icone,
        contenu_md: d.contenu, ordre: d.ordre, statut, published_at: publishedAt,
      }
    }
    case 'conseil': {
      const d = data as ContentData['conseil']
      return { slug: d.slug, titre: d.titre, texte: d.texte, categorie: d.categorie, ordre: d.ordre, statut, published_at: publishedAt }
    }
    default: {
      const d = data as ContentData['article']
      return {
        slug: d.slug, titre: d.titre, extrait: d.extrait, contenu_md: d.contenu,
        couverture_url: d.couverture || null, couverture_alt: d.couvertureAlt || null,
        categorie: d.categorie, tags: d.tags, auteur: d.auteur,
        seo_titre: d.seoTitre || null, seo_description: d.seoDescription || null,
        statut, published_at: publishedAt,
      }
    }
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Données métier d'une ligne (non revalidées : l'appelant décide s'il les valide). */
export function rowData(kind: ContentKind, r: Row): unknown {
  switch (kind) {
    case 'fiche':
    case 'parcours':
      return r.contenu
    case 'partenaire':
      return { id: r.id, territoire: r.territoire, categorie: r.categorie, nom: r.nom, type: r.type, description: r.description, criteres: r.criteres, lien: r.lien ?? null, demo: false }
    case 'modele':
      return { slug: r.slug, titre: r.titre, categorie: r.categorie, description: r.description, badge: r.badge ?? null, champs: r.champs ?? [], corps: r.corps, miseEnPage: r.mise_en_page ?? {} }
    case 'faq':
      return { slug: r.slug, question: r.question, categorie: r.categorie, reponse: r.reponse_md, ordre: r.ordre ?? 100 }
    case 'tutoriel':
      return { slug: r.slug, titre: r.titre, resume: str(r.resume), dureeMin: r.duree_min, icone: r.icone, contenu: r.contenu_md, ordre: r.ordre ?? 100 }
    case 'conseil':
      return { slug: r.slug, titre: r.titre, texte: r.texte, categorie: r.categorie, ordre: r.ordre ?? 100 }
    default:
      return {
        slug: r.slug, titre: r.titre, extrait: r.extrait, contenu: r.contenu_md,
        couverture: str(r.couverture_url), couvertureAlt: str(r.couverture_alt),
        categorie: r.categorie, tags: Array.isArray(r.tags) ? r.tags : [], auteur: r.auteur,
        seoTitre: str(r.seo_titre), seoDescription: str(r.seo_description),
      }
  }
}

export function rowStatus(kind: ContentKind, r: Row): ContentStatus {
  if (kind === 'partenaire') return r.actif ? 'publie' : 'brouillon'
  return r.statut === 'publie' || r.statut === 'archive' ? r.statut : 'brouillon'
}

export function fromRow<K extends ContentKind>(kind: K, r: Row, data?: ContentData[K]): ContentRecord<K> {
  const d = (data ?? rowData(kind, r)) as ContentData[K]
  const desc = safeDescribe(kind, d)
  return {
    id: String(r.id),
    kind,
    statut: rowStatus(kind, r),
    version: typeof r.version === 'number' ? r.version : 1,
    titre: desc.titre,
    slug: desc.slug,
    territoire: desc.territoire,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
    data: d,
  }
}

function safeDescribe<K extends ContentKind>(kind: K, d: ContentData[K]) {
  try {
    const x = describe(kind, d)
    return { titre: x.titre ?? '(sans titre)', slug: x.slug ?? '', territoire: x.territoire ?? null }
  } catch {
    return { titre: '(contenu illisible)', slug: '', territoire: null }
  }
}
