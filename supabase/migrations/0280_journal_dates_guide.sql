-- =====================================================================
-- Lien Parental — 0280_journal_dates_guide.sql
--   1. guide_progress : la contrainte unique inclut le territoire
--      (une même fiche / un même parcours peut exister dans deux territoires).
--   2. Migration de données : anciennes dépenses « Frais partagés »
--      (`expenses`, 0210) → Journal (`journal_entries` type `depense`
--      + `journal_expenses`, 0240).
--
-- Principes (mêmes que 0210 / 0240) :
--   * ré-exécutable sans effet de bord (idempotent) ;
--   * aucune donnée source supprimée : `expenses` et `pension_payments`
--     restent en place (lecture seule pour l'application, purge ultérieure).
--   * fuseau de référence de l'application : America/Cayenne (lib/tz.ts).
--
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. GUIDE — unicité par territoire
-- =====================================================================
-- Ancienne contrainte : (user_id, ref_type, ref_slug, element).
-- Nouvelle : (user_id, territoire, ref_type, ref_slug, element) — c'est
-- la cible de l'upsert `onConflict` de lib/guide/progress.ts.
-- Les lignes existantes respectent forcément la nouvelle contrainte
-- (plus permissive) : aucune donnée à corriger.
alter table public.guide_progress drop constraint if exists uq_guide_progress;

do $$ begin
  alter table public.guide_progress
    add constraint uq_guide_progress_territoire
    unique (user_id, territoire, ref_type, ref_slug, element);
exception when duplicate_object or duplicate_table then null; end $$;

-- L'index (user_id, territoire) de 0250 est désormais couvert par le
-- préfixe de l'index unique ci-dessus : on le retire (une écriture de moins).
drop index if exists public.idx_guide_progress_user;


-- =====================================================================
-- 2. DONNÉES — expenses → journal_entries + journal_expenses
-- =====================================================================
-- Idempotence : l'entrée du Journal reprend l'UUID de la dépense d'origine
-- (`journal_entries.id = expenses.id`), et chaque insertion est protégée
-- par `on conflict do nothing`. Rejouer la migration ne crée aucun doublon ;
-- une dépense déjà reprise n'est pas réécrite (les modifications faites
-- depuis dans le Journal sont préservées).
--
-- Correspondances :
--   date (jour seul)    → occurred_at = jour à 12:00, America/Cayenne
--                         (même règle que l'application pour une dépense sans heure) ;
--   libelle             → titre ;
--   note + infos 0210   → description (payé par, part, statut : non modélisés
--                         dans le Journal, conservés en texte pour la preuve) ;
--   categorie           → scolarite→ecole, sante→sante, activites→activites,
--                         vetements→vetements, autre→autre ;
--   mode de paiement    → 'autre' (inconnu dans 0210), devise → 'EUR' ;
--   justificatif        → document du coffre-fort référencé, repris s'il respecte
--                         les contraintes de journal_expenses (PDF / image, ≤ 10 Mo) ;
--                         sinon le nom du document est cité dans la description ;
--   created_at / deleted_at conservés (horodatage de preuve, corbeille).
--
-- `pension_payments` (mois « reçu » + montant) n'est PAS repris : c'était un
-- pointage de réception, pas une dépense. Le Journal enregistre la pension
-- comme une dépense de catégorie `pension` saisie par le parent qui paie.
--
-- Exécutée par le propriétaire des tables (migration) : la RLS ne s'applique pas,
-- les contraintes CHECK, FK et le trigger de type (0240) si.
do $$
begin
  if to_regclass('public.expenses') is null then
    raise notice '0280 : table expenses absente, migration de données ignorée.';
    return;
  end if;

  -- 2.a Entrées du Journal
  insert into public.journal_entries
    (id, user_id, type, titre, description, lieu, occurred_at, children_ids, media, created_at, updated_at, deleted_at)
  select
    e.id,
    e.user_id,
    'depense'::public.journal_entry_type,
    e.libelle,
    left(
      concat_ws(E'\n',
        nullif(btrim(e.note), ''),
        format('Reprise des « Frais partagés » : payé par %s, part %s %% / %s %%, %s.',
               case e.paid_by when 'moi' then 'moi' else 'l’autre parent' end,
               e.part_moi, 100 - e.part_moi,
               case e.statut when 'rembourse' then 'remboursé le ' || to_char(e.reimbursed_at, 'DD/MM/YYYY') else 'en attente' end),
        case
          when d.id is not null and not (
            d.mime ~ '^(application/pdf|image/(jpeg|png|webp|heic))$' and d.size_bytes <= 10485760
          ) then format('Justificatif dans le coffre-fort : « %s ».', d.name)
        end
      ),
      2000
    ),
    null,
    ((e.date + time '12:00') at time zone 'America/Cayenne'),
    coalesce(e.children_ids, '{}'),
    '[]'::jsonb,
    e.created_at,
    e.updated_at,
    e.deleted_at
  from public.expenses e
  left join public.documents d
    on d.id = e.justificatif_document_id and d.user_id = e.user_id
  on conflict (id) do nothing;

  -- 2.b Détail financier (1-1). La FK composite (entry_id, user_id) garantit
  -- que seule l'entrée du même utilisateur est liée ; `exists` évite toute
  -- erreur si un id avait déjà été pris par une autre entrée (collision UUID).
  insert into public.journal_expenses
    (entry_id, user_id, amount_cents, currency, categorie, payment_method, beneficiaire, justificatif, created_at, updated_at)
  select
    e.id,
    e.user_id,
    e.amount_cents,
    'EUR',
    case e.categorie when 'scolarite' then 'ecole' else e.categorie end,
    'autre',
    null,
    case
      when d.id is not null
       and d.mime ~ '^(application/pdf|image/(jpeg|png|webp|heic))$'
       and d.size_bytes <= 10485760
       and position('..' in d.storage_path) = 0
       and char_length(d.storage_path) between 1 and 400
      then jsonb_build_object('path', d.storage_path, 'mime', d.mime, 'size', d.size_bytes, 'name', left(d.name, 120))
    end,
    e.created_at,
    e.updated_at
  from public.expenses e
  left join public.documents d
    on d.id = e.justificatif_document_id and d.user_id = e.user_id
  where exists (
    select 1 from public.journal_entries j
     where j.id = e.id and j.user_id = e.user_id and j.type::text = 'depense'
  )
  on conflict (entry_id) do nothing;
end $$;


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- -- 2. Entrées reprises (identifiées par l'UUID d'origine) :
-- delete from public.journal_entries j using public.expenses e
--  where j.id = e.id and j.user_id = e.user_id and j.type::text = 'depense';
--    (journal_expenses suit par ON DELETE CASCADE)
-- -- 1. Contrainte d'origine (échoue si une même fiche a été suivie dans deux territoires) :
-- alter table public.guide_progress drop constraint if exists uq_guide_progress_territoire;
-- alter table public.guide_progress add constraint uq_guide_progress unique (user_id, ref_type, ref_slug, element);
-- create index if not exists idx_guide_progress_user on public.guide_progress(user_id, territoire);
