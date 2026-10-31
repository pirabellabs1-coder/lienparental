-- =====================================================================
-- Lien Parental — 0630_prenoms_enfants.sql
-- Un enfant = une fiche (retour utilisateur du 31/10/2026 : « Sharmine » apparaissait deux fois).
--
--   1. Index unique : deux enfants actifs d'un même compte ne peuvent pas porter le même prénom
--      (normalisation _family_norm : casse, accents, tirets et espaces ignorés).
--   2. list_child_name_conflicts() : ma fiche et une fiche que l'autre parent me partage portent le
--      même prénom mais PAS la même date de naissance. list_merge_candidates (0340) n'exige que des
--      dates identiques pour proposer la fusion : ces paires n'étaient jamais signalées. L'écran
--      Coparents invite à corriger la date de la bonne fiche, puis la fusion devient possible.
-- Idempotente. Rollback en fin de fichier.
-- =====================================================================

create unique index if not exists children_owner_prenom_uniq
  on public.children (user_id, public._family_norm(prenom))
  where deleted_at is null;

create or replace function public.list_child_name_conflicts()
returns table (my_child_id uuid, my_child_prenom text, shared_child_id uuid, shared_child_prenom text, shared_owner_prenom text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public._family_assert_caller();
begin
  return query
    select mine.id, mine.prenom, sh.id, sh.prenom, coalesce(o.prenom, '')
      from public.children mine
      join public.child_guardians g on g.user_id = v_me and g.status = 'active' and g.role = 'parent'
      join public.children sh on sh.id = g.child_id and sh.deleted_at is null
      join public.users o on o.id = sh.user_id
     where mine.user_id = v_me
       and mine.deleted_at is null
       and mine.id <> sh.id
       and mine.date_naissance is distinct from sh.date_naissance
       and public._family_norm(mine.prenom) = public._family_norm(sh.prenom)
       and not exists (
         select 1 from public.child_merge_dismissals d
          where d.user_id = v_me and d.my_child_id = mine.id and d.shared_child_id = sh.id
       )
     order by mine.prenom
     limit 20;
end;
$$;
revoke all on function public.list_child_name_conflicts() from public, anon;
grant execute on function public.list_child_name_conflicts() to authenticated;

-- ---------------------------------------------------------------------
-- Retour arrière :
-- drop function if exists public.list_child_name_conflicts();
-- drop index if exists public.children_owner_prenom_uniq;
-- ---------------------------------------------------------------------
