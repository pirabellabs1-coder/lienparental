-- =====================================================================
-- Lien Parental — 0350_finances_plus.sql
-- Finances du Journal : « renseigner le plus possible tout type de paiement »
-- (demandes client v3, chantier B). Enrichit `journal_expenses` (0240) :
--   * sens du mouvement (dépense payée / paiement reçu / remboursement reçu
--     ou versé) ;
--   * payeur et bénéficiaire structurés (+ libellé libre) ;
--   * modes de paiement étendus (+ précision du service : PayPal, Lydia…) ;
--   * référence de transaction, statut, montant déjà payé ;
--   * répartition entre parents (« ma part » en % ou en montant) ;
--   * récurrence et échéance suivante ;
--   * plusieurs justificatifs ;
--   * catégories complétées (garde / nounou, crèche, permis / études
--     supérieures, téléphonie, argent de poche).
--
-- Principes (mêmes que 0210 / 0240 / 0280) :
--   * STRICTEMENT additif : aucune colonne supprimée, aucune donnée réécrite.
--     Les lignes existantes prennent les valeurs par défaut (sens `depense`,
--     statut `paye`, récurrence `ponctuel`, aucun justificatif supplémentaire),
--     ce qui correspond exactement à leur sens d'origine ;
--   * ré-exécutable (if not exists / drop … if exists / do-blocks) ;
--   * montants en centimes entiers ;
--   * les contraintes CHECK reprennent à l'identique les règles de
--     lib/journal-finances.ts (depenseSchema / advancedErrors).
--
-- RLS : la table reste owner-only (0240) + MFA restrictive (0270, inchangée).
-- Les politiques insert / update sont recréées pour vérifier AUSSI les
-- chemins Storage des justificatifs supplémentaires.
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. Validation d'un justificatif (jsonb) — fonctions pures
-- =====================================================================
-- IMMUTABLE + search_path fixé : utilisables dans une contrainte CHECK.
-- Ni SECURITY DEFINER, ni accès aux tables.
create or replace function public.journal_justificatif_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select j is not null
     and jsonb_typeof(j) = 'object'
     and jsonb_typeof(j -> 'path') = 'string'
     and char_length(j ->> 'path') between 1 and 400
     and position('..' in (j ->> 'path')) = 0
     and coalesce(j ->> 'mime', '') ~ '^(application/pdf|image/(jpeg|png|webp|heic))$'
     and jsonb_typeof(j -> 'size') = 'number'
     and (j ->> 'size')::numeric between 0 and 10485760          -- 10 Mo (contrôle app identique)
     and (j -> 'name' is null or (jsonb_typeof(j -> 'name') = 'string' and char_length(j ->> 'name') <= 120))
     and pg_column_size(j) <= 2048
$$;

