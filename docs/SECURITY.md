# Sécurité & RGPD — Lien Parental

Document de référence pour la sécurité des données, la conformité RGPD et les mécanismes cryptographiques utilisés par Lien Parental.

## 1. Hébergement & localisation des données

- **Supabase région UE** (Francfort ou Paris) : base Postgres, Storage, Auth.
- **Stripe** : conforme PCI-DSS Niveau 1. Aucune donnée carte ne transite ni n'est stockée sur nos serveurs ; nous ne stockons que les `customer_id`, `subscription_id`, `payment_intent_id` et URLs de facture.
- **API LLM** (fournisseur à sélectionner) : traitements soumis à DPA. Les données médicales ne sont **jamais** transmises à l'IA sans action explicite du parent.
- **E-mails transactionnels** : prestataire européen (Resend EU / Scaleway TEM / SendinBlue).

## 2. Chiffrement au repos

### 2.1 Chiffrement disque (Supabase, infra)
Postgres et Storage utilisent le chiffrement au repos AES-256 fourni par l'infrastructure Supabase (sous-jacent AWS/GCP EU).

### 2.2 Chiffrement applicatif (en plus du disque)
**Champ `children.infos_medicales` — données de santé = catégorie particulière RGPD.**

Pattern (implémentation dans `lib/crypto` dans une tâche ultérieure) :

- Algorithme : **AES-256-GCM**
- Clé maître : variable `APP_ENCRYPTION_KEY` (32 octets, générée par `openssl rand -base64 32`, stockée dans Vercel/Supabase env, jamais commitée)
- Dérivation : HKDF-SHA256 avec un sel par utilisateur (stocké dans `users` ou dérivé de `user_id`), afin que la compromission d'une ligne ne révèle pas les autres
- IV : 12 octets aléatoires par chiffrement
- Tag d'authentification : 16 octets (GCM)
- Format stocké en BDD (JSONB) :
  ```json
  { "ciphertext": "<base64>", "iv": "<base64>", "tag": "<base64>", "v": 1 }
  ```
- **Garantie** : un administrateur de la base, un dump SQL volé, ou une faille de RLS n'exposent **pas** les informations médicales. La clé vit hors BDD.

