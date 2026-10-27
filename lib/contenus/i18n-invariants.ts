/**
 * Champs d'un contenu éditorial qui ne se traduisent JAMAIS : identifiants, liens, catégories,
 * ordres, dates, téléphones, montants… Une traduction (fichier content/i18n/<locale>/… ou colonne
 * `translations`) garde toujours ces valeurs du français. Module PUR, partagé par la lecture
 * localisée (lib/contenus/i18n.ts) et le contrôle des fichiers (scripts/check-content-i18n.ts).
 */
export const INVARIANT_KEYS: ReadonlySet<string> = new Set([
  // identifiants et rattachements
  'slug', 'id', 'territoire', 'code', 'fiche', 'key', 'categoryKey',
  // classements, types et énumérations
  'categorie', 'type', 'coffre', 'evenement', 'ordre', 'badge', 'icone', 'coverIcon',
  // liens, coordonnées, montants
  'url', 'lien', 'montantSource', 'montant', 'telephone', 'couverture',
  // dates et durées
  'derniereVerification', 'verifieLe', 'date', 'dureeMin', 'duree_min',
  // drapeaux et options techniques
  'disponible', 'demo', 'obligatoire', 'logo', 'police', 'taille',
  // modèles de documents : le document produit reste en français (destiné à une administration française)
  'corps', 'miseEnPage', 'exemple', 'options',
])
