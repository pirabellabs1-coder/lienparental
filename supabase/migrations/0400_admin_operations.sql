-- =====================================================================
-- Lien Parental — 0400_admin_operations.sql  (mission M6 : admin opérationnel)
--
-- Branche les écrans d'administration restés en maquette sur la base :
--   1. Garde commune admin_ops_assert() : is_admin_aal2() (0360), fail-closed.
--   2. Journal d'audit : colonne actor_id, ajout seulement (append-only),
--      lecture admin aal2, admin_log_action(), événements de sécurité
--      (changement d'e-mail, de mot de passe, 2FA) écrits par trigger,
--      lecture filtrée admin_list_audit().
--   3. Comptes : admin_list_accounts() (pagination par curseur, filtres),
--      admin_get_account() (fiche MINIMALE), admin_revoke_user_sessions().
--   4. Support : catégorie, dernière réponse, garde des colonnes réservées au
--      support, admin_list_tickets / admin_get_ticket / admin_update_ticket /
--      admin_reply_ticket, support_reply_mine() côté utilisateur.
--   5. Témoignages (modération) : MÉTADONNÉES uniquement
--      (admin_testimony_overview, admin_list_testimony_requests) et
--      révocation d'un lien (admin_revoke_testimony_request). Aucune fonction
--      ne renvoie le contenu, les questions, le message, le jeton ni le nom
--      du témoin.
--   6. Centre d'aide : faq_items, tutorials, daily_tips (même cycle de vie et
--      même historique que 0300), lecture publique du publié.
--   7. Audit des écritures de contenus par les administrateurs (trigger).
--   8. Durcissement : clauses admin de support_tickets / audit_log /
--      help_articles (0100) passées à is_admin_aal2().
--
-- MINIMISATION (règle produit) : l'administrateur ne lit JAMAIS le Journal,
-- le coffre, les témoignages, la messagerie ni la santé d'un utilisateur.
-- Les fonctions de ce fichier ne lisent que : public.users (identité
-- minimale, formule, stockage), le NOMBRE d'enfants, auth.users (dates,
-- vérification, suspension), auth.sessions (dates, navigateur, niveau
-- d'authentification ; jamais l'IP), subscriptions / payments, audit_log,
-- support_tickets et les métadonnées de testimony_requests.
--
-- Principes : aucune migration antérieure modifiée ; ré-exécutable ;
-- SECURITY DEFINER à search_path vide (noms qualifiés) ; revoke public /
-- anon ; écriture d'audit dans la même transaction que l'action quand
-- l'action est en base. Les actions qui passent par GoTrue ou Stripe
-- (suspension, renvoi d'e-mail, suppression) sont exécutées par la route
-- serveur puis journalisées par admin_log_action().
--
-- Pré-requis : 0007, 0100, 0200, 0300, 0360 (is_admin_aal2), 0380
-- (effective_plan_details). Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. GARDE COMMUNE
-- =====================================================================
create or replace function public.admin_ops_assert()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin_aal2(), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke all on function public.admin_ops_assert() from public, anon, authenticated;

comment on function public.admin_ops_assert() is
  'Garde des fonctions admin 0400 : administrateur ET session aal2, sinon 42501. Retourne auth.uid().';


-- =====================================================================
-- 2. JOURNAL D'AUDIT
-- =====================================================================
-- user_id (0007) = personne CONCERNÉE par l'action ; actor_id = auteur
-- (administrateur). Pour une action d'un utilisateur sur son propre compte,
-- actor_id reste NULL et actor_type = 'user'.
alter table public.audit_log add column if not exists actor_id uuid references public.users(id) on delete set null;

create index if not exists idx_audit_actor_created on public.audit_log(actor_id, created_at desc) where actor_id is not null;
create index if not exists idx_audit_id_desc       on public.audit_log(id desc);

-- Lecture : administrateurs en session aal2 uniquement. Aucune écriture client.
drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin on public.audit_log
  for select to authenticated
  using ((select public.is_admin_aal2()));

revoke insert, update, delete, truncate on table public.audit_log from anon, authenticated;
revoke all on table public.audit_log from anon;
grant select on table public.audit_log to authenticated;

-- Ajout seulement : aucune modification ; suppression réservée à la purge de
-- rétention (> 12 mois). Exception : la mise à NULL de user_id / actor_id par
-- la clé étrangère (ON DELETE SET NULL) lors de la purge d'un compte.
create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'user_id' - 'actor_id') = (to_jsonb(old) - 'user_id' - 'actor_id')
       and (new.user_id is null or new.user_id is not distinct from old.user_id)
       and (new.actor_id is null or new.actor_id is not distinct from old.actor_id) then
      return new;
    end if;
    raise exception 'audit_log is append-only' using errcode = '42501';
  end if;
  -- DELETE
  if old.created_at < now() - interval '12 months' or current_user in ('postgres', 'supabase_admin') then
    return old;
  end if;
  raise exception 'audit_log rows are kept 12 months' using errcode = '42501';
end;
$$;

revoke all on function public.audit_log_append_only() from public, anon, authenticated;

drop trigger if exists trg_audit_log_append_only on public.audit_log;
create trigger trg_audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

