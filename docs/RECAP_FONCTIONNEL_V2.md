# Récapitulatif fonctionnel v2 (client, 26/10/2026)

Source : message du client. Ce document **prime** sur les ajouts faits jusqu'ici.

## Positionnement
**Lien Parental, Guyane** au lancement. Application (web + mobile, PWA) principalement destinée aux parents séparés et aux familles guyanaises.
Mieux communiquer. Mieux s'organiser. Comprendre ses démarches. Retrouver toutes les informations importantes concernant son enfant au même endroit.

## Priorité produit : ne plus multiplier les modules
Cœur, dans cet ordre :
1. Gestion des enfants
2. Journal
3. Calendrier
4. Coach parental IA
5. Coffre-fort
6. Témoignages
7. Finances intégrées au Journal
8. Guide Parent Guyane

Support : profil, sécurité, stockage, abonnement (Gratuit / Premium 14,99 €/mois ou 149 €/an, Coparentalité+ 24,99 €/mois ou 249 €/an, Stripe), notifications, aide.
Les modules ajoutés en dehors de cette liste (messagerie entre parents, planning de garde, frais partagés séparés) ne doivent plus être mis en avant.

## Nouveauté 1 : Finances dans le Journal (pas de module Finances indépendant)
- Nouveau type d'événement du Journal : **Dépense / Paiement** (clé technique `depense`).
- Champs spécifiques : montant, devise (EUR par défaut), date, catégorie, mode de paiement, bénéficiaire / destinataire, enfant concerné, description, justificatif (photo ou PDF).
- Catégories : Pension / contribution, École, Cantine, Santé, Vêtements, Activités, Transport, Loisirs, Assurance, Frais administratifs, Autre.
- Modes : Virement, Carte bancaire, Espèces, Prélèvement, Chèque, Autre.
- Filtres du Journal : **Tous | Visites | Appels | Messages | Santé | Finances | Autres**.
- Vue Finances : liste (montant, date, catégorie, enfant, justificatif), **Total du mois**, et total par enfant.
- Mention obligatoire : Lien Parental ne certifie pas qu'un paiement a réellement été effectué ; il permet d'enregistrer, de joindre un justificatif et de retrouver l'historique.

## Nouveauté 2 : Guide Parent Guyane (section indépendante)
Objectif : comprendre les démarches, aides, organismes, documents, étapes, services et partenaires, pour un parent vivant en Guyane.
- Tout contenu est rattaché à un **territoire** (`guyane` au lancement ; demain `martinique`, `guadeloupe`, `france`…) sans refaire l'application.
- Catégories : École & scolarité · Santé · Aides & droits · Banque & argent · Assurances · Naissance & petite enfance · Séparation & parentalité · Loisirs & activités · Logement & vie quotidienne.
- Fiche type : À quoi ça sert ? · Qui est concerné ? · Documents nécessaires (checklist) · Étapes numérotées · Où effectuer la démarche ? · Liens utiles (officiels) · **Ajouter à Lien Parental** (ajouter un document au coffre-fort, ajouter un rappel, ajouter au calendrier, ajouter une dépense au Journal, marquer comme terminé).
- Le guide n'est pas un blog : chaque action ouvre la fonction existante pré-remplie (contrat d'URL ci-dessous).
- **Parcours / checklists** : éléments À faire / En cours / Terminé, progression sauvegardée. Parcours « Je viens de me séparer » (liste du client) : vérifier ma situation CAF · mettre à jour l'école · vérifier l'assurance scolaire · organiser les documents de l'enfant · ajouter les rendez-vous importants · vérifier les aides auxquelles j'ai droit · trouver un service de médiation · ranger les décisions / documents importants.
- **Partenaires** : bloc séparé « Offres disponibles en Guyane » après l'information neutre, toujours étiqueté **Partenaire** ou **Offre sponsorisée**. Jamais « la meilleure offre ». Critères de comparaison visibles et objectifs.
- Monétisation possible : Premium, partenariats, affiliation (si juridiquement possible), contenus sponsorisés identifiés.

## Santé : organisation par enfant
Espace **Santé** clairement identifiable dans chaque fiche enfant : rendez-vous médicaux, vaccinations, allergies, traitements, médecin, documents médicaux, historique santé.
Les rendez-vous Santé apparaissent dans le calendrier et sont liés automatiquement à l'enfant.

## Contrat d'URL de pré-remplissage (partagé entre modules)
Chaque formulaire de création lit ces paramètres (tous facultatifs, valeurs validées et bornées côté client ; jamais exécutées comme HTML) :
- Journal : `/app/journal/nouveau?type=depense&titre=…&montant=30&categorie=frais-administratifs&enfant=<id>&date=YYYY-MM-DD&source=guide:<slug>`
  - `type` ∈ `visite|appel|message|sante|depense|autre`
  - `categorie` (dépense) ∈ `pension|ecole|cantine|sante|vetements|activites|transport|loisirs|assurance|frais-administratifs|autre`
- Calendrier : `/app/calendrier/nouveau?type=sante&titre=…&date=YYYY-MM-DD&heure=HH:MM&enfant=<id>&rappel=1&source=guide:<slug>`
- Coffre-fort : `/app/coffre/ajouter?categorie=<jaf|scolarite|sante|finances|courriers|autres>&titre=…&source=guide:<slug>`
- `source` sert à revenir vers la fiche (« Retour au guide ») après enregistrement.
