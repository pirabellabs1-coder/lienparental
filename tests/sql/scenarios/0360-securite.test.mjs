// Scénarios 0360_security_v3.sql (PGlite + stubs Supabase).
// A = Julie (titulaire de Lina c1 et Noah c2), B = Thomas (parent invité), D = Rose (proche),
// E = Eva (co-parent messagerie V1 de A), F = admin, X = tiers.
const U = (n) => `00000000-0000-0000-0000-0000000001${n}`
const A = { id: U('0a'), email: 'julie3@test.fr', prenom: 'Julie' }
const B = { id: U('0b'), email: 'thomas3@test.fr', prenom: 'Thomas' }
const D = { id: U('0d'), email: 'rose3@test.fr', prenom: 'Rose' }
const E = { id: U('0e'), email: 'eva3@test.fr', prenom: 'Eva' }
const F = { id: U('0f'), email: 'admin3@test.fr', prenom: 'Admin' }
const X = { id: U('99'), email: 'x3@test.fr', prenom: 'X' }
const c1 = U('c1'), c2 = U('c2'), b1 = U('b1')
const uuid = () => crypto.randomUUID()

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}
async function as(db, who, sql, params = [], opts = {}) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: opts.email ?? who.email, aal: opts.aal ?? 'aal1', role: 'authenticated', session_id: opts.sid }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const payload = { ciphertext: 'x', iv: 'y', tag: 'z', v: 1 }
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]

