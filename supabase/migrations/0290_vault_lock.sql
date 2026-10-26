-- =====================================================================
-- Lien Parental — 0290_vault_lock.sql
-- Verrou du coffre-fort (chantier D) : code à 6 chiffres, mot de passe
-- du compte, empreinte / visage (WebAuthn, passkeys de plateforme).
--
--   1. vault_lock_settings  : réglages par parent (+ empreinte du code)
--   2. vault_passkeys       : clés WebAuthn enregistrées
--   3. vault_lock_attempts  : essais manqués et blocage progressif
--   4. vault_unlocks        : déverrouillages actifs par session Supabase
--   5. vault_register_failure() : comptage atomique des échecs
--   6. vault_unlocked()     : prédicat RLS (phase 2, voir bloc commenté)
--
-- Principes :
--   * RLS partout ; lecture propriétaire ou admin, colonnes sensibles
--     (empreinte du code, clé publique) jamais lisibles par authenticated ;
--   * toutes les écritures passent par les routes /api/vault-lock/** en
--     service_role, APRÈS vérification serveur (code, mot de passe,
--     signature WebAuthn) : le navigateur ne peut rien écrire directement ;
--   * politiques RESTRICTIVE mfa_required (cf. 0270) ;
--   * ré-exécutable (if not exists, drop policy if exists).
--
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. Réglages
-- =====================================================================
create table if not exists public.vault_lock_settings (
  user_id             uuid primary key references public.users(id) on delete cascade,
  -- Activé par défaut (fail-closed) : sans code ni empreinte, le mot de
  -- passe du compte déverrouille.
  enabled             boolean not null default true,
  -- scrypt$N$r$p$sel$hash, poivré par VAULT_LOCK_SECRET (lib/vault-lock/crypto.ts).
  pin_hash            text check (pin_hash is null or (pin_hash like 'scrypt$%' and length(pin_hash) < 300)),
  pin_updated_at      timestamptz,
  timeout_minutes     smallint not null default 10 check (timeout_minutes in (1, 5, 10, 15, 30)),
  background_seconds  integer  not null default 60 check (background_seconds in (0, 60, 300)),
  -- Incrémenté à chaque changement de code / suppression d'une clé :
  -- invalide les cookies de déverrouillage déjà émis sur tous les appareils.
  epoch               integer  not null default 0 check (epoch >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_vault_lock_settings_updated_at on public.vault_lock_settings;
create trigger trg_vault_lock_settings_updated_at
  before update on public.vault_lock_settings
  for each row execute function public.handle_updated_at();


-- =====================================================================
-- 2. Clés WebAuthn (passkeys de plateforme)
-- =====================================================================
create table if not exists public.vault_passkeys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  -- Identifiant de la clé (base64url) : unique sur toute la plateforme.
  credential_id  text not null unique check (length(credential_id) between 16 and 1400),
  -- Clé publique COSE (base64url). Pas un secret, mais jamais exposée au client.
  public_key     text not null check (length(public_key) between 16 and 4096),
  counter        bigint not null default 0 check (counter >= 0),
  transports     text[] not null default '{}',
  device_type    text not null default 'singleDevice' check (device_type in ('singleDevice', 'multiDevice')),
  backed_up      boolean not null default false,
  name           text not null check (length(btrim(name)) between 1 and 60),
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index if not exists idx_vault_passkeys_user on public.vault_passkeys(user_id, created_at);


-- =====================================================================
-- 3. Essais manqués (code, mot de passe)
-- =====================================================================
create table if not exists public.vault_lock_attempts (
  user_id         uuid not null references public.users(id) on delete cascade,
  scope           text not null check (scope in ('pin', 'password')),
  failed_count    integer not null default 0 check (failed_count >= 0),
  -- Nombre de blocages successifs : la durée double à chaque fois.
  lockouts        integer not null default 0 check (lockouts >= 0),
  locked_until    timestamptz,
  last_failed_at  timestamptz,
  primary key (user_id, scope)
);


-- =====================================================================
-- 4. Déverrouillages actifs (liés à la session Supabase, claim session_id)
-- =====================================================================
create table if not exists public.vault_unlocks (
  user_id     uuid not null references public.users(id) on delete cascade,
  session_id  uuid not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, session_id)
);

-- Purge des lignes expirées (tâche planifiée, cf. docs/MISE_EN_SERVICE.md).
create index if not exists idx_vault_unlocks_expires on public.vault_unlocks(expires_at);


-- =====================================================================
-- RLS + privilèges
-- =====================================================================
alter table public.vault_lock_settings enable row level security;
alter table public.vault_passkeys      enable row level security;
alter table public.vault_lock_attempts enable row level security;
alter table public.vault_unlocks       enable row level security;

drop policy if exists vault_lock_settings_select on public.vault_lock_settings;
create policy vault_lock_settings_select on public.vault_lock_settings
  for select to authenticated
  using (auth.uid() = user_id or (select public.is_admin()));

drop policy if exists vault_passkeys_select on public.vault_passkeys;
create policy vault_passkeys_select on public.vault_passkeys
  for select to authenticated
  using (auth.uid() = user_id or (select public.is_admin()));

drop policy if exists vault_lock_attempts_select on public.vault_lock_attempts;
create policy vault_lock_attempts_select on public.vault_lock_attempts
  for select to authenticated
  using (auth.uid() = user_id or (select public.is_admin()));

-- vault_unlocks : aucune politique pour authenticated (lecture via vault_unlocked() uniquement).

do $$
declare t text;
begin
  foreach t in array array['vault_lock_settings', 'vault_passkeys', 'vault_lock_attempts', 'vault_unlocks'] loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t
    );
  end loop;
end $$;

-- Privilèges par défaut de Supabase retirés ; lecture limitée aux colonnes non sensibles.
revoke all on table public.vault_lock_settings from public, anon, authenticated;
revoke all on table public.vault_passkeys      from public, anon, authenticated;
revoke all on table public.vault_lock_attempts from public, anon, authenticated;
revoke all on table public.vault_unlocks       from public, anon, authenticated;

grant select (user_id, enabled, pin_updated_at, timeout_minutes, background_seconds, created_at, updated_at)
  on table public.vault_lock_settings to authenticated;
grant select (id, user_id, name, device_type, backed_up, created_at, last_used_at)
  on table public.vault_passkeys to authenticated;
grant select (user_id, scope, failed_count, locked_until)
  on table public.vault_lock_attempts to authenticated;

grant all on table public.vault_lock_settings to service_role;
grant all on table public.vault_passkeys      to service_role;
grant all on table public.vault_lock_attempts to service_role;
grant all on table public.vault_unlocks       to service_role;


-- =====================================================================
-- 5. Échec d'authentification : comptage atomique + blocage progressif
-- =====================================================================
-- Après p_max échecs : blocage p_base * 2^(blocages-1) secondes (plafond p_cap),
-- puis le compteur repart de zéro. Upsert sous verrou de ligne : deux essais
-- simultanés ne peuvent pas contourner la limite.
create or replace function public.vault_register_failure(
  p_user_id  uuid,
  p_scope    text,
  p_max      integer default 5,
  p_base     integer default 30,
  p_cap      integer default 3600
)
returns table (locked_until timestamptz, attempts_left integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.vault_lock_attempts;
begin
  if p_user_id is null or p_scope not in ('pin', 'password') or p_max < 1 or p_base < 1 or p_cap < p_base then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;

  insert into public.vault_lock_attempts as a (user_id, scope, failed_count, last_failed_at)
  values (p_user_id, p_scope, 1, now())
  on conflict (user_id, scope) do update
     set failed_count   = case when a.locked_until is not null and a.locked_until <= now()
                               then 1 else a.failed_count + 1 end,
         locked_until   = case when a.locked_until is not null and a.locked_until <= now()
                               then null else a.locked_until end,
         last_failed_at = now()
  returning * into v_row;

  if v_row.failed_count >= p_max then
    update public.vault_lock_attempts a
       set failed_count = 0,
           lockouts     = a.lockouts + 1,
           locked_until = now() + make_interval(secs => least(p_cap::double precision, p_base * power(2, least(a.lockouts, 20))))
     where a.user_id = p_user_id and a.scope = p_scope
    returning * into v_row;
  end if;

  locked_until  := v_row.locked_until;
  attempts_left := greatest(0, p_max - v_row.failed_count);
  return next;
end;
$$;

revoke all on function public.vault_register_failure(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.vault_register_failure(uuid, text, integer, integer, integer) to service_role;


-- =====================================================================
-- 6. Prédicat « coffre déverrouillé » pour la session courante
-- =====================================================================
-- Vrai si le verrou est désactivé pour l'utilisateur, ou si un
-- déverrouillage non expiré existe pour la session Supabase du JWT.
create or replace function public.vault_unlocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
           select 1 from public.vault_lock_settings s
            where s.user_id = auth.uid() and s.enabled
         )
      or exists (
           select 1 from public.vault_unlocks u
            where u.user_id = auth.uid()
              and u.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
              and u.expires_at > now()
         );
$$;

revoke all on function public.vault_unlocked() from public, anon;
grant execute on function public.vault_unlocked() to authenticated, service_role;

comment on function public.vault_unlocked() is
  'true si le verrou du coffre est désactivé ou déverrouillé pour la session courante (0290). Prédicat des politiques vault_unlocked (phase 2).';


-- =====================================================================
-- PHASE 2 (NON ACTIVÉE) : verrou appliqué en base sur les données du coffre
-- =====================================================================
-- Aujourd'hui, lib/data/vault.ts et lib/data/testimonies.ts lisent les
-- documents depuis le navigateur (client Supabase + RLS). Le cookie de
-- session coffre protège les routes serveur, pas ces lectures directes.
-- Pour fermer la porte en base, appliquer le bloc ci-dessous APRÈS avoir
-- vérifié que les autres écrans qui lisent ces tables (accueil, dossier JAF,
-- recherche, export, messagerie) gèrent un résultat vide quand le coffre
-- est verrouillé. Le stockage `documents` est partagé avec le journal :
-- ne pas le restreindre ici (servir les fichiers du coffre par une route
-- serveur qui appelle requireVaultUnlocked()).
--
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['documents', 'categories', 'testimony_requests', 'testimonies', 'testimony_reviews'] loop
--     if to_regclass(format('public.%I', t)) is not null then
--       execute format('drop policy if exists vault_unlocked on public.%I', t);
--       execute format(
--         'create policy vault_unlocked on public.%I as restrictive for all to authenticated '
--         'using ((select public.vault_unlocked())) with check ((select public.vault_unlocked()))',
--         t
--       );
--     end if;
--   end loop;
-- end $$;


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- do $$ declare t text; begin
--   foreach t in array array['documents', 'categories', 'testimony_requests', 'testimonies', 'testimony_reviews'] loop
--     if to_regclass(format('public.%I', t)) is not null then
--       execute format('drop policy if exists vault_unlocked on public.%I', t);
--     end if;
--   end loop;
-- end $$;
-- drop function if exists public.vault_unlocked();
-- drop function if exists public.vault_register_failure(uuid, text, integer, integer, integer);
-- drop table if exists public.vault_unlocks;
-- drop table if exists public.vault_lock_attempts;
-- drop table if exists public.vault_passkeys;
-- drop table if exists public.vault_lock_settings;
