-- =====================================================================
-- 0520 — Crédits IA V6 : deux soldes, journal immuable, catalogue versionné.
--
-- Cahier technique V6 (validé : « Appliquer le V6 ») :
--   1. public.credit_config : catalogue VERSIONNÉ (crédits mensuels par formule, coût par action,
--      packs, validité des achats, plafonds, tarifs fournisseur). Ajout seul : chaque modification
--      admin crée une version ; la plus récente s'applique, sans déploiement. Version 1 = V6.
--   2. public.credit_ledger : journal IMMUABLE (allocation, réservation, consommation, restitution,
--      achat, révocation, expiration, ajustement admin). idempotency_key UNIQUE ; trigger qui refuse
--      UPDATE / DELETE / TRUNCATE (seule exception : la cascade de suppression du compte, RGPD).
--   3. public.ai_actions : une ligne par action IA (type, crédits, statut reserved → succeeded |
--      released, version du tarif, modèle, tokens, coût fournisseur estimé en €, y compris pour
--      une action restituée), clé d'idempotence UNIQUE par compte. public.ai_spend_alerts :
--      dépassements de plafond (aucun contenu).
--   4. Solde A (mensuel) CALCULÉ depuis le journal sur la période courante : période ancrée sur
--      subscriptions.current_period_start (formule payante ; annuel = une allocation par mois du
--      cycle) ou sur users.created_at (Gratuit). Allocation paresseuse, une fois par (période,
--      quota cible) : une montée en gamme sur la même période n'alloue que la différence. Aucun
--      report : le reliquat d'une période passée est journalisé « expiration ».
--      Solde B = lots public.ai_credits (0510) non expirés, non révoqués.
--   5. Fonctions service_role (SECURITY DEFINER, search_path vide), sous le verrou consultatif
--      'credits:<uid>' : credits_balance, credits_reserve (A puis B, lot qui expire le plus tôt
--      d'abord, FOR UPDATE, jamais négatif, plafonds de dépense), credits_confirm, credits_release,
--      credits_sweep (réservations échues), credits_revoke_payment (remboursement / litige),
--      grant_ai_credits (0510, redéfinie : écriture « purchase » au journal).
--   6. Administration (session admin, admin_ops_assert, audit_log dans la même transaction) :
--      admin_credit_config_set / _history, admin_credit_adjust (motif obligatoire), admin_credit_user,
--      admin_credit_dashboard.
--   7. Espace familial : 2 adultes au maximum par enfant (titulaire + 1 parent invité : une 2e
--      invitation « parent » en attente ou active est refusée, hint 'adult_limit') ; 5 fiches
--      enfants au maximum par titulaire (hint 'children_limit'). Les proches ne sont pas concernés.
--
-- Données existantes : ai_usage (0270/0510) conservé tel quel (historique, statistiques admin ;
-- les ANALYSES confirmées y sont encore inscrites, les questions au Coach seulement dans ai_actions) ;
-- ai_credits (vide en production) gagne source / revoked_at ; les anciennes fonctions 0510 restent
-- (repli et rollback) mais ne sont plus appelées par le code V6. Chaque compte reçoit son
-- allocation V6 à sa première action.
-- ORDRE DE DÉPLOIEMENT : appliquer AVANT le code V6. Idempotente (rejouable).
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. CATALOGUE VERSIONNÉ
-- =====================================================================
create table if not exists public.credit_config (
  version     integer generated always as identity primary key,
  config      jsonb not null,
  reason      text not null check (length(btrim(reason)) between 5 and 500),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.credit_config enable row level security;
revoke all on table public.credit_config from public, anon, authenticated;
grant select, insert on table public.credit_config to service_role;

-- Ajout seul : seule la mise à NULL de l'auteur (suppression de son compte) est admise.
create or replace function public.credit_config_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by is null
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
    return new;
  end if;
  raise exception 'credit_config is append-only' using errcode = '42501';
end;
$$;
revoke all on function public.credit_config_append_only() from public, anon, authenticated;

drop trigger if exists trg_credit_config_append_only on public.credit_config;
create trigger trg_credit_config_append_only
  before update or delete on public.credit_config
  for each row execute function public.credit_config_append_only();

-- Validation minimale côté base (le serveur valide le schéma complet, lib/ai/credit-config.ts).
create or replace function public._credit_config_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_a text;
  v_p jsonb;
begin
  if p is null or coalesce(jsonb_typeof(p), '') <> 'object' or pg_column_size(p) > 16384 then return false; end if;
  if coalesce(jsonb_typeof(p -> 'monthlyCredits'), '') <> 'object' then return false; end if;
  foreach v_a in array array['gratuit', 'premium', 'coparentalite'] loop
    if coalesce(jsonb_typeof(p -> 'monthlyCredits' -> v_a), '') <> 'number'
       or (p -> 'monthlyCredits' ->> v_a)::numeric not between 0 and 10000
       or (p -> 'monthlyCredits' ->> v_a)::numeric <> trunc((p -> 'monthlyCredits' ->> v_a)::numeric) then
      return false;
    end if;
  end loop;
  foreach v_a in array array['chat_question', 'situation_analysis', 'document_analysis', 'custom_letter', 'full_dossier'] loop
    if coalesce(jsonb_typeof(p -> 'actions' -> v_a -> 'cost'), '') <> 'number'
       or (p -> 'actions' -> v_a ->> 'cost')::numeric not between 0 and 50
       or (p -> 'actions' -> v_a ->> 'cost')::numeric <> trunc((p -> 'actions' -> v_a ->> 'cost')::numeric)
       or coalesce(jsonb_typeof(p -> 'actions' -> v_a -> 'active'), '') <> 'boolean'
       or coalesce(jsonb_typeof(p -> 'actions' -> v_a -> 'timeoutMs'), '') <> 'number'
       or (p -> 'actions' -> v_a ->> 'timeoutMs')::numeric not between 5000 and 280000 then
      return false;
    end if;
  end loop;
  if coalesce(jsonb_typeof(p -> 'packs'), '') <> 'array' or jsonb_array_length(p -> 'packs') not between 1 and 8 then return false; end if;
  for v_p in select x from jsonb_array_elements(p -> 'packs') x loop
    if coalesce(v_p ->> 'id', '') !~ '^[a-z0-9_]{1,32}$'
       or coalesce(jsonb_typeof(v_p -> 'credits'), '') <> 'number' or (v_p ->> 'credits')::numeric not between 1 and 1000
       or coalesce(jsonb_typeof(v_p -> 'priceCents'), '') <> 'number' or (v_p ->> 'priceCents')::numeric not between 50 and 100000
       or coalesce(jsonb_typeof(v_p -> 'active'), '') <> 'boolean' then
      return false;
    end if;
  end loop;
  if coalesce(jsonb_typeof(p -> 'purchasedValidityMonths'), '') <> 'number'
     or (p ->> 'purchasedValidityMonths')::numeric not between 1 and 36 then
    return false;
  end if;
  if coalesce(jsonb_typeof(p -> 'limits' -> 'dailySpendEurUser'), '') <> 'number' or (p -> 'limits' ->> 'dailySpendEurUser')::numeric < 0
     or coalesce(jsonb_typeof(p -> 'limits' -> 'dailySpendEurGlobal'), '') <> 'number' or (p -> 'limits' ->> 'dailySpendEurGlobal')::numeric < 0 then
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public._credit_config_valid(jsonb) from public, anon, authenticated;

alter table public.credit_config drop constraint if exists chk_credit_config_valid;
alter table public.credit_config add constraint chk_credit_config_valid check (public._credit_config_valid(config));

-- Version 1 : valeurs V6 (miroir de DEFAULT_CREDIT_CONFIG, lib/ai/credit-config.ts).
insert into public.credit_config (config, reason)
select $json${
  "monthlyCredits": { "gratuit": 5, "premium": 60, "coparentalite": 200 },
  "actions": {
    "chat_question":      { "cost": 1, "active": true,  "maxOutputTokens": 8000,  "timeoutMs": 80000 },
    "situation_analysis": { "cost": 2, "active": true,  "maxOutputTokens": 12000, "timeoutMs": 110000 },
    "document_analysis":  { "cost": 3, "active": true,  "maxOutputTokens": 12000, "timeoutMs": 110000 },
    "custom_letter":      { "cost": 3, "active": false, "maxOutputTokens": 8000,  "timeoutMs": 90000 },
    "full_dossier":       { "cost": 5, "active": false, "maxOutputTokens": 16000, "timeoutMs": 110000 }
  },
  "packs": [
    { "id": "pack10",  "credits": 10,  "priceCents": 249,  "active": true },
    { "id": "pack30",  "credits": 30,  "priceCents": 599,  "active": true },
    { "id": "pack75",  "credits": 75,  "priceCents": 1199, "active": true },
    { "id": "pack150", "credits": 150, "priceCents": 1999, "active": true }
  ],
  "purchasedValidityMonths": 24,
  "limits": {
    "pdfMaxBytes": 10485760, "imageMaxBytes": 5242880, "pdfMaxPages": 30, "plainMaxChars": 20000,
    "chatPerMinute": 12, "chatPerDay": 100, "dailySpendEurUser": 3, "dailySpendEurGlobal": 100
  },
  "pricing": {
    "usdToEur": 0.92,
    "models": { "claude-opus-5-5": { "input": 4, "output": 20, "cacheWrite": 5, "cacheRead": 0.2 } }
  }
}$json$::jsonb, 'Version initiale V6 (migration 0520)'
where not exists (select 1 from public.credit_config);

-- Configuration active (la plus récente) et sa version.
create or replace function public._credits_cfg(out version integer, out config jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.version, c.config from public.credit_config c order by c.version desc limit 1
$$;
revoke all on function public._credits_cfg() from public, anon, authenticated;

-- Lecture serveur (service_role) : écrans, routes (coûts affichés, plafonds, packs).
create or replace function public.credit_config_current()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('version', c.version, 'config', c.config, 'created_at', c.created_at)
    from public.credit_config c order by c.version desc limit 1
$$;
revoke all on function public.credit_config_current() from public, anon, authenticated;
grant execute on function public.credit_config_current() to service_role;


-- =====================================================================
-- 2. LOTS ACHETÉS (0510) : source, révocation, lots d'ajustement admin
-- =====================================================================
alter table public.ai_credits add column if not exists source text not null default 'stripe';
alter table public.ai_credits add column if not exists revoked_at timestamptz;
alter table public.ai_credits alter column stripe_session_id drop not null;

alter table public.ai_credits drop constraint if exists chk_ai_credits_source;
alter table public.ai_credits add constraint chk_ai_credits_source check (
  (source = 'stripe' and stripe_session_id is not null) or (source = 'admin' and stripe_session_id is null)
);
alter table public.ai_credits drop constraint if exists chk_ai_credits_session;
alter table public.ai_credits add constraint chk_ai_credits_session
  check (stripe_session_id is null or stripe_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{10,200}$');

drop index if exists public.idx_ai_credits_user_available;
create index if not exists idx_ai_credits_user_usable
  on public.ai_credits(user_id, expires_at, purchased_at) where remaining > 0 and revoked_at is null;
create index if not exists idx_ai_credits_payment_intent
  on public.ai_credits(stripe_payment_intent) where stripe_payment_intent is not null;

grant select (id, user_id, pack, quantity, remaining, amount_cents, currency, purchased_at, expires_at, source, revoked_at)
  on table public.ai_credits to authenticated;


-- =====================================================================
-- 3. ACTIONS IA ET ALERTES DE DÉPENSE
-- =====================================================================
create table if not exists public.ai_actions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  action_type         text not null check (action_type in ('chat_question', 'situation_analysis', 'document_analysis', 'custom_letter', 'full_dossier')),
  credits             integer not null check (credits between 0 and 50),
  monthly_part        integer not null default 0 check (monthly_part >= 0),
  -- [{ "lot": uuid, "n": entier }] : lots débités (restitution exacte au même lot).
  lot_parts           jsonb not null default '[]'::jsonb check (jsonb_typeof(lot_parts) = 'array'),
  status              text not null check (status in ('reserved', 'succeeded', 'released')),
  idempotency_key     text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  analysis_id         uuid,
  config_version      integer not null,
  period_start        timestamptz not null,
  model               text check (model is null or model ~ '^[A-Za-z0-9._:-]{1,80}$'),
  input_tokens        integer check (input_tokens is null or input_tokens >= 0),
  output_tokens       integer check (output_tokens is null or output_tokens >= 0),
  cache_write_tokens  integer check (cache_write_tokens is null or cache_write_tokens >= 0),
  cache_read_tokens   integer check (cache_read_tokens is null or cache_read_tokens >= 0),
  cost_eur            numeric(12, 6) not null default 0 check (cost_eur >= 0),
  latency_ms          integer check (latency_ms is null or latency_ms >= 0),
  release_reason      text check (release_reason is null or release_reason ~ '^[a-z_]{1,40}$'),
  reserved_at         timestamptz not null default now(),
  expires_at          timestamptz not null,
  settled_at          timestamptz,
  constraint uq_ai_actions_key unique (user_id, idempotency_key),
  constraint chk_ai_actions_parts check (monthly_part <= credits)
);

create index if not exists idx_ai_actions_reserved on public.ai_actions(expires_at) where status = 'reserved';
create index if not exists idx_ai_actions_reserved_at on public.ai_actions(reserved_at);
create index if not exists idx_ai_actions_user_reserved_at on public.ai_actions(user_id, reserved_at desc);

alter table public.ai_actions enable row level security;
drop policy if exists ai_actions_select_self on public.ai_actions;
create policy ai_actions_select_self on public.ai_actions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists mfa_required on public.ai_actions;
create policy mfa_required on public.ai_actions
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on table public.ai_actions from public, anon, authenticated;
grant select (id, user_id, action_type, credits, status, reserved_at, settled_at) on table public.ai_actions to authenticated;
grant select, insert, update on table public.ai_actions to service_role;
revoke delete, truncate on table public.ai_actions from service_role;

-- Transitions autorisées : reserved → succeeded | released (une seule fois) ; rien d'autre.
create or replace function public.ai_actions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.users u where u.id = old.user_id) then return old; end if;
    raise exception 'ai_actions rows are kept' using errcode = '42501';
  end if;
  if old.status <> 'reserved' or new.status not in ('succeeded', 'released')
     or new.id <> old.id or new.user_id <> old.user_id or new.action_type <> old.action_type
     or new.credits <> old.credits or new.monthly_part <> old.monthly_part or new.lot_parts <> old.lot_parts
     or new.idempotency_key <> old.idempotency_key or new.config_version <> old.config_version
     or new.period_start <> old.period_start or new.reserved_at <> old.reserved_at then
    raise exception 'invalid ai_actions transition' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.ai_actions_guard() from public, anon, authenticated;

drop trigger if exists trg_ai_actions_guard on public.ai_actions;
create trigger trg_ai_actions_guard
  before update or delete on public.ai_actions
  for each row execute function public.ai_actions_guard();

create table if not exists public.ai_spend_alerts (
  id          bigint generated always as identity primary key,
  scope       text not null check (scope in ('user', 'global')),
  day         date not null,
  user_id     uuid references public.users(id) on delete cascade,
  spent_eur   numeric(12, 6) not null,
  cap_eur     numeric(12, 6) not null,
  created_at  timestamptz not null default now(),
  constraint chk_ai_spend_alerts_user check ((scope = 'user') = (user_id is not null))
);
create unique index if not exists uq_ai_spend_alerts
  on public.ai_spend_alerts(scope, day, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.ai_spend_alerts enable row level security;
revoke all on table public.ai_spend_alerts from public, anon, authenticated;
grant all on table public.ai_spend_alerts to service_role;


-- =====================================================================
-- 4. JOURNAL IMMUABLE
-- =====================================================================
create table if not exists public.credit_ledger (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.users(id) on delete cascade,
  wallet           text not null check (wallet in ('monthly', 'purchased')),
  entry_type       text not null check (entry_type in ('allocation', 'reservation', 'consumption', 'release', 'purchase', 'revocation', 'expiration', 'admin_adjustment')),
  -- Effet sur le solde (débit < 0). Consommation : 0 (débit déjà porté par la réservation).
  delta            integer not null check (delta between -100000 and 100000),
  -- Crédits concernés (valeur absolue), affichés dans l'historique.
  amount           integer not null check (amount between 0 and 100000),
  -- Pas de clé étrangère : une écriture ne doit jamais être modifiée par une cascade.
  lot_id           uuid,
  action_id        uuid,
  period_start     timestamptz,
  idempotency_key  text not null check (length(idempotency_key) between 8 and 200),
  reason           text check (reason is null or length(reason) <= 500),
  admin_id         uuid,
  config_version   integer,
  created_at       timestamptz not null default now(),
  constraint uq_credit_ledger_key unique (idempotency_key),
  constraint chk_credit_ledger_monthly_period check (wallet <> 'monthly' or period_start is not null),
  constraint chk_credit_ledger_admin check (
    (entry_type = 'admin_adjustment') = (admin_id is not null)
    and (entry_type <> 'admin_adjustment' or length(btrim(coalesce(reason, ''))) >= 5)
  )
);

create index if not exists idx_credit_ledger_user_created on public.credit_ledger(user_id, created_at desc);
create index if not exists idx_credit_ledger_user_period on public.credit_ledger(user_id, wallet, period_start);
create index if not exists idx_credit_ledger_created on public.credit_ledger(created_at);
create index if not exists idx_credit_ledger_lot on public.credit_ledger(lot_id) where lot_id is not null;

alter table public.credit_ledger enable row level security;
drop policy if exists credit_ledger_select_self on public.credit_ledger;
create policy credit_ledger_select_self on public.credit_ledger
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists mfa_required on public.credit_ledger;
create policy mfa_required on public.credit_ledger
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on table public.credit_ledger from public, anon, authenticated;
-- Lecture de ses propres lignes, sans l'identifiant de l'administrateur.
grant select (id, user_id, wallet, entry_type, delta, amount, lot_id, action_id, period_start, reason, created_at)
  on table public.credit_ledger to authenticated;
revoke update, delete, truncate on table public.credit_ledger from service_role;
grant select, insert on table public.credit_ledger to service_role;

-- Ajout seul. Seule exception : la suppression du COMPTE (cascade users → credit_ledger, droit à
-- l'effacement) ; le trigger voit alors le compte déjà supprimé dans la même instruction.
create or replace function public.credit_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'credit_ledger is append-only' using errcode = '42501';
end;
$$;
revoke all on function public.credit_ledger_immutable() from public, anon, authenticated;

create or replace function public.credit_ledger_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append-only table: truncate refused' using errcode = '42501';
end;
$$;
revoke all on function public.credit_ledger_no_truncate() from public, anon, authenticated;

drop trigger if exists trg_credit_ledger_immutable on public.credit_ledger;
create trigger trg_credit_ledger_immutable
  before update or delete on public.credit_ledger
  for each row execute function public.credit_ledger_immutable();
drop trigger if exists trg_credit_ledger_no_truncate on public.credit_ledger;
create trigger trg_credit_ledger_no_truncate
  before truncate on public.credit_ledger
  for each statement execute function public.credit_ledger_no_truncate();
drop trigger if exists trg_ai_actions_no_truncate on public.ai_actions;
create trigger trg_ai_actions_no_truncate
  before truncate on public.ai_actions
  for each statement execute function public.credit_ledger_no_truncate();


-- =====================================================================
-- 5. PÉRIODES ET SYNCHRONISATION (internes)
-- =====================================================================
-- Mois calendaires en UTC, jour borné à la fin du mois (miroir de addMonthsUtc, wallet-core.ts).
create or replace function public._credits_add_months(p_ts timestamptz, p_k integer)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select ((p_ts at time zone 'UTC') + make_interval(months => p_k)) at time zone 'UTC'
$$;
revoke all on function public._credits_add_months(timestamptz, integer) from public, anon, authenticated;

-- Plus grand k ≥ 0 tel que base + k mois ≤ now (miroir de monthsElapsed).
create or replace function public._credits_months_elapsed(p_base timestamptz, p_now timestamptz)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_k integer;
begin
  v_k := greatest(0, ((extract(year from p_now at time zone 'UTC') - extract(year from p_base at time zone 'UTC')) * 12
                     + (extract(month from p_now at time zone 'UTC') - extract(month from p_base at time zone 'UTC')))::integer);
  while v_k > 0 and public._credits_add_months(p_base, v_k) > p_now loop
    v_k := v_k - 1;
  end loop;
  while public._credits_add_months(p_base, v_k + 1) <= p_now loop
    v_k := v_k + 1;
  end loop;
  return v_k;
end;
$$;
revoke all on function public._credits_months_elapsed(timestamptz, timestamptz) from public, anon, authenticated;

-- Formule PROPRE (jamais le plan effectif familial : crédits non mutualisés) et période courante.
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
  select case when u.deleted_at is null and u.plan::text in ('premium', 'coparentalite') then u.plan::text else 'gratuit' end,
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
revoke all on function public._credits_period(uuid, timestamptz) from public, anon, authenticated;

create or replace function public._credits_ms(p_ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$ select ((extract(epoch from p_ts) * 1000)::bigint)::text $$;
revoke all on function public._credits_ms(timestamptz) from public, anon, authenticated;

-- Restitution d'une réservation (appelant : verrou du compte déjà pris). L'appel au fournisseur a pu
-- avoir lieu (refus, sortie tronquée ou invalide, interruption) : son coût mesuré est conservé, pour
-- que les plafonds de dépense et le tableau de bord le voient même sans débit de crédits.
-- La part mensuelle revient à la période de la réservation : si celle-ci est close entre-temps, elle
-- expire aussitôt (crédits de la période passée, jamais reportés sur la suivante).
create or replace function public._credits_release(
  p_user_id uuid, p_action_id uuid, p_reason text,
  p_model text default null, p_input integer default null, p_output integer default null, p_cost_eur numeric default 0
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a     public.ai_actions%rowtype;
  v_part  jsonb;
  v_lot   uuid;
  v_n     integer;
  v_ok    integer;
begin
  select * into v_a from public.ai_actions a where a.id = p_action_id and a.user_id = p_user_id for update;
  if not found or v_a.status <> 'reserved' then
    return 'not_reserved';
  end if;
  update public.ai_actions
     set status = 'released', release_reason = p_reason, settled_at = now(),
         model = coalesce(left(p_model, 80), model), input_tokens = coalesce(p_input, input_tokens),
         output_tokens = coalesce(p_output, output_tokens), cost_eur = round(greatest(coalesce(p_cost_eur, 0), 0), 6)
   where id = v_a.id;
  if v_a.monthly_part > 0 then
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, action_id, period_start, idempotency_key, reason, config_version)
    values (p_user_id, 'monthly', 'release', v_a.monthly_part, v_a.monthly_part, v_a.id, v_a.period_start, 'rel:' || v_a.id || ':m', p_reason, v_a.config_version)
    on conflict (idempotency_key) do nothing;
  end if;
  for v_part in select x from jsonb_array_elements(v_a.lot_parts) x loop
    v_lot := (v_part ->> 'lot')::uuid;
    v_n := (v_part ->> 'n')::integer;
    -- Lot remboursé ou contesté entre-temps : rien à rendre.
    update public.ai_credits
       set remaining = least(quantity, remaining + v_n)
     where id = v_lot and user_id = p_user_id and revoked_at is null;
    get diagnostics v_ok = row_count;
    if v_ok > 0 then
      insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, action_id, idempotency_key, reason, config_version)
      values (p_user_id, 'purchased', 'release', v_n, v_n, v_lot, v_a.id, 'rel:' || v_a.id || ':' || v_lot, p_reason, v_a.config_version)
      on conflict (idempotency_key) do nothing;
    end if;
  end loop;
  return 'released';
end;
$$;
revoke all on function public._credits_release(uuid, uuid, text, text, integer, integer, numeric) from public, anon, authenticated;

-- Allocation de la période, expirations (mois passés, lots échus), réservations échues.
-- Appelant : verrou 'credits:<uid>' déjà pris.
create or replace function public._credits_sync(
  p_user_id uuid,
  out plan text, out period_start timestamptz, out period_end timestamptz, out quota integer, out cfg_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg        jsonb;
  v_now        timestamptz := now();
  v_allocated  integer;
  v_r          record;
  v_n          integer;
begin
  for v_r in
    select a.id from public.ai_actions a
     where a.user_id = p_user_id and a.status = 'reserved' and a.expires_at <= v_now
  loop
    perform public._credits_release(p_user_id, v_r.id, 'timeout');
  end loop;

  select c.version, c.config into cfg_version, v_cfg from public._credits_cfg() c;
  select p.plan, p.period_start, p.period_end into plan, period_start, period_end
    from public._credits_period(p_user_id, v_now) p;
  quota := coalesce((v_cfg -> 'monthlyCredits' ->> plan)::integer, 0);

  select coalesce(sum(l.delta), 0)::integer into v_allocated
    from public.credit_ledger l
   where l.user_id = p_user_id and l.wallet = 'monthly' and l.entry_type = 'allocation' and l.period_start = _credits_sync.period_start;
  if quota > v_allocated then
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, period_start, idempotency_key, config_version)
    values (p_user_id, 'monthly', 'allocation', quota - v_allocated, quota - v_allocated, _credits_sync.period_start,
            'alloc:' || p_user_id || ':' || public._credits_ms(_credits_sync.period_start) || ':' || quota, cfg_version)
    on conflict (idempotency_key) do nothing;
  end if;

  -- Aucun report : reliquat des périodes passées expiré.
  for v_r in
    select l.period_start as ps, sum(l.delta)::integer as left_over
      from public.credit_ledger l
     where l.user_id = p_user_id and l.wallet = 'monthly' and l.period_start < _credits_sync.period_start
     group by l.period_start
    having sum(l.delta) > 0
  loop
    select count(*)::integer into v_n from public.credit_ledger l
     where l.user_id = p_user_id and l.wallet = 'monthly' and l.entry_type = 'expiration' and l.period_start = v_r.ps;
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, period_start, idempotency_key, config_version)
    values (p_user_id, 'monthly', 'expiration', -v_r.left_over, v_r.left_over, v_r.ps,
            'expire_m:' || p_user_id || ':' || public._credits_ms(v_r.ps) || ':' || v_n, cfg_version)
    on conflict (idempotency_key) do nothing;
  end loop;

  for v_r in
    select c.id, c.remaining from public.ai_credits c
     where c.user_id = p_user_id and c.revoked_at is null and c.remaining > 0 and c.expires_at <= v_now
     for update
  loop
    select count(*)::integer into v_n from public.credit_ledger l where l.entry_type = 'expiration' and l.lot_id = v_r.id;
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, idempotency_key, config_version)
    values (p_user_id, 'purchased', 'expiration', -v_r.remaining, v_r.remaining, v_r.id, 'expire_l:' || v_r.id || ':' || v_n, cfg_version)
    on conflict (idempotency_key) do nothing;
    update public.ai_credits set remaining = 0 where id = v_r.id;
  end loop;
end;
$$;
revoke all on function public._credits_sync(uuid) from public, anon, authenticated;

-- État des deux soldes (après synchronisation ; verrou déjà pris).
create or replace function public._credits_state(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s          record;
  v_monthly    integer;
  v_granted    integer;
  v_purchased  integer;
  v_lots       jsonb;
begin
  select * into v_s from public._credits_sync(p_user_id);
  select coalesce(sum(l.delta), 0)::integer,
         coalesce(sum(l.delta) filter (where l.entry_type in ('allocation', 'admin_adjustment')), 0)::integer
    into v_monthly, v_granted
    from public.credit_ledger l
   where l.user_id = p_user_id and l.wallet = 'monthly' and l.period_start = v_s.period_start;
  select coalesce(sum(c.remaining), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'remaining', c.remaining, 'expires_at', c.expires_at, 'source', c.source)
                            order by c.expires_at, c.purchased_at, c.id), '[]'::jsonb)
    into v_purchased, v_lots
    from public.ai_credits c
   where c.user_id = p_user_id and c.revoked_at is null and c.remaining > 0 and c.expires_at > now();
  v_monthly := greatest(0, v_monthly);
  return jsonb_build_object(
    'plan', v_s.plan, 'period_start', v_s.period_start, 'period_end', v_s.period_end,
    'monthly_quota', v_s.quota, 'monthly', v_monthly, 'monthly_used', greatest(0, v_granted - v_monthly),
    'purchased', v_purchased, 'total', v_monthly + v_purchased, 'lots', v_lots, 'config_version', v_s.cfg_version
  );
end;
$$;
revoke all on function public._credits_state(uuid) from public, anon, authenticated;


-- =====================================================================
-- 6. API SERVICE_ROLE
-- =====================================================================
create or replace function public.credits_balance(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));
  return public._credits_state(p_user_id);
