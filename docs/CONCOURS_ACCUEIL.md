# Concours page d'accueil — brief commun

Dix studios concurrents conçoivent chacun une page d'accueil complète pour **Lien Parental**.
Un jury compare les captures web (1440×900) et mobile (390×844) puis promeut la meilleure sur `/`.
L'objectif : la page d'accueil d'une **application web premium de 2026**, au niveau Linear, Arc, Raycast, Apple, Mercury.
Pas un template. Pas une page « startup générique ».

## Le produit
Application web **et** mobile (PWA installable depuis le navigateur, **aucun App Store / Google Play**) pour les parents séparés.
Elle aide à organiser la coparentalité, conserver des preuves fiables et apaiser les échanges, dans l'intérêt de l'enfant.

Modules réels (écrans existants dans `app/app/**`) :
- **Journal** horodaté des faits du quotidien (humeur de l'enfant, événements, pièces jointes)
- **Calendrier** partagé + **Planning de garde** (alternance, vacances scolaires)
- **Coffre-fort** de documents chiffré (jugements, certificats, factures) et **Mon dossier** (export PDF prêt pour le JAF / l'avocat)
- **Témoignages** : on envoie un lien sécurisé à un proche, il répond sans créer de compte, le témoignage arrive horodaté avec une référence unique
- **Coach IA** (Claude) : analyse un message reçu de l'autre parent, mesure le ton, propose une réponse apaisée. Ne donne pas de conseil juridique.
- **Messagerie** entre parents, **Frais partagés** et suivi de la **pension alimentaire**, **Mes enfants** (fiches, infos médicales chiffrées), partage avocat par lien limité et révocable, notifications.

Tarifs : lire `components/profil/pricing.ts` (`PRICING`, `formatPrice`) — Gratuit, Premium 11,99 €/mois ou 99 €/an. Ne jamais coder un prix en dur.
Le FAQ et les promesses de confiance réelles sont dans `app/page.tsx` actuel (TRUST, VALUES, FAQ) : réutiliser leur fond, pas forcément leur forme.

## Identité (non négociable)
- Logo : `components/brand/Logo.tsx` (`<Logo size=... />`).
- Palette Tailwind (`tailwind.config.ts`) : `night` (marine, texte, 900 = #131d63), `leaf` (vert forêt, **couleur d'action unique**, 500 = #1f7a3d), `iris` (violet, **réservé au Coach IA**), `gold` (Premium), `alert`. Neutres libres (fond blanc, gris très clair, ou marine profond pour une section sombre).
- Police : Plus Jakarta Sans (déjà chargée globalement). Pas d'autre police téléchargée.
- CTA principal = vert `leaf-500` (hover `leaf-600`). Un seul accent d'action sur toute la page.
- Icônes : `lucide-react` (déjà au projet), traits fins (`strokeWidth` 1.5–1.75). Pas d'emoji. Pas de SVG d'icône dessiné à la main.

## Contenu (honnêteté obligatoire)
- Texte en **français**, ton chaleureux, rassurant, adulte. Pas de jargon. **Aucun tiret cadratin (—)** dans le texte visible.
- **Interdit** : statistiques inventées (« 10 000 familles »), faux témoignages clients, faux logos de presse/partenaires, fausses notes ★, badges App Store / Google Play, promesses « zero knowledge », « certifié », « valeur juridique garantie ».
- Autorisé : faits vérifiables du produit (chiffrement, hébergement UE, RGPD, sans engagement, horodatage, export PDF, 2FA), extraits d'interface factices mais plausibles (ex. un message analysé par le Coach) clairement présentés comme illustration.
- Rappel discret : Lien Parental ne remplace pas un avocat.

## Liens / routes
- Créer un compte : `/onboarding` · Se connecter : `/onboarding/connexion` · Installer sur mobile : `/installer` · Aide : `/aide` · Mentions : `/legal/...` (voir `app/legal`).

## Matériel visuel
- Captures réelles de l'app : `public/images/app/` (`mobile-accueil.png`, `mobile-coach.png`, `mobile-coffre.png`, `mobile-calendrier.png`, `mobile-journal.png`, `mobile-temoignages.png`, `mobile-temoin.png`, `desktop-web-accueil.png`). Composant cadre : `components/home/PhoneFrame.tsx`.
- Photos (Unsplash, libres) : `public/images/hero-pere-fille.jpg`, `mere-fille-lecture.jpg`, `main-enfant.jpg`, et `public/images/home/` (`famille-parc.jpg`, `parent-enfant-calme.jpg`, `moment-partage.jpg`, `mains-enfant.jpg`, `pere-enfant.jpg` portrait). Regarder les images avant de les utiliser.
- Vous pouvez aussi recréer des morceaux d'interface en JSX/Tailwind (souvent plus net qu'une capture).
- Librairies disponibles : `motion` (import `motion/react`), `gsap` (+ `gsap/ScrollTrigger`), `lenis`, `three`. Elles sont dans `package.json` ; n'en installez **aucune** autre.

## Technique
- Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3.
- Votre périmètre **exclusif** : `app/(variantes)/accueil-vN/page.tsx` (URL `/accueil-vN`) et `components/variantes/vN/**`. Ne modifiez **aucun autre fichier** (ni `app/page.tsx`, ni `components/home/*`, ni la config). Vous pouvez importer en lecture les composants existants.
- `page.tsx` = Server Component avec `export const metadata` ; l'interactivité dans des composants `'use client'` isolés.
- Responsive impeccable de 360 px à 1920 px. `min-h-[100dvh]`, jamais `h-screen`. Pas de scroll horizontal.
- Accessibilité WCAG 2.2 AA : un seul `h1`, titres hiérarchisés, contrastes ≥ 4.5:1, focus visible, cibles ≥ 44 px, `alt` pertinents, landmarks.
- **`prefers-reduced-motion`** respecté partout. Animer uniquement `transform` / `opacity`. Le contenu doit être **visible sans JavaScript** et dans une capture statique : pas de texte qui reste à `opacity:0` tant qu'on n'a pas scrollé (le jury fait défiler la page, mais prévoir un état final lisible).
- Performance : `next/image` avec `sizes`, `priority` seulement sur l'image du héros. WebGL/three uniquement si une seule scène légère avec repli statique.
- Le serveur de dev tourne déjà sur `http://localhost:3000` : **ne lancez pas** `next dev`, ni `next build`, ni `npm install`. Vérifiez avec `npx tsc --noEmit` (ne corrigez que les erreurs de vos fichiers) et en ouvrant `http://localhost:3000/accueil-vN` (curl ou le script de capture ci-dessous).
- Capture (facultatif mais recommandé pour vous auto-évaluer) :
  `MSYS_NO_PATHCONV=1 node "C:\Users\HP\AppData\Local\Temp\claude\C--Users-HP-lien-parental\c8c32519-a70f-4396-a115-c39b54f0f2d2\scratchpad\capture.mjs" <dossierSortie> desktop v=/accueil-vN` (puis `mobile`). Regardez les PNG produits et itérez.

## Critères du jury (/100)
1. Effet « waouh » premium 2026 au premier écran (25)
2. Clarté : en 5 secondes on comprend pour qui et pourquoi (20)
3. Qualité visuelle : typo, rythme, espace, cohérence couleurs/rayons (20)
4. Mobile aussi soigné que le desktop (15)
5. Motion juste, fluide, sobre (10)
6. Honnêteté, a11y, perf (10) — une fausse stat ou un badge store = disqualification

## Livrable
Fin de mission : liste des fichiers créés, la direction artistique en 3 lignes, les skills appliqués, et le résultat de `npx tsc --noEmit` pour vos fichiers.