export default async function run(db) {
  console.log('\n== Scénarios sécurité v3 (0360)')
  for (const u of [A, B, D, E, F, X]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [F.id])
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values
    ($1, $4, 'Lina', '2019-05-12'), ($2, $4, 'Noah', '2018-03-02'), ($3, $5, 'Lina', '2019-05-12')`, [c1, c2, b1, A.id, B.id])

  // --- Liaisons : A invite B (parent, Lina + Noah) ---------------------------
  const inv = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2, $3]::uuid[])`, [B.email, c1, c2])
  const acc = await as(db, B, `select public.accept_family_invitation($1) r`, [inv[0].token])
  const convAB = acc[0].r.conversation_id
  check('acceptation : 2 enfants + conversation A-B', acc[0].r.child_ids.length === 2 && !!convAB, JSON.stringify(acc[0].r))

  // ===================== M2 =====================
  console.log(' -- M2 invitations')
  const e1 = await err(as(db, B, `select * from public.create_family_invitation('autre3@test.fr', 'parent', array[$1]::uuid[])`, [c1]))
  check('gardien parent → invitation « parent » refusée (owner_only)', e1?.code === '42501' && e1?.hint === 'owner_only', e1?.message)
  const invD = await as(db, B, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [D.email, c1])
  check('gardien parent → invitation « proche » acceptée', !!invD[0]?.token)
  await as(db, D, `select public.accept_family_invitation($1)`, [invD[0].token])
  const gD = (await one(db, `select id from public.child_guardians where user_id = $1 and status = 'active'`, [D.id])).id
  const e2 = await err(as(db, B, `select public.set_child_guardian_role($1, 'parent')`, [gD]))
  check('gardien parent ne promeut pas un proche en parent (owner_only)', e2?.hint === 'owner_only', e2?.message)
  // Invitation « parent » héritée (créée avant 0360 par un non-titulaire) : n'accorde rien.
  const legacyTok = 'ab'.repeat(32)
  const legacy = await one(db, `insert into public.family_invitations (inviter_id, invitee_email, role, token_hash, expires_at)
    values ($1, $2, 'parent', sha256(convert_to($3, 'UTF8')), now() + interval '7 days') returning id`, [B.id, X.email, legacyTok])
  await db.query(`insert into public.family_invitation_children values ($1, $2)`, [legacy.id, c1])
  const lacc = await as(db, X, `select public.accept_family_invitation($1) r`, [legacyTok])
  check('invitation « parent » d\'un non-titulaire : aucun enfant accordé, pas de conversation', lacc[0].r.child_ids.length === 0 && lacc[0].r.conversation_id === null, JSON.stringify(lacc[0].r))
  check('X ne voit pas Lina', (await as(db, X, `select id from public.children`)).length === 0)

  // ===================== M1 =====================
  console.log(' -- M1 calendrier')
  const ev = await db.query(`insert into public.calendar_events (user_id, type, titre, description, lieu, start_at, children_ids, family_shared) values
    ($1, 'sante', 'Pédiatre : asthme', 'détail médical', 'Cabinet', now() + interval '1 day', array[$2]::uuid[], true),
    ($1, 'rendez_vous', 'Avocat', null, null, now() + interval '2 days', array[$2]::uuid[], true),
    ($1, 'ecole', 'Kermesse', null, null, now() + interval '3 days', array[$2]::uuid[], true) returning id, type, family_shared`, [A.id, c1])
  const byType = Object.fromEntries(ev.rows.map((r) => [r.type, r]))
  check('création sante / rendez_vous : family_shared forcé à false', byType.sante.family_shared === false && byType.rendez_vous.family_shared === false)
  check('création ecole : défaut partagé conservé', byType.ecole.family_shared === true)
  await as(db, A, `update public.calendar_events set family_shared = true where id = any($1::uuid[])`, [[byType.sante.id, byType.rendez_vous.id]])
  const seenD = (await as(db, D, `select type::text t from public.calendar_events order by 1`)).map((r) => r.t)
  check('proche : jamais l\'événement sante (même partagé)', !seenD.includes('sante') && seenD.includes('ecole') && seenD.includes('rendez_vous'), seenD.join(','))
  const seenB = (await as(db, B, `select type::text t from public.calendar_events order by 1`)).map((r) => r.t)
  check('parent : voit l\'événement sante partagé', seenB.includes('sante'), seenB.join(','))
  check('proche : sante introuvable même par id', (await as(db, D, `select titre from public.calendar_events where id = $1`, [byType.sante.id])).length === 0)

  // ===================== M3 =====================
  console.log(' -- M3 messagerie')
  // E : co-parent messagerie V1 de A (lien accepté).
  await db.query(`insert into public.coparent_links (user_id, invitee_email, coparent_user_id, status, accepted_at) values ($1, $3, $2, 'accepted', now())`, [A.id, E.id, E.email])
  const conv3 = (await as(db, A, `select public.create_conversation(array[$1, $2]::uuid[], 'Rentrée') id`, [B.id, E.id]))[0].id
  const att1 = `${conv3}/${uuid()}.pdf`
  await as(db, B, `insert into public.messages (conversation_id, sender_id, body, attachment_path, attachment_meta) values ($1, $2, 'avant', $3, '{"name":"a.pdf","mime":"application/pdf"}')`, [conv3, B.id, att1])
  await db.query(`insert into storage.objects (bucket_id, name) values ('message-attachments', $1)`, [att1])
  check('B actif : participant', (await as(db, B, `select public.is_conversation_participant($1) p`, [conv3]))[0].p === true)

  // Révocation de Lina seulement : Noah reste partagé → B reste.
  const gBl = (await one(db, `select id from public.child_guardians where user_id = $1 and child_id = $2 and status = 'active'`, [B.id, c1])).id
  await as(db, A, `select public.revoke_child_guardian($1)`, [gBl])
  check('retrait de Lina seule : B toujours actif (Noah partagé)', (await one(db, `select left_at from public.conversation_participants where conversation_id = $1 and user_id = $2`, [conv3, B.id])).left_at === null)
  // Révocation de Noah : plus aucun enfant partagé.
  const gBn = (await one(db, `select id from public.child_guardians where user_id = $1 and child_id = $2 and status = 'active'`, [B.id, c2])).id
  await as(db, A, `select public.revoke_child_guardian($1)`, [gBn])
  const lefts = (await db.query(`select user_id, left_at from public.conversation_participants where conversation_id = $1`, [conv3])).rows
  check('dernier enfant retiré : B marqué parti, A et E restent', lefts.find((r) => r.user_id === B.id)?.left_at !== null && lefts.filter((r) => r.left_at === null).length === 2, JSON.stringify(lefts))
  check('conversation A-B (2 personnes) : les deux marqués partis', (await db.query(`select 1 from public.conversation_participants where conversation_id = $1 and left_at is null`, [convAB])).rows.length === 0)
  check('B parti : is_conversation_participant = false', (await as(db, B, `select public.is_conversation_participant($1) p`, [conv3]))[0].p === false)
  check('B parti : ne peut plus écrire', !!(await err(as(db, B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'après')`, [conv3, B.id]))))
  await new Promise((r) => setTimeout(r, 20))
  const att2 = `${conv3}/${uuid()}.pdf`
  // 0420 : rangement automatique désactivé par défaut ; activé ici pour les trois participants.
  await db.query(`insert into public.vault_settings (user_id, auto_import_messages) select unnest($1::uuid[]), true on conflict (user_id) do update set auto_import_messages = true`, [[A.id, B.id, E.id]])
  await as(db, A, `insert into public.messages (conversation_id, sender_id, body, attachment_path, attachment_meta) values ($1, $2, 'nouveau', $3, '{"name":"b.pdf","mime":"application/pdf"}')`, [conv3, A.id, att2])
  await db.query(`insert into storage.objects (bucket_id, name) values ('message-attachments', $1)`, [att2])
  const bodiesB = (await as(db, B, `select body from public.messages where conversation_id = $1 order by created_at`, [conv3])).map((r) => r.body)
  check('B parti : historique lisible, nouveau message invisible', bodiesB.join(',') === 'avant', bodiesB.join(','))
  check('A actif : voit les deux messages', (await as(db, A, `select body from public.messages where conversation_id = $1`, [conv3])).length === 2)
  const objB = (await as(db, B, `select name from storage.objects where bucket_id = 'message-attachments' order by name`)).map((r) => r.name)
  check('Storage : B lit l\'ancienne pièce jointe, pas la nouvelle', objB.includes(att1) && !objB.includes(att2), objB.join(','))
  check('B ne peut plus déposer de fichier', !!(await err(as(db, B, `insert into storage.objects (bucket_id, name) values ('message-attachments', $1)`, [`${conv3}/${uuid()}.pdf`]))))
  const vi = (await db.query(`select user_id from public.vault_imports where source_ref = (select id::text from public.messages where attachment_path = $1)`, [att2])).rows.map((r) => r.user_id)
  check('import coffre de la nouvelle pièce : A et E, pas B', vi.length === 2 && !vi.includes(B.id), JSON.stringify(vi))
  const lmc = await as(db, B, `select * from public.list_my_conversations($1)`, [conv3])
  check('list_my_conversations (B) : dernier message = ancien, conversation visible', lmc.length === 1 && lmc[0].last_message?.body === 'avant', JSON.stringify(lmc[0]?.last_message))
  check('B voit encore la conversation et ses participants', (await as(db, B, `select id from public.conversations where id = $1`, [conv3])).length === 1
    && (await as(db, B, `select user_id from public.conversation_participants where conversation_id = $1`, [conv3])).length === 3)
  check('mark_read refusé à un participant parti', (await err(as(db, B, `select public.mark_read($1)`, [conv3])))?.code === '42501')

  // Rupture du lien V1 A-E : la conversation conv3 n'a plus de lien actif.
  await db.query(`delete from public.coparent_links where user_id = $1 and coparent_user_id = $2`, [A.id, E.id])
  check('rupture coparent_link : A et E marqués partis', (await db.query(`select 1 from public.conversation_participants where conversation_id = $1 and left_at is null`, [conv3])).rows.length === 0)

  // Nouveau lien A-B : nouvelle conversation (l'ancienne n'est jamais réactivée).
  const inv2 = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c2])
  const acc2 = await as(db, B, `select public.accept_family_invitation($1) r`, [inv2[0].token])
  check('re-liaison : nouvelle conversation, distincte de l\'ancienne', !!acc2[0].r.conversation_id && acc2[0].r.conversation_id !== convAB, JSON.stringify(acc2[0].r))
  const convNew = acc2[0].r.conversation_id
  check('create_conversation ne réutilise pas une conversation avec un parti', (await as(db, A, `select public.create_conversation(array[$1]::uuid[], null) id`, [B.id]))[0].id !== convAB)

  // ===================== M5 =====================
  console.log(' -- M5 chemins de pièces jointes')
  for (const [label, p] of [
    ['autre conversation', `${conv3}/${uuid()}.pdf`],
    ['traversée', `${convNew}/../${uuid()}.pdf`],
    ['sous-dossier', `${convNew}/x/${uuid()}.pdf`],
    ['nom non uuid', `${convNew}/facture.pdf`],
    ['extension longue', `${convNew}/${uuid()}.pdfxyz`],
    ['majuscules', `${convNew}/${uuid().toUpperCase()}.pdf`],
  ]) {
    const e = await err(svc(db, `insert into public.messages (conversation_id, sender_id, body, attachment_path, attachment_meta) values ($1, $2, 'x', $3, '{"mime":"application/pdf"}')`, [convNew, A.id, p]))
    check(`CHECK attachment_path refuse (${label}) même en service_role`, e?.code === '23514', e?.message)
  }
  check('chemin conforme accepté', !(await err(as(db, A, `insert into public.messages (conversation_id, sender_id, body, attachment_path, attachment_meta) values ($1, $2, 'ok', $3, '{"mime":"application/pdf"}')`, [convNew, A.id, `${convNew}/${uuid()}.jpeg`]))))
  check('contrainte en NOT VALID (validation commentée)', (await one(db, `select convalidated from pg_constraint where conname = 'chk_messages_attachment_path'`)).convalidated === false)

  // ===================== M6 =====================
  console.log(' -- M6 avatar')
  check('photo_url hors de son dossier refusée', (await err(as(db, A, `update public.users set photo_url = $2 where id = $1`, [A.id, `${B.id}/avatar.jpg`])))?.code === '23514')
  check('photo_url avec ..', (await err(as(db, A, `update public.users set photo_url = $2 where id = $1`, [A.id, `${A.id}/../${B.id}/avatar.jpg`])))?.code === '23514')
  check('photo_url dans son dossier acceptée', (await as(db, A, `update public.users set photo_url = $2 where id = $1 returning id`, [A.id, `${A.id}/avatar.jpg`])).length === 1)

  // ===================== M7 =====================
  console.log(' -- M7 admin aal2')
  await db.query(`insert into public.vault_lock_settings (user_id) values ($1)`, [A.id])
  // 0480 : la 2FA n'est plus exigée pour l'administration (is_admin_aal2() = is_admin()).
  check('is_admin_aal2 : admin en aal1 → true (0480)', (await as(db, F, `select public.is_admin_aal2() v`))[0].v === true)
  check('is_admin_aal2 : admin en aal2 → true', (await as(db, F, `select public.is_admin_aal2() v`, [], { aal: 'aal2' }))[0].v === true)
  check('is_admin_aal2 : non-admin en aal2 → false', (await as(db, A, `select public.is_admin_aal2() v`, [], { aal: 'aal2' }))[0].v === false)
  check('admin aal1 (0480) : réglages coffre visibles', (await as(db, F, `select user_id from public.vault_lock_settings where user_id = $1`, [A.id])).length === 1)
  check('admin aal2 : réglages visibles', (await as(db, F, `select user_id from public.vault_lock_settings where user_id = $1`, [A.id], { aal: 'aal2' })).length === 1)
  check('admin aal1 (0480) : invitations visibles', (await as(db, F, `select id from public.family_invitations`)).length > 0)
  check('admin aal2 : invitations visibles', (await as(db, F, `select id from public.family_invitations`, [], { aal: 'aal2' })).length > 0)
  const statsErr = await err(db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: F.id, aal: 'aal1', role: 'authenticated' })])
    return tx.query(`select public.admin_stats_assert()`)
  }))
  check('admin_stats_assert : admin accepté en aal1 (0480)', !statsErr, statsErr?.message)
  const statsOk = await err(db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: F.id, aal: 'aal2', role: 'authenticated' })])
    return tx.query(`select public.admin_stats_assert()`)
  }))
  check('admin_stats_assert : accepté en aal2', statsOk === null, statsOk?.message)
  const leftover = await db.query(`select tablename, policyname from pg_policies
     where (coalesce(qual, '') ~ 'is_admin\\(\\)' or coalesce(with_check, '') ~ 'is_admin\\(\\)')
       and tablename in ('vault_lock_settings','vault_passkeys','vault_lock_attempts','guide_fiches','guide_parcours','guide_partners',
         'document_templates','blog_posts','guide_territoires','content_versions','donations','vault_imports','family_invitations',
         'family_invitation_children','child_guardians','child_merges','objects')
       and policyname <> 'guide_partners_select_public'`)
  check('aucune clause admin sans aal2 sur les tables v3', leftover.rows.length === 0, JSON.stringify(leftover.rows))

  // ===================== m2 =====================
  console.log(' -- m2 fusion')
  check('merge_child_into (0340) supprimée', (await one(db, `select to_regprocedure('public.merge_child_into(uuid,uuid,jsonb,jsonb)') f`)).f === null)
  check('merge_child_into_as non exécutable par authenticated', !!(await err(as(db, B, `select public.merge_child_into_as($1, $2, $3, '[]'::jsonb)`, [B.id, b1, c2]))))
  // b1 (Lina de B) vs c1 (Lina de A) : B doit être gardien parent de c1.
  const inv3 = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c1])
  await as(db, B, `select public.accept_family_invitation($1)`, [inv3[0].token])
  const vB = (await one(db, `insert into public.child_vaccinations (user_id, child_id, payload) values ($1, $2, $3) returning id`, [B.id, b1, payload])).id
  // Ligne d'un autre adulte rattachée à b1 (ex. ancien gardien) : ne doit pas bouger.
  const vX = (await one(db, `insert into public.child_vaccinations (user_id, child_id, payload) values ($1, $2, $3) returning id`, [X.id, b1, payload])).id
  const jX = (await one(db, `insert into public.journal_entries (user_id, type, titre, occurred_at, children_ids) values ($1, 'visite', 'journal X', now(), array[$2]::uuid[]) returning id`, [X.id, b1])).id
  const jB = (await one(db, `insert into public.journal_entries (user_id, type, titre, occurred_at, children_ids) values ($1, 'visite', 'journal B', now(), array[$2]::uuid[]) returning id`, [B.id, b1])).id
  const health = JSON.stringify([
    { kind: 'vaccination', id: vB, payload: { ...payload, ciphertext: 'rewrapped' } },
    { kind: 'vaccination', id: vX, payload: { ...payload, ciphertext: 'HIJACK' } },
  ])
  const medical = JSON.stringify({ ciphertext: 'med', iv: 'i', tag: 't' })
  const mr = (await svc(db, `select public.merge_child_into_as($1, $2, $3, $4::jsonb, $5::jsonb) r`, [B.id, b1, c1, health, medical]))[0].r
  check('fusion : seule MA vaccination déplacée', mr.health_moved === 1, JSON.stringify(mr))
  check('vaccination d\'autrui intacte (enfant, payload)', (await one(db, `select child_id, payload->>'ciphertext' c from public.child_vaccinations where id = $1`, [vX])).c === 'x')
  check('Journal d\'autrui : référence inchangée', (await one(db, `select children_ids from public.journal_entries where id = $1`, [jX])).children_ids.includes(b1))
  check('mon Journal : référence remplacée', (await one(db, `select children_ids from public.journal_entries where id = $1`, [jB])).children_ids.includes(c1))
  check('infos médicales de la fiche d\'autrui non écrites (garde respecté)', mr.medical_copied === false && (await one(db, `select infos_medicales from public.children where id = $1`, [c1])).infos_medicales === null)

  // ===================== m3 =====================
  console.log(' -- m3 réservation d\'essai')
  const res = []
  for (let i = 0; i < 6; i++) res.push((await svc(db, `select * from public.vault_reserve_attempt($1, 'pin', 5, 30, 3600)`, [A.id]))[0])
  check('5 essais réservés, le 6e refusé', res.slice(0, 5).every((r) => r.allowed) && res[5].allowed === false, JSON.stringify(res.map((r) => [r.allowed, r.attempts_left])))
  check('le 5e déclenche le blocage', res[4].locked_until !== null && res[4].attempts_left === 0)
  check('vault_reserve_attempt non exécutable par authenticated', !!(await err(as(db, A, `select * from public.vault_reserve_attempt($1, 'pin')`, [A.id]))))
  await db.query(`update public.vault_lock_attempts set locked_until = now() - interval '1 second' where user_id = $1`, [A.id])
  const after = (await svc(db, `select * from public.vault_reserve_attempt($1, 'pin', 5, 30, 3600)`, [A.id]))[0]
  check('blocage expiré : compteur reparti (4 restants)', after.allowed && after.attempts_left === 4, JSON.stringify(after))

  // ===================== m4 =====================
  console.log(' -- m4 vault_unlocked')
  check('sans réglages : verrouillé (fermé par défaut)', (await as(db, B, `select public.vault_unlocked() v`))[0].v === false)
  check('réglages enabled : verrouillé', (await as(db, A, `select public.vault_unlocked() v`))[0].v === false)
  const sid = uuid()
  await db.query(`insert into public.vault_unlocks (user_id, session_id, expires_at) values ($1, $2, now() + interval '5 minutes')`, [A.id, sid])
  check('déverrouillage de la session : vrai', (await as(db, A, `select public.vault_unlocked() v`, [], { sid }))[0].v === true)
  check('autre session : faux', (await as(db, A, `select public.vault_unlocked() v`, [], { sid: uuid() }))[0].v === false)
  await db.query(`insert into public.vault_lock_settings (user_id, enabled) values ($1, false)`, [B.id])
  check('verrou désactivé explicitement : vrai', (await as(db, B, `select public.vault_unlocked() v`))[0].v === true)

  // ===================== m7 =====================
  console.log(' -- m7 défi WebAuthn')
  const chal = 'c'.repeat(43)
  const cid = (await svc(db, `select public.vault_issue_webauthn_challenge($1, 'auth', $2, null, 120) id`, [A.id, chal]))[0].id
  check('défi stocké, illisible par authenticated', !!(await err(as(db, A, `select * from public.vault_webauthn_challenges`))))
  check('autre utilisateur : rien', (await svc(db, `select * from public.vault_consume_webauthn_challenge($1, $2, 'auth')`, [cid, B.id])).length === 0)
  check('mauvais type : rien', (await svc(db, `select * from public.vault_consume_webauthn_challenge($1, $2, 'reg')`, [cid, A.id])).length === 0)
  const c1st = await svc(db, `select * from public.vault_consume_webauthn_challenge($1, $2, 'auth')`, [cid, A.id])
  check('1re consommation : défi rendu', c1st.length === 1 && c1st[0].challenge === chal)
  check('2e consommation : rien (usage unique)', (await svc(db, `select * from public.vault_consume_webauthn_challenge($1, $2, 'auth')`, [cid, A.id])).length === 0)
  const cid2 = (await svc(db, `select public.vault_issue_webauthn_challenge($1, 'reg', $2, 'Mon téléphone', 120) id`, [A.id, chal]))[0].id
  const cid3 = (await svc(db, `select public.vault_issue_webauthn_challenge($1, 'reg', $2, null, 120) id`, [A.id, chal]))[0].id
  check('un nouveau défi remplace le précédent du même type', (await svc(db, `select * from public.vault_consume_webauthn_challenge($1, $2, 'reg')`, [cid2, A.id])).length === 0
    && (await svc(db, `select * from public.vault_consume_webauthn_challenge($1, $2, 'reg')`, [cid3, A.id])).length === 1)
  const cid4 = (await svc(db, `select public.vault_issue_webauthn_challenge($1, 'auth', $2, null, 120) id`, [A.id, chal]))[0].id
  await db.query(`update public.vault_webauthn_challenges set expires_at = now() - interval '1 second' where id = $1`, [cid4])
  check('défi expiré : rien', (await svc(db, `select * from public.vault_consume_webauthn_challenge($1, $2, 'auth')`, [cid4, A.id])).length === 0)

  // ===================== Nits =====================
  console.log(' -- Nits')
  const je = (await one(db, `insert into public.journal_entries (user_id, type, titre, occurred_at, children_ids) values ($1, 'depense', 'Dentiste', now(), array[$2]::uuid[]) returning id`, [A.id, c1])).id
  const extraPath = `${A.id}/journal/extra.pdf`
  await db.query(`insert into public.journal_expenses (entry_id, user_id, amount_cents, categorie, payment_method, family_shared, justificatif, justificatifs_extra)
     values ($1, $2, 3000, 'sante', 'virement', true, $3::jsonb, $4::jsonb)`,
    [je, A.id, JSON.stringify({ path: `${A.id}/journal/main.pdf`, mime: 'application/pdf', size: 10 }), JSON.stringify([{ path: extraPath, mime: 'application/pdf', size: 10 }])])
  await db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1), ('documents', $2)`, [`${A.id}/journal/main.pdf`, extraPath])
  const objs = (await as(db, B, `select name from storage.objects where bucket_id = 'documents' order by name`)).map((r) => r.name)
  check('Storage famille : justificatif supplémentaire partagé lisible par le parent', objs.includes(extraPath) && objs.includes(`${A.id}/journal/main.pdf`), objs.join(','))
  check('Storage famille : proche ne lit pas les justificatifs', (await as(db, D, `select name from storage.objects where bucket_id = 'documents'`)).length === 0)
  const lfe = await as(db, B, `select * from public.list_family_expenses()`)
  const row = lfe.find((r) => r.entry_id === je)
  check('list_family_expenses : justificatifs_extra_paths', row && row.justificatifs_extra_paths.length === 1 && row.justificatifs_extra_paths[0] === extraPath, JSON.stringify(row))

  // Quota d'import (100 Mo / destinataire / expéditeur / 24 h).
  const add = (ref, size, sender = B.id) => svc(db, `select * from public.vault_add_from_source($1, 'messagerie', $2, $3, 'f.pdf', 'application/pdf', $4, 'Courriers', null, null, null, '{}'::jsonb, null, null, $5)`,
    [A.id, ref, `${A.id}/messagerie/${ref}.pdf`, size, sender])
  check('import 60 Mo accepté', !(await err(add('q1', 60 * 1024 * 1024))))
  const qe = await err(add('q2', 50 * 1024 * 1024))
  check('import suivant au-delà de 100 Mo → 54000 vault_import_quota', qe?.code === '54000' && qe?.hint === 'vault_import_quota', qe?.message)
  check('nouvelle tentative d\'un import déjà fait : pas de quota', !(await err(add('q1', 60 * 1024 * 1024))))
  check('autre expéditeur : quota distinct', !(await err(add('q3', 50 * 1024 * 1024, E.id))))
  check('source sans expéditeur (témoignage) : pas de quota', !(await err(svc(db, `select * from public.vault_add_from_source($1, 'temoignage', 't1', $2, 't.pdf', 'application/pdf', $3)`, [A.id, `${A.id}/temoignage/t1.pdf`, 90 * 1024 * 1024]))))

  const noPath = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname ~ '(family|guardian|merge|conversation|vault_|messaging|is_admin_aal2)'
       and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))`)
  check('SECURITY DEFINER famille / messagerie / coffre : search_path vide', noPath.rows.length === 0, noPath.rows.map((r) => r.proname).join(','))
  const anonExec = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
       and p.proname ~ '(family|guardian|merge|conversation|vault_|messaging|prune)'`)
  check('aucune de ces fonctions exécutable par anon', anonExec.rows.length === 0, anonExec.rows.map((r) => r.proname).join(','))

  console.log(`\n== ${pass} réussis, ${fail} échecs`)
  if (fail) process.exitCode = 1
}
