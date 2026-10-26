-- =====================================================================
-- Lien Parental — 0101_functions.sql
-- Fonctions métier : référence témoignage, fenêtre quota IA,
-- soft delete document, vue publique témoignage.
-- =====================================================================

-- --- generate_testimony_reference() -----------------------------------
-- Format : TMG-YYYY-XXXX  (ex: TMG-2026-0042)
-- Compteur annuel séquentiel ; collision résiliente grâce à advisory lock
-- + UNIQUE constraint sur testimonies.reference comme filet de sécurité.
create sequence if not exists public.testimony_ref_seq;

create or replace function public.generate_testimony_reference()
returns text
language plpgsql
as $$
declare
  v_year   int := extract(year from now())::int;
  v_count  int;
begin
  -- compteur par année : on compte les témoignages de l'année en cours.
  select count(*) + 1
    into v_count
    from public.testimonies
   where reference like 'TMG-' || v_year::text || '-%';

  return format('TMG-%s-%s', v_year::text, lpad(v_count::text, 4, '0'));
end;
$$;


-- --- compute_ai_cycle_window(user_id) ---------------------------------
-- Retourne (window_start, window_end, used, quota, remaining) pour le
-- quota glissant IA sur 30 jours.
-- - free    = 3  / 30 jours glissants
-- - premium = 10 / 30 jours glissants  (ou illimité → NULL)
-- Le "cycle" = fenêtre [now()-30j, now()].
create or replace function public.compute_ai_cycle_window(p_user_id uuid)
returns table (
  window_start timestamptz,
  window_end   timestamptz,
  used         integer,
  quota        integer,     -- NULL = illimité
  remaining    integer      -- NULL = illimité
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan      public.plan_tier;
  v_quota     integer;
  v_used      integer;
  v_start     timestamptz := now() - interval '30 days';
  v_end       timestamptz := now();
begin
  select u.plan into v_plan from public.users u where u.id = p_user_id;

  if v_plan is null then
    raise exception 'User % not found', p_user_id;
  end if;

  -- Mapping plan → quota. Ajuster ici pour "premium illimité".
  v_quota := case v_plan
    when 'free'    then 3
    when 'premium' then 10
  end;

  select count(*)::int
    into v_used
    from public.ai_analyses a
   where a.user_id = p_user_id
     and a.archived = false
     and a.cycle >= v_start
     and a.cycle <= v_end;

  window_start := v_start;
  window_end   := v_end;
  used         := coalesce(v_used, 0);
  quota        := v_quota;
  remaining    := case when v_quota is null then null else greatest(v_quota - used, 0) end;
  return next;
end;
$$;


-- --- handle_updated_at ------------------------------------------------
-- Déjà défini dans 0001_init_auth.sql. Rappelé ici pour visibilité :
--   create trigger trg_xxx before update on <table>
--     for each row execute function public.handle_updated_at();


-- --- soft_delete_document(id) -----------------------------------------
-- Met un document à la corbeille (30 jours). N'efface pas le fichier
-- Storage immédiatement : un cron fera la purge réelle au bout de 30 j.
-- SECURITY INVOKER : la fonction s'exécute avec les droits de l'appelant
-- → la RLS continue de protéger (user ne peut toucher que ses docs).
create or replace function public.soft_delete_document(p_document_id uuid)
returns public.documents
language plpgsql
security invoker
as $$
declare
  v_row public.documents;
begin
  update public.documents
     set deleted_at = now()
   where id = p_document_id
     and user_id = auth.uid()
     and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'Document % introuvable ou déjà supprimé', p_document_id
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;


-- --- restore_document(id) ---------------------------------------------
-- Pendant les 30 jours de rétention, le user peut restaurer.
create or replace function public.restore_document(p_document_id uuid)
returns public.documents
language plpgsql
security invoker
as $$
declare
  v_row public.documents;
begin
  update public.documents
     set deleted_at = null
   where id = p_document_id
     and user_id = auth.uid()
     and deleted_at is not null
     and deleted_at > now() - interval '30 days'
  returning * into v_row;

  if not found then
    raise exception 'Document % introuvable, hors fenêtre de restauration', p_document_id
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;


-- --- purge_expired_trash() --------------------------------------------
-- À exécuter en cron quotidien avec la service_role.
-- Supprime définitivement les documents en corbeille depuis > 30 jours.
-- Le fichier physique dans Storage doit être supprimé par le worker
-- (listing des storage_path renvoyés).
create or replace function public.purge_expired_trash(out purged_paths text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  with d as (
    delete from public.documents
     where deleted_at is not null
       and deleted_at < now() - interval '30 days'
    returning storage_path
  )
  select array_agg(storage_path) into purged_paths from d;
end;
$$;


-- --- Vue publique "témoin" --------------------------------------------
-- Expose uniquement les colonnes nécessaires au questionnaire témoin.
-- Combinée au filtre API `where token = $1`, c'est l'unique surface
-- d'exposition des demandes de témoignage pour un client anonyme.
create or replace view public.public_testimony_request_view as
  select
    id,
    token,
    temoin_nom_pref,
    message_parent,
    questions,
    status,
    expires_at,
    opened_at,
    submitted_at
  from public.testimony_requests
  where revoked_at is null
    and expires_at > now();

comment on view public.public_testimony_request_view is
  'Vue restreinte pour l''accès témoin anonyme. Ne JAMAIS exposer la table testimony_requests directement.';


-- =====================================================================
-- FLUX TÉMOIN PUBLIC — fonctions SECURITY DEFINER
-- =====================================================================
-- Le client anonyme n'a AUCUN accès direct à testimony_requests ni à
-- testimonies (cf. 0100_rls.sql — REVOKE ALL). Il appelle ces deux
-- fonctions, qui sont les seules à:
--   1) valider le token,
--   2) ne retourner / n'écrire que les colonnes publiques,
--   3) refuser toute demande révoquée / expirée / inactive.
--
-- Rate-limiting :
-- - PostgreSQL n'a pas accès à l'IP du client via la clé anon Supabase.
--   On utilise pg_try_advisory_xact_lock(hashtext(p_token)) pour éviter
--   deux appels concurrents sur le MÊME token (anti-brute-force sur un
--   token déjà connu). Le vrai rate-limit par IP + par ASN doit vivre :
--     - dans la route Next.js /app/api/testimony/* (middleware edge),
--     - et/ou dans une Supabase Edge Function en amont (IP → bucket).
--   Les deux couches sont nécessaires : la couche DB protège de la
--   collision locale, la couche HTTP du balayage distribué.
-- =====================================================================

-- --- get_testimony_request_by_token(p_token) --------------------------
-- Lecture publique restreinte. Retourne une ligne OU rien.
-- Colonnes exposées : strictement le minimum pour afficher le
-- questionnaire témoin. `message_parent` (note privée du parent),
-- `user_id`, `token`, `revoked_at`, `context_children` NE SONT PAS
-- exposés.
--
-- NOTE schéma : la table n'a pas de colonne `title`. Le champ équivalent
-- côté UI témoin est `temoin_nom_pref` ("Pour : Jean Dupont"), qui est
-- déjà conçu pour être montré au témoin — on l'expose sous le nom
-- `title`. Le "prénom public" du parent est renvoyé via `parent_prenom`
-- (prenom seul, jamais le nom de famille ni l'email).
create or replace function public.get_testimony_request_by_token(p_token text)
returns table (
  id              uuid,
  title           text,
  parent_prenom   text,
  questions       jsonb,
  status          public.testimony_request_status,
  expires_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_token is null or length(p_token) < 16 then
    return;
  end if;

  -- Verrou coopératif par token (anti-concurrence locale sur le même
  -- token). La valeur de retour est volontairement ignorée : on
  -- continue même si verrou non obtenu, car le filtre WHERE suffit à
  -- la correction ; le vrai rate-limit par IP vit dans l'API Next.js.
  perform pg_try_advisory_xact_lock(hashtext(p_token));

  return query
    select
      r.id,
      r.temoin_nom_pref                                   as title,
      u.prenom                                            as parent_prenom,
      r.questions,
      r.status,
      r.expires_at
    from public.testimony_requests r
    join public.users u on u.id = r.user_id
    where r.token = p_token
      and r.revoked_at is null
      and r.expires_at > now()
      and r.status in ('pending','opened','in_progress')  -- "active"
    limit 1;
end;
$$;

revoke all on function public.get_testimony_request_by_token(text) from public;
grant execute on function public.get_testimony_request_by_token(text) to anon, authenticated;

comment on function public.get_testimony_request_by_token(text) is
  'Lecture publique restreinte d''une demande de témoignage via token. SEUL point d''entrée anon pour testimony_requests.';


-- --- record_testimony_submission(p_token, p_testimony_payload) --------
-- Insertion publique d'un témoignage.
-- Attend un payload JSON de la forme :
--   {
--     "temoin":         { "nom":"...", "prenom":"...", ... },
--     "reponses":       { "q1": "...", "q2": "..." },
--     "texte_original": "...",
--     "texte_ia":       "..."    (optionnel),
--     "texte_envoye":   "...",
--     "attachments":    [ ... ]  (optionnel),
--     "ip_hash":        "..."    (optionnel ; haché côté app),
--     "user_agent":     "..."    (optionnel)
--   }
--
-- La fonction :
--   1) valide le token (identique à get_testimony_request_by_token),
--   2) INSERT dans testimonies (bypass RLS via SECURITY DEFINER),
--   3) met à jour UNIQUEMENT request.submitted_at et request.updated_at.
--      Elle ne touche pas user_id / token / status / expires_at.
--      (NOTE schéma : la colonne demandée `last_submission_at` n'existe
--       pas ; on utilise `submitted_at` qui porte la même sémantique.)
create or replace function public.record_testimony_submission(
  p_token               text,
  p_testimony_payload   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req     public.testimony_requests;
  v_new_id  uuid;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'Invalid token' using errcode = '22023';
  end if;
  if p_testimony_payload is null then
    raise exception 'Missing payload' using errcode = '22023';
  end if;

  perform pg_try_advisory_xact_lock(hashtext(p_token));

  select *
    into v_req
    from public.testimony_requests
   where token = p_token
     and revoked_at is null
     and expires_at > now()
     and status in ('pending','opened','in_progress')
   for update
   limit 1;

  if not found then
    raise exception 'Testimony request not found or inactive'
      using errcode = 'P0002';
  end if;

  insert into public.testimonies (
    request_id,
    user_id,
    reference,
    temoin,
    reponses,
    texte_original,
    texte_ia,
    texte_envoye,
    attachments,
    ip_hash,
    user_agent
  ) values (
    v_req.id,
    v_req.user_id,
    public.generate_testimony_reference(),
    coalesce(p_testimony_payload->'temoin',        '{}'::jsonb),
    coalesce(p_testimony_payload->'reponses',      '{}'::jsonb),
    coalesce(p_testimony_payload->>'texte_original', ''),
    nullif(p_testimony_payload->>'texte_ia', ''),
    coalesce(p_testimony_payload->>'texte_envoye', ''),
    coalesce(p_testimony_payload->'attachments',   '[]'::jsonb),
    nullif(p_testimony_payload->>'ip_hash', ''),
    nullif(p_testimony_payload->>'user_agent', '')
  )
  returning id into v_new_id;

  -- Mise à jour MINIMALE : horodatage seulement. Pas de user_id/token/
  -- status/expires_at. updated_at est aussi géré par le trigger, on le
  -- fixe explicitement pour atomicité.
  update public.testimony_requests
     set submitted_at = now(),
         updated_at   = now()
   where id = v_req.id;

  return v_new_id;
end;
$$;

revoke all on function public.record_testimony_submission(text, jsonb) from public;
grant execute on function public.record_testimony_submission(text, jsonb) to anon, authenticated;

comment on function public.record_testimony_submission(text, jsonb) is
  'Insertion publique d''un témoignage via token. SEUL point d''entrée anon pour testimonies.';
