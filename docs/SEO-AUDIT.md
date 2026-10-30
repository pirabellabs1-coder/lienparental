# Audit SEO / GEO / schema.org — lienparental.fr (27/10/2026)

Score global : **41/100** (technique 55, on-page 50, contenu 30, performance 35, mobile/a11y 80, international 10, schema.org 20, GEO/IA 15).

## Critiques
- **C1** — `/blog/<slug>` répond **500** (ISR `revalidate` + `generateStaticParams` incompatibles avec `getLocale()` qui lit un cookie). Correctif : retirer `generateStaticParams`/`revalidate`, `export const dynamic = 'force-dynamic'` (idem `app/blog/page.tsx`, `app/aide/page.tsx`). Vérifier 200 (slug existant) / 404 (inconnu).
- **C2** — Le Guide (39 fiches, sources officielles, dates de vérification, traduit EN/PT) est derrière la connexion (`/app/guide`, interdit dans robots) : aucune visibilité.
- **C3** — Tout le catalogue de traductions est sérialisé dans chaque page (`app/layout.tsx` passe `getMessages()` entier) : ~640 Ko de HTML sur l'accueil.
- **C4** — Aucune donnée structurée Organization / WebSite / application.
- **C5** — Langue par cookie, aucune URL par langue ni hreflang : EN/PT invisibles pour les moteurs.
- **C6** — Mentions légales avec champs « à compléter » en ligne (LCEN + confiance) → action client.

## Majeurs
M1 pas de `metadataBase` (canonical relatif) · M2 pas de canonical sur `/`, `/aide`, `/legal/*`, `/don`, `/installer` · M3 aucune `og:image`/`twitter:image`, OG identique partout, `summary` · M4 onboarding connexion/inscription sans metadata propres, autres étapes indexables · M5 cookie lu dans le layout racine → tout dynamique, `no-store` · M6 description d'accueil ~230 car. · M7 blog : auteur `Person` pour « L'équipe », `inLanguage` figé, « Accueil » en dur · M8 images du blog en `<img>` sans dimensions · M9 sitemap incomplet (`/installer`, `/don`, `/onboarding/inscription`), `lastModified: now` · M10 pas de page À propos (lien du pied vers `/don`) · M11 ni FAQPage sur `/aide`, ni `llms.txt` · M12 404 par défaut en anglais.

## Mineurs
N1 canonical de `/blog?page=N` · N2 robots : `Host:` inutile, `/abonner`, `/auth/`, `/offline` non exclus · N3 pas de `X-Robots-Tag: noindex` sur `/app`, `/admin`, `/console`, `/onboarding/*` · N4 `/console` et layout admin sans `robots: noindex` · N5 `/don` sans description · N6 textes en dur FR dans SiteShell/SiteHeader (« Aller au contenu », aria-labels) · N7 metadata streamées dans le `<body>` pour les robots non listés → `htmlLimitedBots` · N8 manifest sans `id`/`screenshots` · N9 `aConfirmer` ne doit jamais être public · N10 `getUser()` sur chaque page publique · N11 **jamais** d'`aggregateRating` (pas d'avis réels).

## Plan d'action

