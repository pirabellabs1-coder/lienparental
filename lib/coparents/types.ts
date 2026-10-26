// Types partagés (navigateur + serveur) de la liaison des parents (chantier I, 0340).

/** Rôle d'un adulte sur une fiche enfant. `owner` = titulaire de la fiche. */
export type FamilyRole = 'owner' | 'parent' | 'proche'
/** Rôle attribuable par invitation. */
export type GuardianRole = Exclude<FamilyRole, 'owner'>

export type FamilyMember = {
  /** Lien child_guardians (null pour le titulaire). */
  guardianId: string | null
  userId: string
  prenom: string
  nom: string
  role: FamilyRole
  since: string
  isMe: boolean
  /** Je peux changer son rôle ou le retirer. */
  canManage: boolean
}

export type FamilyChild = {
  id: string
  prenom: string
  dateNaissance: string | null
  myRole: FamilyRole
  members: FamilyMember[]
}

export type InvitationChild = { id: string; prenom: string; dateNaissance?: string }

export type SentInvitation = {
  id: string
  email: string
  role: GuardianRole
  status: 'pending' | 'expired' | 'declined'
  expiresAt: string
  sentCount: number
  lastSentAt: string
  createdAt: string
  children: InvitationChild[]
}

export type ReceivedInvitation = {
  id: string
  fromPrenom: string
  fromNom: string
  role: GuardianRole
  children: InvitationChild[]
  createdAt: string
  expiresAt: string
}

export type MergeCandidate = {
  myChild: { id: string; prenom: string }
  sharedChild: { id: string; prenom: string; ownerPrenom: string }
  dateNaissance: string
}

export type FamilyOverview = {
  children: FamilyChild[]
  sent: SentInvitation[]
  received: ReceivedInvitation[]
  mergeCandidates: MergeCandidate[]
}

/** Réponse à la création ou au renvoi : le lien n'est affiché qu'à ce moment-là. */
export type IssuedInvitation = {
  id: string
  email: string
  role: GuardianRole
  token: string
  expiresAt: string
  /** E-mail transactionnel : envoyé, non configuré (journalisé) ou en échec. */
  emailStatus: 'sent' | 'skipped' | 'failed'
}

export type InvitationPreview =
  | { state: 'invalid' }
  | { state: 'other_account'; inviteeHint: string }
  | { state: 'expired' | 'accepted' | 'cancelled' | 'declined' }
  | { state: 'ready'; id: string; inviterPrenom: string; role: GuardianRole; children: InvitationChild[]; expiresAt: string }

export type AcceptResult = { childIds: string[]; role: GuardianRole; conversationId: string | null }

export type MergeResult = { keptChildId: string; healthMoved: number; referencesUpdated: number; guardiansRevoked: number }

/** Contrat du chantier H (messagerie). */
export type LinkedParent = { userId: string; prenom: string; nom?: string; role: string; avatarUrl?: string }

export type SharingKind = 'document' | 'expense' | 'event'
export type SharingItem = {
  kind: SharingKind
  id: string
  label: string
  /** Date ISO (création du document, date de la dépense, début de l'événement). */
  date: string
  detail?: string
  shared: boolean
}
export type SharingSummary = {
  childId: string
  documents: SharingItem[]
  expenses: SharingItem[]
  events: SharingItem[]
  /** Coffre-fort verrouillé (0370) : les documents ne sont ni listés ni modifiables. */
  documentsLocked?: boolean
}

export const ROLE_LABEL: Record<FamilyRole, string> = {
  owner: 'Titulaire de la fiche',
  parent: 'Parent',
  proche: 'Proche',
}

export const ROLE_HELP: Record<GuardianRole, string> = {
  parent: 'Accès complet aux informations partagées de l’enfant : fiche, santé, calendrier, documents et dépenses partagés.',
  proche: 'Lecture limitée : prénom, classe et calendrier partagé. Pas de santé, de documents ni de dépenses.',
}
