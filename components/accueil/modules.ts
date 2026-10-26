import { Bot, BookOpenText, CalendarDays, CalendarRange, FolderLock, HeartPulse, MessageSquareQuote, MessagesSquare, Scale, Wallet, type LucideIcon } from 'lucide-react'

// Modules de Lien Parental présentés sur l'accueil (barre sous le héros + « Fonctionnalités principales »).
// Les liens pointent vers les sections de la page : un visiteur non connecté n'a pas accès à /app.

export type Module = { key: string; icon: LucideIcon; name: string; href: string }

/** Barre de modules sous le héros (ordre de la maquette). */
export const MODULE_BAR: Module[] = [
  { key: 'guide', icon: BookOpenText, name: 'Guide parental', href: '#guide' },
  { key: 'agenda', icon: CalendarDays, name: 'Agenda partagé', href: '#fct-planning' },
  { key: 'depenses', icon: Wallet, name: 'Dépenses et paiements', href: '#fct-depenses' },
  { key: 'sante', icon: HeartPulse, name: 'Santé des enfants', href: '#fct-sante' },
  { key: 'coffre', icon: FolderLock, name: 'Coffre-fort sécurisé', href: '#pourquoi-documents' },
  { key: 'temoignages', icon: MessageSquareQuote, name: 'Témoignages', href: '#fct-temoignages' },
  { key: 'jaf', icon: Scale, name: 'Mon dossier JAF', href: '#fct-jaf' },
  { key: 'coach', icon: Bot, name: 'Coach parental IA', href: '#fct-coach' },
]

export type Feature = { id: string; icon: LucideIcon; name: string; text: string }

/** Grille « Fonctionnalités principales » (8 cartes de la maquette). */
export const FEATURES: Feature[] = [
  { id: 'fct-guide', icon: BookOpenText, name: 'Guide parental', text: 'Les démarches de parent expliquées pas à pas : documents à réunir, étapes et contacts utiles.' },
  { id: 'fct-depenses', icon: Wallet, name: 'Dépenses et paiements', text: 'Pension, école, santé : chaque dépense notée avec son justificatif et le total du mois.' },
  { id: 'fct-sante', icon: HeartPulse, name: 'Santé des enfants', text: 'Vaccins, allergies, traitements, médecin et rendez-vous médicaux, enfant par enfant.' },
  { id: 'fct-temoignages', icon: MessageSquareQuote, name: 'Témoignages', text: 'Demandez une attestation à un proche et suivez-la jusqu’à sa signature.' },
  // Formulation vérifiée (docs/SECURITY.md) : chiffrement en transit et au repos, pas « de bout en bout ».
  { id: 'fct-messages', icon: MessagesSquare, name: 'Messages', text: 'Des échanges écrits et datés avec l’autre parent, photos et documents compris.' },
  { id: 'fct-planning', icon: CalendarRange, name: 'Planning de garde', text: 'Alternance, vacances et passations dans un agenda clair, avec les rendez-vous de chaque enfant.' },
  { id: 'fct-jaf', icon: Scale, name: 'Mon dossier JAF', text: 'Rassemblez les pièces utiles dans un dossier clair, exportable pour votre avocat.' },
  { id: 'fct-coach', icon: Bot, name: 'Coach parental IA', text: 'Reformuler un message, préparer un échange difficile, garder un ton serein.' },
]
