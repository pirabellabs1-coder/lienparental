-- =====================================================================
-- Lien Parental — 0610_stockage_supplementaire.sql
-- Espace de stockage supplémentaire acheté (packs +20 / +50 / +100 Go, valables 12 mois).
--
--   1. storage_purchases : un lot par paiement Stripe (session unique), lisible par son
--      propriétaire, écrit par le serveur seul (service_role) ;
--   2. storage_extra_bytes(user) : somme des lots actifs (non révoqués, non expirés) ;
--   3. grant_storage_pack(...) : octroi idempotent (webhook ou retour de paiement) ;
--      storage_revoke_payment(pi, reason) : remboursement total ou litige ;
--   4. documents_quota_guard et my_storage_usage : quota = offre + lots actifs.
-- À l'expiration d'un lot, aucun fichier n'est supprimé : seuls les nouveaux ajouts
-- sont refusés tant que l'espace utilisé dépasse le quota.
-- Idempotente. Rollback en fin de fichier.
-- =====================================================================

create table if not exists public.storage_purchases (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  pack                   text not null check (pack ~ '^[a-z0-9_]{1,32}$'),
  gigabytes              integer not null check (gigabytes between 1 and 1000),
  amount_cents           integer not null check (amount_cents >= 0),
  currency               text not null,
  stripe_session_id      text not null unique,
  stripe_payment_intent  text,
  withdrawal_waiver_at   timestamptz,
  purchased_at           timestamptz not null,
  expires_at             timestamptz not null,
  revoked_at             timestamptz,
  revoked_reason         text check (revoked_reason in ('refund', 'dispute')),
  created_at             timestamptz not null default now()
);
create index if not exists storage_purchases_user_idx on public.storage_purchases (user_id, expires_at);
create index if not exists storage_purchases_pi_idx on public.storage_purchases (stripe_payment_intent) where stripe_payment_intent is not null;

alter table public.storage_purchases enable row level security;
revoke all on table public.storage_purchases from public, anon, authenticated;
grant select on table public.storage_purchases to authenticated;
grant select, insert, update on table public.storage_purchases to service_role;

drop policy if exists storage_purchases_select_own on public.storage_purchases;
create policy storage_purchases_select_own on public.storage_purchases
  for select to authenticated using (user_id = (select auth.uid()));

-- Espace acheté encore actif, en octets.
create or replace function public.storage_extra_bytes(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(p.gigabytes::bigint), 0) * 1073741824
    from public.storage_purchases p
   where p.user_id = p_user_id and p.revoked_at is null and p.expires_at > now();
$$;
revoke all on function public.storage_extra_bytes(uuid) from public, anon, authenticated;
grant execute on function public.storage_extra_bytes(uuid) to service_role;

create or replace function public.grant_storage_pack(
  p_user_id          uuid,
  p_pack             text,
  p_gigabytes        integer,
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
  if p_user_id is null or p_pack is null or p_gigabytes is null or p_amount_cents is null
     or p_currency is null or p_session_id is null or p_purchased_at is null
     or p_validity_months is null or p_validity_months not between 1 and 36 then
    raise exception 'Paramètres de stockage invalides' using errcode = '22023';
  end if;

  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('outcome', 'unknown_user');
  end if;

  v_expires := p_purchased_at + make_interval(months => p_validity_months);
  insert into public.storage_purchases (
    user_id, pack, gigabytes, amount_cents, currency, stripe_session_id,
    stripe_payment_intent, withdrawal_waiver_at, purchased_at, expires_at
  ) values (
    p_user_id, p_pack, p_gigabytes, p_amount_cents, lower(p_currency), p_session_id,
    p_payment_intent, p_waiver_at, p_purchased_at, v_expires
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('outcome', 'duplicate');
  end if;
  return jsonb_build_object('outcome', 'granted', 'expires_at', v_expires, 'lot_id', v_id);
end;
$$;
revoke all on function public.grant_storage_pack(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_storage_pack(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz) to service_role;

-- Remboursement total ou litige : lots du paiement révoqués (idempotent).
create or replace function public.storage_revoke_payment(p_payment_intent text, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if coalesce(p_payment_intent, '') !~ '^pi_[A-Za-z0-9_]{6,200}$' or p_reason is null or p_reason not in ('refund', 'dispute') then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  update public.storage_purchases
     set revoked_at = now(), revoked_reason = p_reason
   where stripe_payment_intent = p_payment_intent and revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.storage_revoke_payment(text, text) from public, anon, authenticated;
grant execute on function public.storage_revoke_payment(text, text) to service_role;

-- Quota appliqué = offre effective + lots actifs (0560 redéfinie).
create or replace function public.documents_quota_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_real  bigint;
  v_thumb bigint := 0;
  v_used  bigint;
  v_quota bigint;
begin
  -- Taille réelle du fichier déposé (la taille déclarée par le client n'est pas une preuve).
  select (o.metadata->>'size')::bigint into v_real
    from storage.objects o where o.bucket_id = 'documents' and o.name = new.storage_path;
  if v_real is not null and v_real > new.size_bytes then
    new.size_bytes := v_real;
  end if;
  if new.thumb_path is not null then
    select coalesce((o.metadata->>'size')::bigint, 0) into v_thumb
      from storage.objects o where o.bucket_id = 'documents' and o.name = new.thumb_path;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('storage:' || new.user_id::text, 0));
  v_used := public.storage_used_bytes(new.user_id);
  v_quota := public.storage_quota_bytes(public.effective_plan(new.user_id)) + public.storage_extra_bytes(new.user_id);
  if v_used + new.size_bytes + coalesce(v_thumb, 0) > v_quota then
    raise exception 'Espace de stockage de l''offre atteint' using errcode = '54000', hint = 'storage_quota';
  end if;
  return new;
end;
$$;
revoke all on function public.documents_quota_guard() from public, anon, authenticated;

create or replace function public.my_storage_usage()
returns table (used_bytes bigint, quota_bytes bigint, plan text)
language sql
stable
security definer
set search_path = ''
as $$
  select public.storage_used_bytes(u.id),
         public.storage_quota_bytes(public.effective_plan(u.id)) + public.storage_extra_bytes(u.id),
         public.effective_plan(u.id)
    from public.users u where u.id = (select auth.uid());
$$;
revoke all on function public.my_storage_usage() from public, anon;
grant execute on function public.my_storage_usage() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Retour arrière : rejouer 0560 (documents_quota_guard, my_storage_usage), puis
-- drop function if exists public.storage_revoke_payment(text, text);
-- drop function if exists public.grant_storage_pack(uuid, text, integer, integer, text, text, text, timestamptz, integer, timestamptz);
-- drop function if exists public.storage_extra_bytes(uuid);
-- drop table if exists public.storage_purchases;
-- ---------------------------------------------------------------------
