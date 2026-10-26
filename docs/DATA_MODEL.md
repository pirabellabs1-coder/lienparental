# Modèle de données — Lien Parental

Document destiné au client. Vue d'ensemble des tables Postgres (Supabase, UE), de leurs relations et de la stratégie de sécurité au niveau ligne (RLS).

## 1. Vue d'ensemble

```
                        ┌──────────────────┐
                        │   auth.users     │  (géré par Supabase Auth)
                        └────────┬─────────┘
                                 │ 1-1
                        ┌────────▼─────────┐
                        │     users        │  profil applicatif + plan
                        └────────┬─────────┘
          ┌────────────┬─────────┼────────────┬───────────────┬─────────────┐
          │            │         │            │               │             │
   ┌──────▼─────┐ ┌────▼────┐ ┌──▼──────┐ ┌───▼──────────┐ ┌──▼──────┐ ┌────▼────────┐
   │ children   │ │prefs    │ │journal_ │ │calendar_     │ │categorie│ │subscriptions│
   │ (med. 🔒)  │ │         │ │entries  │ │events        │ │s        │ │+ payments   │
   └────────────┘ └─────────┘ └─────────┘ └──────────────┘ └────┬────┘ └─────────────┘
                                                                │
                                                        ┌───────▼────────┐
                                                        │   documents    │
                                                        └───┬────────────┘
                                                            │ 1-N
                                                        ┌───▼─────┐
                                                        │ shares  │ (token public)
                                                        └─────────┘

   ┌─────────────────────┐   1-1   ┌──────────────┐
   │ testimony_requests  │─────────│ testimonies  │ (immuables, référence TMG-YYYY-XXXX)
   └─────────────────────┘         └──────────────┘
         ▲ token public (témoin anonyme)

   ┌──────────────┐  ┌────────────┐  ┌─────────────┐  ┌──────────────┐
   │ ai_analyses  │  │notifications│  │ sessions   │  │support_tickets│
   └──────────────┘  └────────────┘  └─────────────┘  └──────────────┘

   ┌────────────┐  ┌───────────────┐
   │help_articles│ │ audit_log 12m │  (lecture admin uniquement)
   └────────────┘  └───────────────┘
```

## 2. Tables & rôle

| Table | Rôle | Propriétaire |
|---|---|---|
| `users` | Profil applicatif (prénom, nom, plan free/premium, quota stockage). Lié 1-1 à `auth.users`. | parent |
| `children` | Enfants d'un parent. Champ `infos_medicales` **chiffré AES-256-GCM côté application**. | parent |
| `preferences` | Thème, langue, notifications, rappels par type, enfant actif. | parent |
| `journal_entries` | Événements horodatés (visite, appel, message, santé, autre) + médias. Horodatage = valeur de preuve (immuable). | parent |
| `calendar_events` | 12 types d'événements, rappel configurable, ICS, enfants concernés. | parent |
| `categories` | Classement coffre-fort (nom, icône, couleur, visible dans les filtres). | parent |
| `documents` | Métadonnées des fichiers du coffre-fort. Binaire = bucket privé `documents`. Soft delete = corbeille 30 j. | parent |
| `shares` | Partage public d'un document par token opaque. Révocable, expirable. | parent (émetteur) |
| `testimony_requests` | Demande envoyée à un témoin, accessible via token public. | parent (émetteur) |
| `testimonies` | Témoignage finalisé. Référence unique `TMG-YYYY-XXXX`. `texte_original`, `texte_ia`, `texte_envoye` conservés → traçabilité. Immuable. | parent (receveur) |
| `ai_analyses` | Analyses IA (reformulation, chat). Quota glissant 30 j (free 3 / premium 10). | parent |
| `subscriptions` | Miroir local des abonnements Stripe (webhooks). | parent |
| `payments` | Historique de paiements (PaymentIntents, factures). Aucune donnée carte. | parent |
| `notifications` | File unifiée push/email/in-app. | parent (destinataire) |
| `sessions` | Vue applicative des sessions actives (device, dernier accès). Révocables. | parent |
| `audit_log` | Journal d'actions sensibles. Rétention 12 mois. | admin (lecture) |
| `help_articles` | FAQ, tutoriels, conseils, modèles. Lecture publique si `published = true`. | admin (écriture) |
| `support_tickets` | Billets de support. Lecture par propriétaire + admin. | parent + admin |

