-- =====================================================================
-- 0480 — La 2FA n'est plus obligatoire pour l'administration.
--
-- Choix produit : l'accès admin repose désormais sur la porte masquée
-- (lien secret /console) + le rôle vérifié en base (public.is_admin()).
-- La double authentification reste possible et recommandée, mais n'est
-- plus bloquante.
--
-- is_admin_aal2() était la SEULE clause « admin + session aal2 » utilisée
-- par toutes les politiques RLS du back-office et par admin_stats_assert().
-- On la redéfinit en un seul point pour retirer l'exigence aal2 partout,
-- sans toucher les dizaines de politiques qui l'appellent. Le nom et la
-- signature sont conservés (compatibilité).
--
-- NB : ceci ne concerne QUE les chemins d'administration. La protection
-- des données des utilisateurs par la 2FA de leur propre compte
-- (mfa_required / mfa_satisfied) est un mécanisme distinct, inchangé.
--
-- Non destructif, rejouable.
-- =====================================================================

create or replace function public.is_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Rôle admin seul : la 2FA n'est plus exigée pour l'administration (0480).
  select coalesce(public.is_admin(), false);
$$;

revoke all on function public.is_admin_aal2() from public;
grant execute on function public.is_admin_aal2() to anon, authenticated, service_role;

comment on function public.is_admin_aal2() is
  'Rôle admin (public.is_admin()). La 2FA n''est plus exigée pour l''administration (0480 ; retire la clause aal2 de 0360/M7). Nom conservé : appelé par les politiques RLS admin et admin_stats_assert().';