end;
$$;
revoke all on function public.credits_balance(uuid) from public, anon, authenticated;
grant execute on function public.credits_balance(uuid) to service_role;

-- Réserve le coût d'une action AVANT l'appel au modèle. Renvoie { outcome, ... } :
--   reserved     { action_id, cost, monthly_part, purchased_part, balance }
--   duplicate    { action_id, status }  (même clé d'idempotence : aucun second débit)
--   insufficient { cost, balance }       (rien n'est débité : jamais de solde négatif)
--   inactive                             (action désactivée au catalogue)
--   spend_cap    { scope }               (plafond de dépense IA du jour atteint ; alerte journalisée)
create or replace function public.credits_reserve(
  p_user_id      uuid,
  p_action       text,
  p_key          text,
  p_analysis_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg_version  integer;
  v_cfg          jsonb;
  v_cost         integer;
  v_timeout      integer;
  v_cap          numeric;
  v_spent        numeric;
  v_day          timestamptz := (date_trunc('day', now() at time zone 'UTC')) at time zone 'UTC';
  v_dup          record;
  v_state        jsonb;
  v_monthly      integer;
  v_from_a       integer;
  v_rest         integer;
  v_avail        integer;
  v_parts        jsonb := '[]'::jsonb;
  v_lot          record;
  v_n            integer;
  v_id           uuid := gen_random_uuid();
begin
  if p_user_id is null or p_action is null
     or p_action not in ('chat_question', 'situation_analysis', 'document_analysis', 'custom_letter', 'full_dossier')
     or p_key is null or p_key !~ '^[A-Za-z0-9_-]{16,80}$' then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));

  select a.id, a.status into v_dup from public.ai_actions a where a.user_id = p_user_id and a.idempotency_key = p_key;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'action_id', v_dup.id, 'status', v_dup.status);
  end if;

  select c.version, c.config into v_cfg_version, v_cfg from public._credits_cfg() c;
  if coalesce((v_cfg -> 'actions' -> p_action ->> 'active')::boolean, false) is not true then
    return jsonb_build_object('outcome', 'inactive');
  end if;
  v_cost := (v_cfg -> 'actions' -> p_action ->> 'cost')::integer;
  v_timeout := coalesce((v_cfg -> 'actions' -> p_action ->> 'timeoutMs')::integer, 110000);

  -- Plafonds de dépense IA estimée du jour (UTC) : global puis par compte. Alerte une fois par jour.
  -- Les actions restituées comptent aussi (le fournisseur a pu être payé).
  v_cap := coalesce((v_cfg -> 'limits' ->> 'dailySpendEurGlobal')::numeric, 0);
  if v_cap > 0 then
    select coalesce(sum(a.cost_eur), 0) into v_spent from public.ai_actions a where a.reserved_at >= v_day;
    if v_spent >= v_cap then
      insert into public.ai_spend_alerts (scope, day, user_id, spent_eur, cap_eur)
      values ('global', v_day::date, null, v_spent, v_cap) on conflict do nothing;
      return jsonb_build_object('outcome', 'spend_cap', 'scope', 'global');
    end if;
  end if;
  v_cap := coalesce((v_cfg -> 'limits' ->> 'dailySpendEurUser')::numeric, 0);
  if v_cap > 0 then
    select coalesce(sum(a.cost_eur), 0) into v_spent from public.ai_actions a where a.user_id = p_user_id and a.reserved_at >= v_day;
    if v_spent >= v_cap then
      insert into public.ai_spend_alerts (scope, day, user_id, spent_eur, cap_eur)
      values ('user', v_day::date, p_user_id, v_spent, v_cap) on conflict do nothing;
      return jsonb_build_object('outcome', 'spend_cap', 'scope', 'user');
    end if;
  end if;

  v_state := public._credits_state(p_user_id);
  v_monthly := (v_state ->> 'monthly')::integer;
  v_from_a := least(v_monthly, v_cost);
  v_rest := v_cost - v_from_a;
  if v_rest > 0 then
    select coalesce(sum(c.remaining), 0)::integer into v_avail from public.ai_credits c
     where c.user_id = p_user_id and c.revoked_at is null and c.remaining > 0 and c.expires_at > now();
    if v_avail < v_rest then
      return jsonb_build_object('outcome', 'insufficient', 'cost', v_cost, 'balance', v_state);
    end if;
  end if;

  if v_from_a > 0 then
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, action_id, period_start, idempotency_key, config_version)
    values (p_user_id, 'monthly', 'reservation', -v_from_a, v_from_a, v_id, (v_state ->> 'period_start')::timestamptz, 'res:' || v_id || ':m', v_cfg_version);
  end if;
  -- Lot qui expire le plus tôt d'abord, verrouillé (aucune course entre deux réservations).
  for v_lot in
    select c.id, c.remaining from public.ai_credits c
     where c.user_id = p_user_id and c.revoked_at is null and c.remaining > 0 and c.expires_at > now()
     order by c.expires_at, c.purchased_at, c.id
     for update
  loop
    exit when v_rest = 0;
    v_n := least(v_lot.remaining, v_rest);
    update public.ai_credits set remaining = remaining - v_n where id = v_lot.id and user_id = p_user_id;
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, action_id, idempotency_key, config_version)
    values (p_user_id, 'purchased', 'reservation', -v_n, v_n, v_lot.id, v_id, 'res:' || v_id || ':' || v_lot.id, v_cfg_version);
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('lot', v_lot.id, 'n', v_n));
    v_rest := v_rest - v_n;
  end loop;

  insert into public.ai_actions (id, user_id, action_type, credits, monthly_part, lot_parts, status, idempotency_key,
                                 analysis_id, config_version, period_start, expires_at)
  values (v_id, p_user_id, p_action, v_cost, v_from_a, v_parts, 'reserved', p_key,
          p_analysis_id, v_cfg_version, (v_state ->> 'period_start')::timestamptz,
          now() + make_interval(secs => v_timeout / 1000.0 + 60));

  return jsonb_build_object(
    'outcome', 'reserved', 'action_id', v_id, 'cost', v_cost, 'monthly_part', v_from_a, 'purchased_part', v_cost - v_from_a,
    'config_version', v_cfg_version, 'balance', public._credits_state(p_user_id)
  );
