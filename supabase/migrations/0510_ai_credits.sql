-- =====================================================================
-- 0510 — Crédits d'analyses du Coach IA (achats ponctuels Stripe).
--
-- - public.ai_credits : un lot par achat (pack, quantité, restant, montant,
--   session Stripe UNIQUE = idempotence du webhook et du retour de paiement,
--   date d'expiration = achat + N mois). Lecture : l'utilisateur voit ses
--   propres lots (colonnes non Stripe uniquement). AUCUNE écriture client :
--   crédit par grant_ai_credits() (service_role, webhook / retour Checkout),
--   consommation par reserve_ai_analysis() (service_role).
-- - public.ai_usage.credit_id : une analyse payée par un crédit est inscrite
--   au même registre que les analyses du quota, avec le lot consommé. Elle
--   n'est PAS décomptée du quota mensuel (credit_id non nul).
-- - reserve_ai_analysis() : sous le MÊME verrou consultatif que
--   reserve_ai_usage (0270), quota d'abord ; quota atteint → 1 crédit du lot
--   non expiré le plus ancien (FOR UPDATE), dans la même transaction.
-- - release_ai_usage() : remboursement d'une réservation (analyse échouée) :
--   supprime la ligne ai_usage et rend le crédit éventuel, atomiquement.
-- - reserve_ai_usage() (0270) : redéfinie pour ne plus compter les lignes
--   payées par crédit (signature et droits inchangés).
--
-- Pré-requis : 0270 (ai_usage, reserve_ai_usage, mfa_satisfied).
-- ORDRE DE DÉPLOIEMENT : appliquer AVANT le code qui l'utilise (le code
-- retombe sur reserve_ai_usage / suppression directe si les fonctions
-- manquent, mais n'affiche alors aucun crédit).
-- Idempotente (rejouable). Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. REGISTRE DES CRÉDITS
-- =====================================================================
create table if not exists public.ai_credits (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  -- Identifiant du pack (lib/billing/credit-packs.ts) : la configuration vit dans le code.
  pack                   text not null,
  quantity               integer not null,
  remaining              integer not null,
  -- Montant TTC réellement payé (amount_total de la session Checkout), en centimes.
  amount_cents           integer not null,
  currency               text not null default 'eur',
  stripe_session_id      text not null,
  stripe_payment_intent  text,
  -- Horodatage de la renonciation au droit de rétractation (case cochée avant paiement).
  withdrawal_waiver_at   timestamptz,
  purchased_at           timestamptz not null default now(),
  expires_at             timestamptz not null,
  created_at             timestamptz not null default now()
);

-- Contraintes ajoutées à part (rejouables même si la table existait déjà).
alter table public.ai_credits drop constraint if exists chk_ai_credits_pack;
alter table public.ai_credits add constraint chk_ai_credits_pack check (pack ~ '^[a-z0-9_]{1,32}$');
alter table public.ai_credits drop constraint if exists chk_ai_credits_quantity;
alter table public.ai_credits add constraint chk_ai_credits_quantity check (quantity between 1 and 1000);
alter table public.ai_credits drop constraint if exists chk_ai_credits_remaining;
alter table public.ai_credits add constraint chk_ai_credits_remaining check (remaining between 0 and quantity);
alter table public.ai_credits drop constraint if exists chk_ai_credits_amount;
alter table public.ai_credits add constraint chk_ai_credits_amount check (amount_cents >= 0);
alter table public.ai_credits drop constraint if exists chk_ai_credits_currency;
alter table public.ai_credits add constraint chk_ai_credits_currency check (currency ~ '^[a-z]{3}$');
alter table public.ai_credits drop constraint if exists chk_ai_credits_session;
alter table public.ai_credits add constraint chk_ai_credits_session check (stripe_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{10,200}$');
alter table public.ai_credits drop constraint if exists chk_ai_credits_expiry;
alter table public.ai_credits add constraint chk_ai_credits_expiry check (expires_at > purchased_at);

-- Idempotence : une session Checkout ne crédite qu'une fois (webhook relivré, retour de paiement).
create unique index if not exists uq_ai_credits_session on public.ai_credits(stripe_session_id);
-- Lots consommables d'un utilisateur, du plus ancien au plus récent.
create index if not exists idx_ai_credits_user_available
  on public.ai_credits(user_id, expires_at, purchased_at) where remaining > 0;

alter table public.ai_credits enable row level security;

drop policy if exists ai_credits_select_self on public.ai_credits;
create policy ai_credits_select_self on public.ai_credits
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists mfa_required on public.ai_credits;
create policy mfa_required on public.ai_credits
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Aucun privilège par défaut ; lecture limitée aux colonnes sans identifiant Stripe.
revoke all on table public.ai_credits from public, anon, authenticated;
grant select (id, user_id, pack, quantity, remaining, amount_cents, currency, purchased_at, expires_at)
  on table public.ai_credits to authenticated;
grant all on table public.ai_credits to service_role;


-- =====================================================================
-- 2. REGISTRE D'USAGE : LOT CONSOMMÉ
-- =====================================================================
alter table public.ai_usage add column if not exists credit_id uuid;
alter table public.ai_usage drop constraint if exists fk_ai_usage_credit;
-- NO ACTION : un lot déjà consommé ne peut pas être supprimé seul (sinon ses analyses repasseraient
-- dans le quota) ; pour révoquer des crédits, mettre remaining = 0. La suppression du compte reste
-- possible (cascade users → ai_usage et ai_credits, contrôle en fin d'instruction).
alter table public.ai_usage add constraint fk_ai_usage_credit
  foreign key (credit_id) references public.ai_credits(id) on delete no action;
create index if not exists idx_ai_usage_credit on public.ai_usage(credit_id) where credit_id is not null;


-- =====================================================================
-- 3. RÉSERVATION : QUOTA PUIS CRÉDIT (même verrou que 0270)
-- =====================================================================

-- 0270 redéfinie : le quota ne compte que les analyses NON payées par crédit.
create or replace function public.reserve_ai_usage(
  p_user_id      uuid,
  p_kind         text,
  p_limit        integer,
  p_window_days  integer,
  p_analysis_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used  integer;
  v_id    uuid;
begin
  if p_user_id is null or p_kind is null or p_limit is null or p_limit < 0
     or p_window_days is null or p_window_days not between 1 and 366 then
    raise exception 'Paramètres de quota invalides' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text || ':' || p_kind, 0));

  select count(*)::int into v_used
    from public.ai_usage
   where user_id = p_user_id
     and kind = p_kind
     and credit_id is null
     and created_at > now() - make_interval(days => p_window_days);

  if v_used >= p_limit then
    return null;
  end if;

  insert into public.ai_usage (user_id, kind, analysis_id)
  values (p_user_id, p_kind, p_analysis_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, integer, integer, uuid) to service_role;

-- Réserve UNE analyse : quota mensuel d'abord, sinon 1 crédit du lot non expiré le plus ancien.
-- Renvoie { id, source: 'quota' | 'credit' } ou NULL (ni quota ni crédit).
-- Verrou consultatif par utilisateur (même clé que reserve_ai_usage) + FOR UPDATE sur le lot :
-- deux requêtes simultanées ne dépassent ni le quota ni le solde ; p_user_id borne toutes les
-- lectures et écritures (les crédits d'un utilisateur ne sont jamais consommables par un autre).
create or replace function public.reserve_ai_analysis(
  p_user_id      uuid,
  p_limit        integer,
  p_window_days  integer,
  p_analysis_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used    integer;
  v_id      uuid;
  v_credit  uuid;
begin
  if p_user_id is null or p_analysis_id is null or p_limit is null or p_limit < 0
     or p_window_days is null or p_window_days not between 1 and 366 then
    raise exception 'Paramètres de quota invalides' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text || ':analysis', 0));

  -- (p_analysis_id déjà réservé : l'index unique uq_ai_usage_analysis lève une erreur 23505.)
  select count(*)::int into v_used
    from public.ai_usage
   where user_id = p_user_id
     and kind = 'analysis'
     and credit_id is null
     and created_at > now() - make_interval(days => p_window_days);

  if v_used < p_limit then
    insert into public.ai_usage (user_id, kind, analysis_id)
    values (p_user_id, 'analysis', p_analysis_id)
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'source', 'quota');
  end if;

  select c.id into v_credit
    from public.ai_credits c
   where c.user_id = p_user_id
     and c.remaining > 0
     and c.expires_at > now()
   order by c.expires_at, c.purchased_at, c.id
   limit 1
   for update;

  if v_credit is null then
    return null;
  end if;

  update public.ai_credits set remaining = remaining - 1 where id = v_credit and user_id = p_user_id;

  insert into public.ai_usage (user_id, kind, analysis_id, credit_id)
  values (p_user_id, 'analysis', p_analysis_id, v_credit)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'source', 'credit');
end;
$$;

revoke all on function public.reserve_ai_analysis(uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_analysis(uuid, integer, integer, uuid) to service_role;

-- Libère la réservation d'une analyse qui n'a pas abouti : ligne ai_usage supprimée et, si elle
-- avait consommé un crédit, crédit rendu au même lot (même s'il a expiré entre-temps : rien n'est
-- créé, l'état d'avant la réservation est restauré). Renvoie 'quota' | 'credit' | 'none'.
create or replace function public.release_ai_usage(
  p_user_id      uuid,
  p_analysis_id  uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit  uuid;
begin
  if p_user_id is null or p_analysis_id is null then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text || ':analysis', 0));

  delete from public.ai_usage
   where user_id = p_user_id and analysis_id = p_analysis_id
  returning credit_id into v_credit;

  if not found then
    return 'none';
  end if;
  if v_credit is null then
    return 'quota';
  end if;

  update public.ai_credits
     set remaining = remaining + 1
   where id = v_credit and user_id = p_user_id and remaining < quantity;
  return 'credit';
end;
$$;

revoke all on function public.release_ai_usage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_ai_usage(uuid, uuid) to service_role;


-- =====================================================================
-- 4. CRÉDIT D'UN ACHAT (webhook Stripe / retour Checkout, service_role)
-- =====================================================================
-- Idempotent : une session déjà créditée renvoie 'duplicate' sans rien modifier.
-- Renvoie { outcome: 'granted' | 'duplicate' | 'unknown_user', expires_at? }.
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

  v_expires := p_purchased_at + make_interval(months => p_validity_months);

  insert into public.ai_credits (
    user_id, pack, quantity, remaining, amount_cents, currency,
    stripe_session_id, stripe_payment_intent, withdrawal_waiver_at, purchased_at, expires_at
  ) values (
    p_user_id, p_pack, p_quantity, p_quantity, p_amount_cents, lower(p_currency),
    p_session_id, p_payment_intent, p_waiver_at, p_purchased_at, v_expires
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('outcome', 'duplicate');
  end if;
  return jsonb_build_object('outcome', 'granted', 'expires_at', v_expires);
end;
$$;

revoke all on function public.grant_ai_credits(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_ai_credits(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz) to service_role;


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- drop function if exists public.grant_ai_credits(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz);
-- drop function if exists public.release_ai_usage(uuid, uuid);
-- drop function if exists public.reserve_ai_analysis(uuid, integer, integer, uuid);
-- (puis rejouer la définition de reserve_ai_usage de 0270, qui compte toutes les lignes)
-- alter table public.ai_usage drop constraint if exists fk_ai_usage_credit;
-- drop index if exists public.idx_ai_usage_credit;
-- alter table public.ai_usage drop column if exists credit_id;
-- drop table if exists public.ai_credits;
