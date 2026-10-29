-- =====================================================================
-- Lien Parental — 0540_securite_base.sql
-- Durcissement issu de l'analyse de sécurité Supabase (advisors) sur la
-- base de production, 29/10/2026. Aucun changement de comportement pour
-- l'application : uniquement des droits inutiles retirés.
--
--   1. search_path figé sur les 4 fonctions signalées
--      (function_search_path_mutable) ;
--   2. fonctions de déclencheur retirées des rôles applicatifs
--      (anon_security_definer_function_executable) : un déclencheur ne
--      s'appelle pas par RPC. is_admin() / is_admin_aal2() RESTENT
--      exécutables par anon : les politiques de lecture des contenus
--      publics (Guide, blog, FAQ, modèles, partenaires) les appellent pour
--      tout visiteur (avertissement de l'analyseur accepté, voir 0480) ;
--   3. TRUNCATE retiré à anon et authenticated sur toutes les tables du
--      schéma public (TRUNCATE ignore la RLS ; l'application ne s'en sert
--      jamais), y compris pour les tables créées plus tard.
-- =====================================================================

-- 1. search_path figé (pg_temp en dernier : aucune table temporaire ne peut masquer une table réelle).
alter function public.current_user_id() set search_path = public, pg_temp;
alter function public.handle_updated_at() set search_path = public, pg_temp;
alter function public.soft_delete_document(uuid) set search_path = public, pg_temp;
alter function public.restore_document(uuid) set search_path = public, pg_temp;

-- 2. Pas d'exécution par un visiteur non connecté.
revoke execute on function public.handle_auth_user_updated() from public, anon, authenticated;
revoke execute on function public.handle_mfa_factor_change() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
-- NE PAS retirer is_admin() / is_admin_aal2() à anon : appliqué brièvement en production le
-- 29/10/2026, ce retrait a rendu illisibles par les visiteurs toutes les tables de contenus publics
-- (« permission denied for function is_admin_aal2 »). Droits réaffirmés ici.
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_admin_aal2() to anon, authenticated, service_role;

-- 3. TRUNCATE : jamais pour les rôles applicatifs.
do $$
declare
  t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate on table public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- ---------------------------------------------------------------------
-- Retour arrière (à exécuter à la main si nécessaire) :
-- alter function public.current_user_id() reset search_path;   (idem pour les 3 autres)
-- grant truncate on all tables in schema public to anon, authenticated;
-- alter default privileges in schema public grant truncate on tables to anon, authenticated;
-- ---------------------------------------------------------------------