### Sprint 1 (maintenant)
1. Corriger C1.
2. `metadataBase`, OG par défaut (`siteName`, `url`, image), `twitter: summary_large_image`, `app/opengraph-image.tsx` (1200×630, `next/og`).
3. Metadata complètes (titre, description 140-160 car., canonical, OG) sur chaque page publique ; layouts metadata pour `/onboarding/connexion` et `/onboarding/inscription` ; `robots: noindex, follow` sur les autres étapes d'onboarding, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`, `/console`, admin.
4. JSON-LD (`lib/seo/jsonld.ts`, `components/seo/JsonLd.tsx`) : graphe Organization + WebSite (pas de SearchAction), WebApplication avec offres réelles depuis `components/profil/pricing.ts`, FAQPage sur `/aide`, blog en `BlogPosting` (auteur Organization, `inLanguage` dynamique, fil d'Ariane traduit). `sameAs` vide tant qu'il n'y a pas de profils réels.
5. `app/robots.ts` : crawlers IA autorisés (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, Google-Extended, Applebot-Extended, Bingbot, GPTBot, ClaudeBot, Meta-ExternalAgent), `CCBot` et `Bytespider` bloqués ; chaque groupe répète les interdictions (`/app/ /admin/ /api/ /temoin/ /partage/ /abonner /auth/ /onboarding/` + `Allow` connexion/inscription) ; retirer `host`.
6. `next.config.mjs` : `X-Robots-Tag: noindex, nofollow` sur `/app/:path*`, `/admin/:path*`, `/console/:path*`, `/api/:path*`, `/abonner` ; `htmlLimitedBots`.
7. Sitemap : pages manquantes, `lastModified` réels (build, `updatedAt`, `derniereVerification`).
8. `app/not-found.tsx` de marque, traduit.
9. `app/llms.txt/route.ts` et `app/llms-full.txt/route.ts` (fiches et FAQ, sans `aConfirmer`).
10. Client : compléter les mentions légales, puis `legalName` + `address` dans Organization.

### Ensuite
11. C3 : catalogue de traductions réduit aux namespaces nécessaires par zone (objectif < 150 Ko de HTML sur l'accueil).
12. Guide public `/guide/**` (index, territoire, fiche, catégorie, parcours), sans actions/progression/partenaires de démo/`aConfirmer`, « Vérifié le » + sources, CTA d'inscription, JSON-LD WebPage + Article + BreadcrumbList (+ `citation` des sources), lien depuis l'accueil, `/app/guide` en noindex.
13. URL par langue pour les pages publiques (FR sans préfixe, `/en/…`, `/pt/…`), réécrites par la middleware APRÈS la porte admin et le CSRF ; tout `/en|pt/…` hors liste blanche → 404 ; `updateSession` conserve les cookies sur réécriture ; `i18n/request.ts` : en-tête de locale, puis `fr` sur page publique sans préfixe, puis cookie ; sélecteur de langue → URL préfixée + cookie ; liens via `localePath` ; `alternates` (canonical + hreflang fr/en/pt-BR/x-default) ; contenu non traduit = canonical FR, absent des hreflang et du sitemap ; jamais de redirection sur `Accept-Language`.
14. Images du blog en `next/image`, canonical de pagination.
15. Contenus : `/a-propos`, `/tarifs`, `/fonctionnalites/*`, `/glossaire`, `/guide/methodologie`, liens articles → fiches.
16. Divers : manifest `id`/`screenshots`, libellés en dur traduits.

## Après déploiement
`curl -I` article existant (200) / inconnu (404) ; test des résultats enrichis et validateur schema.org (`/`, `/aide`, article, fiche) ; Search Console : soumettre le sitemap, suivre hreflang et Couverture ; poids HTML de l'accueil.

## Vague du 30/10/2026 (mots-clés et audit technique)

Carte des mots-clés et manques de contenu : `docs/SEO-MOTS-CLES.md`. Mesures avant/après : description de la PR.

- **Titres en double** : les 6 territoires partageaient les mêmes titres de fiches (684 pages dans 121 groupes de titres identiques, FR/EN/PT). Le `title` des fiches et parcours porte désormais le territoire, dans la langue du contenu (`public.guide.inTerritory`, `lib/seo/titles.ts`, testé).
- **og:image absente du Guide** (933 pages) : `guideMetadata` reprend l'image par défaut et passe la carte Twitter en `summary_large_image`.
- **Accueil** : requête principale (« application de coparentalité… parents séparés ») dans le `title`, la description et le H1 ; FAQ avec deux questions produit + `FAQPage` JSON-LD ; liens vers les fiches JAF, pension/ARIPA, médiation et le parcours « Je viens de me séparer ».
- **Accessibilité relevée par Lighthouse** : `<dl>` des fiches, nom accessible du sélecteur de langue et du bouton vidéo (WCAG 2.5.3).
- Lighthouse signale « meta description absente » sur toutes les pages : artefact du streaming des métadonnées (Lighthouse ne figure pas dans `htmlLimitedBots`), Googlebot les reçoit bien dans le `<head>` (vérifié avec son agent utilisateur).
- **Non traité (suite à donner)** : toutes les pages publiques sont rendues à la demande (`force-dynamic`, locale lue dans un en-tête de la middleware) ; un passage en `app/[locale]` + `setRequestLocale` + rendu statique/ISR réduirait le TTFB. Le TBT de l'accueil (~0,7 s en mobile simulé) vient du style/layout d'un gros DOM et de l'hydratation.
