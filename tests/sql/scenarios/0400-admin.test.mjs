// Scénarios 0400_admin_operations.sql. ADM administrateur, P parent, Q autre parent, Z utilisateur supprimé.
// Base partagée avec les scénarios précédents : les listes admin sont filtrées sur les comptes / lignes de ce
// scénario (`mine`) avant de compter.
const U = (n) => `00000000-0000-0000-0000-0000000004${n}`
const ADM = { id: U('a1'), email: 'admin4@test.fr', prenom: 'Ada' }
const ADM2 = { id: U('a2'), email: 'admin4b@test.fr', prenom: 'Bob' }
const P = { id: U('01'), email: 'paul_4@test.fr', prenom: 'Paul', nom: 'Martin' }
const Q = { id: U('02'), email: 'quentin4@test.fr', prenom: 'Quentin', nom: '100%' }
const Z = { id: U('03'), email: 'zoe4@test.fr', prenom: 'Zoé' }
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function as(db, who, sql, params = [], aal = 'aal1') {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal, role: 'authenticated', session_id: crypto.randomUUID() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
const adm = (db, sql, params = []) => as(db, ADM, sql, params, 'aal2')
async function anon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const LIST = `select * from public.admin_list_accounts($1, $2, $3, $4, $5, $6, $7, $8)`
const OURS = new Set([ADM, ADM2, P, Q, Z].map((u) => u.id))
const mine = (rows) => rows.filter((r) => OURS.has(r.id ?? r.user_id))

export default async function run(db) {
  console.log('\n== Admin opérations (0400)')
  for (const u of [ADM, ADM2, P, Q, Z]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values ($1, $2, now(), now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom, nom, email_verified) values ($1, $2, $3, $4, true) on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom, email_verified = true`, [u.id, u.email, u.prenom, u.nom ?? null])
  }
  await db.query(`update public.users set plan = 'admin' where id in ($1, $2)`, [ADM.id, ADM2.id])
  await db.query(`update public.users set plan = 'coparentalite', storage_used_mb = 42 where id = $1`, [P.id])
  await db.query(`update public.users set email_verified = false where id = $1`, [Q.id])
  await db.query(`update public.users set deleted_at = now() where id = $1`, [Z.id])
  await db.query(`insert into public.children (user_id, prenom, date_naissance, infos_medicales) values ($1, 'Lina', '2019-05-12', '{"ciphertext":"x"}'), ($1, 'Noé', '2021-01-01', null)`, [P.id])
  await db.query(`insert into auth.sessions (user_id, user_agent, ip, aal, updated_at) values ($1, 'Mozilla/5.0 (iPhone) Safari', '10.0.0.1', 'aal1', now()), ($1, 'Mozilla/5.0 (Windows) Chrome', '10.0.0.2', 'aal1', now())`, [P.id])

  // --- Garde -----------------------------------------------------------------
  let e = await err(as(db, ADM, LIST, [null, null, null, null, null, null, null, 10], 'aal1'))
  check('admin aal1 refusé (42501)', e && /admin only/.test(e.message), e?.message)
  e = await err(as(db, P, LIST, [null, null, null, null, null, null, null, 10], 'aal2'))
  check('utilisateur aal2 refusé', e && /admin only/.test(e.message), e?.message)
  e = await err(anon(db, LIST, [null, null, null, null, null, null, null, 10]))
  check('anon refusé (pas de droit d’exécution)', e && /permission denied/.test(e.message), e?.message)

  // --- Comptes ---------------------------------------------------------------
  let rows = await adm(db, LIST, [null, null, null, null, null, null, null, 200])
  check('liste : comptes non supprimés uniquement', mine(rows).length === 4 && !rows.some((r) => r.id === Z.id), rows.map((r) => r.id).join(','))
  const p = rows.find((r) => r.id === P.id)
  check('liste : formule, stockage, nombre d’enfants', p && p.plan === 'coparentalite' && p.storage_mb === 42 && p.children_count === 2, JSON.stringify(p))
  check('liste : aucune colonne sensible', p && !('infos_medicales' in p) && !('telephone' in p) && !('adresse' in p))
  rows = await adm(db, LIST, ['_4', null, null, null, null, null, null, 50])
  check('recherche : « _ » échappé (pas de joker)', rows.length === 1 && rows[0].id === P.id, rows.map((r) => r.email).join(','))
  rows = await adm(db, LIST, ['100%', null, null, null, null, null, null, 50])
  check('recherche : « % » échappé, nom trouvé', rows.length === 1 && rows[0].id === Q.id)
  rows = mine(await adm(db, LIST, [null, null, 'non_verifie', null, null, null, null, 200]))
  check('filtre statut non vérifié', rows.length === 1 && rows[0].id === Q.id)
  rows = mine(await adm(db, LIST, [null, null, 'supprime', null, null, null, null, 200]))
  check('filtre statut supprimé', rows.length === 1 && rows[0].id === Z.id)
  rows = await adm(db, LIST, [null, 'admin', null, null, null, null, null, 200])
  check('filtre formule admin', mine(rows).length === 2 && rows.every((r) => r.plan === 'admin'), rows.map((r) => r.plan).join(','))
  const page1 = await adm(db, LIST, [null, null, null, null, null, null, null, 2])
  const last = page1[page1.length - 1]
  const page2 = await adm(db, LIST, [null, null, null, null, null, last.created_at, last.id, 2])
  check('pagination par curseur sans doublon', page1.length === 2 && page2.length === 2 && !page2.some((r) => page1.some((x) => x.id === r.id)))
  e = await err(adm(db, LIST, [null, 'gold', null, null, null, null, null, 50]))
  check('formule inconnue refusée (22023)', e && /invalid plan/.test(e.message))
  await db.query(`update auth.users set banned_until = now() + interval '100 years' where id = $1`, [Q.id])
  rows = mine(await adm(db, LIST, [null, null, 'suspendu', null, null, null, null, 200]))
  check('statut suspendu (banned_until)', rows.length === 1 && rows[0].id === Q.id)
  const ban = await db.query(`select action from public.audit_log where user_id = $1 and action = 'security.banned'`, [Q.id])
  check('événement de sécurité « security.banned » écrit par trigger', ban.rows.length === 1)

  const acc = (await adm(db, `select public.admin_get_account($1) as a`, [P.id]))[0].a
  const keys = Object.keys(acc).sort().join(',')
  check('fiche : clés minimales', keys === 'audit,effective,open_tickets,payments,profile,sessions,subscription', keys)
  const txt = JSON.stringify(acc)
  check('fiche : ni santé, ni IP, ni contenu', !/ciphertext|10\.0\.0|infos_medicales|journal|documents|testimon|messages/.test(txt), txt.slice(0, 300))
  check('fiche : enfants comptés, plan effectif, sessions', acc.profile.children_count === 2 && acc.effective.plan === 'coparentalite' && acc.sessions.length === 2)
  check('fiche inconnue → null', (await adm(db, `select public.admin_get_account($1) as a`, [U('77')]))[0].a === null)

  e = await err(adm(db, `select public.admin_revoke_user_sessions($1)`, [ADM.id]))
  check('déconnexion forcée de soi-même refusée', e && /own sessions/.test(e.message))
  const n = (await adm(db, `select public.admin_revoke_user_sessions($1) as n`, [P.id]))[0].n
  const left = (await db.query(`select count(*)::int as n from auth.sessions where user_id = $1`, [P.id])).rows[0].n
  check('déconnexion forcée : 2 sessions supprimées', n === 2 && left === 0)
  let au = (await db.query(`select * from public.audit_log where action = 'admin.account.force_logout'`)).rows
  check('déconnexion forcée journalisée (auteur, personne concernée)', au.length === 1 && au[0].actor_id === ADM.id && au[0].user_id === P.id && au[0].actor_type === 'admin')
  e = await err(as(db, P, `select public.admin_revoke_user_sessions($1)`, [Q.id], 'aal2'))
  check('déconnexion forcée refusée à un utilisateur', e && /admin only/.test(e.message))

  // --- admin_log_action ---------------------------------------------------------
  const id = (await adm(db, `select public.admin_log_action('admin.account.suspend', 'users', $1, $2::uuid, '{"reason":"abus"}') as id`, [Q.id, Q.id]))[0].id
  au = (await db.query(`select * from public.audit_log where id = $1`, [id])).rows[0]
  check('admin_log_action : auteur = auth.uid()', au.actor_id === ADM.id && au.user_id === Q.id)
  e = await err(adm(db, `select public.admin_log_action('account.delete')`))
  check('admin_log_action : préfixe admin. obligatoire', e && /invalid action/.test(e.message))
  e = await err(as(db, P, `select public.admin_log_action('admin.x')`, [], 'aal2'))
  check('admin_log_action refusée à un utilisateur', e && /admin only/.test(e.message))
  e = await err(as(db, P, `insert into public.audit_log (action) values ('admin.fake')`, [], 'aal2'))
  check('insertion directe dans audit_log refusée', e && /permission denied/.test(e.message), e?.message)

  // --- Journal : append-only, purge, lecture ---------------------------------------
  e = await err(db.query(`update public.audit_log set action = 'x' where id = $1`, [id]))
  check('audit_log : modification refusée', e && /append-only/.test(e.message), e?.message)
  e = await err(svc(db, `delete from public.audit_log where id = $1`, [id]))
  check('audit_log : suppression d’une ligne récente refusée (service_role)', e && /12 months/.test(e.message), e?.message)
  await db.query(`insert into public.audit_log (user_id, actor_type, action, created_at) values ($1, 'user', 'account.export', now() - interval '13 months')`, [Q.id])
  e = await err(svc(db, `delete from public.audit_log where created_at < now() - interval '12 months'`))
  check('audit_log : purge de rétention (> 12 mois) autorisée', !e, e?.message)
  let la = await adm(db, `select * from public.admin_list_audit('admin', null, null, null, null, null, 50)`)
  check('journal : catégorie admin, e-mail de l’auteur', la.length >= 2 && la.every((r) => r.actor_type === 'admin') && la.some((r) => r.actor_email === ADM.email))
  la = await adm(db, `select * from public.admin_list_audit('securite', null, null, null, null, null, 50)`)
  check('journal : catégorie sécurité', la.some((r) => r.action === 'security.banned') && la.every((r) => /^(security|account)\./.test(r.action)))
  const firstPage = await adm(db, `select * from public.admin_list_audit(null, null, null, null, null, null, 1)`)
  const next = await adm(db, `select * from public.admin_list_audit(null, null, null, null, null, $1, 1)`, [firstPage[0].id])
  check('journal : curseur décroissant', next.length === 1 && Number(next[0].id) < Number(firstPage[0].id))
  e = await err(as(db, P, `select * from public.audit_log`, [], 'aal2'))
  const own = e ? null : await as(db, P, `select count(*)::int as n from public.audit_log`, [], 'aal2')
  check('audit_log illisible pour un utilisateur', own && own[0].n === 0)
  const r1 = await as(db, ADM, `select count(*)::int as n from public.audit_log`, [], 'aal1')
  check('audit_log illisible pour un admin aal1', r1[0].n === 0)

  // Événements de sécurité
  await db.query(`update auth.users set email = 'paul.new@test.fr' where id = $1`, [P.id])
  await db.query(`insert into auth.mfa_factors (user_id, status, factor_type) values ($1, 'verified', 'totp')`, [P.id])
  const sec = (await db.query(`select action, metadata from public.audit_log where user_id = $1 and action like 'security.%' order by id`, [P.id])).rows
  check('sécurité : changement d’e-mail et 2FA journalisés sans PII', sec.some((s) => s.action === 'security.email_changed') && sec.some((s) => s.action === 'security.mfa_enabled') && !JSON.stringify(sec).includes('@'), JSON.stringify(sec))

  // Purge d'un compte : FK SET NULL autorisée malgré l'append-only
  e = await err(db.query(`delete from auth.users where id = $1`, [Z.id]))
  check('purge d’un compte : audit conservé, user_id à NULL', !e, e?.message)

  // --- Support ---------------------------------------------------------------------
  const t1 = (await as(db, P, `insert into public.support_tickets (user_id, subject, body, category, status, messages, priority) values (auth.uid(), 'Bug PDF', 'Le PDF ne sort pas', 'bug', 'resolved', '[{"from":"admin","body":"faux"}]', 'urgent') returning id, status, messages, priority, category`, [], 'aal2'))[0]
  check('ticket utilisateur : statut, fil et priorité imposés par la base', t1.status === 'open' && t1.messages.length === 0 && t1.priority === 'high' && t1.category === 'bug', JSON.stringify(t1))
  const t2 = (await as(db, Q, `insert into public.support_tickets (user_id, subject, body) values (auth.uid(), 'Question', 'Comment faire ?') returning id, priority, category`, [], 'aal1'))[0]
  check('ticket gratuit : priorité low, catégorie contact', t2.priority === 'low' && t2.category === 'contact')
  e = await err(as(db, P, `insert into public.support_tickets (user_id, subject, body, category) values (auth.uid(), 's', 'b', 'piratage')`, [], 'aal2'))
  check('catégorie inconnue refusée', e && /chk_support_tickets_category/.test(e.message), e?.message)
  const up = (await as(db, P, `update public.support_tickets set messages = '[1]', status = 'in_progress', subject = 'Bug PDF (maj)' where id = $1 returning messages, status, subject`, [t1.id], 'aal2'))[0]
  check('utilisateur : fil et statut protégés, objet modifiable', up.messages.length === 0 && up.status === 'open' && up.subject === 'Bug PDF (maj)', JSON.stringify(up))
  let tickets = await adm(db, `select * from public.admin_list_tickets(null, null, null, null, 0, 200)`)
  const ix1 = tickets.findIndex((t) => t.id === t1.id), ix2 = tickets.findIndex((t) => t.id === t2.id)
  const prio = tickets.map((t) => t.priority)
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 }
  check('file : Coparentalité+ (high) avant gratuit (low), tri par priorité', ix1 >= 0 && ix2 > ix1 && prio.every((x, i) => i === 0 || rank[prio[i - 1]] <= rank[x]) && Number(tickets[0].total_count) === tickets.length, prio.join(','))
  check('file : e-mail du demandeur', tickets[ix1]?.user_email === 'paul.new@test.fr')
  tickets = await adm(db, `select * from public.admin_list_tickets(null, null, 'bug', null, 0, 200)`)
  check('file : filtre catégorie', tickets.some((t) => t.id === t1.id) && !tickets.some((t) => t.id === t2.id) && tickets.every((t) => t.category === 'bug'))
  tickets = await adm(db, `select * from public.admin_list_tickets(null, null, null, 'quent', 0, 50)`)
  check('file : recherche par e-mail', tickets.length === 1 && tickets[0].id === t2.id)
  const msg = (await adm(db, `select public.admin_reply_ticket($1, 'Bonjour, voici la solution.') as m`, [t1.id]))[0].m
  const after = (await as(db, P, `select status, messages, last_reply_by from public.support_tickets where id = $1`, [t1.id], 'aal2'))[0]
  check('réponse admin : fil, statut en attente, dernière réponse', msg.from === 'admin' && after.messages.length === 1 && after.status === 'waiting_user' && after.last_reply_by === 'admin')
  const notif = (await db.query(`select type from public.notifications where user_id = $1 and type = 'support_reponse'`, [P.id])).rows
  check('réponse admin : notification in-app', notif.length === 1)
  const ar = (await db.query(`select metadata from public.audit_log where action = 'admin.support.reply'`)).rows[0]
  check('réponse admin journalisée sans le texte', ar && !JSON.stringify(ar).includes('solution') && ar.metadata.length > 0)
  await as(db, P, `select public.support_reply_mine($1, 'Merci, ça marche')`, [t1.id], 'aal2')
  const back = (await adm(db, `select public.admin_get_ticket($1) as t`, [t1.id]))[0].t
  check('réponse utilisateur : ticket rouvert, 2 messages', back.status === 'open' && back.messages.length === 2 && back.requester.plan === 'coparentalite')
  e = await err(as(db, Q, `select public.support_reply_mine($1, 'intrusion')`, [t1.id], 'aal1'))
  check('réponse sur le ticket d’un autre refusée', e && /not found/.test(e.message))
  const upd = (await adm(db, `select public.admin_update_ticket($1, 'resolved', 'urgent') as r`, [t2.id]))[0].r
  check('admin : statut et priorité', upd.status === 'resolved' && upd.priority === 'urgent')
  const closed = (await as(db, Q, `select closed_at from public.support_tickets where id = $1`, [t2.id]))[0]
  check('résolu : closed_at posé', closed.closed_at !== null)
  const cl = (await as(db, Q, `update public.support_tickets set status = 'closed' where id = $1 returning status`, [t2.id]))[0]
  check('utilisateur peut fermer son ticket', cl.status === 'closed')
  e = await err(as(db, ADM, `select public.admin_update_ticket($1, 'open', null)`, [t2.id], 'aal1'))
  check('admin aal1 ne modifie pas un ticket', e && /admin only/.test(e.message))
  const aal1Read = await as(db, ADM, `select count(*)::int as n from public.support_tickets`, [], 'aal1')
  check('admin aal1 ne lit pas les tickets (RLS aal2)', aal1Read[0].n === 0)

  // --- Témoignages ---------------------------------------------------------------
  const ov0 = (await adm(db, `select public.admin_testimony_overview() as o`))[0].o
  const req = (await db.query(`insert into public.testimony_requests (user_id, token, temoin_nom_pref, message_parent, questions, expires_at) values ($1, 'tok-secret-123-abcdefghijklmnopqrstuvwxyz0123456789', 'Mamie Jeanne', 'Message privé', '[{"id":"q1","label":"Question privée"}]', now() + interval '7 days') returning id`, [P.id])).rows[0]
  const trAll = await adm(db, `select * from public.admin_list_testimony_requests(null, null, null, null, 200)`)
  const tr = trAll.filter((r) => r.user_id === P.id)
  const trTxt = JSON.stringify(trAll)
  check('témoignages : métadonnées seulement', tr.length === 1 && !/tok-secret|Mamie|Message privé|Question privée/.test(trTxt) && !('token' in tr[0]), trTxt)
  const ov = (await adm(db, `select public.admin_testimony_overview() as o`))[0].o
  check('témoignages : synthèse par statut et signalements', (ov.by_status.pending ?? 0) === (ov0.by_status?.pending ?? 0) + 1 && Number(ov.reports_open) === Number(ov0.reports_open), JSON.stringify({ ov0, ov }))
  e = await err(adm(db, `select public.admin_revoke_testimony_request($1, 'parce que')`, [req.id]))
  check('révocation : motif contrôlé', e && /invalid reason/.test(e.message))
  const rv = (await adm(db, `select public.admin_revoke_testimony_request($1, 'signalement_abus') as ok`, [req.id]))[0].ok
  const st = (await db.query(`select status, revoked_at from public.testimony_requests where id = $1`, [req.id])).rows[0]
  check('révocation : lien révoqué et journalisé', rv === true && st.status === 'revoked' && st.revoked_at && (await db.query(`select 1 from public.audit_log where action = 'admin.testimony.revoke'`)).rows.length === 1)
  check('révocation répétée : sans effet', (await adm(db, `select public.admin_revoke_testimony_request($1, 'autre') as ok`, [req.id]))[0].ok === false)
  e = await err(adm(db, `select count(*) from public.testimony_requests`))
  const direct = e ? null : await adm(db, `select count(*)::int as n from public.testimony_requests`)
  check('admin : aucune lecture directe des demandes de témoignage', direct && direct[0].n === 0, e?.message)

  // --- Centre d'aide ----------------------------------------------------------------
  const faq = (await adm(db, `insert into public.faq_items (slug, question, categorie, reponse_md, statut, published_at) values ('test-q', 'Question ?', 'compte', 'Réponse', 'publie', now()) returning id, version`))[0]
  await adm(db, `insert into public.faq_items (slug, question, categorie, reponse_md) values ('brouillon-q', 'Brouillon ?', 'compte', 'Texte')`)
  check('FAQ : création admin (version 1)', faq.version === 1)
  const cv = (await db.query(`select action from public.content_versions where entity_type = 'faq_items' and entity_id = $1`, [faq.id])).rows
  check('FAQ : historique content_versions', cv.length === 1 && cv[0].action === 'insert')
  const ca = (await db.query(`select action, actor_id from public.audit_log where entity = 'faq_items' and entity_id = $1`, [faq.id])).rows
  check('FAQ : audit admin.content.create', ca.length === 1 && ca[0].action === 'admin.content.create' && ca[0].actor_id === ADM.id)
  await adm(db, `update public.faq_items set statut = 'brouillon' where id = $1`, [faq.id])
  check('FAQ : dépublication journalisée', (await db.query(`select 1 from public.audit_log where entity_id = $1 and action = 'admin.content.unpublish'`, [faq.id])).rows.length === 1)
  await adm(db, `update public.faq_items set statut = 'publie' where id = $1`, [faq.id])
  const pub = await anon(db, `select slug from public.faq_items`)
  check('FAQ : lecture publique du publié uniquement', pub.length === 1 && pub[0].slug === 'test-q')
  e = await err(as(db, P, `insert into public.faq_items (slug, question, categorie, reponse_md) values ('x', 'x', 'compte', 'x')`, [], 'aal2'))
  check('FAQ : écriture refusée à un utilisateur', e && /row-level security/.test(e.message), e?.message)
  e = await err(as(db, ADM, `insert into public.faq_items (slug, question, categorie, reponse_md) values ('y', 'y', 'compte', 'y')`, [], 'aal1'))
  check('FAQ : écriture refusée à un admin aal1', e && /row-level security/.test(e.message), e?.message)
  e = await err(adm(db, `insert into public.daily_tips (slug, titre, texte, categorie) values ('t', 't', $1, 'preuves')`, ['x'.repeat(281)]))
  check('conseil : 280 caractères maximum', e && /check constraint/.test(e.message))
  await adm(db, `insert into public.tutorials (slug, titre, duree_min, icone, contenu_md) values ('tuto', 'Tuto', 3, 'rocket', 'Étapes')`)
  check('tutoriel : création admin + historique', (await db.query(`select 1 from public.content_versions where entity_type = 'tutorials'`)).rows.length === 1)

  console.log(`\n0400 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
