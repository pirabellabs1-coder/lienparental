-- =====================================================================
-- Lien Parental — 0102_admin.sql
-- Rôle admin : fonction `is_admin()` consultée côté serveur (RPC) pour
-- autoriser l'accès au back-office. L'appartenance au rôle admin est
-- matérialisée par `users.plan = 'admin'`.
--
-- SECURITY DEFINER : la fonction peut lire public.users même si la
-- policy RLS de users ne laisse voir que `auth.uid() = id`. Elle NE
-- retourne jamais de données utilisateur — seulement un booléen.
-- =====================================================================

-- NOTE : la table `users` utilise l'enum `plan_tier` (free/premium).
-- Si la valeur 'admin' n'y figure pas encore, on l'ajoute idempotemment.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'plan_tier' and e.enumlabel = 'admin'
  ) then
    alter type public.plan_tier add value 'admin';
  end if;
end $$;


create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.users u
     where u.id = auth.uid()
       and u.plan = 'admin'
       and u.deleted_at is null
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

comment on function public.is_admin() is
  'Retourne true si l''utilisateur courant (auth.uid()) a plan = admin. Utilisé par le guard /admin et par les policies RLS admin.';
