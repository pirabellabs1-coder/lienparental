-- =====================================================================
-- Lien Parental — 0380_plan_coparentalite.sql
-- Troisième formule payante « Coparentalité+ » (au-dessus de Premium).
--
--   1. Enums : plan_tier += 'coparentalite' ;
--              subscription_plan += 'coparentalite_monthly', 'coparentalite_yearly'.
--   2. Plan effectif (accès partagé) : effective_plan_details(user) /
--      effective_plan(user). Un adulte titulaire ou gardien `parent` ACTIF
--      d'un enfant dont un autre titulaire / parent actif est en
--      Coparentalité+ obtient les avantages PREMIUM (pas Coparentalité+).
--   3. compute_ai_cycle_window (0101) : quota selon le plan effectif.
--   4. support_tickets : priorité initiale posée par la base selon le plan
--      effectif (assistance prioritaire), non modifiable par l'utilisateur.
--   5. Statistiques admin : abonnés Coparentalité+ à un instant (MRR, répartition).
--
-- Garde-fou users.plan (0220, réécrit en SECURITY INVOKER par 0270 B1) :
-- il bloque TOUTE modification de plan par `authenticated` / `anon`, quelle
-- que soit la valeur : 'coparentalite' est donc couvert sans changement.
-- Aucune contrainte CHECK ne porte sur users.plan / subscriptions.plan
-- (ce sont des enums) : seuls les enums sont étendus.
--
-- Note PostgreSQL : une valeur ajoutée par ALTER TYPE ... ADD VALUE n'est
-- utilisable qu'après COMMIT. Toutes les comparaisons de ce fichier passent
-- donc par `::text` (aucun littéral casté vers l'enum dans cette transaction).
--
-- Additive et ré-exécutable. Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. ENUMS
-- =====================================================================
alter type public.plan_tier add value if not exists 'coparentalite' after 'premium';
alter type public.subscription_plan add value if not exists 'coparentalite_monthly';
alter type public.subscription_plan add value if not exists 'coparentalite_yearly';


-- =====================================================================
-- 2. PLAN EFFECTIF
-- =====================================================================
-- Retourne une ligne (plan, own_plan, via) ; aucune ligne si l'utilisateur
-- n'existe pas. Valeurs : 'free' | 'premium' | 'coparentalite' ;
-- via : 'abonnement' | 'famille' | NULL. Un admin (users.plan = 'admin')
-- n'a pas d'avantage payant propre.
-- Membres retenus : titulaire (children.user_id) et gardiens `parent`
-- actifs ; les proches n'apportent ni ne reçoivent rien.
create or replace function public.effective_plan_details(p_user_id uuid)
returns table (plan text, own_plan text, via text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select case
             when u.deleted_at is null and u.plan::text in ('premium', 'coparentalite') then u.plan::text
             else 'free'
           end as own
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
         and o.plan::text = 'coparentalite'
    ) as has
  )
  select case when me.own = 'free' and linked.has then 'premium' else me.own end,
         me.own,
         case when me.own <> 'free' then 'abonnement' when linked.has then 'famille' end
    from me, linked;
$$;

create or replace function public.effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select d.plan from public.effective_plan_details(p_user_id) d), 'free');
$$;

-- Lecture du plan d'un TIERS : réservée au serveur (service_role).
revoke all on function public.effective_plan_details(uuid) from public, anon, authenticated;
revoke all on function public.effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.effective_plan_details(uuid) to service_role;
grant execute on function public.effective_plan(uuid) to service_role;

comment on function public.effective_plan(uuid) is
  'Plan effectif (free|premium|coparentalite) : plan propre, relevé à premium si un parent lié (même enfant, titulaire ou parent actif) est en Coparentalité+. service_role uniquement. Voir docs/FAMILLE.md §12.';


