// Témoignages d'utilisateurs affichés sur la page d'accueil (section « Ils utilisent déjà Lien Parental »).
//
// RÈGLE : uniquement de VRAIS retours d'utilisateurs. Aucun avis inventé, reformulé au point d'en changer le sens,
// ou attribué à une personne fictive (pratique commerciale trompeuse, art. L121-4 du Code de la consommation).
// Tant que ce tableau est vide, la section affiche « Ce que nous voulons pour vous » et l'invitation « Vos retours comptent ».
//
// Ajouter un témoignage :
// 1. Obtenir le consentement ÉCRIT de la personne (e-mail ou formulaire signé) pour publier sa citation,
//    son prénom (ou un prénom d'emprunt si elle le demande, à indiquer dans `profile`) et, le cas échéant, sa photo.
//    Conserver cette preuve (date, canal) : elle doit pouvoir être produite. Retirer le témoignage sur simple demande.
// 2. Ne jamais publier d'information permettant d'identifier un enfant ou l'autre parent.
// 3. Photo facultative : la déposer dans public/images/temoignages/ (carrée, 160 × 160 px minimum) ;
//    sans photo, l'initiale du prénom est affichée.
// 4. Ajouter une entrée ci-dessous, par exemple :
//    {
//      quote: 'Texte exact validé par la personne.',
//      firstName: 'Prénom',
//      profile: 'Maman de deux enfants, Cayenne',
//      avatar: '/images/temoignages/prenom.jpg',
//      consent: { date: '2026-11-02', channel: 'e-mail' },
//    },

export type Testimonial = {
  /** Citation exacte, validée par la personne. */
  quote: string
  firstName: string
  /** Profil court, sans donnée identifiante (ex. « Papa d'une fille de 6 ans, Kourou »). */
  profile: string
  /** Chemin d'une photo dans /public (facultatif). */
  avatar?: string
  /** Trace du consentement écrit (non affichée, sert au contrôle). */
  consent: { date: string; channel: string }
}

export const TESTIMONIALS: Testimonial[] = []
