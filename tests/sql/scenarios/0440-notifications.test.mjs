// Scénarios 0440_notifications.sql (PGlite + stubs Supabase).
// A = Julie (titulaire de Lina), B = Thomas (parent lié), D = Rose (proche de Lina), X = tiers.
import nodeFs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const vaultOpen = true
const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/0440_notifications.sql')
const U = (n) => `00000000-0000-0000-0000-0000000044${n}`
const A = { id: U('0a'), email: 'julie44@test.fr', prenom: 'Julie' }
const B = { id: U('0b'), email: 'thomas44@test.fr', prenom: 'Thomas' }
const D = { id: U('0d'), email: 'rose44@test.fr', prenom: 'Rose' }
const X = { id: U('99'), email: 'x44@test.fr', prenom: 'X' }
const T = { id: U('77'), email: 't44@test.fr', prenom: 'T' }
const c1 = U('c1')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}
async function as(db, who, sql, params = []) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal1', role: 'authenticated' }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function asAnon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const jobs = (db, user, event) => db.query(`select * from public.notification_jobs where user_id = $1 and event = $2 order by id`, [user, event]).then((r) => r.rows)
const EP = (n) => `https://fcm.googleapis.com/fcm/send/abc${n}`
const P256 = 'B' + 'x'.repeat(86)
const AUTH = 'a'.repeat(22)

