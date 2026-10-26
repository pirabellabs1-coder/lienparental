-- =====================================================================
-- Lien Parental — 0005_testimonies.sql
-- Demandes de témoignage (parent) et témoignages (témoin via lien public).
-- =====================================================================

-- --- ENUM : statut d'une demande --------------------------------------
do $$ begin
  create type public.testimony_request_status as enum (
    'pending',     -- lien généré, pas encore ouvert
    'opened',      -- témoin a ouvert le lien
    'in_progress', -- questionnaire commencé
    'submitted',   -- témoignage envoyé
    'expired',     -- lien expiré
    'revoked'      -- parent a révoqué
  );
exception when duplicate_object then null; end $$;


-- --- testimony_requests -----------------------------------------------
-- Demande envoyée à un témoin. L'accès du témoin est anonyme : il
-- entre le token présent dans l'URL. Aucun compte requis.
create table if not exists public.testimony_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  token             text not null unique,         -- 32+ octets base64url
  temoin_nom_pref   text,                         -- "Pour: Jean Dupont" côté témoin
  message_parent    text,                         -- message d'intro au témoin
  questions         jsonb not null default '[]'::jsonb,
  -- questions : [{ "id":"q1", "label":"Comment décririez-vous...", "type":"textarea", "required":true }, ...]
  context_children  uuid[] not null default '{}',
  status            public.testimony_request_status not null default 'pending',
  expires_at        timestamptz not null,
  sent_at           timestamptz not null default now(),
  opened_at         timestamptz,
  submitted_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_testimony_requests_user
  on public.testimony_requests(user_id, created_at desc);

create index if not exists idx_testimony_requests_token
  on public.testimony_requests(token)
  where revoked_at is null;

drop trigger if exists trg_testimony_requests_updated_at on public.testimony_requests;
create trigger trg_testimony_requests_updated_at
  before update on public.testimony_requests
  for each row execute function public.handle_updated_at();


-- --- testimonies ------------------------------------------------------
-- Témoignage finalisé rattaché à une demande.
-- `reference` : identifiant visible type TMG-2026-00042 (unique, immuable).
-- `texte_original` : rédaction brute du témoin (preuve).
-- `texte_ia` : reformulation IA proposée au témoin AVANT envoi (M08).
--             Le témoin choisit de garder l'un ou l'autre → traçabilité.
create table if not exists public.testimonies (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null unique references public.testimony_requests(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,  -- dénormalisé → RLS
  reference       text not null unique,         -- format: TMG-YYYY-XXXX
  temoin          jsonb not null,
  -- temoin : { "nom":"...", "prenom":"...", "email":"...", "lien":"grand-mère", "telephone":"..." }
  reponses        jsonb not null default '{}'::jsonb,  -- { "q1": "...", "q2": "..." }
  texte_original  text not null,
  texte_ia        text,
  texte_envoye    text not null,                -- la version finalement choisie par le témoin
  attachments     jsonb not null default '[]'::jsonb,
  -- attachments : [{ "path":"temoignage-attachments/<req>/<uuid>.pdf", "mime":"...", "size":... }]
  ip_hash         text,                         -- hash salé de l'IP du témoin (preuve légère, RGPD)
  user_agent      text,
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_testimonies_user
  on public.testimonies(user_id, sent_at desc);

comment on column public.testimonies.texte_original is
  'Rédaction brute du témoin. Conservé pour valeur probante : jamais écrasé.';
comment on column public.testimonies.texte_ia is
  'Reformulation IA proposée au témoin. Conservé pour traçabilité.';
