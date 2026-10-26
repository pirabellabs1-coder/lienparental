-- =====================================================================
-- Lien Parental — 0220_billing.sql
-- Facturation Stripe : client Stripe par utilisateur, idempotence des
-- webhooks, garde-fou sur users.plan.
--
-- Additive et rejouable (if not exists / or replace). Rollback en bas.
-- =====================================================================

-- --- billing_customers -------------------------------------------------
-- 1 utilisateur ↔ 1 Customer Stripe. Table séparée (et non une colonne
-- sur public.users) car la policy users_update_self permet à l'utilisateur
-- de modifier sa propre ligne : il ne doit jamais pouvoir réécrire son
-- stripe_customer_id pour se rattacher au client Stripe d'un autre.
create table if not exists public.billing_customers (
  user_id             uuid primary key references public.users(id) on delete cascade,
  stripe_customer_id  text not null unique,
  created_at          timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
-- Aucune policy : lecture/écriture réservées à la service_role (bypass RLS).

-- Les abonnements existants (créés avant cette migration) alimentent la table.
insert into public.billing_customers (user_id, stripe_customer_id)
select s.user_id, s.stripe_customer_id
from public.subscriptions s
on conflict do nothing;


-- --- stripe_events -----------------------------------------------------
-- Journal d'idempotence des webhooks Stripe (livraison at-least-once).
-- Une ligne est « réclamée » à la réception (processed_at null) puis
-- marquée traitée. Une réclamation sans processed_at (crash en cours de
-- traitement) est rejouée lors du retry Stripe suivant.
create table if not exists public.stripe_events (
  id            text primary key,            -- evt_...
  type          text not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists idx_stripe_events_received
  on public.stripe_events(received_at);

alter table public.stripe_events enable row level security;
-- Aucune policy : service_role uniquement.


-- --- subscriptions -----------------------------------------------------
-- stripe_subscription_id est déjà UNIQUE (0006). On ajoute un index pour
-- retrouver vite l'abonnement d'un customer (webhooks invoice.*).
create index if not exists idx_subscriptions_customer
  on public.subscriptions(stripe_customer_id);


-- --- Garde-fou : users.plan n'est modifiable que par le serveur ----------
-- La policy users_update_self (0100) autorise l'utilisateur à mettre à jour
-- sa propre ligne, colonne plan comprise : sans ce trigger, un appel
-- PostgREST `update users set plan = 'premium'` (ou 'admin' !) suffirait
-- à s'octroyer l'offre payante ou les droits d'administration.
create or replace function public.guard_users_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan is distinct from old.plan
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'users.plan is read-only for clients'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_guard_plan on public.users;
create trigger trg_users_guard_plan
  before update of plan on public.users
  for each row execute function public.guard_users_plan();


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre) :
--   drop trigger if exists trg_users_guard_plan on public.users;
--   drop function if exists public.guard_users_plan();
--   drop index if exists public.idx_subscriptions_customer;
--   drop table if exists public.stripe_events;
--   drop table if exists public.billing_customers;
-- =====================================================================