Les colonnes sensibles non médicales (nom, prénom de l'enfant...) restent en clair pour pouvoir être lues/indexées normalement par l'application. Le compromis est explicite : le médical bénéficie du double chiffrement, le reste du chiffrement disque uniquement.

## 3. Authentification & mots de passe

- Gérée par **Supabase Auth (GoTrue)**.
- Mots de passe hashés avec **bcrypt** (coût configurable) ou **argon2id** selon la version GoTrue déployée. Aucun mot de passe en clair, aucun hash faible (jamais MD5/SHA1).
- Politique mot de passe appliquée côté UI et serveur : 8 caractères minimum, 1 majuscule, 1 chiffre ou symbole (M02-04).
- E-mail vérifié obligatoire pour accéder au coffre-fort et créer une demande de témoignage.
- **2FA** : TOTP optionnel (M11). Attribut `users.mfa_enabled`.
- **Code de vérification e-mail** : 6 chiffres, expiration 15 min, 5 essais max avant blocage temporaire.

## 4. Autorisation : RLS (Row Level Security)

Détaillée dans `docs/DATA_MODEL.md`. En résumé :
- RLS activée sur toutes les tables sensibles.
- Policies par défaut : `auth.uid() = user_id`.
- Les webhooks Stripe, cron, écritures `audit_log` passent par la `service_role` (bypass RLS) **uniquement depuis le serveur**. La `service_role` key n'est **jamais** exposée au navigateur.

## 5. URLs signées courte durée (Storage)

- Tous les buckets sont **privés**.
- L'accès à un fichier (documents, avatars, pièces jointes témoignage) se fait **exclusivement** via `createSignedUrl` côté serveur, après vérification des droits.
- **TTL : 15 minutes.** Un lien expiré force la régénération, ce qui réimpose la vérification d'autorisation.
- Pour les partages publics (`shares`), la fonction serveur vérifie `revoked_at IS NULL AND expires_at > now()` avant d'émettre l'URL signée, et incrémente `download_count` (plafonné par `max_downloads` si défini).
- Pour les témoignages, les pièces jointes téléchargeables par le parent sont également servies par URL signée 15 min.

## 6. Partages & liens témoin

- **Tokens cryptographiquement sûrs** : 32+ octets, `crypto.randomBytes(32).toString('base64url')`, stockés sans hash (opaques, non devinables).
- `expires_at` obligatoire sur `shares` et `testimony_requests`.
- Révocation : `revoked_at = now()` → le lien est invalidé instantanément.
- Témoignage soumis = `testimonies` immuable (pas d'UPDATE ni DELETE côté client, policy RLS stricte).
- Hash IP du témoin stocké pour preuve légère (`ip_hash` = SHA-256 + salt applicatif → non réversible).

## 7. Rétention des données

| Donnée | Durée | Justification |
|---|---|---|
| Documents en corbeille | **30 jours** | Récupération possible, puis purge réelle (BDD + Storage) via cron |
| Pièces jointes témoignage | **30 jours** | Lifecycle bucket `temoignage-attachments`. Le texte du témoignage reste. |
| Compte supprimé | **30 jours** après demande | Soft delete + anonymisation progressive, puis purge |
| `audit_log` | **12 mois glissants** | Preuve, conformité ; purge quotidienne au-delà |
| Sessions révoquées | **90 jours** | Pour affichage historique côté utilisateur |
| Analyses IA archivées | Illimité (archivées) | L'utilisateur peut nettoyer manuellement |

## 8. Minimisation & données sensibles

- **Médical** : jamais envoyé à l'IA sans consentement explicite (CDC M04).
- **IP** : stockée sous forme de hash salé (`ip_hash`), jamais en clair.
- **Témoin** : ne crée pas de compte, aucune donnée personnelle n'est conservée au-delà du témoignage soumis.
- Les champs facultatifs restent facultatifs (taille, poids, couleurs). Le CDC indique « informations incomplètes » si manquants, sans jamais bloquer l'usage.

## 9. Journalisation & audit

- Table `audit_log` : `login`, `logout`, `password.reset`, `mfa.enable`, `mfa.disable`, `document.create`, `document.share.create`, `document.share.revoke`, `child.create`, `child.delete`, `testimony.request.create`, `testimony.received`, `plan.upgrade`, `plan.cancel`, `account.delete`, etc.
- Lecture **admin uniquement** via RLS + helper `public.is_admin()`.
- Les logs applicatifs (Vercel/Supabase) ne contiennent **jamais** de valeurs médicales ni de contenus de messages/témoignages — seulement des identifiants techniques.

## 10. Paiements : PCI-DSS

- **Stripe Checkout / Elements**. Les champs carte sont tokenisés dans un iframe Stripe. Aucune donnée carte ne touche notre backend.
- Portée PCI-DSS réduite à **SAQ-A**.
- Webhooks Stripe signés HMAC vérifiés côté serveur avant toute écriture.

## 11. Transport

- **TLS 1.3** partout (Vercel + Supabase).
- HSTS activé, cookies de session `Secure`, `HttpOnly`, `SameSite=Lax`.
- CSP stricte côté PWA (à définir avec la liste finale des origines : Supabase, Stripe, LLM API).

## 12. Droits RGPD de l'utilisateur

Fournis par l'application via le profil (M10/M11) :
- **Accès** : export de toutes les données personnelles au format JSON + ZIP des documents.
- **Rectification** : édition de profil et des enfants.
- **Effacement** : suppression de compte → soft delete 30 j puis purge totale (BDD + Storage).
- **Portabilité** : export JSON structuré, intervalle 7 jours entre deux exports pour éviter l'abus.
- **Opposition / limitation** : désactivation IA, désactivation notifications.
- Base légale : contrat (fourniture du service) + consentement explicite pour les données médicales.

## 13. Rotation & secrets

- Clés secrètes stockées **uniquement** dans les variables d'environnement Vercel/Supabase (jamais en Git).
- Rotation planifiée : `APP_ENCRYPTION_KEY` chaque 12 mois (migration ciphertext → ré-encrypt via version `v` dans le JSONB).
- `SUPABASE_SERVICE_ROLE_KEY` et `STRIPE_WEBHOOK_SECRET` rotatés en cas de compromission suspectée.
