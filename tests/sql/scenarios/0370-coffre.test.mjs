// Scénarios 0370_vault_lock_phase2.sql (PGlite + stubs Supabase).
// A = Julie (titulaire de Lina), B = Thomas (gardien parent de Lina), X = tiers.
const U = (n) => `00000000-0000-0000-0000-0000000003${n}`
const A = { id: U('0a'), email: 'julie7@test.fr', prenom: 'Julie' }
const B = { id: U('0b'), email: 'thomas7@test.fr', prenom: 'Thomas' }
const X = { id: U('99'), email: 'x7@test.fr', prenom: 'X' }
const c1 = U('c1')
const sidA = crypto.randomUUID(), sidA2 = crypto.randomUUID(), sidB = crypto.randomUUID(), sidX = crypto.randomUUID()

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}
async function as(db, who, sid, sql, params = []) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal1', role: 'authenticated', session_id: sid }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function asAnon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const unlock = (db, who, sid, mins = 10) => svc(db,
  `insert into public.vault_unlocks (user_id, session_id, expires_at) values ($1, $2, now() + make_interval(mins => $3))
   on conflict (user_id, session_id) do update set expires_at = excluded.expires_at`, [who.id, sid, mins])
const names = (rows) => rows.map((r) => r.name).sort().join(',')