end;
$$;
revoke all on function public.credits_reserve(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.credits_reserve(uuid, text, text, uuid) to service_role;

-- Succès : débit confirmé une seule fois, mesures de coût enregistrées.
-- Renvoie 'confirmed' | 'already' | 'not_reserved' (restituée entre-temps, inconnue, autre compte).
create or replace function public.credits_confirm(
  p_user_id      uuid,
  p_action_id    uuid,
  p_model        text default null,
  p_input        integer default null,
  p_output       integer default null,
  p_cache_write  integer default null,
  p_cache_read   integer default null,
  p_cost_eur     numeric default 0,
  p_latency_ms   integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a     public.ai_actions%rowtype;
  v_part  jsonb;
begin
  if p_user_id is null or p_action_id is null or coalesce(p_cost_eur, 0) < 0 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));
  select * into v_a from public.ai_actions a where a.id = p_action_id and a.user_id = p_user_id for update;
  if not found then return 'not_reserved'; end if;
  if v_a.status = 'succeeded' then return 'already'; end if;
  if v_a.status <> 'reserved' then return 'not_reserved'; end if;

  update public.ai_actions
     set status = 'succeeded', settled_at = now(), model = left(p_model, 80),
         input_tokens = p_input, output_tokens = p_output, cache_write_tokens = p_cache_write, cache_read_tokens = p_cache_read,
         cost_eur = round(coalesce(p_cost_eur, 0), 6), latency_ms = p_latency_ms
   where id = v_a.id;
  if v_a.monthly_part > 0 then
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, action_id, period_start, idempotency_key, config_version)
    values (p_user_id, 'monthly', 'consumption', 0, v_a.monthly_part, v_a.id, v_a.period_start, 'con:' || v_a.id || ':m', v_a.config_version)
    on conflict (idempotency_key) do nothing;
  end if;
  for v_part in select x from jsonb_array_elements(v_a.lot_parts) x loop
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, action_id, idempotency_key, config_version)
    values (p_user_id, 'purchased', 'consumption', 0, (v_part ->> 'n')::integer, (v_part ->> 'lot')::uuid, v_a.id,
            'con:' || v_a.id || ':' || (v_part ->> 'lot'), v_a.config_version)
    on conflict (idempotency_key) do nothing;
  end loop;
  -- Registre d'usage historique des ANALYSES (statistiques admin 0310 / 0450, sens inchangé) ;
  -- les questions au Coach ne sont suivies que dans ai_actions.
  if v_a.action_type <> 'chat_question' then
    insert into public.ai_usage (user_id, kind, analysis_id)
    values (p_user_id, 'analysis', v_a.analysis_id)
    on conflict do nothing;
  end if;
  return 'confirmed';