-- =====================================================================
-- 3. QUOTA COACH IA (fonction historique, non utilisée par le code)
-- =====================================================================
-- Même signature que 0101 ; privilèges conservés par create or replace
-- (service_role uniquement depuis 0270).
create or replace function public.compute_ai_cycle_window(p_user_id uuid)
returns table (
  window_start timestamptz,
  window_end   timestamptz,
  used         integer,
  quota        integer,     -- NULL = illimité
  remaining    integer      -- NULL = illimité
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exists    boolean;
  v_plan      text;
  v_quota     integer;
  v_used      integer;
  v_start     timestamptz := now() - interval '30 days';
  v_end       timestamptz := now();
begin
  select true into v_exists from public.users u where u.id = p_user_id;
  if v_exists is null then
    raise exception 'User % not found', p_user_id;
  end if;

  v_plan := public.effective_plan(p_user_id);
  -- Aligné sur ANALYSIS_QUOTA_BY_PLAN (lib/billing/plans.ts).
  v_quota := case v_plan
    when 'coparentalite' then 10
    when 'premium'       then 10
    else 3
  end;

  select count(*)::int
    into v_used
    from public.ai_analyses a
   where a.user_id = p_user_id
     and a.archived = false
     and a.cycle >= v_start
     and a.cycle <= v_end;

  window_start := v_start;
  window_end   := v_end;
  used         := coalesce(v_used, 0);
  quota        := v_quota;
  remaining    := case when v_quota is null then null else greatest(v_quota - used, 0) end;
  return next;
end;
$$;


-- =====================================================================
-- 4. PRIORITÉ DES TICKETS DE SUPPORT
-- =====================================================================
-- low : gratuit · normal : premium (y compris via la famille) · high :
-- coparentalite (assistance prioritaire) · urgent : posé par un admin.
-- Miroir TS : supportPriorityFor() (lib/billing/plans.ts).

-- Priorité de l'appelant (auth.uid()) : ne révèle que son propre niveau.
create or replace function public._my_support_priority()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case public.effective_plan(auth.uid())
           when 'coparentalite' then 'high'
           when 'premium'       then 'normal'
           else 'low'
         end
   where auth.uid() is not null;
$$;

revoke all on function public._my_support_priority() from public, anon;
grant execute on function public._my_support_priority() to authenticated, service_role;

-- SECURITY INVOKER : current_user = rôle PostgREST réel (même principe que
-- guard_users_plan, 0270 B1). Le serveur (service_role) et les admins
-- gardent la main sur la priorité.
create or replace function public.support_tickets_set_priority()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not coalesce(public.is_admin(), false) then
    if tg_op = 'INSERT' then
      new.priority := coalesce(public._my_support_priority(), 'low');
    elsif new.priority is distinct from old.priority then
      new.priority := old.priority;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.support_tickets_set_priority() from public, anon, authenticated;

drop trigger if exists trg_support_tickets_priority on public.support_tickets;
create trigger trg_support_tickets_priority
  before insert or update of priority on public.support_tickets
  for each row execute function public.support_tickets_set_priority();


-- =====================================================================
-- 5. STATISTIQUES ADMIN
-- =====================================================================
-- Abonnés Coparentalité+ à un instant : même règle que
-- admin_stats_premium_at (0310), qui ne compte que premium_* (pas de double compte).
create or replace function public.admin_stats_coparentalite_at(p_at timestamptz)
returns table (monthly bigint, yearly bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where s.plan::text = 'coparentalite_monthly'),
         count(*) filter (where s.plan::text = 'coparentalite_yearly')
    from public.subscriptions s
    join public.users u on u.id = s.user_id and u.plan::text <> 'admin'
   where s.created_at <= p_at
     and case
           when p_at >= now() - interval '5 minutes'
             then s.status in ('active', 'trialing', 'past_due')
           else s.status not in ('incomplete', 'incomplete_expired')
                and (s.canceled_at is null or s.canceled_at > p_at)
                and not (s.status = 'canceled' and s.canceled_at is null)
         end;
$$;

revoke all on function public.admin_stats_coparentalite_at(timestamptz) from public, anon, authenticated;

-- Exposée : { monthly, yearly, monthly_prev, yearly_prev } (fin de période / début de période).
create or replace function public.admin_stats_coparentalite(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cur  record;
  v_prev record;
begin
  perform public.admin_stats_assert();
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '800 days' then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  select * into v_cur  from public.admin_stats_coparentalite_at(least(p_to, now()));
  select * into v_prev from public.admin_stats_coparentalite_at(p_from);
  return jsonb_build_object(
    'monthly',      v_cur.monthly,
    'yearly',       v_cur.yearly,
    'monthly_prev', v_prev.monthly,
    'yearly_prev',  v_prev.yearly
  );
end;
$$;

revoke all on function public.admin_stats_coparentalite(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_stats_coparentalite(timestamptz, timestamptz) to authenticated;


-- =====================================================================
-- 6. TESTS (à exécuter manuellement, résultat attendu en commentaire)
-- =====================================================================
-- -- A titulaire de l'enfant E, B gardien parent actif de E, C proche de E.
-- update public.users set plan = 'coparentalite' where id = :A;   -- (service_role)
-- select * from public.effective_plan_details(:B);  -- premium | free | famille
-- select * from public.effective_plan_details(:C);  -- free | free | NULL (proche)
-- select * from public.effective_plan_details(:A);  -- coparentalite | coparentalite | abonnement
-- -- Symétrique : B en coparentalite, A gratuit → A obtient premium via famille.
-- -- Révocation : update child_guardians set status='revoked', revoked_at=now() where user_id=:B;
-- select public.effective_plan(:B);                 -- free
-- -- Ticket : en tant que B (authenticated) insert into support_tickets(user_id, subject, body, priority)
-- --   values (auth.uid(), 's', 'b', 'urgent')  → priority = 'normal' (posée par la base)
-- -- update ... set priority = 'urgent' (B)     → inchangée


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre)
-- =====================================================================
-- drop function if exists public.admin_stats_coparentalite(timestamptz, timestamptz);
-- drop function if exists public.admin_stats_coparentalite_at(timestamptz);
-- drop trigger if exists trg_support_tickets_priority on public.support_tickets;
-- drop function if exists public.support_tickets_set_priority();
-- drop function if exists public._my_support_priority();
-- -- compute_ai_cycle_window : ré-appliquer la définition de 0101_functions.sql.
-- drop function if exists public.effective_plan(uuid);
-- drop function if exists public.effective_plan_details(uuid);
-- -- Enums : PostgreSQL ne sait pas retirer une valeur. Avant tout retour
-- -- arrière applicatif, ramener les lignes :
-- --   update public.users set plan = 'premium' where plan::text = 'coparentalite';
-- --   (subscriptions.plan : laisser le webhook Stripe re-synchroniser.)
-- -- Les valeurs restent déclarées mais inutilisées (sans effet).
