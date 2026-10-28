-- =====================================================================
-- 0500 — Modération des comptes : journal de modération (avertissement,
-- suspension temporaire, désactivation, réactivation).
--
-- - Table public.account_moderation : une ligne par décision, avec le
--   motif (code + précisions), la fin de suspension et l'administrateur.
-- - Lecture : administrateurs uniquement (RLS). AUCUNE écriture directe
--   (ni anon, ni authenticated) : l'écriture passe par la fonction
--   admin_moderate_account(), appelée par le serveur avec la session de
--   l'administrateur (jamais la service_role), qui écrit dans la MÊME
--   transaction le journal de modération et le journal d'audit (0400).
-- - L'état du compte reste porté par auth.users.banned_until (GoTrue) :
--   une suspension expire seule ; ce journal en garde l'historique.
-- - Le texte libre (précisions) n'est PAS recopié dans audit_log
--   (minimisation) : seuls le code du motif et la date de fin y figurent.
--
-- Pré-requis : 0007 (audit_log), 0102 (is_admin), 0400 (admin_ops_assert,
-- actor_id), 0480 (is_admin_aal2 = is_admin).
-- Idempotente (rejouable). Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. TABLE
-- =====================================================================
create table if not exists public.account_moderation (
  id          uuid primary key default gen_random_uuid(),
  -- Compte concerné. Purge du compte (30 jours après la suppression) : historique effacé avec lui.
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  reason_code text,
  reason      text,
  until       timestamptz,
  admin_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Contraintes ajoutées à part (rejouables même si la table existait déjà).
alter table public.account_moderation drop constraint if exists chk_account_moderation_kind;
alter table public.account_moderation add constraint chk_account_moderation_kind
  check (kind in ('warning', 'suspension', 'deactivation', 'reactivation'));

alter table public.account_moderation drop constraint if exists chk_account_moderation_reason_code;
alter table public.account_moderation add constraint chk_account_moderation_reason_code
  check (
    (kind = 'reactivation' and reason_code is null)
    or reason_code in ('comportement', 'harcelement', 'contenu', 'usurpation', 'spam', 'fraude', 'securite', 'autre')
  );

alter table public.account_moderation drop constraint if exists chk_account_moderation_reason;
alter table public.account_moderation add constraint chk_account_moderation_reason
  check (reason is null or (length(reason) between 1 and 500));

alter table public.account_moderation drop constraint if exists chk_account_moderation_until;
alter table public.account_moderation add constraint chk_account_moderation_until
  check ((kind = 'suspension') = (until is not null) and (until is null or until > created_at));

create index if not exists idx_account_moderation_user on public.account_moderation(user_id, created_at desc);

comment on table public.account_moderation is
  'Journal de modération des comptes (0500). Lecture admin ; écriture via admin_moderate_account() uniquement.';


-- =====================================================================
-- 2. RLS : lecture réservée aux administrateurs, aucune écriture client
-- =====================================================================
alter table public.account_moderation enable row level security;

-- is_admin_aal2() = is_admin() depuis 0480 (point unique de la règle d'accès admin).
drop policy if exists account_moderation_select_admin on public.account_moderation;
create policy account_moderation_select_admin on public.account_moderation
  for select to authenticated
  using ((select public.is_admin_aal2()));

revoke all on table public.account_moderation from anon;
revoke insert, update, delete, truncate on table public.account_moderation from authenticated;
grant select on table public.account_moderation to authenticated;


-- =====================================================================
-- 3. ÉCRITURE : décision + audit dans la même transaction
-- =====================================================================
-- Refus : soi-même, un compte administrateur, un compte supprimé ou inconnu.
-- La date de fin d'une suspension est bornée (futur, 31 jours au plus).
create or replace function public.admin_moderate_account(
  p_user_id     uuid,
  p_kind        text,
  p_reason_code text default null,
  p_reason      text default null,
  p_until       timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := public.admin_ops_assert();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_plan   text;
  v_del    timestamptz;
  v_id     uuid;
begin
  if p_user_id is null or p_kind is null or p_kind not in ('warning', 'suspension', 'deactivation', 'reactivation') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if p_kind = 'reactivation' then
    if p_reason_code is not null then
      raise exception 'no reason code for reactivation' using errcode = '22023';
    end if;
  elsif p_reason_code is null
     or p_reason_code not in ('comportement', 'harcelement', 'contenu', 'usurpation', 'spam', 'fraude', 'securite', 'autre') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'reason too long' using errcode = '22023';
  end if;
  if p_kind = 'suspension' then
    if p_until is null or p_until <= now() or p_until > now() + interval '31 days' then
      raise exception 'invalid until' using errcode = '22023';
    end if;
  elsif p_until is not null then
    raise exception 'until only for suspension' using errcode = '22023';
  end if;

  if p_user_id = v_actor then
    raise exception 'cannot moderate own account' using errcode = '42501';
  end if;
  select u.plan::text, u.deleted_at into v_plan, v_del from public.users u where u.id = p_user_id;
  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  if v_del is not null then
    raise exception 'account deleted' using errcode = '22023';
  end if;
  if v_plan = 'admin' then
    raise exception 'cannot moderate an admin' using errcode = '42501';
  end if;

  insert into public.account_moderation (user_id, kind, reason_code, reason, until, admin_id)
  values (p_user_id, p_kind, p_reason_code, v_reason, p_until, v_actor)
  returning id into v_id;

  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (
    p_user_id, v_actor, 'admin',
    case p_kind
      when 'warning' then 'admin.account.warn'
      when 'suspension' then 'admin.account.suspend'
      when 'deactivation' then 'admin.account.deactivate'
      else 'admin.account.reactivate'
    end,
    'users', p_user_id::text,
    jsonb_strip_nulls(jsonb_build_object('moderation_id', v_id, 'reason_code', p_reason_code, 'until', p_until))
  );

  return v_id;
end;
$$;

revoke all on function public.admin_moderate_account(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.admin_moderate_account(uuid, text, text, text, timestamptz) to authenticated;


-- =====================================================================
-- 4. LECTURES (liste et fiche du back-office)
-- =====================================================================
-- Liste : fin de ban GoTrue et nombre d'avertissements pour une page de comptes.
create or replace function public.admin_accounts_moderation(p_ids uuid[])
returns table (user_id uuid, banned_until timestamptz, warnings integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_ops_assert();
  if coalesce(array_length(p_ids, 1), 0) > 1000 then
    raise exception 'too many ids' using errcode = '22023';
  end if;
  return query
  select i.id,
         a.banned_until,
         (select count(*)::integer from public.account_moderation m where m.user_id = i.id and m.kind = 'warning')
    from unnest(coalesce(p_ids, '{}'::uuid[])) as i(id)
    left join auth.users a on a.id = i.id;
end;
$$;

revoke all on function public.admin_accounts_moderation(uuid[]) from public, anon;
grant execute on function public.admin_accounts_moderation(uuid[]) to authenticated;

-- Fiche : nombre d'avertissements et 50 dernières décisions (adresse de l'administrateur).
create or replace function public.admin_account_moderation(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_ops_assert();
  return jsonb_build_object(
    'warnings', (select count(*)::integer from public.account_moderation m where m.user_id = p_user_id and m.kind = 'warning'),
    'history', coalesce((
      select jsonb_agg(x order by x.created_at desc)
        from (
          select m.id, m.kind, m.reason_code, m.reason, m.until, m.created_at, u.email::text as admin_email
            from public.account_moderation m
            left join public.users u on u.id = m.admin_id
           where m.user_id = p_user_id
           order by m.created_at desc
           limit 50
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_account_moderation(uuid) from public, anon;
grant execute on function public.admin_account_moderation(uuid) to authenticated;


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- drop function if exists public.admin_account_moderation(uuid);
-- drop function if exists public.admin_accounts_moderation(uuid[]);
-- drop function if exists public.admin_moderate_account(uuid, text, text, text, timestamptz);
-- drop table if exists public.account_moderation;