end;
$$;
revoke all on function public.credits_confirm(uuid, uuid, text, integer, integer, integer, integer, numeric, integer) from public, anon, authenticated;
grant execute on function public.credits_confirm(uuid, uuid, text, integer, integer, integer, integer, numeric, integer) to service_role;

-- Échec, refus ou annulation : crédits restitués, coût fournisseur éventuel conservé.
-- Renvoie 'released' | 'not_reserved'.
create or replace function public.credits_release(
  p_user_id    uuid,
  p_action_id  uuid,
  p_reason     text default 'failed',
  p_model      text default null,
  p_input      integer default null,
  p_output     integer default null,
  p_cost_eur   numeric default 0
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_action_id is null or coalesce(p_reason, '') !~ '^[a-z_]{1,40}$' or coalesce(p_cost_eur, 0) < 0 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));
  return public._credits_release(p_user_id, p_action_id, p_reason, p_model, p_input, p_output, p_cost_eur);
end;
$$;
revoke all on function public.credits_release(uuid, uuid, text, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.credits_release(uuid, uuid, text, text, integer, integer, numeric) to service_role;

-- Tâche planifiée : restitue les réservations échues (opération non livrée, instance arrêtée).
create or replace function public.credits_sweep(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r  record;
  v_n  integer := 0;
begin
  for v_r in
    select a.id, a.user_id from public.ai_actions a
     where a.status = 'reserved' and a.expires_at <= now()
     order by a.expires_at
     limit greatest(1, least(coalesce(p_limit, 500), 5000))
  loop
    perform pg_advisory_xact_lock(hashtextextended('credits:' || v_r.user_id::text, 0));
    if public._credits_release(v_r.user_id, v_r.id, 'timeout') = 'released' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.credits_sweep(integer) from public, anon, authenticated;
grant execute on function public.credits_sweep(integer) to service_role;

-- Achat (0510, même signature) : lot + écriture « purchase », une seule fois par session Stripe.
create or replace function public.grant_ai_credits(
  p_user_id          uuid,
  p_pack             text,
  p_quantity         integer,
  p_amount_cents     integer,
  p_currency         text,
  p_session_id       text,
  p_payment_intent   text,
  p_purchased_at     timestamptz,
  p_validity_months  integer,
  p_waiver_at        timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_expires  timestamptz;
begin
  if p_user_id is null or p_pack is null or p_quantity is null or p_amount_cents is null
     or p_currency is null or p_session_id is null or p_purchased_at is null
     or p_validity_months is null or p_validity_months not between 1 and 36 then
    raise exception 'Paramètres de crédit invalides' using errcode = '22023';
  end if;

  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('outcome', 'unknown_user');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));
  v_expires := public._credits_add_months(p_purchased_at, p_validity_months);

  insert into public.ai_credits (
    user_id, pack, quantity, remaining, amount_cents, currency, source,
    stripe_session_id, stripe_payment_intent, withdrawal_waiver_at, purchased_at, expires_at
  ) values (
    p_user_id, p_pack, p_quantity, p_quantity, p_amount_cents, lower(p_currency), 'stripe',
    p_session_id, p_payment_intent, p_waiver_at, p_purchased_at, v_expires
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('outcome', 'duplicate');
  end if;
  insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, idempotency_key, config_version)
  values (p_user_id, 'purchased', 'purchase', p_quantity, p_quantity, v_id, 'purchase:' || p_session_id, (select c.version from public._credits_cfg() c));
  return jsonb_build_object('outcome', 'granted', 'expires_at', v_expires, 'lot_id', v_id);
end;
$$;
revoke all on function public.grant_ai_credits(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_ai_credits(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz) to service_role;

-- Remboursement total ou litige : solde restant des lots du paiement révoqué (idempotent).
create or replace function public.credits_revoke_payment(p_payment_intent text, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot   record;
  v_left  integer;
  v_n     integer := 0;
begin
  if coalesce(p_payment_intent, '') !~ '^pi_[A-Za-z0-9_]{6,200}$' or p_reason is null or p_reason not in ('refund', 'dispute') then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  for v_lot in
    select c.id, c.user_id from public.ai_credits c
     where c.stripe_payment_intent = p_payment_intent and c.revoked_at is null
  loop
    perform pg_advisory_xact_lock(hashtextextended('credits:' || v_lot.user_id::text, 0));
    select c.remaining into v_left from public.ai_credits c where c.id = v_lot.id and c.revoked_at is null for update;
    continue when not found;
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, idempotency_key, reason, config_version)
    values (v_lot.user_id, 'purchased', 'revocation', -v_left, v_left, v_lot.id, 'revoke:' || v_lot.id, p_reason,
            (select c.version from public._credits_cfg() c))
    on conflict (idempotency_key) do nothing;
    update public.ai_credits set remaining = 0, revoked_at = now() where id = v_lot.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.credits_revoke_payment(text, text) from public, anon, authenticated;
grant execute on function public.credits_revoke_payment(text, text) to service_role;


-- =====================================================================
-- 7. ADMINISTRATION (session admin, audit dans la même transaction)
-- =====================================================================
create or replace function public.admin_credit_config_set(p_config jsonb, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := public.admin_ops_assert();
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_version  integer;
begin
  if length(v_reason) not between 5 and 500 then
    raise exception 'Motif obligatoire' using errcode = '22023';
  end if;
  if not public._credit_config_valid(p_config) then
    raise exception 'Configuration invalide' using errcode = '22023';
  end if;
  insert into public.credit_config (config, reason, created_by) values (p_config, v_reason, v_actor)
  returning version into v_version;
  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (null, v_actor, 'admin', 'admin.credits.config', 'credit_config', v_version::text, jsonb_build_object('version', v_version));
  return v_version;
end;
$$;
revoke all on function public.admin_credit_config_set(jsonb, text) from public, anon;
grant execute on function public.admin_credit_config_set(jsonb, text) to authenticated;

create or replace function public.admin_credit_config_history(p_limit integer default 20)
returns table (version integer, config jsonb, reason text, created_by_email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_ops_assert();
  return query
    select c.version, c.config, c.reason, u.email::text, c.created_at
      from public.credit_config c left join public.users u on u.id = c.created_by
     order by c.version desc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;
revoke all on function public.admin_credit_config_history(integer) from public, anon;
grant execute on function public.admin_credit_config_history(integer) to authenticated;

-- Ajustement manuel : motif obligatoire, journalisé (ledger + audit_log), jamais en dessous de zéro.
-- Renvoie { outcome: 'adjusted' | 'duplicate' | 'insufficient', balance? }.
-- Chaque ajustement écrit TOUJOURS une première ligne de clé exacte 'adjust:<clé>' (les lignes
-- suivantes d'un retrait multi-lots sont suffixées) : le doublon se détecte par égalité.
create or replace function public.admin_credit_adjust(
  p_user_id  uuid,
  p_wallet   text,
  p_delta    integer,
  p_reason   text,
  p_key      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := public.admin_ops_assert();
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_state   jsonb;
  v_cfg     record;
  v_lot     record;
  v_rest    integer;
  v_avail   integer;
  v_n       integer;
  v_id      uuid;
  v_first   boolean := true;
begin
  if p_user_id is null or p_wallet is null or p_wallet not in ('monthly', 'purchased') or p_delta is null or p_delta = 0
     or abs(p_delta) > 1000 or length(v_reason) not between 5 and 500
     or coalesce(p_key, '') !~ '^[A-Za-z0-9_-]{16,80}$' then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  if p_user_id = v_actor then
    raise exception 'Ajustement de son propre compte interdit' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception 'Compte introuvable' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));
  if exists (select 1 from public.credit_ledger l where l.idempotency_key = 'adjust:' || p_key) then
    return jsonb_build_object('outcome', 'duplicate');
  end if;
  v_state := public._credits_state(p_user_id);
  select * into v_cfg from public._credits_cfg();

  if p_wallet = 'monthly' then
    if (v_state ->> 'monthly')::integer + p_delta < 0 then
      return jsonb_build_object('outcome', 'insufficient', 'balance', v_state);
    end if;
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, period_start, idempotency_key, reason, admin_id, config_version)
    values (p_user_id, 'monthly', 'admin_adjustment', p_delta, abs(p_delta), (v_state ->> 'period_start')::timestamptz, 'adjust:' || p_key, v_reason, v_actor, v_cfg.version);
  elsif p_delta > 0 then
    insert into public.ai_credits (user_id, pack, quantity, remaining, amount_cents, currency, source, purchased_at, expires_at)
    values (p_user_id, 'admin', p_delta, p_delta, 0, 'eur', 'admin', now(),
            public._credits_add_months(now(), coalesce((v_cfg.config ->> 'purchasedValidityMonths')::integer, 24)))
    returning id into v_id;
    insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, idempotency_key, reason, admin_id, config_version)
    values (p_user_id, 'purchased', 'admin_adjustment', p_delta, p_delta, v_id, 'adjust:' || p_key, v_reason, v_actor, v_cfg.version);
  else
    v_rest := -p_delta;
    select coalesce(sum(c.remaining), 0)::integer into v_avail from public.ai_credits c
     where c.user_id = p_user_id and c.revoked_at is null and c.remaining > 0 and c.expires_at > now();
    if v_avail < v_rest then
      return jsonb_build_object('outcome', 'insufficient', 'balance', v_state);
    end if;
    for v_lot in
      select c.id, c.remaining from public.ai_credits c
       where c.user_id = p_user_id and c.revoked_at is null and c.remaining > 0 and c.expires_at > now()
       order by c.expires_at, c.purchased_at, c.id
       for update
    loop
      exit when v_rest = 0;
      v_n := least(v_lot.remaining, v_rest);
      update public.ai_credits set remaining = remaining - v_n where id = v_lot.id;
      insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, lot_id, idempotency_key, reason, admin_id, config_version)
      values (p_user_id, 'purchased', 'admin_adjustment', -v_n, v_n, v_lot.id,
              case when v_first then 'adjust:' || p_key else 'adjust:' || p_key || ':' || v_lot.id end,
              v_reason, v_actor, v_cfg.version);
      v_first := false;
      v_rest := v_rest - v_n;
    end loop;
  end if;

  -- Audit : sans le motif (texte libre), qui reste au journal des crédits.
  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (p_user_id, v_actor, 'admin', 'admin.credits.adjust', 'credit_ledger', p_key,
          jsonb_build_object('wallet', p_wallet, 'delta', p_delta));
  return jsonb_build_object('outcome', 'adjusted', 'balance', public._credits_state(p_user_id));
end;
$$;
revoke all on function public.admin_credit_adjust(uuid, text, integer, text, text) from public, anon;
grant execute on function public.admin_credit_adjust(uuid, text, integer, text, text) to authenticated;

-- Soldes et 30 dernières écritures d'un compte (aucun contenu familial : types, montants, dates).
create or replace function public.admin_credit_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state  jsonb;
begin
  perform public.admin_ops_assert();
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Compte introuvable' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));
  v_state := public._credits_state(p_user_id);
  return v_state || jsonb_build_object('ledger', coalesce((
    select jsonb_agg(jsonb_build_object('wallet', l.wallet, 'type', l.entry_type, 'delta', l.delta, 'amount', l.amount,
                                        'reason', case when l.entry_type = 'admin_adjustment' then l.reason end, 'at', l.created_at)
                     order by l.id desc)
      from (select * from public.credit_ledger x where x.user_id = p_user_id order by x.id desc limit 30) l
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_credit_user(uuid) from public, anon;
grant execute on function public.admin_credit_user(uuid) to authenticated;

-- Tableau de bord (agrégats seulement). Les montants d'abonnement (MRR/ARR) sont calculés par le
-- serveur avec les prix du code (components/profil/pricing.ts) à partir des effectifs renvoyés.
create or replace function public.admin_credit_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_ops_assert();
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'subscribers', coalesce((
      select jsonb_object_agg(x.plan, x.n) from (
        select s.plan::text as plan, count(*)::int as n from public.subscriptions s
         where s.status::text in ('active', 'trialing', 'past_due') group by s.plan::text) x), '{}'::jsonb),
    'users_by_plan', coalesce((
      select jsonb_object_agg(x.plan, x.n) from (
        select case when u.plan::text in ('premium', 'coparentalite') then u.plan::text else 'gratuit' end as plan, count(*)::int as n
          from public.users u where u.deleted_at is null group by 1) x), '{}'::jsonb),
    'recharges', (
      select jsonb_build_object('count', count(*)::int, 'amount_cents', coalesce(sum(c.amount_cents), 0)::bigint,
                                'credits', coalesce(sum(c.quantity), 0)::int, 'revoked', count(*) filter (where c.revoked_at is not null)::int)
        from public.ai_credits c where c.source = 'stripe' and c.purchased_at >= p_from and c.purchased_at < p_to),
    'ledger', coalesce((
      select jsonb_object_agg(x.k, x.v) from (
        select l.wallet || ':' || l.entry_type as k, coalesce(sum(l.amount), 0)::bigint as v
          from public.credit_ledger l where l.created_at >= p_from and l.created_at < p_to
         group by l.wallet, l.entry_type) x), '{}'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', x.action_type, 'model', x.model, 'succeeded', x.ok, 'released', x.ko,
               'credits', x.credits, 'cost_eur', x.cost, 'avg_cost_eur', x.avg_cost, 'p95_cost_eur', x.p95_cost,
               'avg_input', x.avg_in, 'avg_output', x.avg_out, 'p95_latency_ms', x.p95_lat) order by x.action_type, x.model)
        from (
          select a.action_type, coalesce(a.model, '—') as model,
                 count(*) filter (where a.status = 'succeeded')::int as ok,
                 count(*) filter (where a.status = 'released')::int as ko,
                 coalesce(sum(a.credits) filter (where a.status = 'succeeded'), 0)::int as credits,
                 -- Coût réel total : actions réussies ET restituées (le fournisseur a pu être payé).
                 round(coalesce(sum(a.cost_eur), 0), 4) as cost,
                 round(coalesce(avg(a.cost_eur) filter (where a.status = 'succeeded'), 0), 6) as avg_cost,
                 round(coalesce((percentile_cont(0.95) within group (order by a.cost_eur) filter (where a.status = 'succeeded'))::numeric, 0), 6) as p95_cost,
                 round(coalesce(avg(a.input_tokens) filter (where a.status = 'succeeded'), 0)) as avg_in,
                 round(coalesce(avg(a.output_tokens) filter (where a.status = 'succeeded'), 0)) as avg_out,
                 round(coalesce((percentile_cont(0.95) within group (order by a.latency_ms) filter (where a.status = 'succeeded'))::numeric, 0)) as p95_lat
            from public.ai_actions a
           where a.reserved_at >= p_from and a.reserved_at < p_to
           group by a.action_type, coalesce(a.model, '—')) x), '[]'::jsonb),
    'cost_by_plan', coalesce((
      select jsonb_object_agg(x.plan, x.cost) from (
        select case when u.plan::text in ('premium', 'coparentalite') then u.plan::text else 'gratuit' end as plan,
               round(coalesce(sum(a.cost_eur), 0), 4) as cost
          from public.ai_actions a join public.users u on u.id = a.user_id
         where a.reserved_at >= p_from and a.reserved_at < p_to
         group by 1) x), '{}'::jsonb),
    'failed_payments', (select count(*)::int from public.payments p where p.status::text = 'failed' and p.created_at >= p_from and p.created_at < p_to),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object('scope', x.scope, 'day', x.day, 'spent_eur', x.spent_eur, 'cap_eur', x.cap_eur) order by x.day desc)
        from (select * from public.ai_spend_alerts s where s.day >= (p_from at time zone 'UTC')::date order by s.day desc limit 30) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_credit_dashboard(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_credit_dashboard(timestamptz, timestamptz) to authenticated;


-- =====================================================================
-- 8. ESPACE FAMILIAL : 2 ADULTES, 5 FICHES ENFANTS
-- =====================================================================
-- Par enfant : le titulaire + UN parent (gardien actif ou invitation « parent » en attente émise par
-- le titulaire). Les proches (lecture limitée) ne sont pas concernés. Les familles déjà au-delà
-- restent en l'état (seules les nouvelles invitations / acceptations sont contrôlées).
create or replace function public.family_adult_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_status  text;
  v_exp     timestamptz;
  v_n       integer;
begin
  if tg_table_name = 'family_invitation_children' then
    select i.role, i.status, i.expires_at into v_role, v_status, v_exp from public.family_invitations i where i.id = new.invitation_id;
    if v_role is distinct from 'parent' or v_status is distinct from 'pending' or v_exp <= now() then
      return new;
    end if;
    -- Seul le titulaire de la fiche peut faire entrer un parent (0360) : une invitation d'un
    -- autre adulte n'accorde rien et n'est pas comptée.
    if not exists (select 1 from public.children c join public.family_invitations i on i.id = new.invitation_id
                    where c.id = new.child_id and c.user_id = i.inviter_id) then
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('family_adults:' || new.child_id::text, 0));
    select count(*)::integer into v_n from (
      select g.id from public.child_guardians g
       where g.child_id = new.child_id and g.status = 'active' and g.role = 'parent'
      union all
      select i.id from public.family_invitation_children ic
        join public.family_invitations i on i.id = ic.invitation_id
       where ic.child_id = new.child_id and i.id <> new.invitation_id
         and i.role = 'parent' and i.status = 'pending' and i.expires_at > now()
         and exists (select 1 from public.children c where c.id = ic.child_id and c.user_id = i.inviter_id)
    ) x;
  else
    if new.role <> 'parent' or new.status <> 'active'
       or (tg_op = 'UPDATE' and old.role = 'parent' and old.status = 'active') then
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('family_adults:' || new.child_id::text, 0));
    select count(*)::integer into v_n from public.child_guardians g
     where g.child_id = new.child_id and g.status = 'active' and g.role = 'parent' and g.id <> new.id;
  end if;
  if v_n >= 1 then
    raise exception 'Deux adultes au maximum par enfant' using errcode = '54000', hint = 'adult_limit';
  end if;
  return new;