export default async function run(db) {
  console.log('\n== Verrou du coffre en base (0370)')
  // Supabase accorde insert / update / delete sur storage.objects à authenticated (la RLS filtre).
  await db.exec(`grant insert, update, delete on storage.objects to authenticated`)
  for (const u of [A, B, X]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  // Ces comptes testent le verrou : pas de réglage (défaut fermé) ou verrou actif.
  await db.query(`delete from public.vault_lock_settings where user_id = any($1::uuid[])`, [[A.id, B.id, X.id]])
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Lina', '2019-05-12')`, [c1, A.id])
  const inv = await as(db, A, sidA, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c1])
  await as(db, B, sidB, `select public.accept_family_invitation($1)`, [inv[0].token])

  const docs = await db.query(`insert into public.documents (user_id, name, mime, size_bytes, storage_path, children_ids, family_shared) values
    ($1::uuid, 'Carnet partagé', 'application/pdf', 10, $1::text || '/v-shared.pdf', array[$2]::uuid[], true),
    ($1::uuid, 'Jugement privé', 'application/pdf', 10, $1::text || '/v-private.pdf', array[$2]::uuid[], false) returning id, name`, [A.id, c1])
  const dShared = docs.rows.find((r) => r.name === 'Carnet partagé').id
  const dPriv = docs.rows.find((r) => r.name === 'Jugement privé').id
  await db.query(`insert into storage.objects (bucket_id, name) values
    ('documents', $1::text || '/v-shared.pdf'), ('documents', $1::text || '/v-private.pdf'), ('documents', $1::text || '/journal/photo.jpg')`, [A.id])
  const req = await db.query(`insert into public.testimony_requests (user_id, token, expires_at, subject) values ($1, 'tok7-' || md5(random()::text), now() + interval '30 days', 'Sorties d''école') returning id`, [A.id])
  const tmg = await db.query(`insert into public.testimonies (request_id, user_id, reference, temoin, texte_original, texte_envoye) values ($1, $2, 'TMG-2026-7777', '{}'::jsonb, 'brut', 'envoyé') returning id`, [req.rows[0].id, A.id])
  await db.query(`insert into public.testimony_reviews (testimony_id, user_id, decision) values ($1, $2, 'confirme')`, [tmg.rows[0].id, A.id])
  await db.query(`insert into public.shares (document_id, user_id, token, expires_at) values ($1, $2, 'share7' || md5(random()::text), now() + interval '7 days')`, [dPriv, A.id])
  await db.query(`insert into public.lawyer_shares (user_id, token, label, expires_at) values ($1, $2, 'Maître Durand', now() + interval '7 days')`, [A.id, 'L'.repeat(32)])

  const vaultRead = async (who, sid) => ({
    docs: await as(db, who, sid, `select name from public.documents where deleted_at is null`),
    reqs: await as(db, who, sid, `select id from public.testimony_requests`),
    tmgs: await as(db, who, sid, `select id from public.testimonies`),
    revs: await as(db, who, sid, `select testimony_id from public.testimony_reviews`),
    shares: await as(db, who, sid, `select id, token from public.shares`),
    lawyer: await as(db, who, sid, `select id, token from public.lawyer_shares`),
    objs: await as(db, who, sid, `select name from storage.objects where bucket_id = 'documents' order by name`),
  })

  // --- 1. Verrouillé (aucun réglage : fermé par défaut) ----------------------
  console.log(' -- verrouillé')
  check('vault_unlocked() faux sans réglage ni déverrouillage', (await as(db, A, sidA, `select public.vault_unlocked() v`))[0].v === false)
  let r = await vaultRead(A, sidA)
  check('verrouillé → 0 document', r.docs.length === 0, names(r.docs))
  check('verrouillé → 0 demande / témoignage / décision', r.reqs.length === 0 && r.tmgs.length === 0 && r.revs.length === 0)
  check('verrouillé → 0 jeton de partage (shares, lawyer_shares)', r.shares.length === 0 && r.lawyer.length === 0)
  check('verrouillé → Storage : fichiers du coffre masqués, pièce du Journal lisible',
    r.objs.length === 1 && r.objs[0].name === `${A.id}/journal/photo.jpg`, r.objs.map((o) => o.name).join(','))
  check('verrouillé → aucun lien d\'accès avocat journalisé lisible', (await as(db, A, sidA, `select id from public.lawyer_share_access_log`)).length === 0)
  const insErr = await err(as(db, A, sidA, `insert into public.documents (user_id, name, mime, size_bytes, storage_path) values ($1::uuid, 'n', 'application/pdf', 1, $1::text || '/new.pdf')`, [A.id]))
  check('verrouillé → ajout de document refusé (42501)', insErr?.code === '42501', insErr?.message)
  check('verrouillé → renommage sans effet', (await as(db, A, sidA, `update public.documents set name = 'x' where id = $1 returning id`, [dPriv])).length === 0)
  const sdErr = await err(as(db, A, sidA, `select public.soft_delete_document($1)`, [dPriv]))
  check('verrouillé → mise à la corbeille refusée (P0002)', sdErr?.code === 'P0002', sdErr?.message)
  const tsErr = await err(as(db, A, sidA, `insert into public.testimony_requests (user_id, token, expires_at) values ($1, 'tok7-new', now() + interval '1 day')`, [A.id]))
  check('verrouillé → création de demande de témoignage refusée', tsErr?.code === '42501', tsErr?.message)
  const jUp = await err(as(db, A, sidA, `insert into storage.objects (bucket_id, name) values ('documents', $1::text || '/journal/new.jpg')`, [A.id]))
  check('verrouillé → envoi d\'une pièce du Journal toujours possible', jUp === null, jUp?.message)
  const delObj = await as(db, A, sidA, `delete from storage.objects where bucket_id = 'documents' and name = $1 returning name`, [`${A.id}/v-private.pdf`])
  check('verrouillé → suppression du fichier d\'un document refusée', delObj.length === 0)
  check('verrouillé → la ligne n\'a pas été modifiée', (await db.query(`select name, deleted_at from public.documents where id = $1`, [dPriv])).rows[0].deleted_at === null)

  // --- 2. Déverrouillé (session A) ---------------------------------------------
  console.log(' -- déverrouillé')
  await unlock(db, A, sidA)
  r = await vaultRead(A, sidA)
  check('déverrouillé → documents', names(r.docs) === 'Carnet partagé,Jugement privé', names(r.docs))
  check('déverrouillé → demande, témoignage, décision', r.reqs.length === 1 && r.tmgs.length === 1 && r.revs.length === 1)
  check('déverrouillé → partages', r.shares.length === 1 && r.lawyer.length === 1)
  check('déverrouillé → Storage : fichiers du coffre lisibles', r.objs.length === 4, r.objs.map((o) => o.name).join(','))
  check('déverrouillé → renommage', (await as(db, A, sidA, `update public.documents set name = 'Jugement privé' where id = $1 returning id`, [dPriv])).length === 1)
  check('déverrouillé → ajout de document', !(await err(as(db, A, sidA, `insert into public.documents (user_id, name, mime, size_bytes, storage_path) values ($1::uuid, 'Nouveau', 'application/pdf', 1, $1::text || '/new.pdf')`, [A.id]))))
  await db.query(`delete from public.documents where storage_path = $1`, [`${A.id}/new.pdf`])

  console.log(' -- liaison à la session')
  check('autre session du même compte → 0 document', (await as(db, A, sidA2, `select id from public.documents`)).length === 0)
  check('jeton sans session_id → 0 document', (await as(db, A, null, `select id from public.documents`)).length === 0)
  await unlock(db, A, sidA, -1)
  check('déverrouillage expiré → 0 document', (await as(db, A, sidA, `select id from public.documents`)).length === 0)
  check('vault_purge_expired_unlocks (service_role) purge la ligne expirée', (await svc(db, `select public.vault_purge_expired_unlocks() n`))[0].n >= 1)
  check('purge réservée au service_role', (await err(as(db, A, sidA, `select public.vault_purge_expired_unlocks()`)))?.code === '42501')

  // --- 3. Gardien : même règle pour le lecteur ------------------------------
  console.log(' -- gardien (document partagé par l\'autre parent)')
  await unlock(db, A, sidA)
  check('gardien verrouillé → 0 document (même si A est déverrouillé)', (await as(db, B, sidB, `select id from public.documents`)).length === 0)
  check('gardien verrouillé → fichier partagé illisible', (await as(db, B, sidB, `select name from storage.objects where bucket_id = 'documents' and name like '%v-shared.pdf'`)).length === 0)
  await unlock(db, B, sidB)
  const bDocs = await as(db, B, sidB, `select name from public.documents`)
  check('gardien déverrouillé → seulement le document partagé', names(bDocs) === 'Carnet partagé', names(bDocs))
  const bObjs = (await as(db, B, sidB, `select name from storage.objects where bucket_id = 'documents' order by name`)).map((o) => o.name)
  check('gardien déverrouillé → seul le fichier partagé', bObjs.length === 1 && bObjs[0] === `${A.id}/v-shared.pdf`, bObjs.join(','))
  const bDel = await err(as(db, B, sidB, `select public.soft_delete_document($1)`, [dShared]))
  check('gardien déverrouillé → ne met pas à la corbeille le document de A (P0002)', bDel?.code === 'P0002', bDel?.message)
  check('gardien déverrouillé → ne renomme pas le document de A', (await as(db, B, sidB, `update public.documents set name = 'pirate' where id = $1 returning id`, [dShared])).length === 0)
  check('gardien déverrouillé → aucun témoignage ni partage de A', (await as(db, B, sidB, `select id from public.testimonies union all select id from public.shares union all select id from public.lawyer_shares`)).length === 0)
  // Le déverrouillage du gardien ne vaut pas pour le titulaire, et inversement.
  await svc(db, `delete from public.vault_unlocks where user_id = $1`, [A.id])
  check('A reverrouillé : B garde l\'accès au document partagé (son propre coffre est ouvert)', (await as(db, B, sidB, `select id from public.documents`)).length === 1)
  check('A reverrouillé : A ne lit plus rien', (await as(db, A, sidA, `select id from public.documents`)).length === 0)

  // --- 4. Autre utilisateur ---------------------------------------------------
  console.log(' -- tiers')
  await unlock(db, X, sidX)
  check('tiers déverrouillé → rien (documents)', (await as(db, X, sidX, `select id from public.documents`)).length === 0)
  check('tiers déverrouillé → rien (Storage, témoignages, partages)',
    (await as(db, X, sidX, `select name from storage.objects where bucket_id = 'documents'`)).length === 0
    && (await as(db, X, sidX, `select id from public.testimonies union all select id from public.testimony_requests union all select id from public.shares union all select id from public.lawyer_shares`)).length === 0)
  check('déverrouillage de X dans la session de A : sans effet pour A', (await as(db, A, sidX, `select id from public.documents`)).length === 0)

  // --- 5. Réglages : désactivation, époque, réactivation ---------------------
  console.log(' -- réglages')
  await svc(db, `insert into public.vault_lock_settings (user_id, enabled) values ($1, false)`, [A.id])
  check('verrou désactivé par le parent → documents sans déverrouillage', (await as(db, A, sidA2, `select id from public.documents where deleted_at is null`)).length === 2)
  await unlock(db, A, sidA)
  await svc(db, `update public.vault_lock_settings set enabled = true where user_id = $1`, [A.id])
  check('réactivation → déverrouillages en base révoqués', (await db.query(`select 1 from public.vault_unlocks where user_id = $1`, [A.id])).rows.length === 0)
  check('réactivation → 0 document', (await as(db, A, sidA, `select id from public.documents`)).length === 0)
  await unlock(db, A, sidA)
  await svc(db, `update public.vault_lock_settings set epoch = epoch + 1 where user_id = $1`, [A.id])
  check('changement de code (époque) → déverrouillage révoqué', (await as(db, A, sidA, `select id from public.documents`)).length === 0)
  await unlock(db, A, sidA)
  await svc(db, `update public.vault_lock_settings set timeout_minutes = 5 where user_id = $1`, [A.id])
  check('autre réglage (délai) → déverrouillage conservé', (await as(db, A, sidA, `select id from public.documents`)).length === 2)
  check('authenticated ne peut pas écrire vault_unlocks', !!(await err(as(db, X, sidX, `insert into public.vault_unlocks (user_id, session_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [X.id, sidX]))))

  // --- 6. Routes publiques (service_role) et anon -----------------------------
  console.log(' -- service_role / anon')
  check('service_role lit tout (routes témoin, partage, avocat)', (await svc(db, `select id from public.documents where user_id = $1`, [A.id])).length === 2
    && (await svc(db, `select id from public.testimony_requests where user_id = $1`, [A.id])).length === 1)
  const reqTok = (await db.query(`select token from public.testimony_requests where user_id = $1`, [A.id])).rows[0].token
  check('parcours témoin (service_role, RPC par jeton) non affecté par le verrou', (await svc(db, `select * from public.get_testimony_request_by_token($1)`, [reqTok])).length === 1)
  check('anon ne peut pas appeler vault_is_document_object', (await err(asAnon(db, `select public.vault_is_document_object('a')`)))?.code === '42501')

  // --- 7. Structure ------------------------------------------------------------
  const missing = await db.query(`select t from unnest(array['documents','testimony_requests','testimonies','testimony_reviews',
      'shares','lawyer_shares','lawyer_share_access_log']) t
     where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
                         and p.policyname = 'vault_unlocked' and p.permissive = 'RESTRICTIVE')`)
  check('politique RESTRICTIVE vault_unlocked sur les 7 tables', missing.rows.length === 0, missing.rows.map((x) => x.t).join(','))
  check('politique Storage RESTRICTIVE présente', (await db.query(`select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents vault unlocked' and permissive = 'RESTRICTIVE'`)).rows.length === 1)
  const sd = await db.query(`select prosrc, prosecdef from pg_proc where proname = 'soft_delete_document'`)
  check('soft_delete_document : INVOKER et filtre propriétaire', sd.rows.length === 1 && !sd.rows[0].prosecdef && /user_id\s*=\s*auth\.uid\(\)/.test(sd.rows[0].prosrc))
  check('categories non restreinte (lue hors du coffre)', (await db.query(`select 1 from pg_policies where tablename = 'categories' and policyname = 'vault_unlocked'`)).rows.length === 0)

  console.log(`\n== ${pass} réussis, ${fail} échecs`)
  if (fail) process.exitCode = 1
}
