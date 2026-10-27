-- =====================================================================
-- 0470 — Durcissement sécurité (v4), suite à l'audit plateforme du 27/10/2026.
-- Points traités : F2 (search_path figé sur generate_testimony_reference).
-- Non destructif, rejouable. Les autres constats de l'audit sont déjà couverts
-- (mfa_required présent sur toutes les tables sensibles, vérifié en production)
-- ou traités côté application (anti-CSRF middleware, cookies Secure, CSP).
-- =====================================================================

-- F2 — generate_testimony_reference() n'avait pas de search_path figé.
-- Elle n'est appelée que par des fonctions SECURITY DEFINER (search_path contrôlé)
-- et ses références sont déjà qualifiées (public.testimonies) ; on fige quand même
-- le search_path par principe de défense en profondeur.
create or replace function public.generate_testimony_reference()
returns text
language plpgsql
set search_path = public
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
