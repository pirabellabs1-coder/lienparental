-- =====================================================================
-- Lien Parental — 0100_rls.sql
-- Row Level Security : règle d'or = un utilisateur A ne peut JAMAIS
-- lire une ligne d'un utilisateur B. RLS activé sur TOUTES les tables
-- sensibles. Les exceptions (lien de témoignage, lien de partage,
-- articles d'aide) sont explicites et portent sur colonnes restreintes.
--
-- NOTE SÉCURITÉ MAJEURE — Flux témoin public :
-- Le flux témoin public NE TOUCHE JAMAIS les tables testimony_requests
-- ni testimonies directement depuis la clé anon : il appelle uniquement
-- les deux fonctions SECURITY DEFINER définies dans 0101_functions.sql
-- (`get_testimony_request_by_token`, `record_testimony_submission`).
-- Toute policy anon directe sur ces tables est une fuite potentielle
-- (SELECT * contourne la restriction de colonnes). On REVOKE ALL en
-- bas de ce fichier pour s'assurer qu'aucun grant implicite ne traîne.
-- =====================================================================

-- --- Helper : utilisateur courant est propriétaire de la ligne ---------
-- auth.uid() = user_id est la règle par défaut.

-- =====================================================================
-- USERS
-- =====================================================================
alter table public.users enable row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select using (auth.uid() = id);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Pas de policy INSERT côté client : la ligne est créée par un trigger
-- côté auth.users (ou par la service_role lors de l'inscription).
-- Pas de DELETE côté client : la suppression du compte transite par
-- un endpoint serveur (anonymisation + soft delete + purge 30 j).


-- =====================================================================
-- CHILDREN
-- =====================================================================
alter table public.children enable row level security;

drop policy if exists children_crud_self on public.children;
create policy children_crud_self on public.children
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- =====================================================================
-- PREFERENCES
-- =====================================================================
alter table public.preferences enable row level security;

drop policy if exists preferences_crud_self on public.preferences;
create policy preferences_crud_self on public.preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- =====================================================================
-- JOURNAL + CALENDAR
-- =====================================================================
alter table public.journal_entries enable row level security;

drop policy if exists journal_crud_self on public.journal_entries;
create policy journal_crud_self on public.journal_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.calendar_events enable row level security;

drop policy if exists calendar_crud_self on public.calendar_events;
create policy calendar_crud_self on public.calendar_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- =====================================================================
-- VAULT : categories, documents, shares
-- =====================================================================
alter table public.categories enable row level security;

drop policy if exists categories_crud_self on public.categories;
create policy categories_crud_self on public.categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.documents enable row level security;

drop policy if exists documents_crud_self on public.documents;
create policy documents_crud_self on public.documents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.shares enable row level security;

-- Propriétaire : plein CRUD sur ses propres partages.
drop policy if exists shares_crud_self on public.shares;
create policy shares_crud_self on public.shares
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE : la lecture publique via `token` ne passe PAS par une policy
-- "anon select by token" (fuite si l'attaquant devine un token). Elle
-- passe par une fonction SECURITY DEFINER côté serveur qui :
--   1) prend le token,
--   2) vérifie revoked_at IS NULL AND expires_at > now(),
--   3) retourne un payload minimal + une URL signée Supabase (15 min)
--      pour télécharger le fichier dans le bucket privé "documents".
-- Les clients anonymes n'ont donc AUCUN accès direct en lecture à la
-- table `shares` ni au bucket `documents`.


-- =====================================================================
-- TESTIMONIES : accès témoin anonyme par token (colonnes restreintes)
-- =====================================================================
alter table public.testimony_requests enable row level security;

-- Parent propriétaire : CRUD complet sur ses demandes.
drop policy if exists testimony_requests_crud_self on public.testimony_requests;
create policy testimony_requests_crud_self on public.testimony_requests
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Témoin anonyme : AUCUNE policy directe sur testimony_requests.
-- Les anciennes policies `testimony_requests_public_by_token` (SELECT)
-- et `testimony_requests_public_update_status` (UPDATE) permettaient à
-- la clé anon de faire `SELECT *` (fuite de user_id, token, message_parent)
-- ou `UPDATE` arbitraire. Elles sont explicitement supprimées ici.
-- Le flux témoin passe exclusivement par les fonctions SECURITY DEFINER
-- `public.get_testimony_request_by_token(text)` et
-- `public.record_testimony_submission(text, jsonb)` (cf. 0101_functions.sql).
drop policy if exists testimony_requests_public_by_token on public.testimony_requests;
drop policy if exists testimony_requests_public_update_status on public.testimony_requests;

