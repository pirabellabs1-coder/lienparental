// Point d'entrée public de la liaison des parents (chantier I).
// Le chantier H (messagerie) consomme `listLinkedParents()` :
//   () => Promise<{ userId: string; prenom: string; nom?: string; role: string; avatarUrl?: string }[]>
export {
  FAMILY_LIVE, FamilyError, acceptFamilyInvitation, cancelFamilyInvitation, changeGuardianRole,
  createFamilyInvitation, declineFamilyInvitation, dismissMergeCandidate, invitationMessage, invitationUrl,
  listLinkedParents, loadFamilyOverview, loadSharing, mergeChildren, previewFamilyInvitation, removeGuardian,
  resendFamilyInvitation, setSharing, shareTargets,
} from './client'
export * from './types'
