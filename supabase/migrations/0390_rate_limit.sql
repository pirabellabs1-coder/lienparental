-- =====================================================================
-- Lien Parental — 0390_rate_limit.sql
-- Limiteur de débit PARTAGÉ entre instances serverless (Vercel).
--
-- Le limiteur mémoire de lib/data/server/rate-limit.ts était propre à chaque
-- instance : en serverless, un attaquant répartissait ses essais sur N
-- instances (jetons témoin, codes avocat, déverrouillage du coffre, Coach IA).
-- Le compteur vit désormais ici, sans nouveau service externe.
--
--   * table `rate_limits` : un compteur par (clé, début de fenêtre) ;
--     fenêtre FIXE alignée sur l'epoch (floor(now / w) * w), identique au
--     calcul de Retry-After côté serveur (lib/data/server/rate-limit-core.ts) ;
--   * `rate_limit_hit(key, limit, window_s)` : incrément ATOMIQUE
--     (insert … on conflict do update … returning, verrou de ligne implicite :
--     deux appels concurrents ne peuvent pas lire le même compte) ; renvoie
--     true si la requête est autorisée (compte ≤ limit) ;
--   * purge opportuniste (1 appel sur 100, lot borné, skip locked) des
--     fenêtres expirées, + `rate_limit_purge()` pour une purge manuelle/cron.
--
-- Données : les clés sont `famille:empreinte` (HMAC tronqué calculé côté
-- serveur avec IP_HASH_SALT) : jamais d'IP, de jeton ni d'e-mail en clair.
-- Durée de conservation : au plus la fenêtre (≤ 24 h) + délai de purge.
--
-- Accès : service_role UNIQUEMENT (le serveur Next.js). RLS activée sans
-- aucune politique, privilèges retirés à anon/authenticated : un client ne
-- peut ni lire ni remettre à zéro ses compteurs.
--
-- Ré-exécutable. Aucune migration antérieure modifiée. Rollback en fin de fichier.
-- =====================================================================

create table if not exists public.rate_limits (
  key          text        not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  count        integer     not null default 1 check (count >= 0),
  expires_at   timestamptz not null,
  primary key (key, window_start)
) with (fillfactor = 70);  -- place libre dans la page : mises à jour de `count` en HOT

comment on table public.rate_limits is
  'Compteurs du limiteur de débit partagé (fenêtre fixe). Clés pseudonymisées (HMAC). Service_role uniquement. Cf. 0390.';

create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;
-- Aucune politique : seuls le propriétaire (fonctions SECURITY DEFINER) et
-- service_role (bypassrls) y accèdent.
revoke all on table public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;


-- ---------------------------------------------------------------------
-- rate_limit_hit : compte une requête, renvoie true si elle est autorisée
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now   timestamptz := now();
  v_start timestamptz;
  v_count integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'rate_limit_hit: clé invalide' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 1000000 then
    raise exception 'rate_limit_hit: limite invalide' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate_limit_hit: fenêtre invalide' using errcode = '22023';
  end if;

  v_start := to_timestamp((floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds)::double precision);

  insert into public.rate_limits as r (key, window_start, count, expires_at)
  values (p_key, v_start, 1, v_start + make_interval(secs => p_window_seconds))
  on conflict (key, window_start)
    do update set count = least(r.count, 2147483646) + 1
  returning r.count into v_count;

  -- Purge opportuniste, bornée, sans attendre les lignes verrouillées.
  if random() < 0.01 then
    delete from public.rate_limits d
     where (d.key, d.window_start) in (
       select x.key, x.window_start
         from public.rate_limits x
        where x.expires_at < v_now
        limit 500
        for update skip locked
     );
  end if;

  return v_count <= p_limit;
end;
$$;

comment on function public.rate_limit_hit(text, integer, integer) is
  'Limiteur partagé : incrémente atomiquement (clé, fenêtre fixe) et renvoie true si count <= limit. Service_role uniquement. Cf. 0390.';

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;


-- ---------------------------------------------------------------------
-- rate_limit_purge : purge complète des fenêtres expirées (cron/manuel)
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_purge()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.rate_limit_purge() from public, anon, authenticated;
grant execute on function public.rate_limit_purge() to service_role;


-- =====================================================================
-- VÉRIFICATIONS (à exécuter dans l'éditeur SQL, rôle postgres)
-- =====================================================================
-- -- Atomicité / plafond : 3 autorisés puis refus.
-- select public.rate_limit_hit('test:verif', 3, 60) from generate_series(1, 5);
--   → t, t, t, f, f
-- delete from public.rate_limits where key = 'test:verif';
-- -- Aucun accès client :
-- select has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer)', 'execute');          → f
-- select has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'execute'); → f
-- select has_table_privilege('authenticated', 'public.rate_limits', 'select');                              → f


-- =====================================================================
-- ROLLBACK (manuel) — le serveur retombe alors sur le compteur mémoire
-- (fail-open) et répond 503 sur les routes fail-closed : déployer d'abord
-- un code qui n'appelle plus rate_limit_hit.
-- =====================================================================
-- drop function if exists public.rate_limit_purge();
-- drop function if exists public.rate_limit_hit(text, integer, integer);
-- drop table if exists public.rate_limits;
-- =====================================================================