-- --- testimonies ---
alter table public.testimonies enable row level security;

-- Parent : lecture seule des témoignages reçus (immutables).
drop policy if exists testimonies_select_self on public.testimonies;
create policy testimonies_select_self on public.testimonies
  for select
  using (auth.uid() = user_id);

-- Témoin anonyme : AUCUNE policy directe sur testimonies.
-- L'insertion passe uniquement par la fonction SECURITY DEFINER
-- `public.record_testimony_submission(text, jsonb)` qui valide le token
-- et contrôle les colonnes écrites. Les témoignages restent immuables
-- côté client (aucun UPDATE / DELETE).
drop policy if exists testimonies_insert_public on public.testimonies;


-- =====================================================================
-- AI + SUBSCRIPTIONS + PAYMENTS
-- =====================================================================
alter table public.ai_analyses enable row level security;

drop policy if exists ai_analyses_crud_self on public.ai_analyses;
create policy ai_analyses_crud_self on public.ai_analyses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.subscriptions enable row level security;

-- Lecture seule côté client ; les écritures passent par les webhooks
-- Stripe appelés avec la service_role (qui bypass RLS).
drop policy if exists subscriptions_select_self on public.subscriptions;
create policy subscriptions_select_self on public.subscriptions
  for select
  using (auth.uid() = user_id);

alter table public.payments enable row level security;

drop policy if exists payments_select_self on public.payments;
create policy payments_select_self on public.payments
  for select
  using (auth.uid() = user_id);


-- =====================================================================
-- SYSTEM : notifications, sessions, audit, help, support
-- =====================================================================
alter table public.notifications enable row level security;

drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- INSERT = service_role (job rappels / webhooks).

alter table public.sessions enable row level security;

drop policy if exists sessions_select_self on public.sessions;
create policy sessions_select_self on public.sessions
  for select using (auth.uid() = user_id);

drop policy if exists sessions_delete_self on public.sessions;
create policy sessions_delete_self on public.sessions
  for delete using (auth.uid() = user_id);
-- Révocation (UPDATE revoked_at) = fonction serveur dédiée.

-- --- audit_log : lecture admin uniquement, écriture service_role ---
alter table public.audit_log enable row level security;

drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin on public.audit_log
  for select
  using (public.is_admin());
-- Pas de INSERT/UPDATE/DELETE pour les clients → tout passe par
-- service_role (côté serveur) ou l'admin via back-office.

-- --- help_articles : lecture publique des articles publiés ---
alter table public.help_articles enable row level security;

drop policy if exists help_articles_public_read on public.help_articles;
create policy help_articles_public_read on public.help_articles
  for select
  to anon, authenticated
  using (published = true);

drop policy if exists help_articles_admin_write on public.help_articles;
create policy help_articles_admin_write on public.help_articles
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- support_tickets : propriétaire + admin ---
alter table public.support_tickets enable row level security;

drop policy if exists support_select on public.support_tickets;
create policy support_select on public.support_tickets
  for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists support_insert_self on public.support_tickets;
create policy support_insert_self on public.support_tickets
  for insert
  with check (auth.uid() = user_id);

drop policy if exists support_update on public.support_tickets;
create policy support_update on public.support_tickets
  for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());


-- =====================================================================
-- REVOKE DIRECT ACCESS — tables témoignage (anon)
-- Le flux témoin public passe exclusivement par les fonctions
-- SECURITY DEFINER de 0101_functions.sql. Aucun grant direct ne doit
-- subsister sur ces tables côté clé anon.
-- =====================================================================
revoke all on table public.testimony_requests from anon;
revoke all on table public.testimonies         from anon;