end;
$$;
revoke all on function public.family_adult_limit_guard() from public, anon, authenticated;

drop trigger if exists trg_family_invitation_adult_limit on public.family_invitation_children;
create trigger trg_family_invitation_adult_limit
  before insert on public.family_invitation_children
  for each row execute function public.family_adult_limit_guard();
drop trigger if exists trg_child_guardians_adult_limit on public.child_guardians;
create trigger trg_child_guardians_adult_limit
  before insert or update of role, status on public.child_guardians
  for each row execute function public.family_adult_limit_guard();

-- 5 fiches enfants actives par titulaire : à la création, à la restauration (deleted_at → null)
-- et au changement de titulaire.
create or replace function public.children_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if new.deleted_at is not null
     or (tg_op = 'UPDATE' and old.deleted_at is null and old.user_id = new.user_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('children:' || new.user_id::text, 0));
  select count(*)::integer into v_n from public.children c
   where c.user_id = new.user_id and c.deleted_at is null and c.id <> new.id;
  if v_n >= 5 then
    raise exception 'Cinq fiches enfants au maximum' using errcode = '54000', hint = 'children_limit';
  end if;
  return new;
end;
$$;
revoke all on function public.children_limit_guard() from public, anon, authenticated;

drop trigger if exists trg_children_limit on public.children;
create trigger trg_children_limit
  before insert or update of deleted_at, user_id on public.children
  for each row execute function public.children_limit_guard();