-- Écriture d'une action administrateur (actions exécutées hors base :
-- GoTrue, Stripe, export CSV). L'auteur vient de auth.uid(), jamais du client.
create or replace function public.admin_log_action(
  p_action    text,
  p_entity    text default null,
  p_entity_id text default null,
  p_subject   uuid default null,
  p_metadata  jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.admin_ops_assert();
  v_id    bigint;
  v_meta  jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_action is null or p_action !~ '^admin\.[a-z_]+(\.[a-z_]+){0,3}$' or length(p_action) > 80 then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  if jsonb_typeof(v_meta) <> 'object' or pg_column_size(v_meta) > 4096 then
    raise exception 'invalid metadata' using errcode = '22023';
  end if;
  if p_entity is not null and (length(p_entity) > 60 or p_entity !~ '^[a-z_]+$') then
    raise exception 'invalid entity' using errcode = '22023';
  end if;
  if p_entity_id is not null and length(p_entity_id) > 80 then
    raise exception 'invalid entity id' using errcode = '22023';
  end if;
  -- Personne concernée inexistante (déjà purgée) : on journalise sans lien.
  if p_subject is not null and not exists (select 1 from public.users u where u.id = p_subject) then
    p_subject := null;
  end if;

  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (p_subject, v_actor, 'admin', p_action, p_entity, p_entity_id, v_meta)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_log_action(text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.admin_log_action(text, text, text, uuid, jsonb) to authenticated;

-- --- Événements de sécurité (auth.*) ------------------------------------
-- Écrits par trigger, sans aucune donnée personnelle (ni ancienne ni
-- nouvelle adresse, ni facteur). Un échec d'écriture ne bloque JAMAIS
-- l'opération d'authentification (exception avalée).
create or replace function public.audit_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if not exists (select 1 from public.users u where u.id = new.id) then
      return new;
    end if;
    if new.email is distinct from old.email then
      insert into public.audit_log (user_id, actor_type, action, entity, entity_id, metadata)
      values (new.id, 'system', 'security.email_changed', 'users', new.id::text, '{}'::jsonb);
    end if;
    if (to_jsonb(new) ->> 'encrypted_password') is distinct from (to_jsonb(old) ->> 'encrypted_password') then
      insert into public.audit_log (user_id, actor_type, action, entity, entity_id, metadata)
      values (new.id, 'system', 'security.password_changed', 'users', new.id::text, '{}'::jsonb);
    end if;
    if (to_jsonb(new) ->> 'banned_until') is distinct from (to_jsonb(old) ->> 'banned_until') then
      insert into public.audit_log (user_id, actor_type, action, entity, entity_id, metadata)
      values (new.id, 'system',
              case when (to_jsonb(new) ->> 'banned_until') is null then 'security.unbanned' else 'security.banned' end,
              'users', new.id::text, '{}'::jsonb);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function public.audit_auth_user_change() from public, anon, authenticated;

-- Trigger posé seulement sur les colonnes présentes (environnements partiels).
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.column_name)
    into v_cols
    from information_schema.columns c
   where c.table_schema = 'auth' and c.table_name = 'users'
     and c.column_name in ('email', 'encrypted_password', 'banned_until');
  execute 'drop trigger if exists trg_audit_auth_user_change on auth.users';
  if v_cols is not null then
    execute format(
      'create trigger trg_audit_auth_user_change after update of %s on auth.users '
      'for each row execute function public.audit_auth_user_change()', v_cols);
  end if;
end $$;

create or replace function public.audit_mfa_factor_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := coalesce(new.user_id, old.user_id);
  v_action text;
begin
  begin
    if tg_op = 'DELETE' and old.status = 'verified' then
      v_action := 'security.mfa_removed';
    elsif tg_op <> 'DELETE' and new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
      v_action := 'security.mfa_enabled';
    end if;
    if v_action is not null and exists (select 1 from public.users u where u.id = v_user) then
      insert into public.audit_log (user_id, actor_type, action, entity, entity_id, metadata)
      values (v_user, 'system', v_action, 'users', v_user::text, '{}'::jsonb);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.audit_mfa_factor_change() from public, anon, authenticated;

drop trigger if exists trg_audit_mfa_factor_change on auth.mfa_factors;
create trigger trg_audit_mfa_factor_change
  after insert or update of status or delete on auth.mfa_factors
  for each row execute function public.audit_mfa_factor_change();

-- --- Lecture filtrée du journal -------------------------------------------
-- p_category : 'admin' (actions d'administration), 'securite' (événements de
-- sécurité et actions sensibles des utilisateurs sur leur compte) ; NULL = tout.
-- Pagination par curseur décroissant sur id (p_before_id).
-- actor_email : uniquement pour un auteur administrateur (personnel).
create or replace function public.admin_list_audit(
  p_category  text default null,
  p_action    text default null,
  p_subject   uuid default null,
  p_from      timestamptz default null,
  p_to        timestamptz default null,
  p_before_id bigint default null,
  p_limit     integer default 50
)
returns table (
  id          bigint,
  created_at  timestamptz,
  action      text,
  actor_type  text,
  actor_id    uuid,
  actor_email text,
  subject_id  uuid,
  entity      text,
  entity_id   text,
  metadata    jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  perform public.admin_ops_assert();
  if p_category is not null and p_category not in ('admin', 'securite') then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  if p_action is not null and (length(p_action) > 80 or p_action !~ '^[a-z_.]+$') then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  return query
  select a.id, a.created_at, a.action, a.actor_type, a.actor_id,
         case when a.actor_type = 'admin' then au.email::text end,
         a.user_id, a.entity, a.entity_id, a.metadata
    from public.audit_log a
    left join public.users au on au.id = a.actor_id
   where (p_category is null
          or (p_category = 'admin' and a.actor_type = 'admin')
          or (p_category = 'securite' and (a.action like 'security.%' or a.action like 'account.%')))
     and (p_action is null or a.action = p_action)
     and (p_subject is null or a.user_id = p_subject)
     and (p_from is null or a.created_at >= p_from)
     and (p_to is null or a.created_at < p_to)
     and (p_before_id is null or a.id < p_before_id)
   order by a.id desc
   limit v_limit;
end;
$$;

revoke all on function public.admin_list_audit(text, text, uuid, timestamptz, timestamptz, bigint, integer) from public, anon;
grant execute on function public.admin_list_audit(text, text, uuid, timestamptz, timestamptz, bigint, integer) to authenticated;


-- =====================================================================
-- 3. COMPTES
-- =====================================================================
create index if not exists idx_users_created_id on public.users(created_at desc, id desc);

-- Statut dérivé : supprime (deleted_at) > suspendu (auth.users.banned_until
-- futur) > non_verifie > actif. Les comptes supprimés n'apparaissent que si
-- p_status = 'supprime'. Recherche : e-mail, prénom, nom (sous-chaîne,
-- jokers échappés) ou identifiant exact.
create or replace function public.admin_list_accounts(
  p_search         text default null,
  p_plan           text default null,
  p_status         text default null,
  p_from           timestamptz default null,
  p_to             timestamptz default null,
  p_cursor_created timestamptz default null,
  p_cursor_id      uuid default null,
  p_limit          integer default 50
)
returns table (
  id              uuid,
  email           text,
  prenom          text,
  nom             text,
  plan            text,
  status          text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  email_verified  boolean,
  mfa_enabled     boolean,
  storage_mb      integer,
  children_count  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 1000));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like   text;
begin
  perform public.admin_ops_assert();
  if v_search is not null then
    if length(v_search) > 120 then
      raise exception 'search too long' using errcode = '22023';
    end if;
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  if p_plan is not null and p_plan not in ('free', 'premium', 'coparentalite', 'admin') then
    raise exception 'invalid plan' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('actif', 'non_verifie', 'suspendu', 'supprime') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if (p_cursor_created is null) <> (p_cursor_id is null) then
    raise exception 'invalid cursor' using errcode = '22023';
  end if;

  return query
  with base as (
    select u.id as uid,
           u.email::text as uemail,
           u.prenom as uprenom,
           u.nom as unom,
           u.plan::text as uplan,
           case
             when u.deleted_at is not null then 'supprime'
             when a.banned_until is not null and a.banned_until > now() then 'suspendu'
             when not coalesce(u.email_verified, false) then 'non_verifie'
             else 'actif'
           end as ustatus,
           u.created_at as ucreated,
           a.last_sign_in_at as ulast,
           coalesce(u.email_verified, false) as uverified,
           coalesce(u.mfa_enabled, false) as umfa,
           coalesce(u.storage_used_mb, 0) as ustorage
      from public.users u
      left join auth.users a on a.id = u.id
     where (v_like is null
            or u.email::text ilike v_like
            or coalesce(u.prenom, '') ilike v_like
            or coalesce(u.nom, '') ilike v_like
            or u.id::text = lower(v_search))
       and (p_plan is null or u.plan::text = p_plan)
       and (p_from is null or u.created_at >= p_from)
       and (p_to is null or u.created_at < p_to)
       and (p_cursor_created is null or (u.created_at, u.id) < (p_cursor_created, p_cursor_id))
  )
  select b.uid, b.uemail, b.uprenom, b.unom, b.uplan, b.ustatus, b.ucreated, b.ulast, b.uverified, b.umfa, b.ustorage,
         (select count(*)::integer from public.children c where c.user_id = b.uid and c.deleted_at is null)
    from base b
   where (p_status is null and b.ustatus <> 'supprime') or b.ustatus = p_status
   order by b.ucreated desc, b.uid desc
   limit v_limit;
end;
$$;

revoke all on function public.admin_list_accounts(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_list_accounts(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer) to authenticated;

-- Fiche compte MINIMALE. Aucun contenu : ni Journal, ni coffre, ni
-- témoignages, ni messagerie, ni santé ; les enfants sont seulement comptés.
create or replace function public.admin_get_account(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile  jsonb;
  v_eff      jsonb;
  v_sessions jsonb;
  v_sub      jsonb;
  v_payments jsonb;
  v_audit    jsonb;
  v_tickets  integer;
begin
  perform public.admin_ops_assert();

  select jsonb_build_object(
           'id', u.id,
           'email', u.email::text,
           'prenom', u.prenom,
           'nom', u.nom,
           'plan', u.plan::text,
           'created_at', u.created_at,
           'deleted_at', u.deleted_at,
           'email_verified', coalesce(u.email_verified, false),
           'mfa_enabled', coalesce(u.mfa_enabled, false),
           'storage_mb', coalesce(u.storage_used_mb, 0),
           'last_sign_in_at', a.last_sign_in_at,
           'banned_until', a.banned_until,
           'children_count', (select count(*) from public.children c where c.user_id = u.id and c.deleted_at is null)
         )
    into v_profile
    from public.users u
    left join auth.users a on a.id = u.id
   where u.id = p_id;

  if v_profile is null then
    return null;
  end if;

  select to_jsonb(d) into v_eff from public.effective_plan_details(p_id) d;

  -- 10 dernières sessions (actives ou non) : dates, navigateur, niveau. Jamais l'IP.
  select coalesce(jsonb_agg(x order by x.last_seen_at desc), '[]'::jsonb)
    into v_sessions
    from (
      select s.created_at,
             coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) as last_seen_at,
             left(coalesce(s.user_agent, ''), 300) as user_agent,
             s.aal::text as aal
        from auth.sessions s
       where s.user_id = p_id
       order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc
       limit 10
    ) x;

  select jsonb_build_object(
           'plan', s.plan::text,
           'status', s.status::text,
           'current_period_end', s.current_period_end,
           'cancel_at_period_end', s.cancel_at_period_end,
           'canceled_at', s.canceled_at,
           'created_at', s.created_at,
           'stripe_customer_id', s.stripe_customer_id,
           'stripe_subscription_id', s.stripe_subscription_id
         )
    into v_sub
    from public.subscriptions s
   where s.user_id = p_id;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
    into v_payments
    from (
      select p.amount_cents, p.currency, p.status::text as status, p.paid_at, p.created_at
        from public.payments p
       where p.user_id = p_id
       order by p.created_at desc
       limit 5
    ) x;

  select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb)
    into v_audit
    from (
      select l.id, l.action, l.actor_type, l.created_at
        from public.audit_log l
       where l.user_id = p_id
       order by l.id desc
       limit 15
    ) x;

  select count(*)::integer into v_tickets
    from public.support_tickets t
   where t.user_id = p_id and t.status in ('open', 'in_progress', 'waiting_user');

  return jsonb_build_object(
    'profile', v_profile,
    'effective', v_eff,
    'sessions', v_sessions,
    'subscription', v_sub,
    'payments', v_payments,
    'audit', v_audit,
    'open_tickets', v_tickets
  );
end;
$$;

revoke all on function public.admin_get_account(uuid) from public, anon;
grant execute on function public.admin_get_account(uuid) to authenticated;

-- Déconnexion forcée : supprime les sessions GoTrue (refresh tokens en
-- cascade). Le jeton d'accès déjà émis reste valable jusqu'à son expiration
-- (1 h par défaut, comportement standard GoTrue). Journalisé ici.
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.admin_ops_assert();
  v_count integer;
begin
  if p_user_id = v_actor then
    raise exception 'cannot revoke own sessions here' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'unknown user' using errcode = 'P0002';
  end if;
  with d as (delete from auth.sessions s where s.user_id = p_user_id returning 1)
  select count(*)::integer into v_count from d;

  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (p_user_id, v_actor, 'admin', 'admin.account.force_logout', 'users', p_user_id::text,
          jsonb_build_object('sessions', v_count));
  return v_count;
end;
$$;

revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon;
grant execute on function public.admin_revoke_user_sessions(uuid) to authenticated;


-- =====================================================================
-- 4. SUPPORT
-- =====================================================================
alter table public.support_tickets add column if not exists category      text not null default 'contact';
alter table public.support_tickets add column if not exists last_reply_at timestamptz;
alter table public.support_tickets add column if not exists last_reply_by text;

do $$ begin
  alter table public.support_tickets add constraint chk_support_tickets_category
    check (category in ('contact', 'bug', 'technique', 'suggestion', 'abus', 'autre')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.support_tickets add constraint chk_support_tickets_last_reply_by
    check (last_reply_by is null or last_reply_by in ('user', 'admin')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.support_tickets add constraint chk_support_tickets_lengths
    check (length(subject) between 1 and 160 and length(body) between 1 and 8000
           and jsonb_typeof(messages) = 'array' and pg_column_size(messages) <= 1048576) not valid;
exception when duplicate_object then null; end $$;
-- Validation (sans risque si aucune ligne hors bornes) :
--   alter table public.support_tickets validate constraint chk_support_tickets_category;
--   alter table public.support_tickets validate constraint chk_support_tickets_last_reply_by;
--   alter table public.support_tickets validate constraint chk_support_tickets_lengths;

create index if not exists idx_support_open_queue
  on public.support_tickets(priority, created_at)
  where status in ('open', 'in_progress', 'waiting_user');

-- Colonnes réservées au support : un utilisateur (authenticated, non admin)
-- ne peut ni réécrire le fil (messages), ni changer la catégorie, ni poser un
-- autre statut que « closed ». Le fil s'enrichit par support_reply_mine() /
-- admin_reply_ticket() (SECURITY DEFINER). Même principe que
-- support_tickets_set_priority (0380) : SECURITY INVOKER, current_user réel.
create or replace function public.support_tickets_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not coalesce(public.is_admin_aal2(), false) then
    if tg_op = 'INSERT' then
      new.messages      := '[]'::jsonb;
      new.attachments   := '[]'::jsonb;
      new.status        := 'open';
      new.closed_at     := null;
      new.last_reply_at := null;
      new.last_reply_by := null;
      new.created_at    := now();
    else
      new.messages      := old.messages;
      new.attachments   := old.attachments;
      new.category      := old.category;
      new.last_reply_at := old.last_reply_at;
      new.last_reply_by := old.last_reply_by;
      new.created_at    := old.created_at;
      new.user_id       := old.user_id;
      if new.status is distinct from old.status then
        if new.status::text = 'closed' then
          new.closed_at := now();
        else
          new.status := old.status;
          new.closed_at := old.closed_at;
        end if;
      else
        new.closed_at := old.closed_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.support_tickets_guard() from public, anon, authenticated;

drop trigger if exists trg_support_tickets_guard on public.support_tickets;
create trigger trg_support_tickets_guard
  before insert or update on public.support_tickets
  for each row execute function public.support_tickets_guard();

-- Politiques : clause admin en aal2 (0100 utilisait is_admin()).
drop policy if exists support_select on public.support_tickets;
create policy support_select on public.support_tickets
  for select
  using (auth.uid() = user_id or (select public.is_admin_aal2()));

drop policy if exists support_update on public.support_tickets;
create policy support_update on public.support_tickets
  for update
  using (auth.uid() = user_id or (select public.is_admin_aal2()))
  with check (auth.uid() = user_id or (select public.is_admin_aal2()));

revoke all on table public.support_tickets from anon;

-- Rang de priorité (file : urgent, high = Coparentalité+, normal, low).
create or replace function public.support_priority_rank(p text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end;
$$;

-- File des tickets : tickets en cours d'abord, par priorité puis ancienneté
-- (premier arrivé, premier servi) ; tickets fermés ensuite, du plus récent.
-- Pagination par décalage (volume faible, tri composite) : p_offset ≤ 5000.
create or replace function public.admin_list_tickets(
  p_status   text default null,
  p_priority text default null,
  p_category text default null,
  p_search   text default null,
  p_offset   integer default 0,
  p_limit    integer default 50
)
returns table (
  id             uuid,
  subject        text,
  category       text,
  status         text,
  priority       text,
  created_at     timestamptz,
  updated_at     timestamptz,
  last_reply_at  timestamptz,
  last_reply_by  text,
  user_id        uuid,
  user_email     text,
  message_count  integer,
  total_count    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 5000));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like   text;
begin
  perform public.admin_ops_assert();
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed', 'en_cours') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid priority' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('contact', 'bug', 'technique', 'suggestion', 'abus', 'autre') then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  if v_search is not null then
    if length(v_search) > 120 then
      raise exception 'search too long' using errcode = '22023';
    end if;
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select t.id, t.subject, t.category, t.status::text, t.priority, t.created_at, t.updated_at,
         t.last_reply_at, t.last_reply_by, t.user_id, u.email::text,
         (1 + jsonb_array_length(coalesce(t.messages, '[]'::jsonb)))::integer,
         count(*) over ()
    from public.support_tickets t
    left join public.users u on u.id = t.user_id
   where (p_status is null
          or (p_status = 'en_cours' and t.status in ('open', 'in_progress', 'waiting_user'))
          or t.status::text = p_status)
     and (p_priority is null or t.priority = p_priority)
     and (p_category is null or t.category = p_category)
     and (v_like is null or t.subject ilike v_like or u.email::text ilike v_like or t.id::text = lower(v_search))
   order by case when t.status in ('open', 'in_progress', 'waiting_user') then 0 else 1 end,
            case when t.status in ('open', 'in_progress', 'waiting_user') then public.support_priority_rank(t.priority) else 0 end,
            case when t.status in ('open', 'in_progress', 'waiting_user') then extract(epoch from t.created_at) else -extract(epoch from t.updated_at) end,
            t.id
   offset v_offset
   limit v_limit;
end;
$$;

revoke all on function public.admin_list_tickets(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_tickets(text, text, text, text, integer, integer) to authenticated;

create or replace function public.admin_get_ticket(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.admin_ops_assert();
  select jsonb_build_object(
           'id', t.id,
           'subject', t.subject,
           'body', t.body,
           'category', t.category,
           'status', t.status::text,
           'priority', t.priority,
           'messages', coalesce(t.messages, '[]'::jsonb),
           'created_at', t.created_at,
           'updated_at', t.updated_at,
           'closed_at', t.closed_at,
           'last_reply_at', t.last_reply_at,
           'last_reply_by', t.last_reply_by,
           'requester', jsonb_build_object(
             'id', u.id,
             'email', u.email::text,
             'prenom', u.prenom,
             'plan', coalesce((select d.plan from public.effective_plan_details(u.id) d), 'free'),
             'deleted', u.deleted_at is not null
           )
         )
    into v
    from public.support_tickets t
    join public.users u on u.id = t.user_id
   where t.id = p_id;
  return v;
end;
$$;

revoke all on function public.admin_get_ticket(uuid) from public, anon;
grant execute on function public.admin_get_ticket(uuid) to authenticated;

create or replace function public.admin_update_ticket(p_id uuid, p_status text default null, p_priority text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.admin_ops_assert();
  v_old   record;
  v_new   record;
begin
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid priority' using errcode = '22023';
  end if;

  select t.status::text as status, t.priority, t.user_id into v_old
    from public.support_tickets t where t.id = p_id for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  update public.support_tickets t
     set status    = coalesce(p_status, t.status::text)::public.ticket_status,
         priority  = coalesce(p_priority, t.priority),
         closed_at = case
                       when coalesce(p_status, t.status::text) in ('resolved', 'closed') then coalesce(t.closed_at, now())
                       else null
                     end
   where t.id = p_id
  returning t.status::text as status, t.priority into v_new;

  if v_new.status is distinct from v_old.status or v_new.priority is distinct from v_old.priority then
    insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
    values (v_old.user_id, v_actor, 'admin', 'admin.support.update', 'support_tickets', p_id::text,
            jsonb_build_object('status', jsonb_build_array(v_old.status, v_new.status),
                               'priority', jsonb_build_array(v_old.priority, v_new.priority)));
  end if;
  return jsonb_build_object('status', v_new.status, 'priority', v_new.priority);
end;
$$;

revoke all on function public.admin_update_ticket(uuid, text, text) from public, anon;
grant execute on function public.admin_update_ticket(uuid, text, text) to authenticated;

-- Réponse du support : ajout atomique au fil, statut « en attente de
-- l'utilisateur » (ou résolu si p_resolve), notification in-app au
-- demandeur, audit (sans le texte de la réponse).
create or replace function public.admin_reply_ticket(p_id uuid, p_body text, p_resolve boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.admin_ops_assert();
  v_body  text := btrim(coalesce(p_body, ''));
  v_msg   jsonb;
  v_user  uuid;
  v_count integer;
  v_subj  text;
begin
  if length(v_body) < 1 or length(v_body) > 8000 then
    raise exception 'invalid body' using errcode = '22023';
  end if;
  select t.user_id, jsonb_array_length(coalesce(t.messages, '[]'::jsonb)), t.subject
    into v_user, v_count, v_subj
    from public.support_tickets t where t.id = p_id for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  if v_count >= 200 then
    raise exception 'thread too long' using errcode = '54000';
  end if;

  v_msg := jsonb_build_object(
    'id', gen_random_uuid(),
    'from', 'admin',
    'author_id', v_actor,
    'body', v_body,
    'at', now()
  );

  update public.support_tickets t
     set messages      = coalesce(t.messages, '[]'::jsonb) || jsonb_build_array(v_msg),
         status        = (case when p_resolve then 'resolved' else 'waiting_user' end)::public.ticket_status,
         closed_at     = case when p_resolve then now() else null end,
         last_reply_at = now(),
         last_reply_by = 'admin'
   where t.id = p_id;

  insert into public.notifications (user_id, channel, type, title, body, data)
  values (v_user, 'inapp', 'support_reponse', 'Réponse du support',
          left('Le support a répondu à votre demande « ' || v_subj || ' ».', 300),
          jsonb_build_object('ticket_id', p_id));

  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (v_user, v_actor, 'admin', 'admin.support.reply', 'support_tickets', p_id::text,
          jsonb_build_object('length', length(v_body), 'resolved', coalesce(p_resolve, false)));
  return v_msg;
end;
$$;

revoke all on function public.admin_reply_ticket(uuid, text, boolean) from public, anon;
grant execute on function public.admin_reply_ticket(uuid, text, boolean) to authenticated;

-- Réponse de l'utilisateur sur SON ticket (centre d'aide) : rouvre le ticket.
create or replace function public.support_reply_mine(p_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_body  text := btrim(coalesce(p_body, ''));
  v_msg   jsonb;
  v_count integer;
begin
  if v_uid is null or not coalesce(public.mfa_satisfied(), false) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if length(v_body) < 1 or length(v_body) > 4000 then
    raise exception 'invalid body' using errcode = '22023';
  end if;
  select jsonb_array_length(coalesce(t.messages, '[]'::jsonb)) into v_count
    from public.support_tickets t
   where t.id = p_id and t.user_id = v_uid
   for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  if v_count >= 200 then
    raise exception 'thread too long' using errcode = '54000';
  end if;
  v_msg := jsonb_build_object('id', gen_random_uuid(), 'from', 'user', 'body', v_body, 'at', now());
  update public.support_tickets t
     set messages      = coalesce(t.messages, '[]'::jsonb) || jsonb_build_array(v_msg),
         status        = 'open',
         closed_at     = null,
         last_reply_at = now(),
         last_reply_by = 'user'
   where t.id = p_id;
  return v_msg;
end;
$$;

revoke all on function public.support_reply_mine(uuid, text) from public, anon;
grant execute on function public.support_reply_mine(uuid, text) to authenticated;


-- =====================================================================
-- 5. TÉMOIGNAGES : MODÉRATION PAR MÉTADONNÉES
-- =====================================================================
-- La politique de confidentialité ne prévoit aucune lecture du contenu des
-- témoignages par l'équipe : seules des métadonnées sont exposées. Pas de
-- jeton, pas de nom du témoin, pas de message ni de questions, pas de
-- réponses. Les signalements passent par le support (catégorie « abus »).
create or replace function public.admin_testimony_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_ops_assert();
  return jsonb_build_object(
    'by_status', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
        from (select r.status::text as status, count(*) as n from public.testimony_requests r group by r.status) s
    ),
    'requests_30d', (select count(*) from public.testimony_requests r where r.created_at >= now() - interval '30 days'),
    'submitted_30d', (select count(*) from public.testimonies t where t.sent_at >= now() - interval '30 days'),
    'reports_open', (
      select count(*) from public.support_tickets t
       where t.category = 'abus' and t.status in ('open', 'in_progress', 'waiting_user')
    )
  );
end;
$$;

revoke all on function public.admin_testimony_overview() from public, anon;
grant execute on function public.admin_testimony_overview() to authenticated;

create or replace function public.admin_list_testimony_requests(
  p_status         text default null,
  p_user           uuid default null,
  p_cursor_created timestamptz default null,
  p_cursor_id      uuid default null,
  p_limit          integer default 50
)
returns table (
  id            uuid,
  user_id       uuid,
  status        text,
  created_at    timestamptz,
  expires_at    timestamptz,
  opened_at     timestamptz,
  submitted_at  timestamptz,
  revoked_at    timestamptz,
  has_testimony boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  perform public.admin_ops_assert();
  if p_status is not null and p_status not in ('pending', 'opened', 'in_progress', 'submitted', 'expired', 'revoked') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if (p_cursor_created is null) <> (p_cursor_id is null) then
    raise exception 'invalid cursor' using errcode = '22023';
  end if;
  return query
  select r.id, r.user_id, r.status::text, r.created_at, r.expires_at, r.opened_at, r.submitted_at, r.revoked_at,
         exists (select 1 from public.testimonies t where t.request_id = r.id)
    from public.testimony_requests r
   where (p_status is null or r.status::text = p_status)
     and (p_user is null or r.user_id = p_user)
     and (p_cursor_created is null or (r.created_at, r.id) < (p_cursor_created, p_cursor_id))
   order by r.created_at desc, r.id desc
   limit v_limit;
end;
$$;

revoke all on function public.admin_list_testimony_requests(text, uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_list_testimony_requests(text, uuid, timestamptz, uuid, integer) to authenticated;

-- Révocation d'un lien de témoignage encore ouvert (lien abusif signalé,
-- demande du parent, incident de sécurité). Le témoignage déjà reçu n'est
-- ni lu ni supprimé. Motif contrôlé (pas de texte libre : pas de PII).
create or replace function public.admin_revoke_testimony_request(p_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.admin_ops_assert();
  v_user  uuid;
  v_prev  text;
begin
  if p_reason is null or p_reason not in ('signalement_abus', 'demande_parent', 'securite', 'autre') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  select r.user_id, r.status::text into v_user, v_prev
    from public.testimony_requests r where r.id = p_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_prev not in ('pending', 'opened', 'in_progress') then
    return false;
  end if;
  update public.testimony_requests r
     set status = 'revoked', revoked_at = now()
   where r.id = p_id;
  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (v_user, v_actor, 'admin', 'admin.testimony.revoke', 'testimony_requests', p_id::text,
          jsonb_build_object('reason', p_reason, 'previous_status', v_prev));
  return true;
end;
$$;

revoke all on function public.admin_revoke_testimony_request(uuid, text) from public, anon;
grant execute on function public.admin_revoke_testimony_request(uuid, text) to authenticated;


-- =====================================================================
-- 6. CENTRE D'AIDE : FAQ, TUTORIELS, CONSEILS DU JOUR
-- =====================================================================
-- Même enveloppe que 0300 (statut, version, auteur, historique par trigger).
-- help_articles (0007) n'a jamais été utilisée par le code : elle est
-- conservée (contract différé) mais n'est plus la source du centre d'aide.

create table if not exists public.faq_items (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  question      text not null check (length(question) between 1 and 160),
  categorie     text not null check (categorie in (
                  'prise-en-main', 'confidentialite-securite', 'coffre-fort', 'temoignages',
                  'coach-ia', 'abonnement', 'compte')),
  reponse_md    text not null check (length(reponse_md) between 1 and 20000),
  ordre         integer not null default 100 check (ordre between 0 and 10000),
  statut        text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'archive')),
  published_at  timestamptz,
  version       integer not null default 1 check (version >= 1),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_faq_items_published check (statut <> 'publie' or published_at is not null)
);

create index if not exists idx_faq_items_public on public.faq_items(categorie, ordre) where statut = 'publie';

create table if not exists public.tutorials (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  titre         text not null check (length(titre) between 1 and 120),
  resume        text check (resume is null or length(resume) <= 300),
  duree_min     integer not null check (duree_min between 1 and 60),
  icone         text not null check (icone in ('rocket', 'sparkles', 'upload', 'user-check', 'folder-down', 'star')),
  contenu_md    text not null check (length(contenu_md) between 1 and 40000),
  ordre         integer not null default 100 check (ordre between 0 and 10000),
  statut        text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'archive')),
  published_at  timestamptz,
  version       integer not null default 1 check (version >= 1),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_tutorials_published check (statut <> 'publie' or published_at is not null)
);

create index if not exists idx_tutorials_public on public.tutorials(ordre) where statut = 'publie';

create table if not exists public.daily_tips (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  titre         text not null check (length(titre) between 1 and 80),
  texte         text not null check (length(texte) between 1 and 280),
  categorie     text not null check (categorie in ('communication', 'preuves', 'enfant', 'organisation', 'juridique', 'empathie')),
  ordre         integer not null default 100 check (ordre between 0 and 10000),
  statut        text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'archive')),
  published_at  timestamptz,
  version       integer not null default 1 check (version >= 1),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_daily_tips_published check (statut <> 'publie' or published_at is not null)
);

create index if not exists idx_daily_tips_public on public.daily_tips(ordre) where statut = 'publie';

-- Historique : nouveaux types d'entités.
alter table public.content_versions drop constraint if exists content_versions_entity_type_check;
alter table public.content_versions add constraint content_versions_entity_type_check check (entity_type in (
  'guide_fiches', 'guide_parcours', 'guide_partners', 'document_templates', 'blog_posts',
  'faq_items', 'tutorials', 'daily_tips'));

do $$
declare
  t text;
begin
  foreach t in array array['faq_items', 'tutorials', 'daily_tips']
  loop
    execute format('drop trigger if exists trg_%s_before_write on public.%I', t, t);
    execute format('create trigger trg_%s_before_write before insert or update on public.%I for each row execute function public.content_before_write()', t, t);
    execute format('drop trigger if exists trg_%s_version on public.%I', t, t);
    execute format('create trigger trg_%s_version after insert or update or delete on public.%I for each row execute function public.content_log_version()', t, t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %s_select_public on public.%I', t, t);
    execute format('create policy %s_select_public on public.%I for select to anon, authenticated using (statut = ''publie'' or (select public.is_admin_aal2()))', t, t);
    execute format('drop policy if exists %s_insert_admin on public.%I', t, t);
    execute format('create policy %s_insert_admin on public.%I for insert to authenticated with check ((select public.is_admin_aal2()))', t, t);
    execute format('drop policy if exists %s_update_admin on public.%I', t, t);
    execute format('create policy %s_update_admin on public.%I for update to authenticated using ((select public.is_admin_aal2())) with check ((select public.is_admin_aal2()))', t, t);
    execute format('drop policy if exists %s_delete_admin on public.%I', t, t);
    execute format('create policy %s_delete_admin on public.%I for delete to authenticated using ((select public.is_admin_aal2()))', t, t);

    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select on table public.%I to anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

-- help_articles (0007, inutilisée) : clause admin en aal2.
drop policy if exists help_articles_admin_write on public.help_articles;
create policy help_articles_admin_write on public.help_articles
  for all to authenticated
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));


-- =====================================================================
-- 7. AUDIT DES ÉCRITURES DE CONTENUS
-- =====================================================================
-- L'historique (content_versions) garde le contenu ; le journal d'audit
-- garde QUI a fait QUOI (création, modification, publication, dépublication,
-- archivage, suppression), sans le contenu.
create or replace function public.content_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old    jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_action text;
  v_new_st text;
  v_old_st text;
begin
  if auth.uid() is null then
    return null;  -- semences / service_role : déjà tracées par content_versions
  end if;
  -- guide_partners n'a pas de statut : « actif » tient lieu de publication.
  v_new_st := coalesce(v_row ->> 'statut', case when (v_row ->> 'actif')::boolean then 'publie' else 'brouillon' end);
  v_old_st := coalesce(v_old ->> 'statut', case when (v_old ->> 'actif')::boolean then 'publie' else 'brouillon' end);
  v_action := case
    when tg_op = 'INSERT' then 'admin.content.create'
    when tg_op = 'DELETE' then 'admin.content.delete'
    when v_new_st is distinct from v_old_st and v_new_st = 'publie' then 'admin.content.publish'
    when v_new_st is distinct from v_old_st and v_new_st = 'archive' then 'admin.content.archive'
    when v_new_st is distinct from v_old_st then 'admin.content.unpublish'
    else 'admin.content.update'
  end;
  insert into public.audit_log (actor_id, actor_type, action, entity, entity_id, metadata)
  values (
    case when exists (select 1 from public.users u where u.id = auth.uid()) then auth.uid() end,
    'admin', v_action, tg_table_name, v_row ->> 'id',
    jsonb_build_object('version', (v_row ->> 'version')::integer, 'statut', v_new_st, 'slug', left(coalesce(v_row ->> 'slug', ''), 80))
  );
  return null;
end;
$$;

revoke all on function public.content_audit() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['guide_fiches', 'guide_parcours', 'guide_partners', 'document_templates', 'blog_posts',
                           'faq_items', 'tutorials', 'daily_tips']
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I for each row execute function public.content_audit()', t, t);
  end loop;
end $$;


-- =====================================================================
-- 8. TESTS (manuels, résultat attendu en commentaire)
-- =====================================================================
-- -- Admin aal2 : select * from public.admin_list_accounts(null, null, null, null, null, null, null, 20);  → lignes
-- -- Admin aal1 / utilisateur : même appel → 42501 'admin only'
-- -- select public.admin_get_account(:id) ? 'profile'  → true ; aucune clé journal / documents / testimonies / messages / sante
-- -- update public.audit_log set action = 'x' where id = :id  → 42501 (append-only)
-- -- Utilisateur : update support_tickets set messages = '[]', status = 'resolved' where id = :mine  → inchangés
-- -- select * from public.admin_list_testimony_requests() → aucune colonne token / temoin_nom_pref / message_parent / questions
-- Scénarios automatisés : scratchpad pgtest/admin400.test.mjs (PGlite).


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre)
-- =====================================================================
-- do $$ declare t text; begin
--   foreach t in array array['guide_fiches','guide_parcours','guide_partners','document_templates','blog_posts','faq_items','tutorials','daily_tips'] loop
--     if to_regclass(format('public.%I', t)) is not null then execute format('drop trigger if exists trg_%s_audit on public.%I', t, t); end if;
--   end loop; end $$;
-- drop function if exists public.content_audit();
-- drop table if exists public.daily_tips, public.tutorials, public.faq_items;   -- après export si des contenus y ont été saisis
-- -- content_versions : conserver les lignes ; recréer la contrainte d'origine seulement s'il n'en reste aucune pour les tables supprimées.
-- drop function if exists public.admin_revoke_testimony_request(uuid, text);
-- drop function if exists public.admin_list_testimony_requests(text, uuid, timestamptz, uuid, integer);
-- drop function if exists public.admin_testimony_overview();
-- drop function if exists public.support_reply_mine(uuid, text);
-- drop function if exists public.admin_reply_ticket(uuid, text, boolean);
-- drop function if exists public.admin_update_ticket(uuid, text, text);
-- drop function if exists public.admin_get_ticket(uuid);
-- drop function if exists public.admin_list_tickets(text, text, text, text, integer, integer);
-- drop function if exists public.support_priority_rank(text);
-- drop trigger if exists trg_support_tickets_guard on public.support_tickets;
-- drop function if exists public.support_tickets_guard();
-- -- Politiques support_select / support_update / help_articles_admin_write : ré-appliquer 0100.
-- -- Colonnes support_tickets.category / last_reply_* : conserver (contract différé) ou
-- --   alter table public.support_tickets drop column category, drop column last_reply_at, drop column last_reply_by;
-- drop function if exists public.admin_revoke_user_sessions(uuid);
-- drop function if exists public.admin_get_account(uuid);
-- drop function if exists public.admin_list_accounts(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer);
-- drop index if exists public.idx_users_created_id;
-- drop function if exists public.admin_list_audit(text, text, uuid, timestamptz, timestamptz, bigint, integer);
-- drop trigger if exists trg_audit_mfa_factor_change on auth.mfa_factors;
-- drop function if exists public.audit_mfa_factor_change();
-- drop trigger if exists trg_audit_auth_user_change on auth.users;
-- drop function if exists public.audit_auth_user_change();
-- drop function if exists public.admin_log_action(text, text, text, uuid, jsonb);
-- drop trigger if exists trg_audit_log_append_only on public.audit_log;
-- drop function if exists public.audit_log_append_only();
-- -- audit_select_admin : ré-appliquer 0100. Colonne audit_log.actor_id : conserver (contract différé).
-- drop function if exists public.admin_ops_assert();
