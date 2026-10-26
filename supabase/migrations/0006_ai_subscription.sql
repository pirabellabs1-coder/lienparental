-- =====================================================================
-- Lien Parental — 0006_ai_subscription.sql
-- Coach IA (quotas glissants), abonnements Stripe, paiements.
-- =====================================================================

-- --- ENUMs -------------------------------------------------------------
do $$ begin
  create type public.subscription_status as enum (
    'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_plan as enum (
    'premium_monthly', 'premium_yearly'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum (
    'requires_action', 'processing', 'succeeded', 'failed', 'canceled', 'refunded'
  );
exception when duplicate_object then null; end $$;


-- --- ai_analyses -------------------------------------------------------
-- Chaque analyse IA (reformulation d'un message, analyse d'une capture...)
-- compte dans le quota glissant 30 jours : free = 3, premium = 10 ou illimité.
-- `cycle` = ancre temporelle de calcul du quota (voir compute_ai_cycle_window).
create table if not exists public.ai_analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  entree      text,                              -- texte / description de l'entrée
  resultat    jsonb not null default '{}'::jsonb,-- analyse structurée IA
  messages    jsonb not null default '[]'::jsonb,-- historique du chat de suivi
  input_kind  text not null default 'text' check (input_kind in ('text','image','document','voice')),
  cycle       timestamptz not null default now(),-- instant comptabilisé pour le quota 30j
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index crucial pour le calcul rapide du quota glissant 30j.
create index if not exists idx_ai_analyses_user_cycle
  on public.ai_analyses(user_id, cycle desc)
  where archived = false;

create index if not exists idx_ai_analyses_user_created
  on public.ai_analyses(user_id, created_at desc);

drop trigger if exists trg_ai_analyses_updated_at on public.ai_analyses;
create trigger trg_ai_analyses_updated_at
  before update on public.ai_analyses
  for each row execute function public.handle_updated_at();


-- --- subscriptions -----------------------------------------------------
-- Reflet local des abonnements Stripe (source de vérité : Stripe).
-- Synchronisé via webhooks `customer.subscription.*` et `invoice.*`.
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references public.users(id) on delete cascade,
  stripe_customer_id      text not null,
  stripe_subscription_id  text not null unique,
  plan                    public.subscription_plan not null,
  status                  public.subscription_status not null,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  trial_end               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_subscriptions_status
  on public.subscriptions(status);

create index if not exists idx_subscriptions_period_end
  on public.subscriptions(current_period_end)
  where status in ('active','trialing','past_due');

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();


-- --- payments ----------------------------------------------------------
-- Historique des paiements (PaymentIntents + factures Stripe).
-- Aucune donnée carte stockée (PCI-DSS = Stripe).
create table if not exists public.payments (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  subscription_id           uuid references public.subscriptions(id) on delete set null,
  stripe_payment_intent_id  text unique,
  stripe_invoice_id         text unique,
  amount_cents              integer not null check (amount_cents >= 0),
  currency                  char(3) not null default 'EUR',
  status                    public.payment_status not null,
  invoice_url               text,
  invoice_pdf_url           text,
  paid_at                   timestamptz,
  created_at                timestamptz not null default now()
);

create index if not exists idx_payments_user
  on public.payments(user_id, created_at desc);
