-- =====================================================================
-- 0490 — Traductions du contenu éditorial (anglais, portugais du Brésil)
--
-- Une colonne `translations jsonb` sur chaque table de contenu administrable :
--   { "en": <objet complet du contenu>, "pt": <objet complet du contenu> }
-- Le français reste dans les colonnes existantes (original). La lecture
-- (lib/contenus/i18n.ts) superpose les textes traduits sur le français, force
-- les champs invariants (slugs, URL, catégories, dates…) depuis le français
-- et revalide avec le schéma zod : une traduction absente ou invalide affiche
-- le français. Architecture : docs/I18N-CONTENU.md.
--
-- Sécurité (inchangée, vérifiée) :
--   - Droits : GRANT au niveau TABLE (0250, 0300, 0400) — select pour anon,
--     select/insert/update/delete pour authenticated ; aucun GRANT par colonne
--     sur ces tables : la nouvelle colonne suit donc les mêmes droits.
--   - RLS : lecture publique = éléments publiés seulement (0360 / 0400), écriture
--     = administrateur (is_admin / is_admin_aal2). Rien n'est ajouté : pas de
--     nouvelle surface publique en écriture.
--   - Historique : content_log_version() enregistre to_jsonb(new) : l'instantané
--     de content_versions inclut automatiquement `translations`. Toute écriture
--     de traduction passe par le trigger content_before_write() (version + 1,
--     concurrence optimiste inchangée).
--
-- Contraintes : objet JSON, clés ⊆ {en, pt}, chaque valeur est un objet,
-- taille bornée (400 Ko de texte JSON, soit largement plus que deux articles
-- de blog de 60 000 caractères).
--
-- Non destructif, idempotent (rejouable).
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'guide_fiches', 'guide_parcours', 'guide_partners', 'document_templates',
    'blog_posts', 'faq_items', 'tutorials', 'daily_tips'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists translations jsonb not null default ''{}''::jsonb', t);

    execute format('alter table public.%I drop constraint if exists chk_%s_translations', t, t);
    -- CASE : l'opérateur jsonb - text échoue sur un scalaire ; on ne l'évalue que sur un objet.
    execute format($c$
      alter table public.%I add constraint chk_%s_translations check (
        case when jsonb_typeof(translations) = 'object' then
          (translations - 'en' - 'pt') = '{}'::jsonb
          and coalesce(jsonb_typeof(translations -> 'en'), 'object') = 'object'
          and coalesce(jsonb_typeof(translations -> 'pt'), 'object') = 'object'
          and octet_length(translations::text) <= 400000
        else false end
      )$c$, t, t);

    execute format(
      'comment on column public.%I.translations is %L', t,
      'Traductions du contenu : { "en": {…}, "pt": {…} } (objets complets, mêmes clés que le français). '
      || 'Champs invariants forcés depuis le français à la lecture (lib/contenus/i18n.ts). Voir docs/I18N-CONTENU.md.');
  end loop;
end $$;

-- =====================================================================
-- Retour arrière (manuel) :
-- do $$ declare t text; begin
--   foreach t in array array['guide_fiches','guide_parcours','guide_partners','document_templates',
--                            'blog_posts','faq_items','tutorials','daily_tips'] loop
--     execute format('alter table public.%I drop constraint if exists chk_%s_translations', t, t);
--     execute format('alter table public.%I drop column if exists translations', t);   -- perd les traductions saisies
--   end loop;
-- end $$;
-- =====================================================================
