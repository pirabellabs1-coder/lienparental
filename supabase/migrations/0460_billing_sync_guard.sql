-- =====================================================================
-- Lien Parental — 0460_billing_sync_guard.sql
-- Synchronisation Stripe → base ATOMIQUE et ordonnée.
--
-- Le webhook, le retour de Checkout et les actions de l'écran « Mon abonnement »
-- peuvent synchroniser le même abonnement en même temps. Sans garde, une lecture
-- Stripe plus ANCIENNE écrite en dernier écraserait l'état réel (ex. le webhook
-- « active » arrive après la résiliation faite depuis l'écran).
--
-- public.billing_apply_subscription :
--   - verrou consultatif par utilisateur (transaction) : une seule écriture à la fois ;
--   - version : `synced_at` = instant de la lecture chez Stripe ; une lecture plus
--     ancienne que celle déjà écrite pour le même abonnement est ignorée ('outdated') ;
--   - un abonnement terminé n'écrase jamais un autre abonnement encore en cours ('stale') ;
--   - écrit public.subscriptions ET public.users.plan dans la même transaction
--     (un administrateur reste administrateur).
-- Exécutable par service_role uniquement.
--
-- Additive et rejouable. Rollback en bas.
-- =====================================================================

alter table public.subscriptions
  add column if not exists synced_at timestamptz;

comment on column public.subscriptions.synced_at is
  'Instant de la lecture Stripe reflétée par cette ligne (version : une lecture plus ancienne est ignorée).';

create or replace function public.billing_apply_subscription(
  p_row         jsonb,
  p_tier        text,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (p_row->>'user_id')::uuid;
  v_sub_id   text := p_row->>'stripe_subscription_id';
  v_status   text := p_row->>'status';
  v_blocking text[] := array['active', 'trialing', 'past_due', 'unpaid', 'paused'];
  v_prev     public.subscriptions%rowtype;
  v_has_prev boolean;
  v_new      public.subscriptions%rowtype;
begin
  if v_user is null or v_sub_id is null or v_status is null or p_tier not in ('free', 'premium', 'coparentalite') then
    raise exception 'billing_apply_subscription: paramètres invalides' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing:' || v_user::text, 0));

  select * into v_prev from public.subscriptions where user_id = v_user;
  v_has_prev := found;

  if v_has_prev and v_prev.stripe_subscription_id = v_sub_id
     and v_prev.synced_at is not null and p_observed_at is not null and v_prev.synced_at > p_observed_at then
    return pg_catalog.jsonb_build_object('outcome', 'outdated', 'record', pg_catalog.to_jsonb(v_prev));
  end if;

  if v_has_prev and v_prev.stripe_subscription_id <> v_sub_id
     and v_prev.status::text = any (v_blocking) and not (v_status = any (v_blocking)) then
    return pg_catalog.jsonb_build_object('outcome', 'stale', 'record', pg_catalog.to_jsonb(v_prev));
  end if;

  if not exists (select 1 from public.users u where u.id = v_user) then
    return pg_catalog.jsonb_build_object('outcome', 'unknown_user');
  end if;

  insert into public.subscriptions as s (
    user_id, stripe_customer_id, stripe_subscription_id, plan, status,
    current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, synced_at
  ) values (
    v_user,
    p_row->>'stripe_customer_id',
    v_sub_id,
    (p_row->>'plan')::public.subscription_plan,
    v_status::public.subscription_status,
    (p_row->>'current_period_start')::timestamptz,
    (p_row->>'current_period_end')::timestamptz,
    coalesce((p_row->>'cancel_at_period_end')::boolean, false),
    (p_row->>'canceled_at')::timestamptz,
    (p_row->>'trial_end')::timestamptz,
    coalesce(p_observed_at, pg_catalog.now())
  )
  on conflict (user_id) do update set
    stripe_customer_id     = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    plan                   = excluded.plan,
    status                 = excluded.status,
    current_period_start   = excluded.current_period_start,
    current_period_end     = excluded.current_period_end,
    cancel_at_period_end   = excluded.cancel_at_period_end,
    canceled_at            = excluded.canceled_at,
    trial_end              = excluded.trial_end,
    synced_at              = excluded.synced_at
  returning * into v_new;

  update public.users
     set plan = p_tier::public.plan_tier
   where id = v_user
     and plan <> 'admin'
     and plan is distinct from p_tier::public.plan_tier;

  return pg_catalog.jsonb_build_object(
    'outcome', 'ok',
    'record', pg_catalog.to_jsonb(v_new),
    'previous', case when v_has_prev then pg_catalog.to_jsonb(v_prev) else null end
  );
end;
$$;

revoke all on function public.billing_apply_subscription(jsonb, text, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.billing_apply_subscription(jsonb, text, timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.billing_apply_subscription(jsonb, text, timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.billing_apply_subscription(jsonb, text, timestamptz) to service_role';
  end if;
end;
$$;

-- =====================================================================
-- ROLLBACK (manuel) :
--   drop function if exists public.billing_apply_subscription(jsonb, text, timestamptz);
--   alter table public.subscriptions drop column if exists synced_at;
-- =====================================================================