## 3. Relations clés

- `users.id = auth.users.id` (cascade supprime les lignes applicatives).
- `children.user_id → users.id` (cascade). Les enfants sont référencés par **UUID[]** dans `journal_entries.children_ids`, `calendar_events.children_ids`, `documents.children_ids` (dénormalisation volontaire : lectures simples, filtres rapides via index GIN).
- `documents.category_id → categories.id` (SET NULL si la catégorie est supprimée).
- `shares.document_id → documents.id` ; `shares.user_id` dupliqué pour que la RLS reste rapide (évite un JOIN).
- `testimonies.request_id → testimony_requests.id` (1-1).

## 4. Stratégie RLS (Row Level Security)

**Règle d'or :** `RLS enabled` sur **toutes** les tables sensibles. Un utilisateur A ne peut jamais lire une ligne appartenant à un utilisateur B.

Trois patrons de policy :

### 4.1 Propriétaire uniquement (défaut)
Appliqué à `users`, `children`, `preferences`, `journal_entries`, `calendar_events`, `categories`, `documents`, `shares`, `ai_analyses`, `notifications`, `sessions`, `support_tickets`.

```sql
using (auth.uid() = user_id) with check (auth.uid() = user_id)
```

### 4.2 Accès public restreint par token
- `shares` : la lecture publique **ne passe pas** par une policy anon. Elle passe par une fonction serveur qui, après vérif du token et de l'expiration, retourne une **URL signée Supabase Storage valide 15 minutes**.
- `testimony_requests` : aucune exposition directe. Le parcours témoin passe par les routes serveur `/api/temoin/[token]/**` (limitation de débit par IP) qui appellent, en service_role, les fonctions `get_testimony_request_by_token`, `get_testimony_request_people` et `record_testimony_submission` (exécution retirée à anon/authenticated, 0270). L'ancienne vue `public_testimony_request_view` (qui contournait la RLS) a été supprimée par 0270.
- `testimonies` : INSERT public autorisé seulement si la demande liée est active (non révoquée, non expirée). Pas d'UPDATE ni DELETE côté client → immuabilité = valeur de preuve.

### 4.3 Lecture publique conditionnelle
- `help_articles` : policy `SELECT` publique uniquement si `published = true`. Écriture réservée aux admins (`public.is_admin()`).
- `audit_log` : lecture **admins uniquement**. Écriture via `service_role` côté serveur (webhooks, cron).

### 4.4 Admin
Rôle `admin` matérialisé dans `auth.users.raw_app_meta_data->>'role'` (modifiable uniquement par la `service_role`). Fonction helper `public.is_admin()`.

## 5. Soft delete & rétention

| Donnée | Rétention | Mécanisme |
|---|---|---|
| Documents en corbeille | 30 jours | `documents.deleted_at` + cron `purge_expired_trash()` |
| Pièces jointes témoignage | 30 jours | Lifecycle bucket `temoignage-attachments` |
| Compte supprimé | 30 jours | Soft delete `users.deleted_at`, anonymisation puis purge |
| `audit_log` | 12 mois glissants | Cron quotidien `DELETE ... WHERE created_at < now() - interval '12 months'` |

## 6. Quotas (contrôlés en application)

| Plan | Stockage | Analyses IA (30 j glissants) |
|---|---|---|
| Gratuit | 2 Go | 3 |
| Premium | 10 Go | 10 (ou illimité) |

Les quotas sont calculés par la fonction `public.compute_ai_cycle_window(user_id)` et vérifiés à chaque appel au Coach IA côté serveur avant d'invoquer le LLM.
