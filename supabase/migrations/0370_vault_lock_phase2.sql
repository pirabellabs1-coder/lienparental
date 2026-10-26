-- =====================================================================
-- Lien Parental — 0370_vault_lock_phase2.sql
-- Verrou du coffre-fort, PHASE 2 : appliqué EN BASE (prévu par 0290,
-- prédicat fermé par défaut depuis 0360 §10).
--
-- Tant que le coffre n'est pas déverrouillé pour la session Supabase
-- courante (ligne non expirée dans vault_unlocks pour le claim
-- `session_id` du JWT, écrite par le serveur après vérification du code,
-- du mot de passe ou de l'empreinte), un client `authenticated` ne lit,
-- n'écrit et ne signe RIEN du coffre :
--
--   1. vault_lock_settings : tout changement d'époque (nouveau code, clé
--      retirée) ou réactivation du verrou révoque les déverrouillages en base
--      (miroir de l'invalidation des cookies, lib/vault-lock/session.ts) ;
--   2. politiques RESTRICTIVE `vault_unlocked` (en ET avec les politiques
--      existantes, propriétaire comme famille) sur :
--        documents, testimony_requests, testimonies, testimony_reviews,
--        shares, lawyer_shares, lawyer_share_access_log
--      → un gardien qui lit un document partagé par l'autre parent est soumis
--        à la même règle : SON coffre doit être déverrouillé ;
--      → `shares` / `lawyer_shares` portent des jetons d'accès aux documents :
--        les laisser lisibles contournerait le verrou ;
--   3. Storage, bucket `documents` : RESTRICTIVE sur les objets qui sont des
--      fichiers du coffre (ligne `documents` correspondante). Les pièces du
--      Journal et les justificatifs (même bucket, `<uid>/journal/…`) ne sont
--      PAS concernés : le Journal reste utilisable coffre verrouillé.
--
-- Non concernés (volontairement) :
--   * service_role (bypassrls) : routes publiques du témoin
--     (/api/temoin/[token]), partage par lien (/api/partages/[token]),
--     partage avocat (/api/partage/[token]), import depuis la messagerie
--     (vault_add_from_source), purge, export serveur ;
--   * fonctions SECURITY DEFINER appelées par anon (get_testimony_request_*) ;
--   * `categories` : noms de rubriques seulement (aucun contenu) et lus hors
--     du coffre (messagerie, « Ranger dans le coffre ») ; leurs compteurs
--     viennent de `documents` et tombent à 0 quand le coffre est verrouillé ;
--   * `vault_imports` (statut d'import des pièces de messagerie).
--
-- PRÉREQUIS DE DÉPLOIEMENT : VAULT_LOCK_SECRET et SUPABASE_SERVICE_ROLE_KEY
-- configurés (sinon le serveur ne peut pas écrire vault_unlocks et le coffre
-- reste fermé en base pour tout le monde). Voir docs/MISE_EN_SERVICE.md.
--
-- soft_delete_document / restore_document (0101, jamais redéfinies depuis) :
-- SECURITY INVOKER et filtre `user_id = auth.uid()` : un gardien ne peut pas
-- mettre à la corbeille le document d'un autre adulte ; la politique ci-dessous
-- s'y applique aussi (coffre verrouillé → P0002). Aucune correction requise.
--
-- Ré-exécutable. Aucune migration antérieure modifiée. Rollback en fin de
-- fichier. Tests : docs/SECURITY_FIXES.md § « Phase 2 du verrou (0370) ».
-- =====================================================================


-- =====================================================================
-- 1. Révocation des déverrouillages en base (époque, réactivation)
-- =====================================================================
create or replace function public.vault_lock_settings_revoke_unlocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.epoch is distinct from old.epoch or (new.enabled and not old.enabled) then
    delete from public.vault_unlocks u where u.user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.vault_lock_settings_revoke_unlocks() from public, anon, authenticated;

drop trigger if exists trg_vault_lock_settings_revoke_unlocks on public.vault_lock_settings;
create trigger trg_vault_lock_settings_revoke_unlocks
  after update of epoch, enabled on public.vault_lock_settings
  for each row execute function public.vault_lock_settings_revoke_unlocks();


-- =====================================================================
-- 2. Tables du coffre : RESTRICTIVE « coffre déverrouillé »
-- =====================================================================
-- `(select ...)` : initPlan, évalué une fois par requête (pas par ligne).
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents',
    'testimony_requests', 'testimonies', 'testimony_reviews',
    'shares', 'lawyer_shares', 'lawyer_share_access_log'
  ]
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop policy if exists vault_unlocked on public.%I', t);
    execute format(
      'create policy vault_unlocked on public.%I as restrictive for all to authenticated '
      'using ((select public.vault_unlocked())) with check ((select public.vault_unlocked()))',
      t
    );
  end loop;
end $$;


-- =====================================================================
-- 3. Storage : fichiers du coffre dans le bucket `documents`
-- =====================================================================
-- SECURITY DEFINER : la recherche ne doit PAS passer par la RLS de
-- `documents` (sinon, coffre verrouillé, aucune ligne visible et le
-- fichier serait pris pour une pièce du Journal). Ne renvoie qu'un booléen
-- pour un chemin exact (chemins non devinables : `<uid>/<uuid>-…`).
create or replace function public.vault_is_document_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name is not null
     and exists (select 1 from public.documents d where d.storage_path = p_name);
$$;
revoke all on function public.vault_is_document_object(text) from public, anon;
grant execute on function public.vault_is_document_object(text) to authenticated, service_role;

comment on function public.vault_is_document_object(text) is
  'Vrai si l''objet du bucket documents est le fichier d''un document du coffre (0370). Prédicat de la politique Storage « documents vault unlocked ».';

-- Index unique documents.storage_path (0004) : une recherche par objet.
-- Envoi d'un nouveau document : l'objet n'a pas encore de ligne (passe),
-- puis l'INSERT de `documents` est refusé par la politique de la section 2
-- et lib/data/vault.ts supprime l'objet orphelin.
drop policy if exists "documents vault unlocked" on storage.objects;
create policy "documents vault unlocked" on storage.objects
  as restrictive
  for all to authenticated
  using (
    bucket_id is distinct from 'documents'
    or (select public.vault_unlocked())
    or not public.vault_is_document_object(name)
  )
  with check (
    bucket_id is distinct from 'documents'
    or (select public.vault_unlocked())
    or not public.vault_is_document_object(name)
  );


-- =====================================================================
-- 4. Purge des déverrouillages expirés (tâche planifiée, service_role)
-- =====================================================================
create or replace function public.vault_purge_expired_unlocks()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.vault_unlocks u where u.expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.vault_purge_expired_unlocks() from public, anon, authenticated;
grant execute on function public.vault_purge_expired_unlocks() to service_role;


-- =====================================================================
-- 5. CONTRÔLES CI (résultat attendu : aucune ligne)
-- =====================================================================
-- -- Table du coffre sans politique restrictive vault_unlocked :
-- select t from unnest(array['documents','testimony_requests','testimonies','testimony_reviews',
--   'shares','lawyer_shares','lawyer_share_access_log']) t
--  where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
--                      and p.policyname = 'vault_unlocked' and p.permissive = 'RESTRICTIVE');
-- -- Politique Storage absente :
-- select 1 where not exists (select 1 from pg_policies where schemaname = 'storage'
--   and tablename = 'objects' and policyname = 'documents vault unlocked' and permissive = 'RESTRICTIVE');


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- do $$ declare t text; begin
--   foreach t in array array['documents','testimony_requests','testimonies','testimony_reviews',
--                            'shares','lawyer_shares','lawyer_share_access_log'] loop
--     if to_regclass(format('public.%I', t)) is not null then
--       execute format('drop policy if exists vault_unlocked on public.%I', t);
--     end if;
--   end loop;
-- end $$;
-- drop policy if exists "documents vault unlocked" on storage.objects;
-- drop function if exists public.vault_is_document_object(text);
-- drop function if exists public.vault_purge_expired_unlocks();
-- drop trigger if exists trg_vault_lock_settings_revoke_unlocks on public.vault_lock_settings;
-- drop function if exists public.vault_lock_settings_revoke_unlocks();
-- (vault_unlocked() reste celle de 0360 §10.)
-- =====================================================================
