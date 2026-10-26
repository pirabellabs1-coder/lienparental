'use client'
/** Listes par type de contenu (les fonctions d'affichage restent côté client). */
import { getCategory } from '@/lib/guide/types'
import { templateCategoryLabel } from '@/lib/modeles/template'
import { blogCategoryLabel } from '@/lib/blog/types'
import { faqCategoryLabel, tipCategoryLabel } from '@/lib/aide/types'
import type { ContentRecord } from '@/lib/contenus/types'
import { PARTNER_TYPE_LABEL } from '@/components/admin/guides/PartenaireEditor'
import { ContentList } from './ContentList'
import { dateTimeFr } from './StatusPill'

export function FicheList({ records }: { records: ContentRecord<'fiche'>[] }) {
  return (
    <ContentList kind="fiche" records={records}
      extra={{ header: 'Catégorie', cell: (r) => getCategory(r.data.categorie)?.label ?? r.data.categorie }}
      publicHref={(r) => `/app/guide/${r.slug}?territoire=${r.territoire}`}
      emptyLabel="Aucune fiche pour ce territoire. Créez la première fiche." />
  )
}

export function ParcoursList({ records }: { records: ContentRecord<'parcours'>[] }) {
  return (
    <ContentList kind="parcours" records={records}
      extra={{ header: 'Étapes', cell: (r) => `${r.data.elements?.length ?? 0} étape(s), ordre ${r.data.ordre}` }}
      publicHref={(r) => `/app/guide/parcours/${r.slug}?territoire=${r.territoire}`}
      emptyLabel="Aucun parcours pour ce territoire." />
  )
}

export function PartenaireList({ records }: { records: ContentRecord<'partenaire'>[] }) {
  return (
    <ContentList kind="partenaire" records={records}
      extra={{ header: 'Étiquette', cell: (r) => `${PARTNER_TYPE_LABEL[r.data.type]} · ${getCategory(r.data.categorie)?.court ?? r.data.categorie}${r.data.demo ? ' · exemple fictif' : ''}` }}
      emptyLabel="Aucune offre partenaire pour ce territoire." />
  )
}

export function ModeleList({ records }: { records: ContentRecord<'modele'>[] }) {
  return (
    <ContentList kind="modele" records={records}
      extra={{ header: 'Catégorie', cell: (r) => `${templateCategoryLabel(r.data.categorie)} · ${r.data.champs?.length ?? 0} champ(s)` }}
      emptyLabel="Aucun modèle. Créez le premier modèle de document." />
  )
}

export function ArticleList({ records }: { records: ContentRecord<'article'>[] }) {
  return (
    <ContentList kind="article" records={records}
      extra={{
        header: 'Catégorie',
        cell: (r) => `${blogCategoryLabel(r.data.categorie)}${r.publishedAt ? ` · publication ${dateTimeFr(r.publishedAt)}` : ''}`,
      }}
      publicHref={(r) => `/blog/${r.slug}`}
      previewHref={(r) => `/admin/blog/${r.id}/apercu`}
      emptyLabel="Aucun article. Rédigez le premier article du blog." />
  )
}

export function FaqList({ records }: { records: ContentRecord<'faq'>[] }) {
  return (
    <ContentList kind="faq" records={records}
      extra={{ header: 'Catégorie', cell: (r) => `${faqCategoryLabel(r.data.categorie)} · ordre ${r.data.ordre}` }}
      publicHref={(r) => `/app/aide/faq/${r.slug}`}
      emptyLabel="Aucune question. Importez la FAQ du dépôt ou créez la première question." />
  )
}

export function TutorielList({ records }: { records: ContentRecord<'tutoriel'>[] }) {
  return (
    <ContentList kind="tutoriel" records={records}
      extra={{ header: 'Durée', cell: (r) => `${r.data.dureeMin} min · ordre ${r.data.ordre}` }}
      publicHref={(r) => `/app/aide/tutoriels/${r.slug}`}
      emptyLabel="Aucun tutoriel. Importez les tutoriels du dépôt ou créez le premier." />
  )
}

export function ConseilList({ records }: { records: ContentRecord<'conseil'>[] }) {
  return (
    <ContentList kind="conseil" records={records}
      extra={{ header: 'Catégorie', cell: (r) => `${tipCategoryLabel(r.data.categorie)} · ordre ${r.data.ordre}` }}
      emptyLabel="Aucun conseil. Importez les conseils du dépôt ou créez le premier." />
  )
}