export default async function run(db) {
  console.log('\n== Notifications (0440)')
  for (const u of [A, B, D, X, T]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Lina', '2019-05-12')`, [c1, A.id])
  const inv = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c1])
  const acc = await as(db, B, `select public.accept_family_invitation($1) r`, [inv[0].token])
  const conv = acc[0].r.conversation_id
  const invD = await as(db, A, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [D.email, c1])
  await as(db, D, `select public.accept_family_invitation($1)`, [invD[0].token])

  // --- 1. Invitation acceptée ----------------------------------------------------
  console.log(' -- invitation acceptée')
  const accepted = await jobs(db, A.id, 'coparent_invite_accepted')
  check('invitation acceptée : une tâche par invité pour l\'invitant (famille + lien V1 dédoublonnés)',
    accepted.length === 2 && accepted.some((j) => j.payload.actor_id === B.id) && accepted.some((j) => j.payload.actor_id === D.id), JSON.stringify(accepted.map((j) => j.payload)))

  // --- 2. Messages ---------------------------------------------------------------
  console.log(' -- message reçu et e-mail différé')
  check('conversation A / B créée', !!conv)
  await as(db, B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Bonjour, as-tu le carnet de santé ?')`, [conv, B.id])
  const rec = await jobs(db, A.id, 'message_received')
  check('message : tâche immédiate in-app + push pour A', rec.length === 1 && new Date(rec[0].run_after) <= new Date(Date.now() + 1000) && rec[0].actor_id === B.id)
  check('message : jamais de texte du message dans la tâche', !JSON.stringify(rec[0].payload).includes('carnet'))
  const mail = await jobs(db, A.id, 'message_email')
  const delayMin = mail.length ? (new Date(mail[0].run_after) - new Date(mail[0].created_at)) / 60000 : 0
  check('message : e-mail différé d\'au moins 5 min', mail.length === 1 && delayMin >= 4.9, `delay=${delayMin}`)
  check('message : rien pour l\'auteur', (await jobs(db, B.id, 'message_received')).length === 0 && (await jobs(db, B.id, 'message_email')).length === 0)

  await as(db, B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Et la date du vaccin ?')`, [conv, B.id])
  check('2e message : toujours UNE tâche e-mail en attente (regroupement)', (await jobs(db, A.id, 'message_email')).length === 1)
  check('2e message dans les 2 min : pas de second push (dédoublonnage)', (await jobs(db, A.id, 'message_received')).length === 1)

  const unread = (await svc(db, `select * from public.notif_conversation_unread($1, $2)`, [A.id, conv]))[0]
  check('non lus : 2 messages de Thomas, date du plus ancien', unread.unread === 2 && unread.senders.join() === 'Thomas' && !!unread.oldest, JSON.stringify(unread))
  check('notif_conversation_unread refusée à authenticated', !!(await err(as(db, A, `select * from public.notif_conversation_unread($1, $2)`, [A.id, conv]))))

  // Lu avant l'échéance → ignoré.
  await as(db, A, `select public.mark_read($1)`, [conv])
  await db.query(`update public.notification_jobs set run_after = now() - interval '1 second' where user_id = $1 and event = 'message_email'`, [A.id])
  const claimed = await svc(db, `select id, event from public.notif_claim_jobs(100, null)`)
  check('lu avant l\'échéance : e-mail non réservé', !claimed.some((j) => j.event === 'message_email'))
  check('lu avant l\'échéance : tâche classée skipped', (await jobs(db, A.id, 'message_email'))[0].status === 'skipped')
  for (const j of claimed) await svc(db, `select public.notif_finish_job($1, 'done', '{inapp}'::text[], null)`, [j.id])

  // Lu, puis nouveau message : l'échéance devient « plus ancien non lu + 5 min ».
  await as(db, B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Merci')`, [conv, B.id])
  await db.query(`update public.notification_jobs set run_after = now() - interval '1 second' where user_id = $1 and event = 'message_email' and status = 'pending'`, [A.id])
  const early = (await svc(db, `select id, event from public.notif_claim_jobs(100, null)`))
  for (const j of early.filter((x) => x.event !== 'message_email')) await svc(db, `select public.notif_finish_job($1, 'done', '{}'::text[], null)`, [j.id])
  const deferred = (await jobs(db, A.id, 'message_email')).find((j) => j.status === 'pending')
  const newest = (await db.query(`select max(created_at) t from public.messages where conversation_id = $1`, [conv])).rows[0].t
  check('lu puis nouveau message : pas d\'e-mail avant 5 min (reporté)', !early.some((j) => j.event === 'message_email') && !!deferred
    && Math.abs((new Date(deferred.run_after) - new Date(newest)) / 60000 - 5) < 0.1, JSON.stringify(deferred?.run_after))

  // Non lu depuis plus de 5 min → envoyé ; message suivant → nouvel e-mail 30 min après le précédent.
  await db.exec(`alter table public.messages disable trigger trg_messages_guard_update`)
  await db.query(`update public.messages set created_at = created_at - interval '6 minutes' where conversation_id = $1`, [conv])
  await db.exec(`alter table public.messages enable trigger trg_messages_guard_update`)
  await db.query(`update public.conversation_participants set last_read_at = last_read_at - interval '6 minutes' where conversation_id = $1 and last_read_at is not null`, [conv])
  await db.query(`update public.notification_jobs set run_after = now() - interval '1 second' where user_id = $1 and event = 'message_email' and status = 'pending'`, [A.id])
  const due = (await svc(db, `select id, event from public.notif_claim_jobs(100, null)`)).filter((j) => j.event === 'message_email')
  check('non lu à l\'échéance : e-mail réservé', due.length === 1)
  check('double réservation impossible (déjà en cours)', (await svc(db, `select id from public.notif_claim_jobs(100, null) where event = 'message_email'`)).length === 0)
  await svc(db, `select public.notif_finish_job($1, 'done', '{email}'::text[], null)`, [due[0].id])
  await as(db, B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Encore une chose')`, [conv, B.id])
  const next = (await jobs(db, A.id, 'message_email')).filter((j) => j.status === 'pending')
  const sent = (await jobs(db, A.id, 'message_email')).find((j) => j.id === due[0].id)
  const gap = next.length ? (new Date(next[0].run_after) - new Date(sent.processed_at)) / 60000 : 0
  check('e-mail suivant : au plus un par conversation toutes les 30 min', next.length === 1 && gap >= 29.9, `gap=${gap}`)

  // Écoulement immédiat réservé à l'auteur.
  const byActor = await svc(db, `select id, actor_id from public.notif_claim_jobs(50, $1)`, [A.id])
  check('notif_claim_jobs(p_actor) : seulement les tâches de cet auteur', byActor.every((j) => j.actor_id === A.id))
  for (const j of byActor) await svc(db, `select public.notif_finish_job($1, 'done', '{}'::text[], null)`, [j.id])

  // Jamais bloquant : une erreur dans le déclencheur n'empêche pas l'envoi du message.
  const before = (await jobs(db, A.id, 'message_received')).length
  await db.exec(`alter table public.notification_jobs add constraint tmp_block_0440 check (event <> 'message_received') not valid`)
  const sentErr = await err(as(db, B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Test panne') returning id`, [conv, B.id]))
  await db.exec(`alter table public.notification_jobs drop constraint tmp_block_0440`)
  check('jamais bloquant : erreur forcée dans la file, le message est bien enregistré', sentErr === null
    && (await db.query(`select 1 from public.messages where body = 'Test panne'`)).rows.length === 1
    && (await jobs(db, A.id, 'message_received')).length === before, String(sentErr?.message))

  // --- 2 bis. Dépense partagée et planning de garde ------------------------------------
  console.log(' -- activité de l\'autre parent')
  const entry = (await db.query(`insert into public.journal_entries (user_id, type, titre, occurred_at, children_ids) values ($1, 'depense', 'Cantine', now(), array[$2]::uuid[]) returning id`, [A.id, c1])).rows[0].id
  await db.query(`insert into public.journal_expenses (entry_id, user_id, amount_cents, categorie, payment_method, family_shared) values ($1, $2, 4200, 'cantine', 'carte', true)`, [entry, A.id])
  const exp = (await db.query(`select user_id, payload from public.notification_jobs where event = 'coparent_activity' and payload ->> 'entity' = 'expense' and payload ->> 'entity_id' = $1`, [entry])).rows
  check('dépense partagée : le parent lié est prévenu, pas la proche', exp.length === 1 && exp[0].user_id === B.id && exp[0].payload.entity_id === entry, JSON.stringify(exp))
  await as(db, A, `insert into public.garde_configs (user_id, config) values ($1, '{"rythme": "1-1"}'::jsonb)`, [A.id])
  const gar = (await db.query(`select user_id from public.notification_jobs where event = 'coparent_activity' and payload ->> 'entity' = 'garde' and payload ->> 'actor_id' = $1`, [A.id])).rows
  check('planning de garde : le parent lié est prévenu, pas la proche', gar.length === 1 && gar[0].user_id === B.id, JSON.stringify(gar))

  // --- 3. Partage de dossier --------------------------------------------------------
  console.log(' -- dossier partagé')
  const folder = (await as(db, A, `insert into public.vault_folders (user_id, name) values ($1, 'Assurance') returning id`, [A.id]))[0].id
  const share = (await as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3) returning id`, [folder, A.id, B.id]))[0].id
  const fs = await jobs(db, B.id, 'vault_folder_shared')
  check('partage de dossier : tâche pour le destinataire', fs.length === 1 && fs[0].payload.share_id === share && fs[0].actor_id === A.id)
  check('partage de dossier : nom du dossier absent de la tâche', !JSON.stringify(fs[0].payload).includes('Assurance'))

  // --- 4. Calendrier partagé ----------------------------------------------------------
  console.log(' -- événements partagés')
  const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString()
  const ev1 = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared)
     values ($1, 'visite', 'Kermesse', $2, array[$3]::uuid[], true) returning id`, [A.id, inHours(48), c1]))[0].id
  const calB = () => db.query(`select * from public.notification_jobs where event = 'calendar_shared' and payload ->> 'event_id' = $1 and user_id = $2 order by id`, [ev1, B.id]).then((r) => r.rows)
  const all1 = (await db.query(`select user_id from public.notification_jobs where event = 'calendar_shared' and payload ->> 'event_id' = $1`, [ev1])).rows
  check('événement partagé : tâche pour le parent lié seulement (ni l\'auteur, ni la proche)',
    all1.length === 1 && all1[0].user_id === B.id, JSON.stringify(all1))
  await as(db, A, `update public.calendar_events set start_at = $1 where id = $2`, [inHours(49), ev1])
  await as(db, A, `update public.calendar_events set lieu = 'École' where id = $1`, [ev1])
  let jb = await calB()
  check('modifications en rafale : fusionnées dans la tâche en attente', jb.length === 1 && jb[0].payload.action === 'created', JSON.stringify(jb.map((j) => j.payload)))
  await as(db, A, `update public.calendar_events set titre = 'Kermesse de juin' where id = $1`, [ev1])
  check('changement de titre seul : pas de notification', (await calB()).length === 1)
  const c = await svc(db, `select id from public.notif_claim_jobs(100, null) where event = 'calendar_shared'`)
  for (const j of c) await svc(db, `select public.notif_finish_job($1, 'done', '{inapp,push}'::text[], null)`, [j.id])
  await as(db, A, `update public.calendar_events set start_at = $1 where id = $2`, [inHours(50), ev1])
  jb = await calB()
  const trail = jb.find((j) => j.status === 'pending')
  const lastDone = jb.find((j) => j.status === 'done')
  check('modification juste après un envoi : tâche différée de 2 min (regroupement)',
    !!trail && trail.payload.action === 'updated' && (new Date(trail.run_after) - new Date(lastDone.processed_at)) / 60000 >= 1.9)
  await as(db, A, `update public.calendar_events set deleted_at = now() where id = $1`, [ev1])
  jb = await calB()
  check('annulation fusionnée : l\'annulation l\'emporte', jb.filter((j) => j.status === 'pending').length === 1 && jb.find((j) => j.status === 'pending').payload.action === 'deleted')

  const evGone = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared)
     values ($1, 'visite', 'Erreur de saisie', $2, array[$3]::uuid[], true) returning id`, [A.id, inHours(30), c1]))[0].id
  await as(db, A, `update public.calendar_events set deleted_at = now() where id = $1`, [evGone])
  const gone = (await db.query(`select status, last_error from public.notification_jobs where event = 'calendar_shared' and payload ->> 'event_id' = $1`, [evGone])).rows
  check('ajouté puis annulé avant envoi : rien n\'est envoyé', gone.length === 1 && gone[0].status === 'skipped' && gone[0].last_error === 'cancelled_before_send', JSON.stringify(gone))

  const evPriv = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared)
     values ($1, 'visite', 'Privé', $2, array[$3]::uuid[], false) returning id`, [A.id, inHours(5), c1]))[0].id
  check('événement non partagé : aucune tâche pour les autres',
    (await db.query(`select 1 from public.notification_jobs where payload ->> 'event_id' = $1`, [evPriv])).rows.length === 0)

  // Santé : privé à la création (0360), partagé ensuite → parent seulement, jamais la proche.
  const evSante = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, children_ids)
     values ($1, 'sante', 'Pédiatre', $2, array[$3]::uuid[]) returning id`, [A.id, inHours(3), c1]))[0].id
  check('santé : aucune tâche tant que non partagé', (await db.query(`select 1 from public.notification_jobs where payload ->> 'event_id' = $1`, [evSante])).rows.length === 0)
  await as(db, A, `update public.calendar_events set family_shared = true where id = $1`, [evSante])
  const sJobs = (await db.query(`select user_id, payload from public.notification_jobs where event = 'calendar_shared' and payload ->> 'event_id' = $1`, [evSante])).rows
  check('santé partagé : le parent lié est prévenu', sJobs.length === 1 && sJobs[0].user_id === B.id && sJobs[0].payload.action === 'created')
  check('santé partagé : la proche ne reçoit rien', !sJobs.some((j) => j.user_id === D.id))
  const visD = (await svc(db, `select visible from public.notif_calendar_event_for($1, $2)`, [D.id, evSante]))[0]
  const visB = (await svc(db, `select visible from public.notif_calendar_event_for($1, $2)`, [B.id, evSante]))[0]
  check('notif_calendar_event_for : visible pour le parent, pas pour la proche', visB.visible === true && visD.visible === false)

  // --- 5. Rappels selon les préférences du destinataire ------------------------------
  console.log(' -- rappels')
  await db.query(`update public.preferences set rappel_defaut_min = 1440, rappels_par_type = '{}'::jsonb, notif_rappels = true where user_id = $1`, [B.id])
  await db.query(`update public.preferences set rappels_par_type = '{"activite": 600}'::jsonb where user_id = $1`, [A.id])
  const evR = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared)
     values ($1, 'activite', 'Piscine', $2, array[$3]::uuid[], true) returning id`, [A.id, inHours(2), c1]))[0].id
  await svc(db, `select public.notif_enqueue_calendar_reminders(500)`)
  const remFor = (ev) => db.query(`select user_id from public.notification_jobs where event = 'calendar_reminder' and payload ->> 'event_id' = $1`, [ev]).then((r) => r.rows.map((x) => x.user_id))
  let r1 = await remFor(evR)
  check('rappel : le parent lié (défaut 24 h) est rappelé 2 h avant', r1.includes(B.id), JSON.stringify(r1))
  check('rappel : l\'auteur sans rappel sur l\'événement (« Aucun ») ne reçoit rien, même avec un délai par type', !r1.includes(A.id))
  check('rappel : jamais la proche', !r1.includes(D.id))
  await svc(db, `select public.notif_enqueue_calendar_reminders(500)`)
  check('rappel : idempotent (second passage sans doublon)', (await remFor(evR)).filter((u) => u === B.id).length === 1)

  await db.query(`update public.preferences set rappels_par_type = '{"activite": 30}'::jsonb where user_id = $1`, [B.id])
  const evR2 = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared, reminder_minutes)
     values ($1, 'activite', 'Judo', $2, array[$3]::uuid[], true, 180) returning id`, [A.id, inHours(2), c1]))[0].id
  await svc(db, `select public.notif_enqueue_calendar_reminders(500)`)
  r1 = await remFor(evR2)
  check('rappel : délai par type du destinataire (30 min) → pas encore pour B', !r1.includes(B.id), JSON.stringify(r1))
  check('rappel : délai de l\'événement (3 h) → l\'auteur est rappelé', r1.includes(A.id))
  check('rappel titulaire : reminder_sent_at posé', (await db.query(`select reminder_sent_at from public.calendar_events where id = $1`, [evR2])).rows[0].reminder_sent_at !== null)

  await db.query(`update public.preferences set notif_rappels = false, rappels_par_type = '{}'::jsonb where user_id = $1`, [B.id])
  const evR3 = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared)
     values ($1, 'activite', 'Danse', $2, array[$3]::uuid[], true) returning id`, [A.id, inHours(2), c1]))[0].id
  await svc(db, `select public.notif_enqueue_calendar_reminders(500)`)
  check('rappel : notif_rappels désactivé chez B → rien', !(await remFor(evR3)).includes(B.id))
  check('notif_enqueue_calendar_reminders refusée à authenticated', !!(await err(as(db, A, `select public.notif_enqueue_calendar_reminders(10)`))))

  // --- 6. Abonnements Web Push : RLS ------------------------------------------------
  console.log(' -- push_subscriptions')
  check('insertion directe refusée (passage obligé par /api/push/subscribe)',
    !!(await err(as(db, A, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ($1, $2, $3, $4)`, [A.id, EP(1), P256, AUTH]))))
  await svc(db, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ($1, $2, $3, $4), ($5, $6, $3, $4)`, [A.id, EP(1), P256, AUTH, B.id, EP(2)])
  check('A ne voit que ses appareils', (await as(db, A, `select user_id from public.push_subscriptions`)).map((r) => r.user_id).join() === A.id)
  check('A ne supprime pas l\'appareil de B', (await as(db, A, `delete from public.push_subscriptions where endpoint = $1 returning id`, [EP(2)])).length === 0)
  check('A ne modifie rien (pas d\'UPDATE)', !!(await err(as(db, A, `update public.push_subscriptions set device_label = 'x'`))))
  check('anon : aucun accès', !!(await err(asAnon(db, `select id from public.push_subscriptions`))))
  check('point de terminaison hors services de push → refusé (23514)',
    (await err(svc(db, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ($1, 'https://169.254.169.254/latest', $2, $3)`, [A.id, P256, AUTH])))?.code === '23514')
  check('point de terminaison unique (23505)', (await err(svc(db, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ($1, $2, $3, $4)`, [X.id, EP(1), P256, AUTH])))?.code === '23505')
  check('A supprime son appareil', (await as(db, A, `delete from public.push_subscriptions where endpoint = $1 returning id`, [EP(1)])).length === 1)

  // --- 7. File : service_role uniquement ----------------------------------------------
  console.log(' -- file réservée au serveur')
  check('authenticated : notification_jobs illisible', !!(await err(as(db, A, `select id from public.notification_jobs`))))
  check('authenticated : notif_claim_jobs refusée', !!(await err(as(db, A, `select * from public.notif_claim_jobs(10, null)`))))
  check('anon : notification_jobs illisible', !!(await err(asAnon(db, `select id from public.notification_jobs`))))

  // --- 8. Sécurité et bienvenue ----------------------------------------------------------
  console.log(' -- sécurité et bienvenue')
  await db.query(`update auth.users set encrypted_password = 'hash1' where id = $1`, [A.id])
  await db.query(`update auth.users set encrypted_password = 'hash2' where id = $1`, [A.id])
  const sec = (await jobs(db, A.id, 'security_change')).map((j) => j.payload.change)
  check('mot de passe défini puis modifié : deux alertes', sec.includes('password_set') && sec.includes('password_changed'), sec.join())
  await db.query(`update auth.users set email_change = 'nouvelle@test.fr' where id = $1`, [A.id])
  check('changement d\'e-mail demandé : alerte', (await jobs(db, A.id, 'security_change')).some((j) => j.payload.change === 'email_change_requested'))
  await db.query(`update public.users set mfa_enabled = true where id = $1`, [A.id])
  check('2FA activée : alerte', (await jobs(db, A.id, 'security_change')).some((j) => j.payload.change === 'mfa_enabled'))
  await db.query(`update public.users set email_verified = true where id = $1`, [X.id])
  await db.query(`update public.users set email_verified = false where id = $1`, [X.id])
  await db.query(`update public.users set email_verified = true where id = $1`, [X.id])
  check('bienvenue : une seule fois par compte', (await jobs(db, X.id, 'welcome')).length === 1)
  await db.query(`update public.users set deleted_at = now(), email = 'deleted+x@deleted.invalid' where id = $1`, [X.id])
  const del = (await jobs(db, X.id, 'security_change')).find((j) => j.payload.change === 'account_deletion_requested')
  check('suppression demandée : alerte vers l\'adresse d\'origine', del?.payload.notify_email === X.email, JSON.stringify(del?.payload))
  check('suppression : pas d\'alerte « e-mail modifié » parasite', !(await jobs(db, X.id, 'security_change')).some((j) => j.payload.change === 'email_changed'))
  for (const j of await svc(db, `select id from public.notif_claim_jobs(50, $1)`, [X.id])) await svc(db, `select public.notif_finish_job($1, 'done', '{email}'::text[], null)`, [j.id])
  const delDone = (await jobs(db, X.id, 'security_change')).find((j) => j.payload.change === 'account_deletion_requested')
  check('tâche terminée : adresse effacée de la charge', delDone.status === 'done' && !('notify_email' in delDone.payload), JSON.stringify(delDone.payload))

  // --- 9. Appareils connus (connexion) ------------------------------------------------
  console.log(' -- nouvelle connexion')
  const did1 = '1'.repeat(64), did2 = '2'.repeat(64), did3 = '3'.repeat(64), fpA = 'a'.repeat(64), fpC = 'c'.repeat(64)
  const signAs = (u, sid, did, fp) => svc(db, `select public.notif_record_sign_in($1, $2, $3, $4, 'Chrome sur Windows', null, 'UA') r`, [u.id, sid, did, fp]).then((r) => r[0].r)
  const sign = (sid, did, fp) => signAs(B, sid, did, fp)
  check('première connexion du compte : first (pas d\'alerte après inscription)', (await sign('sess-0001', did1, fpA)) === 'first')
  check('drapeau first_sign_in_at posé sur le compte', (await db.query(`select first_sign_in_at from public.users where id = $1`, [B.id])).rows[0].first_sign_in_at !== null)
  check('même session rejouée : duplicate (idempotent)', (await sign('sess-0001', did1, fpA)) === 'duplicate')
  check('reconnexion juste après l\'inscription depuis un autre réseau : pas d\'alerte', (await sign('sess-0002', did2, fpC)) === 'first')
  await db.query(`update public.users set first_sign_in_at = now() - interval '2 days' where id = $1`, [B.id])
  check('même identifiant d\'appareil (cookie), autre réseau : known', (await sign('sess-0003', did1, fpC)) === 'known')
  check('contournement 1 : cookie inconnu mais empreinte identique → new (l\'empreinte ne reconnaît jamais un appareil)',
    (await sign('sess-0004', did3, fpA)) === 'new')
  check('contournement 2 : session vue seulement par le filet serveur (sans cookie), même empreinte → new',
    (await sign('sess-0005', null, fpA)) === 'new')
  // Compte existant (drapeau ancien), première session suivie par cookie : référence silencieuse, une seule fois.
  await db.query(`update public.users set first_sign_in_at = now() - interval '1 year' where id = $1`, [D.id])
  check('compte existant, première session suivie par cookie : baseline (pas d\'alerte au déploiement)', (await signAs(D, 'sess-d-0001', did1, fpA)) === 'baseline')
  check('compte existant, autre cookie ensuite : new', (await signAs(D, 'sess-d-0002', did2, fpA)) === 'new')
  const delSess = await err(as(db, B, `delete from public.sessions returning id`))
  check('l\'utilisateur ne peut pas effacer son historique de connexions', !!delSess
    && (await db.query(`select count(*)::int n from public.sessions where user_id = $1`, [B.id])).rows[0].n === 5)
  check('notif_record_sign_in refusée à authenticated', !!(await err(as(db, B, `select public.notif_record_sign_in($1, 'sess-x-0001', null, $2, 'x', null, 'x')`, [B.id, fpA]))))

  // Filet serveur : capture à la création, même si la session disparaît avant le passage du cron.
  const sess = (await db.query(`insert into auth.sessions (user_id, user_agent, ip, aal) values ($1, 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', '81.2.3.4', 'aal1') returning id`, [B.id])).rows[0].id
  const lc = (await jobs(db, B.id, 'login_check')).find((j) => j.payload.session_id === sess)
  check('nouvelle session GoTrue : tâche login_check différée de 2 min, agent et IP absents de la charge',
    !!lc && (new Date(lc.run_after) - new Date(lc.created_at)) / 60000 >= 1.9 && !JSON.stringify(lc.payload).includes('81.2.3.4'))
  check('capture réservée au service_role', !!(await err(as(db, B, `select * from public.auth_session_captures`))))
  let info = (await svc(db, `select * from public.notif_session_info($1)`, [sess]))[0]
  check('notif_session_info : agent, IP, aal1, pas de 2FA', info.user_id === B.id && info.ip === '81.2.3.4' && info.session_exists && info.aal === 'aal1' && !info.has_verified_factor)
  await db.query(`insert into auth.mfa_factors (user_id, status, factor_type) values ($1, 'verified', 'totp')`, [B.id])
  info = (await svc(db, `select * from public.notif_session_info($1)`, [sess]))[0]
  check('2FA vérifiée et session en aal1 : signalé (décision reportée côté cron)', info.has_verified_factor === true && info.aal === 'aal1')
  await db.query(`delete from auth.mfa_factors where user_id = $1`, [B.id])
  await db.query(`delete from auth.sessions where id = $1`, [sess])
  info = (await svc(db, `select * from public.notif_session_info($1)`, [sess]))[0]
  check('session déjà fermée au passage du cron : agent et IP toujours connus (contournement 3)',
    !!info && info.session_exists === false && info.user_agent.includes('Chrome') && info.ip === '81.2.3.4')
  check('notif_session_info refusée à authenticated', !!(await err(as(db, B, `select * from public.notif_session_info($1)`, [sess]))))
  const lcRow = (await svc(db, `select id from public.notif_claim_jobs(50, null) where event = 'login_check' and payload ->> 'session_id' = $1`, [sess]))
  check('login_check pas encore dû (2 min)', lcRow.length === 0)
  await db.query(`update public.notification_jobs set run_after = now() - interval '1 second' where id = $1`, [lc.id])
  const claimedLc = (await svc(db, `select id, attempts from public.notif_claim_jobs(200, null)`)).filter((j) => Number(j.id) === Number(lc.id))
  await svc(db, `select public.notif_finish_job($1, 'defer', '{}'::text[], 'awaiting_mfa')`, [lc.id])
  const deferred2 = (await db.query(`select status, attempts, run_after from public.notification_jobs where id = $1`, [lc.id])).rows[0]
  check('report (2FA en attente) : remis en attente 2 min, sans consommer d\'essai',
    claimedLc.length === 1 && deferred2.status === 'pending' && deferred2.attempts === 0 && new Date(deferred2.run_after) > new Date())

  // Rattrapage du drapeau first_sign_in_at pour les comptes existants (migration ré-exécutée).
  const old = { id: U('5a'), email: 'ancien44@test.fr' }
  await db.query(`insert into auth.users (id, email, email_confirmed_at, created_at, last_sign_in_at) values ($1, $2, now() - interval '1 year', now() - interval '1 year', now() - interval '3 days')`, [old.id, old.email])
  await db.query(`insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing`, [old.id, old.email])
  await db.exec(nodeFs.readFileSync(MIGRATION, 'utf8'))
  const fsi = (await db.query(`select first_sign_in_at from public.users where id = $1`, [old.id])).rows[0].first_sign_in_at
  check('comptes existants : first_sign_in_at rattrapé (dernière connexion), pas de fenêtre de 30 min',
    !!fsi && Date.now() - new Date(fsi).getTime() > 2 * 86400_000)

  // Comptes jamais confirmés de plus de 24 h, sans données : à supprimer.
  const unc = { id: U('5b'), email: 'abandon44@test.fr' }, uncKid = { id: U('5c'), email: 'abandon-enfant44@test.fr' }, uncNew = { id: U('5d'), email: 'recent44@test.fr' }
  for (const [u, age] of [[unc, '2 days'], [uncKid, '2 days'], [uncNew, '1 hour']]) {
    await db.query(`insert into auth.users (id, email, created_at) values ($1, $2, now() - $3::interval)`, [u.id, u.email, age])
    await db.query(`insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing`, [u.id, u.email])
  }
  await db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'Test', '2020-01-01')`, [uncKid.id])
  const stale = (await svc(db, `select * from public.notif_unconfirmed_accounts(500) as id`)).map((r) => r.id)
  check('purge des comptes non confirmés : seulement > 24 h, jamais confirmés, sans données',
    stale.includes(unc.id) && !stale.includes(uncKid.id) && !stale.includes(uncNew.id) && !stale.includes(A.id), JSON.stringify(stale))
  check('notif_unconfirmed_accounts refusée à authenticated', !!(await err(as(db, A, `select * from public.notif_unconfirmed_accounts(10)`))))

  // --- 9 bis. Réessais, échec définitif, reprise des tâches bloquées --------------------
  console.log(' -- réessais')
  const mk = (key, extra = '') => db.query(`insert into public.notification_jobs (user_id, actor_id, event, payload, dedupe_key, run_after ${extra ? ', status, locked_at, attempts' : ''})
     values ($1, $2, 'welcome', '{"notify_email": "t44@test.fr"}'::jsonb, $3, now() - interval '1 second' ${extra}) returning id`, [A.id, T.id, key]).then((r) => r.rows[0].id)
  const jb1 = await mk('test:backoff')
  await svc(db, `select id from public.notif_claim_jobs(10, $1)`, [T.id])
  await svc(db, `select public.notif_finish_job($1, 'retry', '{inapp}'::text[], 'email')`, [jb1])
  let row = (await db.query(`select * from public.notification_jobs where id = $1`, [jb1])).rows[0]
  const wait = (new Date(row.run_after) - Date.now()) / 60000
  check('réessai : remis en attente, 2 min après le 1er essai, canaux livrés conservés', row.status === 'pending' && wait > 1.8 && wait < 2.1 && row.delivered.join() === 'inapp', `${row.status} ${wait}`)
  check('réessai : adresse conservée tant que la tâche n\'est pas terminée', 'notify_email' in row.payload)
  await db.query(`update public.notification_jobs set attempts = 4, run_after = now() - interval '1 second' where id = $1`, [jb1])
  await svc(db, `select id from public.notif_claim_jobs(10, $1)`, [T.id])
  await svc(db, `select public.notif_finish_job($1, 'retry', '{}'::text[], 'email')`, [jb1])
  row = (await db.query(`select * from public.notification_jobs where id = $1`, [jb1])).rows[0]
  check('5e essai en échec : failed, adresse effacée', row.status === 'failed' && row.attempts === 5 && !('notify_email' in row.payload), JSON.stringify(row))
  const jb2 = await mk('test:stale', ", 'processing', now() - interval '11 minutes', 2")
  const jb3 = await mk('test:stuck', ", 'processing', now() - interval '11 minutes', 5")
  const rec2 = await svc(db, `select id, attempts from public.notif_claim_jobs(10, $1)`, [T.id])
  check('tâche abandonnée (moins de 5 essais) : reprise', rec2.some((j) => Number(j.id) === Number(jb2) && j.attempts === 3), JSON.stringify(rec2))
  const st = (await db.query(`select status, last_error, payload from public.notification_jobs where id = $1`, [jb3])).rows[0]
  check('tâche abandonnée après 5 essais : failed (stuck), adresse effacée', st.status === 'failed' && st.last_error === 'stuck' && !('notify_email' in st.payload))
  check('tâche en cours récente : jamais reprise deux fois', !(await svc(db, `select id from public.notif_claim_jobs(10, $1)`, [T.id])).some((j) => Number(j.id) === Number(jb2)))

  // --- 10. search_path des fonctions SECURITY DEFINER --------------------------------
  const noPath = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (p.proname like 'notif\\_%' or p.proname like '\\_notif\\_%')
       and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))`)
  check('SECURITY DEFINER 0440 : search_path vide', noPath.rows.length === 0, noPath.rows.map((r) => r.proname).join(','))
  const count = (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and (p.proname like 'notif\\_%' or p.proname like '\\_notif\\_%')`)).rows[0].n
  check('fonctions 0440 bien présentes', count >= 20, String(count))
  const exec = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'notif\\_%' or p.proname like '\\_notif\\_%')
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`)).rows
  check('fonctions 0440 non exécutables par anon / authenticated', exec.length === 0, exec.map((r) => r.proname).join(','))

  console.log(`\n0440 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
