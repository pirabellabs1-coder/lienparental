import type { Tone } from './ui'
import { Bot, BookOpenText, CalendarDays, CalendarRange, FolderLock, HeartPulse, MessageSquareQuote, MessagesSquare, Scale, Wallet, type LucideIcon } from 'lucide-react'

// Modules de Lien Parental présentés sur l'accueil (barre sous le héros + « Fonctionnalités principales »).
// Les liens pointent vers les sections de la page : un visiteur non connecté n'a pas accès à /app.

export type Module = { key: string; icon: LucideIcon; tone: Tone; name: string; href: string }

/** Barre de modules sous le héros (ordre de la maquette). */
export const MODULE_BAR: Module[] = [
  { key: 'guide', icon: BookOpenText, tone: 'leaf', name: 'Guide parental', href: '#guide' },
  { key: 'agenda', icon: CalendarDays, tone: 'sky', name: 'Agenda partagé', href: '#fct-planning' },
  { key: 'depenses', icon: Wallet, tone: 'gold', name: 'Dépenses et paiements', href: '#fct-depenses' },
  { key: 'sante', icon: HeartPulse, tone: 'rose', name: 'Santé des enfants', href: '#fct-sante' },
  { key: 'coffre', icon: FolderLock, tone: 'night', name: 'Coffre-fort sécurisé', href: '#pourquoi-documents' },
  { key: 'temoignages', icon: MessageSquareQuote, tone: 'iris', name: 'Témoignages', href: '#fct-temoignages' },
  { key: 'jaf', icon: Scale, tone: 'night', name: 'Mon dossier JAF', href: '#fct-jaf' },
  { key: 'coach', icon: Bot, tone: 'iris', name: 'Coach parental IA', href: '#fct-coach' },
]

export type Feature = { id: string; icon: LucideIcon; tone: Tone; name: string; text: string }

/** Grille « Fonctionnalités principales » (8 cartes de la maquette). */
export const FEATURES: Feature[] = [
  { id: 'fct-guide', icon: BookOpenText, tone: 'leaf', name: 'Guide parental', text: 'Les démarches de parent expliquées pas à pas : documents à réunir, étapes et contacts utiles.' },
  { id: 'fct-depenses', icon: Wallet, tone: 'gold', name: 'Dépenses et paiements', text: 'Pension, école, santé : chaque dépense notée avec son justificatif et le total du mois.' },
  { id: 'fct-sante', icon: HeartPulse, tone: 'rose', name: 'Santé des enfants', text: 'Vaccins, allergies, traitements, médecin et rendez-vous médicaux, enfant par enfant.' },
  { id: 'fct-temoignages', icon: MessageSquareQuote, tone: 'iris', name: 'Témoignages', text: 'Demandez une attestation à un proche et suivez-la jusqu’à sa signature.' },
  // Formulation vérifiée (docs/SECURITY.md) : chiffrement en transit et au repos, pas « de bout en bout ».
  { id: 'fct-messages', icon: MessagesSquare, tone: 'leaf', name: 'Messages', text: 'Des échanges écrits et datés avec l’autre parent, photos et documents compris.' },
  { id: 'fct-planning', icon: CalendarRange, tone: 'sky', name: 'Planning de garde', text: 'Alternance, vacances et passations dans un agenda clair, avec les rendez-vous de chaque enfant.' },
  { id: 'fct-jaf', icon: Scale, tone: 'night', name: 'Mon dossier JAF', text: 'Rassemblez les pièces utiles dans un dossier clair, exportable pour votre avocat.' },
  { id: 'fct-coach', icon: Bot, tone: 'iris', name: 'Coach parental IA', text: 'Reformuler un message, préparer un échange difficile, garder un ton serein.' },
]
