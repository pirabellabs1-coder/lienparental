# Icônes PWA — Lien Parental

## Masters

Les fichiers SVG de ce dossier sont la **source** des icônes :

- `icon.svg` — master carré arrondi (dégradé night-900 → iris-500, « L » blanc + maillon vert)
- `icon-192.svg`, `icon-512.svg` — mêmes vecteurs, tailles différentes
- `maskable-512.svg` — version pleine bleue avec safe-zone interne 10% pour les icônes adaptatives Android
- `apple-touch-icon.svg` — 180×180, iOS applique son propre masque arrondi
- `favicon.svg` — version 32×32 simplifiée

## Générer les PNG

Les navigateurs modernes acceptent les SVG dans `manifest.json`, mais certains
installateurs (Android legacy, iOS splash screens) préfèrent le PNG. Pour générer
les versions bitmap :

```bash
npm install sharp
node scripts/gen-icons.mjs
```

Cela produit, à côté des SVG :

- `icon-192.png`
- `icon-512.png`
- `maskable-512.png`
- `apple-touch-icon.png` (180×180)

Et met à jour `public/favicon.ico` si `png-to-ico` est aussi installé
(`npm install png-to-ico`) — sinon, le `.ico` placeholder est laissé tel quel.

## Mise à jour

Toute modification visuelle se fait **uniquement** sur `icon.svg` (le master).
Les autres SVG sont des réductions dérivées — à régénérer à la main si la
géométrie change — puis relancer `gen-icons.mjs` pour les PNG.
