-- =====================================================================
-- Lien Parental — 0650_agent_whatsapp.sql
-- Agent d'accueil, phase 3 : WhatsApp (Twilio, API officielle Meta). Même agent, même base de connaissances,
-- même agenda que le chatbot du site (0640).
--
--   1. agent_wa_conversations  une conversation par numéro : langue, étape du parcours en cours,
--                              mode « bot » ou « human » (un représentant a pris la main).
--   2. agent_wa_messages       historique utile à la continuité et au support (6 mois) ; l'identifiant
--                              du message chez le fournisseur est unique : un webhook rejoué n'est
--                              traité qu'une fois.
--   3. agent_purge()           étendue : messages et conversations inactives de plus de 6 mois.
--
-- Accès : aucun pour anon / utilisateurs ; administrateur (is_admin_aal2) ; webhook via service_role.
-- Idempotente. Rollback en fin de fichier.
-- =====================================================================

create table if not exists public.agent_wa_conversations (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null unique check (phone ~ '^[0-9]{6,15}$'),
  name             text check (char_length(name) <= 120),
  locale           text not null default 'fr' check (locale in ('fr', 'en', 'pt')),
  state            jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  mode             text not null default 'bot' check (mode in ('bot', 'human')),
  human_until      timestamptz,
  last_inbound_at  timestamptz,
  last_outbound_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists agent_wa_conversations_recent_idx on public.agent_wa_conversations (updated_at desc);

create table if not exists public.agent_wa_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.agent_wa_conversations(id) on delete cascade,
  direction        text not null check (direction in ('in', 'out')),
  author           text not null check (author in ('contact', 'bot', 'team')),
  wa_id            text unique check (char_length(wa_id) <= 200),
  body             text not null check (char_length(body) <= 4000),
  created_at       timestamptz not null default now()
);
create index if not exists agent_wa_messages_conv_idx on public.agent_wa_messages (conversation_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['agent_wa_conversations', 'agent_wa_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin_aal2())) with check ((select public.is_admin_aal2()))', t || '_admin_all', t);
  end loop;
end $$;

-- Conservation (cahier V2 §30) : conversations 6 mois, en plus des règles de 0640.
create or replace function public.agent_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a integer; c integer; e integer; m integer; w integer;
begin
  delete from public.agent_appointments where ends_at < now() - interval '12 months';
  get diagnostics a = row_count;
  delete from public.agent_callbacks where created_at < now() - interval '12 months';
  get diagnostics c = row_count;
  delete from public.agent_events where at < now() - interval '90 days';
  get diagnostics e = row_count;
  delete from public.agent_wa_messages where created_at < now() - interval '6 months';
  get diagnostics m = row_count;
  delete from public.agent_wa_conversations where coalesce(last_inbound_at, created_at) < now() - interval '6 months';
  get diagnostics w = row_count;
  return jsonb_build_object('appointments', a, 'callbacks', c, 'events', e, 'wa_messages', m, 'wa_conversations', w);
end;
$$;
revoke all on function public.agent_purge() from public, anon, authenticated;
grant execute on function public.agent_purge() to service_role;

-- Double appui sur « Oui » (deux webhooks simultanés) : un seul rendez-vous par numéro et par créneau.
create unique index if not exists agent_appointments_one_per_phone_slot
  on public.agent_appointments (contact_phone, starts_at) where status = 'confirmed' and contact_phone is not null;

-- Déplacement (0640) : le canal de confirmation de l'ancien rendez-vous est conservé (WhatsApp → rappels
-- WhatsApp), au lieu de « email » imposé.
create or replace function public.agent_reschedule(p_old uuid, p_new jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_hash text; v_confirm text;
begin
  -- Lu AVANT la mise à jour (RETURNING rendrait la nouvelle valeur, nulle).
  select manage_token_hash, confirm_channel into v_hash, v_confirm from public.agent_appointments where id = p_old and status = 'confirmed' for update;
  if not found then return 'not_found'; end if;
  update public.agent_appointments set status = 'cancelled', cancelled_at = now(), manage_token_hash = null where id = p_old;
  begin
    insert into public.agent_appointments (id, ref, type_code, service, representative_id, starts_at, ends_at, busy_until,
      contact_name, contact_phone, contact_email, language, reason, channel, confirm_channel, reminders_consent,
      manage_token_hash, rescheduled_from)
    values ((p_new->>'id')::uuid, p_new->>'ref', p_new->>'type_code', p_new->>'service', (p_new->>'representative_id')::uuid,
      (p_new->>'starts_at')::timestamptz, (p_new->>'ends_at')::timestamptz, (p_new->>'busy_until')::timestamptz,
      p_new->>'contact_name', p_new->>'contact_phone', p_new->>'contact_email', p_new->>'language', p_new->>'reason',
      p_new->>'channel', v_confirm, coalesce((p_new->>'reminders_consent')::boolean, false), v_hash, p_old);
  exception when exclusion_violation or unique_violation then
    raise exception 'agent_slot_taken' using errcode = 'P0001';
  end;
  return 'ok';
end;
$$;
revoke all on function public.agent_reschedule(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.agent_reschedule(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Retour arrière :
-- drop index if exists public.agent_appointments_one_per_phone_slot;
-- drop table if exists public.agent_wa_messages, public.agent_wa_conversations;
-- (puis rejouer les définitions de agent_purge() et agent_reschedule() de 0640)
-- ---------------------------------------------------------------------