-- Tableau de justificatifs supplémentaires : 0 à 9 éléments valides
-- (justificatif principal de 0240 + 9 = 10 au total, MAX_JUSTIFICATIFS).
create or replace function public.journal_justificatifs_ok(arr jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select arr is not null
     and jsonb_typeof(arr) = 'array'
     and jsonb_array_length(arr) <= 9
     and not exists (
       select 1 from jsonb_array_elements(arr) as x(j)
        where not public.journal_justificatif_ok(x.j)
     )
$$;

-- Tous les chemins (principal + supplémentaires) sont-ils dans l'espace
-- Storage de `uid` (`<uid>/journal/…`) ? Utilisée par la RLS.
create or replace function public.journal_justificatifs_owned(main jsonb, extra jsonb, uid uuid)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select uid is not null
     and (main is null or (main ->> 'path') like uid::text || '/journal/%')
     and not exists (
       select 1 from jsonb_array_elements(coalesce(extra, '[]'::jsonb)) as x(j)
        where coalesce(x.j ->> 'path', '') not like uid::text || '/journal/%'
     )
$$;

-- Fonctions utilitaires : pas d'appel anonyme direct (elles restent
-- évaluables par la RLS et les CHECK, qui s'exécutent avec les droits du
-- propriétaire de la table pour les contraintes et ceux de l'appelant
-- authentifié pour les politiques).
revoke all on function public.journal_justificatif_ok(jsonb) from public, anon;
revoke all on function public.journal_justificatifs_ok(jsonb) from public, anon;
revoke all on function public.journal_justificatifs_owned(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.journal_justificatif_ok(jsonb) to authenticated, service_role;
grant execute on function public.journal_justificatifs_ok(jsonb) to authenticated, service_role;
grant execute on function public.journal_justificatifs_owned(jsonb, jsonb, uuid) to authenticated, service_role;


-- =====================================================================
-- 2. Nouvelles colonnes (valeurs par défaut = sens d'origine des lignes)
-- =====================================================================
alter table public.journal_expenses
  add column if not exists direction            text    not null default 'depense',
  add column if not exists payer_type           text,
  add column if not exists payer_label          text,
  add column if not exists beneficiary_type     text,
  add column if not exists payment_method_label text,
  add column if not exists transaction_ref      text,
  add column if not exists status               text    not null default 'paye',
  add column if not exists amount_paid_cents    integer,
  add column if not exists split_mode           text,
  add column if not exists split_value          integer,
  add column if not exists recurrence           text    not null default 'ponctuel',
  add column if not exists next_due_date        date,
  add column if not exists justificatifs_extra  jsonb   not null default '[]'::jsonb;

comment on column public.journal_expenses.direction is
  'Sens du mouvement pour l''utilisateur : depense (payée), recu, remboursement-recu, remboursement-verse.';
comment on column public.journal_expenses.amount_cents is
  'Montant de la dépense ou du paiement ; montant dû si status = partiel.';
comment on column public.journal_expenses.amount_paid_cents is
  'Montant déjà réglé, uniquement si status = partiel (0 < payé < amount_cents).';
comment on column public.journal_expenses.split_value is
  'Part de l''utilisateur : pourcentage entier 0-100 (split_mode = pourcentage) ou centimes ≤ amount_cents (montant).';
comment on column public.journal_expenses.justificatifs_extra is
  'Justificatifs supplémentaires (0 à 9), même forme que justificatif.';


-- =====================================================================
-- 3. Contraintes CHECK
-- =====================================================================
-- 3.a Listes étendues : on retire les CHECK de colonne de 0240 sur
-- `categorie` et `payment_method` (nom généré par Postgres, retrouvé dans
-- le catalogue pour ne dépendre d'aucune convention de nommage).
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.journal_expenses'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname in ('categorie', 'payment_method')
       and con.conname not in ('chk_journal_expenses_categorie', 'chk_journal_expenses_payment_method')
  loop
    execute format('alter table public.journal_expenses drop constraint %I', c.conname);
  end loop;
end $$;

-- Ajout idempotent : on supprime puis recrée nos propres contraintes nommées.
alter table public.journal_expenses
  drop constraint if exists chk_journal_expenses_categorie,
  drop constraint if exists chk_journal_expenses_payment_method,
  drop constraint if exists chk_journal_expenses_direction,
  drop constraint if exists chk_journal_expenses_parties,
  drop constraint if exists chk_journal_expenses_labels,
  drop constraint if exists chk_journal_expenses_status,
  drop constraint if exists chk_journal_expenses_amount_paid,
  drop constraint if exists chk_journal_expenses_split,
  drop constraint if exists chk_journal_expenses_recurrence,
  drop constraint if exists chk_journal_expenses_extra;

alter table public.journal_expenses
  add constraint chk_journal_expenses_categorie check (categorie in (
    'pension','ecole','cantine','sante','vetements','activites',
    'transport','loisirs','assurance','frais-administratifs',
    'garde','creche','etudes-permis','telephonie','argent-de-poche',
    'autre'
  )),
  add constraint chk_journal_expenses_payment_method check (payment_method in (
    'virement','carte','especes','prelevement','cheque',
    'mobile','mandat-cash','cesu','compensation','autre'
  )),
  add constraint chk_journal_expenses_direction check (direction in (
    'depense','recu','remboursement-recu','remboursement-verse'
  )),
  add constraint chk_journal_expenses_parties check (
    (payer_type is null or payer_type in ('moi','autre-parent','etablissement','prestataire','organisme','autre'))
    and (beneficiary_type is null or beneficiary_type in ('moi','autre-parent','etablissement','prestataire','organisme','autre'))
  ),
  add constraint chk_journal_expenses_labels check (
    (payer_label is null or char_length(payer_label) between 1 and 120)
    and (payment_method_label is null or char_length(payment_method_label) between 1 and 60)
    and (transaction_ref is null or char_length(transaction_ref) between 1 and 80)
  ),
  add constraint chk_journal_expenses_status check (status in (
    'paye','en-attente','partiel','rembourse','conteste'
  )),
  -- Montant payé : présent si et seulement si « partiellement payé », 0 < payé < montant.
  add constraint chk_journal_expenses_amount_paid check (
    (status = 'partiel' and amount_paid_cents is not null and amount_paid_cents > 0 and amount_paid_cents < amount_cents)
    or (status <> 'partiel' and amount_paid_cents is null)
  ),
  -- Répartition : mode et valeur vont ensemble ; % entre 0 et 100, montant ≤ total.
  add constraint chk_journal_expenses_split check (
    (split_mode is null and split_value is null)
    or (split_mode = 'pourcentage' and split_value between 0 and 100)
    or (split_mode = 'montant' and split_value between 0 and amount_cents)
  ),
  -- Échéance suivante : uniquement pour une dépense récurrente.
  add constraint chk_journal_expenses_recurrence check (
    recurrence in ('ponctuel','mensuel','trimestriel','annuel')
    and (recurrence <> 'ponctuel' or next_due_date is null)
    and (next_due_date is null or next_due_date between date '1900-01-01' and date '2100-12-31')
  ),
  add constraint chk_journal_expenses_extra check (public.journal_justificatifs_ok(justificatifs_extra));


-- =====================================================================
-- 4. Index (filtres de la vue Finances, échéances à venir)
-- =====================================================================
create index if not exists idx_journal_expenses_user_direction
  on public.journal_expenses(user_id, direction);
create index if not exists idx_journal_expenses_user_status
  on public.journal_expenses(user_id, status)
  where status <> 'paye';
create index if not exists idx_journal_expenses_next_due
  on public.journal_expenses(user_id, next_due_date)
  where next_due_date is not null;


-- =====================================================================
-- 5. RLS — politiques recréées (owner-only, chemins de TOUS les justificatifs)
-- =====================================================================
alter table public.journal_expenses enable row level security;

drop policy if exists journal_expenses_insert_self on public.journal_expenses;
create policy journal_expenses_insert_self on public.journal_expenses
  for insert with check (
    (select auth.uid()) = user_id
    and public.journal_justificatifs_owned(justificatif, justificatifs_extra, (select auth.uid()))
  );

drop policy if exists journal_expenses_update_self on public.journal_expenses;
create policy journal_expenses_update_self on public.journal_expenses
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.journal_justificatifs_owned(justificatif, justificatifs_extra, (select auth.uid()))
  );

-- select / delete (0240) et mfa_required (0270, restrictive) : inchangées.
revoke all on public.journal_expenses from anon;


-- =====================================================================
-- ROLLBACK (manuel, à exécuter dans cet ordre si nécessaire)
-- =====================================================================
-- /!\ Les nouvelles catégories / nouveaux modes doivent d'abord être
--     requalifiés, sinon les CHECK d'origine échouent :
-- update public.journal_expenses set categorie = 'autre'
--  where categorie in ('garde','creche','etudes-permis','telephonie','argent-de-poche');
-- update public.journal_expenses set payment_method = 'autre'
--  where payment_method in ('mobile','mandat-cash','cesu','compensation');
-- alter table public.journal_expenses
--   drop constraint if exists chk_journal_expenses_categorie,
--   drop constraint if exists chk_journal_expenses_payment_method,
--   drop constraint if exists chk_journal_expenses_direction,
--   drop constraint if exists chk_journal_expenses_parties,
--   drop constraint if exists chk_journal_expenses_labels,
--   drop constraint if exists chk_journal_expenses_status,
--   drop constraint if exists chk_journal_expenses_amount_paid,
--   drop constraint if exists chk_journal_expenses_split,
--   drop constraint if exists chk_journal_expenses_recurrence,
--   drop constraint if exists chk_journal_expenses_extra;
-- alter table public.journal_expenses
--   add constraint journal_expenses_categorie_check check (categorie in (
--     'pension','ecole','cantine','sante','vetements','activites',
--     'transport','loisirs','assurance','frais-administratifs','autre')),
--   add constraint journal_expenses_payment_method_check check (payment_method in (
--     'virement','carte','especes','prelevement','cheque','autre'));
-- drop index if exists public.idx_journal_expenses_user_direction;
-- drop index if exists public.idx_journal_expenses_user_status;
-- drop index if exists public.idx_journal_expenses_next_due;
-- alter table public.journal_expenses
--   drop column if exists direction, drop column if exists payer_type,
--   drop column if exists payer_label, drop column if exists beneficiary_type,
--   drop column if exists payment_method_label, drop column if exists transaction_ref,
--   drop column if exists status, drop column if exists amount_paid_cents,
--   drop column if exists split_mode, drop column if exists split_value,
--   drop column if exists recurrence, drop column if exists next_due_date,
--   drop column if exists justificatifs_extra;
--   (les justificatifs supplémentaires restent dans le Storage : à purger à part)
-- -- Politiques d'origine (0240) :
-- drop policy if exists journal_expenses_insert_self on public.journal_expenses;
-- create policy journal_expenses_insert_self on public.journal_expenses for insert with check (
--   auth.uid() = user_id and (justificatif is null or (justificatif ->> 'path') like auth.uid()::text || '/journal/%'));
-- drop policy if exists journal_expenses_update_self on public.journal_expenses;
-- create policy journal_expenses_update_self on public.journal_expenses for update using (auth.uid() = user_id)
--   with check (auth.uid() = user_id and (justificatif is null or (justificatif ->> 'path') like auth.uid()::text || '/journal/%'));
-- drop function if exists public.journal_justificatifs_owned(jsonb, jsonb, uuid);
-- drop function if exists public.journal_justificatifs_ok(jsonb);
-- drop function if exists public.journal_justificatif_ok(jsonb);
