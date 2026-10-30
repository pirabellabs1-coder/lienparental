# Brief commun, vague v3 (9 chantiers en parallèle)

Demandes du client : `docs/DEMANDES_CLIENT_V3.md`. Cahier fonctionnel : `docs/RECAP_FONCTIONNEL_V2.md`. Design : `docs/DESIGN_SYSTEM.md`.

## Règles communes
- Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3. Réponses et textes d'interface en **français**, aucun tiret cadratin dans les textes visibles.
- **Charte** : bleu marine `night-900` (#0B2D5B) pour les titres, vert `leaf-400` (#4CAF50) pour accents/logo, `leaf-500` pour les boutons (texte blanc), gris clair #E5E7EB pour bordures. Montserrat / Allura déjà en place. `iris` réservé au Coach IA, `gold` au Premium.
- **Deux modes** à supporter partout : démo (`lib/demo-auth.ts`, cookie `lp_demo`, données fictives en mémoire/localStorage) et réel (Supabase, `lib/supabase/config.ts` : `SUPABASE_ENABLED`, etc.). Toute intégration externe (Google, etc.) s'active seulement si ses variables d'environnement existent, sinon l'interface explique qu'elle n'est pas configurée. Ajoute les variables à `.env.example` (section dédiée, valeurs vides) et une section dans `docs/MISE_EN_SERVICE.md`.
- **Sécurité** : RLS sur toute nouvelle table (propriétaire ou admin via `public.is_admin()`), politiques MFA restrictives comme dans `0270_security_hardening.sql` pour les données sensibles, `search_path` fixé sur les fonctions SECURITY DEFINER, `revoke` des fonctions sensibles à anon. Validation zod côté serveur. Jamais de secret côté client. Routes API protégées par `requireAuthedUser()` (`lib/auth/guard.ts`) ou garde admin.
- **Migrations** : ne modifie jamais une migration existante. Chaque chantier a SON numéro (tableau ci-dessous).
- **Accessibilité** WCAG 2.2 AA (labels, focus visible, cibles 44 px, erreurs liées aux champs, `prefers-reduced-motion`). Web et mobile soignés.
- **Serveur de dev** déjà lancé sur http://localhost:3000 : ne lance **pas** `next dev`, `next build`, ni `npm install` (si une dépendance est indispensable, ne l'installe pas : écris-la dans ton livrable, je l'installerai). Vérifie avec `npx tsc --noEmit` et des captures :
  `MSYS_NO_PATHCONV=1 DEMO_ACCOUNT=parent-premium VIEWPORT_ONLY=1 node "C:\Users\HP\AppData\Local\Temp\claude\C--Users-HP-lien-parental\c8c32519-a70f-4396-a115-c39b54f0f2d2\scratchpad\capture.mjs" <dossier> mobile x=/chemin` (puis `desktop` ; `DEMO_ACCOUNT=admin` pour l'admin). Regarde les captures et itère.
- **Périmètre** : ne modifie que les fichiers de ton chantier (tableau). Si tu dois toucher un fichier partagé listé « coordinateur », écris le besoin précis dans ton livrable au lieu de le modifier.
- Livrable : fichiers créés/modifiés, ce qui est vérifié, ce qui ne l'est pas (sans Supabase/Google réels), variables d'environnement, dépendances à installer.

## Partage des fichiers et numéros de migration
| Chantier | Fichiers | Migration |
|---|---|---|
| A. Page d'installation | `app/installer/**`, `components/marketing/MobileInstall.tsx`, nouveaux `components/install/**`, `public/images/install/**` | aucune |
| B. Finances (tous types de paiement) | `lib/journal-finances.ts`, `components/journal/**`, `app/app/journal/**`, `lib/data/journal.ts` | `0350_finances_plus.sql` |
| C. Contenu du Guide | `content/guide/**` uniquement | aucune |
| D. Coffre-fort verrouillé | `app/app/coffre/layout.tsx` (nouveau), `components/vault-lock/**`, `lib/vault-lock/**`, `app/api/vault-lock/**`, `app/app/profil/securite/coffre/**` | `0290_vault_lock.sql` |
| E. Admin contenus (guides, modèles PDF, blog) | `app/admin/guides/**`, `app/admin/modeles/**`, `app/admin/blog/**`, `components/admin/**` (sauf `components/admin/dashboard/**`), `app/api/admin/**` (sauf `stats`), `lib/guide/load.ts` (lecture BDD), `lib/blog/**`, `app/blog/**`, `content/blog/**` | `0300_admin_contenus.sql` |
| F. Admin tableau de bord | `app/admin/page.tsx`, `components/admin/dashboard/**`, `app/api/admin/stats/**`, `lib/admin/stats/**` | `0310_admin_stats.sql` |
| G. Google (connexion + Agenda) | `app/(public)/onboarding/connexion/page.tsx`, `app/(public)/onboarding/inscription/page.tsx`, `components/auth/GoogleButton.tsx`, `app/auth/callback/route.ts`, `lib/integrations/google/**`, `app/api/integrations/google/**`, `app/app/calendrier/parametres/page.tsx`, `lib/data/calendar.ts` (point d'accroche de synchro uniquement) | `0320_google.sql` |
| H. Messagerie | `app/app/messages/**`, `components/messages/**`, `lib/messages.ts` | `0330_messagerie_plus.sql` |
| I. Liaison des parents | `app/app/coparents/**` (nouveau), `components/coparents/**`, `lib/coparents/**`, `app/api/coparents/**`, étape d'onboarding `app/(public)/onboarding/coparent/**` (nouvelle) | `0340_famille.sql` |

Fichiers « coordinateur » (ne pas modifier, demander) : `components/mobile/**`, `app/app/(accueil)/page.tsx`, `app/app/layout.tsx`, `middleware.ts`, `lib/auth/**`, `tailwind.config.ts`, `app/layout.tsx`, `package.json`, `components/brand/**`, `components/accueil/**`, `components/admin/Sidebar.tsx` → exception : le chantier E peut y ajouter ses entrées de menu (Guides, Modèles, Blog) et le chantier F aucune.
