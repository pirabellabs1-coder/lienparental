import type { Tone } from '@/components/admin/ops/ui'
import type { PartnerCategory } from '@/lib/partenaires/catalog'
import type { ApplicationStatus } from '@/lib/partenaires/server'
import type { PartnerProfile, PartnerTerritory } from '@/lib/partenaires/types'

// Libellés du back-office partenaires (administration en français).
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'À valider',
  approved: 'Publié',
  hidden: 'Masqué',
  rejected: 'Refusé',
}
export const STATUS_TONE: Record<ApplicationStatus, Tone> = { pending: 'warn', approved: 'ok', hidden: 'neutral', rejected: 'danger' }

export const CATEGORY_LABEL: Record<PartnerCategory, string> = {
  institution: 'Institutionnel',
  association: 'Associatif',
  createur: 'Créateur de contenu',
  professionnel: 'Professionnel',
}

export const PROFILE_LABEL: Record<PartnerProfile, string> = {
  association: 'Association',
  institution: 'Institution ou organisme public',
  professionnel: 'Professionnel ou prestataire',
  createur: 'Créateur de contenu ou influenceur',
}

export const TERRITORY_LABEL: Record<PartnerTerritory, string> = {
  guyane: 'Guyane', france: 'France métropolitaine', martinique: 'Martinique', guadeloupe: 'Guadeloupe',
  reunion: 'La Réunion', mayotte: 'Mayotte', autre: 'Autre',
}
