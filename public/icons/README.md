# Icônes PWA — Lien Parental

Toutes les icônes dérivent du **logo officiel** (`public/brand/logo.svg`, fichier vectoriel fourni par le client) :

- `favicon.svg` (et `public/favicon.ico` 16/32/48) — le « L » et le point vert du logo, sur carré blanc arrondi : seul détail lisible en 16 à 32 px.
- `icon-192.png`, `icon-512.png` — logo complet centré sur fond blanc (80 % de la largeur).
- `maskable-512.png` — même rendu, logo réduit à 62 % pour rester dans la zone sûre des icônes adaptatives Android.
- `apple-touch-icon.png` (180×180) — iOS applique son propre masque arrondi.
- `logo-google-120.png` — logo de l'écran de consentement Google (120×120).

Pour les régénérer : rendre `public/brand/logo.svg` avec sharp aux tailles ci-dessus (fond blanc).
Après un changement d'icône, incrémenter `CACHE_V` dans `public/sw.js`.
