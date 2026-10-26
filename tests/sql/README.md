# Tests SQL (migrations, RLS, RPC)

Rejoue la base Supabase en mémoire avec [PGlite](https://pglite.dev) (PostgreSQL compilé en WebAssembly) : aucun
Docker, aucun projet Supabase, aucune donnée réelle.

```bash
npm install --save-dev --save-exact @electric-sql/pglite@0.5.11   # une fois
npm run test:sql                       # tout
npm run test:sql -- famille coffre     # seulement les scénarios dont le nom contient un filtre
```

## Ce que fait `run.mjs`

1. `supabase-stubs.sql` : rôles `anon` / `authenticated` / `service_role`, schémas `auth` et `storage` réduits,
   `auth.uid()` / `auth.jwt()` lus depuis `request.jwt.claims` (comme PostgREST).
2. `supabase/storage.sql` **puis** toutes les migrations `supabase/migrations/NNNN_*.sql` dans l'ordre des préfixes :
   le même ordre que `docs/DEPLOIEMENT.md` §1.5. Une nouvelle migration est prise en compte sans rien modifier.
3. Ré-exécution des migrations à partir de `0360` (idempotence, constante `IDEMPOTENT_FROM`).
4. Les scénarios `scenarios/*.test.mjs`, dans l'ordre de leur nom, sur la même base.

`OK*` : le fichier a dû être rejoué après ses `alter type … add value` (une valeur d'enum ajoutée ne peut pas servir
dans le même bloc ; même contrainte dans l'éditeur SQL de Supabase). Sortie en code 1 si une migration est en
échec (scénarios non lancés) ou si une assertion échoue.

## Scénarios

| Fichier | Couvre |
|---|---|
| `0000-socle` | buckets privés (sauf `blog-images`), limite 20 Mo de `documents` (prouve l'ordre storage → migrations), RLS sur toutes les tables, aucune politique `using (true)` ouverte à `anon` |
| `0340-famille` | invitations, gardiens, partage par enfant, fusion de fiches (`merge_child_into_as`) |
| `0360-securite` | audit v3 : santé masquée aux proches, titulaire seul invite un parent, départ de conversation, chemins de pièces jointes, admin `aal2`, essais du code coffre, `search_path` |
| `0370-coffre` | verrou du coffre en base : documents, témoignages, partages et fichiers Storage selon la session déverrouillée |
| `0380-coparentalite` | plan effectif partagé Coparentalité+, garde-fou `users.plan`, statistiques admin |
| `0400-admin` | opérations admin `aal2` (comptes, déconnexion forcée, journal append-only et rétention, support, témoignages en métadonnées seules, centre d'aide versionné et publié seulement) |
| `0410-dossiers` | dossiers et sous-dossiers du coffre (cycles, profondeur, noms), partage d'un dossier avec un parent lié (lecture seule, documents ajoutés plus tard, Storage), tiers / proche / anonyme sans accès, écritures refusées au destinataire, arrêt du partage et fin du lien, réglage de rangement automatique des pièces jointes (0420) |

Écrire un scénario : `export default async function run(db)` ; jouer un utilisateur avec
`set_config('request.jwt.claims', …)` + `set local role authenticated` dans une transaction (voir les helpers `as` /
`svc` des fichiers existants) ; utiliser des UUID et e-mails propres au scénario (la base est partagée) ; mettre
`process.exitCode = 1` en cas d'échec. `export const vaultOpen = true` crée les comptes avec le verrou du coffre
désactivé (scénarios qui ne testent pas le verrou).

## Limites

Ce n'est pas un Supabase complet : ni GoTrue, ni API Storage (`createSignedUrl`), ni Realtime, ni `pg_cron` /
`pg_net`. Les points listés « À vérifier sur Supabase réel » dans `docs/SECURITY_FIXES.md` restent à recetter sur le
projet `eu-west-1`.