-- =====================================================================
-- ROLLBACK (manuel, dans cet ordre)
-- =====================================================================
-- drop trigger if exists trg_children_limit on public.children;
-- drop function if exists public.children_limit_guard();
-- drop trigger if exists trg_child_guardians_adult_limit on public.child_guardians;
-- drop trigger if exists trg_family_invitation_adult_limit on public.family_invitation_children;
-- drop function if exists public.family_adult_limit_guard();
-- drop function if exists public.admin_credit_dashboard(timestamptz, timestamptz);
-- drop function if exists public.admin_credit_user(uuid);
-- drop function if exists public.admin_credit_adjust(uuid, text, integer, text, text);
-- drop function if exists public.admin_credit_config_history(integer);
-- drop function if exists public.admin_credit_config_set(jsonb, text);
-- drop function if exists public.credits_revoke_payment(text, text);
-- drop function if exists public.credits_sweep(integer);
-- drop function if exists public.credits_release(uuid, uuid, text, text, integer, integer, numeric);
-- drop function if exists public.credits_confirm(uuid, uuid, text, integer, integer, integer, integer, numeric, integer);
-- drop function if exists public.credits_reserve(uuid, text, text, uuid);
-- drop function if exists public.credits_balance(uuid);
-- drop function if exists public._credits_state(uuid);
-- drop function if exists public._credits_sync(uuid);
-- drop function if exists public._credits_release(uuid, uuid, text, text, integer, integer, numeric);
-- drop function if exists public._credits_ms(timestamptz);
-- drop function if exists public._credits_period(uuid, timestamptz);
-- drop function if exists public._credits_months_elapsed(timestamptz, timestamptz);
-- drop function if exists public._credits_add_months(timestamptz, integer);
-- drop table if exists public.credit_ledger;        -- (les triggers n'empêchent pas DROP)
-- drop table if exists public.ai_spend_alerts;
-- drop table if exists public.ai_actions;
-- drop function if exists public.credit_ledger_immutable();
-- drop function if exists public.credit_ledger_no_truncate();
-- drop function if exists public.ai_actions_guard();
-- drop function if exists public.credit_config_current();
-- drop function if exists public._credits_cfg();
-- drop table if exists public.credit_config;
-- drop function if exists public.credit_config_append_only();
-- drop function if exists public._credit_config_valid(jsonb);
-- (puis rejouer la définition de grant_ai_credits de 0510)
-- delete from public.ai_credits where source = 'admin';
-- alter table public.ai_credits drop constraint if exists chk_ai_credits_source;
-- alter table public.ai_credits alter column stripe_session_id set not null;
-- alter table public.ai_credits drop column if exists revoked_at;
-- alter table public.ai_credits drop column if exists source;
-- drop index if exists public.idx_ai_credits_user_usable;
-- drop index if exists public.idx_ai_credits_payment_intent;
-- create index if not exists idx_ai_credits_user_available on public.ai_credits(user_id, expires_at, purchased_at) where remaining > 0;
