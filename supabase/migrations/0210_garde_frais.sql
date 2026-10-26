-- =====================================================================
-- Lien Parental — 0210_garde_frais.sql
-- Persistance réelle des écrans « Garde », « Frais partagés », et
-- compléments additifs pour le coffre-fort / les témoignages.
--
-- Principes :
--   * toutes les tables sont propriétaires (user_id = auth.uid()) ;
--   * RLS activée + policies owner-only (select/insert/update/delete) ;
--   * changements STRICTEMENT additifs sur les tables existantes
--     (expand) — aucune colonne supprimée, aucune donnée réécrite.
--   * migration ré-exécutable (if not exists / drop policy if exists).
--
-- Rollback : voir le bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. GARDE — une configuration de planning par utilisateur
-- =====================================================================
-- La config (rythme, date de début, lieu, vacances…) est un objet métier
-- versionné côté application (lib/garde.ts → GardeConfig). Elle est lue et
-- écrite d'un bloc : jsonb est le bon compromis (pas de requête par champ).
create table if not exists public.garde_configs (
  user_id     uuid primary key references public.users(id) on delete cascade,
  config      jsonb not null,
  version     integer not null default 1 check (version >= 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_garde_config_object check (jsonb_typeof(config) = 'object'),
  constraint chk_garde_config_size   check (pg_column_size(config) <= 16384)
);

drop trigger if exists trg_garde_configs_updated_at on public.garde_configs;
create trigger trg_garde_configs_updated_at
  before update on public.garde_configs
  for each row execute function public.handle_updated_at();


-- =====================================================================
-- 2. FRAIS PARTAGÉS — dépenses
-- =====================================================================
-- Montants en centimes entiers (jamais de flottant pour l'argent).
-- part_moi = part à la charge de l'utilisateur, en % entier (0..100).
create table if not exists public.expenses (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  libelle                   text not null check (char_length(libelle) between 1 and 80),
  amount_cents              integer not null check (amount_cents > 0 and amount_cents <= 10000000),
  categorie                 text not null
                              check (categorie in ('scolarite','sante','activites','vetements','autre')),
  date                      date not null,
  paid_by                   text not null check (paid_by in ('moi','autre')),
  part_moi                  integer not null default 50 check (part_moi between 0 and 100),
  statut                    text not null default 'en-attente'
                              check (statut in ('en-attente','rembourse')),
  reimbursed_at             date,
  justificatif_document_id  uuid references public.documents(id) on delete set null,
  note                      text check (note is null or char_length(note) <= 500),
  children_ids              uuid[] not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz,
  constraint chk_expense_reimbursed check (statut <> 'rembourse' or reimbursed_at is not null)
);

-- Liste principale : dépenses actives de l'utilisateur, plus récentes d'abord.
create index if not exists idx_expenses_user_date
  on public.expenses(user_id, date desc, created_at desc)
  where deleted_at is null;

-- FK sans index = scan lors d'un delete sur documents (on delete set null).
create index if not exists idx_expenses_justificatif
  on public.expenses(justificatif_document_id)
  where justificatif_document_id is not null;

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.handle_updated_at();


-- =====================================================================
-- 3. PENSION ALIMENTAIRE — versements reçus
-- =====================================================================
-- Une ligne par mois reçu (month = 1er jour du mois). L'unicité
-- (user_id, month) rend « marquer comme reçu » idempotent (upsert).
create table if not exists public.pension_payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  amount_cents  integer not null check (amount_cents >= 0 and amount_cents <= 10000000),
  received_at   date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists idx_pension_user_month
  on public.pension_payments(user_id, month desc);

drop trigger if exists trg_pension_payments_updated_at on public.pension_payments;
create trigger trg_pension_payments_updated_at
  before update on public.pension_payments
  for each row execute function public.handle_updated_at();


-- =====================================================================
-- 4. COFFRE-FORT — compléments additifs
-- =====================================================================
-- Métadonnées saisies dans « Ajouter un document » (maquette) qui
-- n'avaient pas de colonne : date du document, source, description.
alter table public.documents add column if not exists doc_date    date;
alter table public.documents add column if not exists source      text;
alter table public.documents add column if not exists description text;

do $$ begin
  alter table public.documents
    add constraint chk_documents_source_len check (source is null or char_length(source) <= 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.documents
    add constraint chk_documents_description_len check (description is null or char_length(description) <= 280);
exception when duplicate_object then null; end $$;

-- Libellé libre d'un partage (« Me Dupont (avocat) ») — affiché au parent uniquement.
alter table public.shares add column if not exists label text;
do $$ begin
  alter table public.shares
    add constraint chk_shares_label_len check (label is null or char_length(label) <= 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shares
    add constraint chk_shares_token_len check (char_length(token) >= 32) not valid;  -- lignes existantes non revalidées
exception when duplicate_object then null; end $$;

-- Limite du bucket « documents » alignée sur l'écran d'ajout : 20 Mo.
-- /!\ supabase/storage.sql (exécuté APRÈS les migrations) remet 10 Mo via son upsert :
--     ré-exécuter cette instruction après storage.sql (cf. docs/MISE_EN_SERVICE.md §1 bis.1).
update storage.buckets
   set file_size_limit = 20971520
 where id = 'documents';


-- =====================================================================
-- 5. TÉMOIGNAGES — compléments additifs
-- =====================================================================
-- 5.a Une demande = un lien partageable à PLUSIEURS témoins (maquette
-- « Témoin 1, Témoin 2… »). La contrainte UNIQUE(request_id) de 0005
-- empêchait le 2e témoin d'envoyer son témoignage. On la remplace par un
-- index simple. (Le nombre d'envois par demande est plafonné côté API.)
alter table public.testimonies drop constraint if exists testimonies_request_id_key;
create index if not exists idx_testimonies_request
  on public.testimonies(request_id, sent_at);

-- 5.b Champs de la demande saisis par le parent (étapes 1 à 3) :
--   subject   : titre interne (« Procédure JAF ») ;
--   parents   : noms des parents concernés (montrés au témoin) ;
--   enfants   : noms des enfants concernés (montrés au témoin) ;
--   auto_reminder / deadline : options de suivi.
-- `message_parent` porte le contexte (note privée, jamais exposée au témoin).
alter table public.testimony_requests add column if not exists subject       text;
alter table public.testimony_requests add column if not exists parents       text[] not null default '{}';
alter table public.testimony_requests add column if not exists enfants       text[] not null default '{}';
alter table public.testimony_requests add column if not exists auto_reminder boolean not null default true;
alter table public.testimony_requests add column if not exists deadline      date;

do $$ begin
  alter table public.testimony_requests
    add constraint chk_testimony_requests_token_len check (char_length(token) >= 32) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.testimony_requests
    add constraint chk_testimony_requests_people check (
      coalesce(array_length(parents, 1), 0) <= 10 and coalesce(array_length(enfants, 1), 0) <= 10
    );
exception when duplicate_object then null; end $$;

-- 5.c Décision du parent sur un témoignage reçu (confirmer / refuser).
-- Les témoignages restent IMMUABLES (valeur probante) : la décision vit
-- dans une table séparée, propriétaire uniquement.
create table if not exists public.testimony_reviews (
  testimony_id  uuid primary key references public.testimonies(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  decision      text not null check (decision in ('confirme','refuse')),
  decided_at    timestamptz not null default now()
);

create index if not exists idx_testimony_reviews_user
  on public.testimony_reviews(user_id);

-- 5.d Lecture publique des personnes concernées (parcours témoin).
-- Même garde que get_testimony_request_by_token : token valide, non
-- révoqué, non expiré, demande active. N'expose QUE les noms saisis par le
-- parent pour ce questionnaire (ni user_id, ni e-mail, ni contexte privé).
create or replace function public.get_testimony_request_people(p_token text)
returns table (
  parents  text[],
  enfants  text[]
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

  return query
    select r.parents, r.enfants
      from public.testimony_requests r
     where r.token = p_token
       and r.revoked_at is null
       and r.expires_at > now()
       and r.status in ('pending','opened','in_progress')
     limit 1;
end;
$$;

revoke all on function public.get_testimony_request_people(text) from public;
grant execute on function public.get_testimony_request_people(text) to anon, authenticated;


-- =====================================================================
-- 6. RLS — owner-only sur toutes les nouvelles tables
-- =====================================================================
alter table public.garde_configs     enable row level security;
alter table public.expenses          enable row level security;
alter table public.pension_payments  enable row level security;
alter table public.testimony_reviews enable row level security;

-- garde_configs
drop policy if exists garde_configs_select_self on public.garde_configs;
create policy garde_configs_select_self on public.garde_configs
  for select using (auth.uid() = user_id);
drop policy if exists garde_configs_insert_self on public.garde_configs;
create policy garde_configs_insert_self on public.garde_configs
  for insert with check (auth.uid() = user_id);
drop policy if exists garde_configs_update_self on public.garde_configs;
create policy garde_configs_update_self on public.garde_configs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists garde_configs_delete_self on public.garde_configs;
create policy garde_configs_delete_self on public.garde_configs
  for delete using (auth.uid() = user_id);

-- expenses
drop policy if exists expenses_select_self on public.expenses;
create policy expenses_select_self on public.expenses
  for select using (auth.uid() = user_id);
drop policy if exists expenses_insert_self on public.expenses;
create policy expenses_insert_self on public.expenses
  for insert with check (
    auth.uid() = user_id
    -- le justificatif doit appartenir au même utilisateur
    and (justificatif_document_id is null or exists (
      select 1 from public.documents d
       where d.id = justificatif_document_id and d.user_id = auth.uid()
    ))
  );
drop policy if exists expenses_update_self on public.expenses;
create policy expenses_update_self on public.expenses
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (justificatif_document_id is null or exists (
      select 1 from public.documents d
       where d.id = justificatif_document_id and d.user_id = auth.uid()
    ))
  );
drop policy if exists expenses_delete_self on public.expenses;
create policy expenses_delete_self on public.expenses
  for delete using (auth.uid() = user_id);

-- pension_payments
drop policy if exists pension_payments_select_self on public.pension_payments;
create policy pension_payments_select_self on public.pension_payments
  for select using (auth.uid() = user_id);
drop policy if exists pension_payments_insert_self on public.pension_payments;
create policy pension_payments_insert_self on public.pension_payments
  for insert with check (auth.uid() = user_id);
drop policy if exists pension_payments_update_self on public.pension_payments;
create policy pension_payments_update_self on public.pension_payments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists pension_payments_delete_self on public.pension_payments;
create policy pension_payments_delete_self on public.pension_payments
  for delete using (auth.uid() = user_id);

-- testimony_reviews : le parent ne peut statuer que sur SES témoignages.
drop policy if exists testimony_reviews_select_self on public.testimony_reviews;
create policy testimony_reviews_select_self on public.testimony_reviews
  for select using (auth.uid() = user_id);
drop policy if exists testimony_reviews_insert_self on public.testimony_reviews;
create policy testimony_reviews_insert_self on public.testimony_reviews
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.testimonies t where t.id = testimony_id and t.user_id = auth.uid())
  );
drop policy if exists testimony_reviews_update_self on public.testimony_reviews;
create policy testimony_reviews_update_self on public.testimony_reviews
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.testimonies t where t.id = testimony_id and t.user_id = auth.uid())
  );
drop policy if exists testimony_reviews_delete_self on public.testimony_reviews;
create policy testimony_reviews_delete_self on public.testimony_reviews
  for delete using (auth.uid() = user_id);

-- shares : la policy 0100 (owner-only) ne vérifiait pas que document_id appartient
-- au même utilisateur → on la remplace par une version qui l'exige (anti-IDOR).
drop policy if exists shares_crud_self on public.shares;
create policy shares_crud_self on public.shares
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
  );

-- Aucun accès anonyme direct aux nouvelles tables.
revoke all on public.garde_configs, public.expenses, public.pension_payments, public.testimony_reviews from anon;


-- =====================================================================
-- ROLLBACK (manuel, à exécuter dans cet ordre si nécessaire)
-- =====================================================================
-- (la policy shares_crud_self renforcée peut rester : elle est strictement plus sûre)
-- drop function if exists public.get_testimony_request_people(text);
-- drop table if exists public.testimony_reviews;
-- drop table if exists public.pension_payments;
-- drop table if exists public.expenses;
-- drop table if exists public.garde_configs;
-- alter table public.testimony_requests
--   drop constraint if exists chk_testimony_requests_people,
--   drop constraint if exists chk_testimony_requests_token_len,
--   drop column if exists deadline, drop column if exists auto_reminder,
--   drop column if exists enfants, drop column if exists parents, drop column if exists subject;
-- -- /!\ ne ré-ajouter UNIQUE(request_id) que s'il n'existe aucun doublon :
-- -- alter table public.testimonies add constraint testimonies_request_id_key unique (request_id);
-- drop index if exists public.idx_testimonies_request;
-- alter table public.shares drop constraint if exists chk_shares_token_len,
--   drop constraint if exists chk_shares_label_len, drop column if exists label;
-- alter table public.documents drop constraint if exists chk_documents_description_len,
--   drop constraint if exists chk_documents_source_len,
--   drop column if exists description, drop column if exists source, drop column if exists doc_date;
-- update storage.buckets set file_size_limit = 10485760 where id = 'documents';
