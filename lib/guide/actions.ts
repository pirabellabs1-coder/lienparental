/**
 * Actions « Ajouter à Lien Parental » : liens internes pré-remplis selon le contrat d'URL
 * (docs/RECAP_FONCTIONNEL_V2.md). Le guide génère seulement les liens ; la lecture et la
 * validation des paramètres sont faites par chaque formulaire (lib/prefill.ts).
 */
import { prefillHref } from '@/lib/prefill'
import type { FicheAction } from './types'

const TITLE_MAX = 120

function title(t: string): string {
  return t.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
}

/** Valeur du paramètre `source` (retour vers la fiche après enregistrement). */
export function guideSource(ficheSlug: string): string {
  return `guide:${ficheSlug}`
}

export function vaultHref(o: { categorie: string; titre: string; fiche: string }): string {
  return prefillHref('/app/coffre/ajouter', { categorie: o.categorie, titre: title(o.titre), source: guideSource(o.fiche) })
}

export function calendarHref(o: { evenement: string; titre: string; fiche: string; rappel?: boolean; date?: string }): string {
  return prefillHref('/app/calendrier/nouveau', {
    type: o.evenement,
    titre: title(o.titre),
    date: o.date,
    rappel: o.rappel ? '1' : undefined,
    source: guideSource(o.fiche),
  })
}

export function expenseHref(o: { categorie: string; titre: string; fiche: string; montant?: number }): string {
  return prefillHref('/app/journal/nouveau', {
    type: 'depense',
    titre: title(o.titre),
    montant: o.montant !== undefined ? String(Math.round(o.montant * 100) / 100) : undefined,
    categorie: o.categorie,
    source: guideSource(o.fiche),
  })
}

export type ResolvedAction = {
  kind: FicheAction['type']
  label: string
  titre: string
  href: string
  montant?: number
  montantSource?: string
}

const LABELS: Record<FicheAction['type'], string> = {
  coffre: 'Ajouter un document au coffre-fort',
  calendrier: 'Ajouter au calendrier',
  rappel: 'Ajouter un rappel',
  depense: 'Ajouter une dépense au Journal',
}

/** Transforme une action de fiche en lien prêt à l'emploi. */
export function resolveAction(a: FicheAction, ficheSlug: string): ResolvedAction {
  switch (a.type) {
    case 'coffre':
      return { kind: a.type, label: LABELS.coffre, titre: a.titre, href: vaultHref({ categorie: a.categorie, titre: a.titre, fiche: ficheSlug }) }
    case 'calendrier':
      return { kind: a.type, label: LABELS.calendrier, titre: a.titre, href: calendarHref({ evenement: a.evenement, titre: a.titre, fiche: ficheSlug }) }
    case 'rappel':
      return { kind: a.type, label: LABELS.rappel, titre: a.titre, href: calendarHref({ evenement: a.evenement, titre: a.titre, fiche: ficheSlug, rappel: true }) }
    case 'depense':
      return {
        kind: a.type, label: LABELS.depense, titre: a.titre, montant: a.montant, montantSource: a.montantSource,
        href: expenseHref({ categorie: a.categorie, titre: a.titre, fiche: ficheSlug, montant: a.montant }),
      }
  }
}
