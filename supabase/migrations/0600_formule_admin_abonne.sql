-- =====================================================================
-- Lien Parental — 0600_formule_admin_abonne.sql
-- Un administrateur qui s'abonne reçoit la formule qu'il paie.
--
-- users.plan sert à la fois de rôle ('admin') et de formule : billing_apply_subscription
-- (0460) ne remplace jamais 'admin' (un administrateur reste administrateur), et
-- effective_plan_details (0380) / _credits_period (0520) traitaient 'admin' comme
-- l'offre gratuite. Un administrateur abonné à Coparentalité+ était donc prélevé mais
-- restait en Gratuit : profil, crédits mensuels (5), stockage (2 Go), quotas du Coach.
--
-- public.user_own_tier : formule propre d'un compte ('free' | 'premium' | 'coparentalite').
--   - users.plan premium / coparentalite : inchangé ;
--   - users.plan 'admin' : formule de son abonnement Stripe s'il est actif ou en essai
--     (subscriptions.plan = '<formule>_<période>', ex. coparentalite_monthly) ;
--   - sinon, ou compte supprimé : 'free'.
-- effective_plan_details et _credits_period passent par elle ; leurs droits sont conservés
-- (create or replace). Le rôle admin, is_admin() et la synchronisation Stripe ne changent pas.
--
-- Additive et rejouable. Rollback en bas.
-- =====================================================================

create or replace function public.user_own_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when u.deleted_at is not null then 'free'
           when u.plan::text in ('premium', 'coparentalite') then u.plan::text
           when u.plan::text = 'admin' then coalesce((
             select split_part(s.plan::text, '_', 1)
               from public.subscriptions s
              where s.user_id = u.id
                and s.status in ('active', 'trialing')
                and split_part(s.plan::text, '_', 1) in ('premium', 'coparentalite')
              limit 1
           ), 'free')
           else 'free'
         end
    from public.users u
   where u.id = p_user_id;
$$;

revoke all on function public.user_own_tier(uuid) from public, anon, authenticated;
grant execute on function public.user_own_tier(uuid) to service_role;

comment on function public.user_own_tier(uuid) is
  'Formule propre (free|premium|coparentalite). Un admin abonné reçoit la formule de son abonnement actif ou en essai. service_role uniquement (0600).';

-- Plan effectif (0380) : formule propre via user_own_tier, y compris pour le parent lié.
create or replace function public.effective_plan_details(p_user_id uuid)
returns table (plan text, own_plan text, via text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select coalesce(public.user_own_tier(u.id), 'free') as own
      from public.users u
     where u.id = p_user_id
  ),
  my_kids as (
    select c.id
      from public.children c
     where c.user_id = p_user_id and c.deleted_at is null
    union
    select g.child_id
      from public.child_guardians g
      join public.children c on c.id = g.child_id and c.deleted_at is null
     where g.user_id = p_user_id and g.status = 'active' and g.role = 'parent'
  ),
  linked as (
    select exists (
      select 1
        from my_kids k
        join lateral (
          select c.user_id as uid from public.children c where c.id = k.id
          union all
          select g.user_id from public.child_guardians g
           where g.child_id = k.id and g.status = 'active' and g.role = 'parent'
        ) m on true
        join public.users o on o.id = m.uid and o.deleted_at is null
       where m.uid <> p_user_id
         and public.user_own_tier(o.id) = 'coparentalite'
    ) as has
  )
  select case when me.own = 'free' and linked.has then 'premium' else me.own end,
         me.own,
         case when me.own <> 'free' then 'abonnement' when linked.has then 'famille' end
    from me, linked;
$$;

-- Période de crédits (0520) : même corps, formule lue via user_own_tier.
create or replace function public._credits_period(
  p_user_id uuid, p_now timestamptz,
  out plan text, out period_start timestamptz, out period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created  timestamptz;
  v_s        timestamptz;
  v_e        timestamptz;
  v_base     timestamptz;
  v_k        integer;
  v_sub      boolean := false;
begin
  select case public.user_own_tier(u.id) when 'free' then 'gratuit' else public.user_own_tier(u.id) end,
         u.created_at
    into plan, v_created
    from public.users u where u.id = p_user_id;
  if not found then
    raise exception 'Compte inconnu' using errcode = 'P0002';
  end if;
  if plan <> 'gratuit' then
    select s.current_period_start, s.current_period_end into v_s, v_e
      from public.subscriptions s where s.user_id = p_user_id;
    v_sub := v_s is not null;
  end if;
  if v_sub then
    v_base := case when v_e is not null and p_now >= v_e then v_e else v_s end;
  else
    v_base := v_created;
  end if;
  v_k := public._credits_months_elapsed(v_base, p_now);
  period_start := public._credits_add_months(v_base, v_k);
  period_end := public._credits_add_months(v_base, v_k + 1);
  if v_sub and v_e is not null and p_now < v_e and period_end > v_e then
    period_end := v_e;
  end if;
end;
$$;

-- =====================================================================
-- Rollback : rejouer les définitions de effective_plan_details (0380) et de
-- _credits_period (0520), puis : drop function if exists public.user_own_tier(uuid);
-- =====================================================================
