-- =====================================================================
-- Lien Parental — 0240_journal_finances.sql
-- Finances intégrées au Journal (récap fonctionnel v2, « Nouveauté 1 ») :
--   * nouveau type d'entrée `depense` (Dépense / Paiement) ;
--   * table liée 1-1 `journal_expenses` (montant, devise, catégorie,
--     mode de paiement, bénéficiaire, justificatif) ;
--   * RLS owner-only (user_id = auth.uid()), contraintes CHECK.
--
-- Principes (mêmes que 0210) :
--   * STRICTEMENT additif : aucune colonne supprimée, aucune donnée réécrite ;
--   * ré-exécutable (if not exists / drop policy if exists / do-blocks) ;
--   * montants en centimes entiers ;
--   * justificatif dans le bucket privé existant `documents`, sous le
--     préfixe `${auth.uid()}/journal/` (déjà couvert par les policies
--     Storage « documents owner * » de supabase/storage.sql).
--
-- L'ancienne table `expenses` (0210) n'est ni modifiée ni supprimée.
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. Type d'entrée `depense`
-- =====================================================================
-- ADD VALUE est autorisé dans une transaction (PG ≥ 12) mais la nouvelle
-- valeur n'est utilisable qu'après COMMIT : rien, plus bas dans ce fichier,
-- n'emploie le littéral 'depense' typé enum (le trigger compare type::text,
-- évalué à l'exécution).
alter type public.journal_entry_type add value if not exists 'depense' before 'autre';


-- =====================================================================
-- 2. Clé composite (id, user_id) sur journal_entries
-- =====================================================================
-- Permet une FK composite : une dépense ne peut référencer QUE une entrée
-- du même utilisateur (anti-IDOR au niveau du schéma, en plus de la RLS).
do $$ begin
  alter table public.journal_entries
    add constraint journal_entries_id_user_key unique (id, user_id);
exception when duplicate_object or duplicate_table then null; end $$;


-- =====================================================================
-- 3. journal_expenses — détail financier d'une entrée `depense`
-- =====================================================================
-- La date, les enfants concernés, le titre et la description restent sur
-- journal_entries (occurred_at, children_ids, titre, description) : une
-- seule source de vérité, et la chronologie du Journal reste inchangée.
create table if not exists public.journal_expenses (
  entry_id        uuid primary key,
  user_id         uuid not null references public.users(id) on delete cascade,
  amount_cents    integer not null
                    check (amount_cents >= 0 and amount_cents <= 10000000),   -- 0 à 100 000,00
  currency        text not null default 'EUR'
                    check (currency in ('EUR','BRL','SRD','USD')),
  categorie       text not null
                    check (categorie in (
                      'pension','ecole','cantine','sante','vetements','activites',
                      'transport','loisirs','assurance','frais-administratifs','autre'
                    )),
  payment_method  text not null
                    check (payment_method in ('virement','carte','especes','prelevement','cheque','autre')),
  beneficiaire    text check (beneficiaire is null or char_length(beneficiaire) <= 120),
  -- { "path": "<uid>/journal/<uuid>-<nom>", "mime": "application/pdf", "size": 123, "name": "facture.pdf" }
  justificatif    jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fk_journal_expenses_entry
    foreign key (entry_id, user_id)
    references public.journal_entries(id, user_id)
    on delete cascade,
  constraint chk_journal_expenses_justificatif check (
    justificatif is null or (
      jsonb_typeof(justificatif) = 'object'
      and jsonb_typeof(justificatif -> 'path') = 'string'
      and char_length(justificatif ->> 'path') between 1 and 400
      and position('..' in (justificatif ->> 'path')) = 0
      and (justificatif ->> 'mime') ~ '^(application/pdf|image/(jpeg|png|webp|heic))$'
      and jsonb_typeof(justificatif -> 'size') = 'number'
      and (justificatif ->> 'size')::numeric between 0 and 10485760          -- 10 Mo (contrôle app identique)
      and pg_column_size(justificatif) <= 2048
    )
  )
);

-- Vue Finances : total du mois / par catégorie pour l'utilisateur.
create index if not exists idx_journal_expenses_user_categorie
  on public.journal_expenses(user_id, categorie);

drop trigger if exists trg_journal_expenses_updated_at on public.journal_expenses;
create trigger trg_journal_expenses_updated_at
  before update on public.journal_expenses
  for each row execute function public.handle_updated_at();

-- Cohérence : une ligne de dépense n'existe que pour une entrée de type `depense`.
create or replace function public.journal_expenses_check_entry_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.journal_entries e
     where e.id = new.entry_id
       and e.user_id = new.user_id
       and e.type::text = 'depense'
  ) then
    raise exception 'journal_expenses : l''entrée liée doit être de type depense'
      using errcode = '23514';  -- check_violation → « Certaines informations sont invalides. »
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journal_expenses_entry_type on public.journal_expenses;
create trigger trg_journal_expenses_entry_type
  before insert or update on public.journal_expenses
  for each row execute function public.journal_expenses_check_entry_type();


-- =====================================================================
-- 4. RLS — owner-only
-- =====================================================================
alter table public.journal_expenses enable row level security;

drop policy if exists journal_expenses_select_self on public.journal_expenses;
create policy journal_expenses_select_self on public.journal_expenses
  for select using (auth.uid() = user_id);

drop policy if exists journal_expenses_insert_self on public.journal_expenses;
create policy journal_expenses_insert_self on public.journal_expenses
  for insert with check (
    auth.uid() = user_id
    -- le justificatif doit être rangé dans l'espace Storage de l'utilisateur
    and (justificatif is null or (justificatif ->> 'path') like auth.uid()::text || '/journal/%')
  );

drop policy if exists journal_expenses_update_self on public.journal_expenses;
create policy journal_expenses_update_self on public.journal_expenses
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (justificatif is null or (justificatif ->> 'path') like auth.uid()::text || '/journal/%')
  );

drop policy if exists journal_expenses_delete_self on public.journal_expenses;
create policy journal_expenses_delete_self on public.journal_expenses
  for delete using (auth.uid() = user_id);

-- Aucun accès anonyme direct.
revoke all on public.journal_expenses from anon;


-- =====================================================================
-- ROLLBACK (manuel, à exécuter dans cet ordre si nécessaire)
-- =====================================================================
-- drop table if exists public.journal_expenses;
-- drop function if exists public.journal_expenses_check_entry_type();
-- alter table public.journal_entries drop constraint if exists journal_entries_id_user_key;
-- /!\ Postgres ne sait pas retirer une valeur d'ENUM : `depense` reste dans
--     public.journal_entry_type. Requalifier d'abord les entrées concernées :
--     update public.journal_entries set type = 'autre' where type = 'depense';
