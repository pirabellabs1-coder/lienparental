# Lien Parental — V1 (PWA)

Application mobile PWA (Next.js 15 + Supabase + Stripe) pour accompagner les parents séparés : coffre-fort chiffré, journal, calendrier, témoignages, coach parental IA.

Référence : `maquettes/` (29 écrans) · Cahier des charges fonctionnel et technique du 25/10/2026.

## Démarrage rapide

```bash
npm install
cp .env.example .env.local  # renseigner Supabase, Stripe, Resend, API IA
npm run dev
```

Ouvrir http://localhost:3000 (page web d’accueil) · http://localhost:3000/app (PWA mobile).

## Stack

| Couche | Techno | Rôle |
|---|---|---|
| App mobile | Next.js 15 + Tailwind + PWA | Interface, service worker, manifest |
| Back-end | Routes API Next.js | Logique métier, quotas, PDF |
| Base | Supabase Postgres (UE) + RLS | Données + règles par utilisateur |
| Auth | Supabase Auth (email, code, TOTP) | Sessions, 2FA |
| Fichiers | Supabase Storage privé | Documents chiffrés, URL signées |
| IA | API LLM (Claude ou équivalent) | Analyse, reformulation, OCR |
| Paiement | Stripe Billing + Checkout + Portail | Abonnements, factures |
| Mails | Resend | Transactionnels |
| Notifications | Web Push (VAPID) | Rappels, alertes |
| Hébergement | Vercel UE | HTTPS, déploiement continu |

## Design system — tokens de marque

Les couleurs du cahier des charges (§1.5) sont exposées comme palettes Tailwind :

- `night` — bleu nuit (titres, parcours)
- `leaf`  — vert (validation, navigation)
- `iris`  — violet (coach IA, témoignages)
- `gold`  — or (Premium)
- `alert` — rouge (erreur, suppression)

## Structure (découpée par module)

```
app/
  page.tsx                 # M01 — Landing + guides d'installation
  app/                     # PWA mobile (parent connecté)
    layout.tsx             # Barre de navigation 5 onglets
    page.tsx               # M03 — Accueil
    journal/               # M05
    calendrier/            # M06
    coffre/                # M07
    temoignages/           # M08
    coach/                 # M09
    profil/                # M10 → M15
  (public)/
    onboarding/            # M02 — 10 étapes
    temoin/[token]/        # Espace témoin (sans compte)
    legal/                 # Mentions, CGU, Confidentialité
  api/
    stripe/webhook/        # Webhooks Stripe
    coach/analyze/         # Appel LLM + OCR
    temoignage/send/       # Envoi PDF chiffré
components/
lib/
  supabase/                # Client + helpers RLS
  pdf/                     # Génération PDF (React-PDF)
  crypto/                  # Chiffrement champs sensibles
```

## Pipeline de l'équipe

Voir `pilotage.html` (ou l'artifact publié : salle de pilotage) pour l'organisation du studio et le pipeline des décisions.

## Qualité (avant livraison)

1. `npm run typecheck` + `npm run lint`
2. Auto-revue avec `code-review-self`
3. Revue croisée : `code-reviewer` + `security-auditor` (auth, RLS, Stripe)
4. GO/NO-GO : `quality-gatekeeper`

## Points en attente de validation client (chap. 13 CDC)

- Prix Premium : 11,99/99 ou 19,99/199,99 ?
- Coach IA Premium : 10/cycle ou illimité ?
- Messagerie entre parents en V1 ?
- Validation manuelle des témoignages ou classement auto ?
- Couleurs d'accent personnalisables dès V1 ?
- Bouton Faire un don → Stripe / HelloAsso / autre ?
- Publication App Store/Google Play (Capacitor) après V1 ?
