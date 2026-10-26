// Scénarios 0410_vault_folders.sql + 0420_vault_import_settings.sql (PGlite + stubs Supabase).
// A = Julie (titulaire de Lina), B = Thomas (gardien parent de Lina), D = Rose (proche de Lina), X = tiers.
// Verrou du coffre désactivé pour ces comptes (vaultOpen), sauf dans la section « verrou du lecteur ».
export const vaultOpen = true
const U = (n) => `00000000-0000-0000-0000-0000000004${n}`
const A = { id: U('0a'), email: 'julie41@test.fr', prenom: 'Julie' }
const B = { id: U('0b'), email: 'thomas41@test.fr', prenom: 'Thomas' }
const D = { id: U('0d'), email: 'rose41@test.fr', prenom: 'Rose' }
const X = { id: U('99'), email: 'x41@test.fr', prenom: 'X' }
const c1 = U('c1')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}
async function as(db, who, sql, params = [], sid = null) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal1', role: 'authenticated', ...(sid ? { session_id: sid } : {}) }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function asAnon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const names = (rows) => rows.map((r) => r.name).sort().join(',')
const uuid = () => crypto.randomUUID()

export default async function run(db) {
  console.log('\n== Dossiers du coffre et partage avec un parent lié (0410, 0420)')
  for (const u of [A, B, D, X]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Lina', '2019-05-12')`, [c1, A.id])
  const inv = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c1])
  const acc = await as(db, B, `select public.accept_family_invitation($1) r`, [inv[0].token])
  const conv = acc[0].r.conversation_id
  const invD = await as(db, A, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [D.email, c1])
  await as(db, D, `select public.accept_family_invitation($1)`, [invD[0].token])

  // --- 1. Propriétaire : dossiers, sous-dossiers, documents -------------------
  console.log(' -- propriétaire')
  const fAm = (await as(db, A, `insert into public.vault_folders (user_id, name) values ($1, '  Assistante maternelle ') returning id, name`, [A.id]))[0]
  check('création d\'un dossier (nom nettoyé)', fAm.name === 'Assistante maternelle', fAm.name)
  const fContrats = (await as(db, A, `insert into public.vault_folders (user_id, parent_id, name) values ($1, $2, 'Contrats') returning id`, [A.id, fAm.id]))[0].id
  const fPrive = (await as(db, A, `insert into public.vault_folders (user_id, name) values ($1, 'Privé') returning id`, [A.id]))[0].id
  check('le propriétaire voit ses 3 dossiers', (await as(db, A, `select id from public.vault_folders`)).length === 3)
  check('nom en double dans le même dossier → 23505', (await err(as(db, A, `insert into public.vault_folders (user_id, name) values ($1, 'assistante MATERNELLE')`, [A.id])))?.code === '23505')
  check('même nom dans un autre dossier : accepté', !(await err(as(db, A, `insert into public.vault_folders (user_id, parent_id, name) values ($1, $2, 'Privé')`, [A.id, fContrats]))))
  check('nom vide → 23514', (await err(as(db, A, `insert into public.vault_folders (user_id, name) values ($1, '   ')`, [A.id])))?.code === '23514')
  check('cycle (dossier rangé dans son sous-dossier) → 23514', (await err(as(db, A, `update public.vault_folders set parent_id = $1 where id = $2`, [fContrats, fAm.id])))?.code === '23514')
  // Profondeur : 6 niveaux au plus.
  let parent = null
  let depthErr = null
  for (let i = 1; i <= 7; i++) {
    const e = await err(as(db, A, `insert into public.vault_folders (user_id, parent_id, name) values ($1, $2, $3) returning id`, [A.id, parent, `Niveau ${i}`]).then((r) => { parent = r[0].id }))
    if (e) { depthErr = { level: i, code: e.code }; break }
  }
  check('7e niveau refusé (54000), 6 acceptés', depthErr?.level === 7 && depthErr?.code === '54000', JSON.stringify(depthErr))
  await db.query(`delete from public.vault_folders where user_id = $1 and name = 'Niveau 1'`, [A.id])

  const docs = await as(db, A, `insert into public.documents (user_id, folder_id, name, mime, size_bytes, storage_path) values
    ($1::uuid, $2::uuid, 'Contrat Mme Lopez', 'application/pdf', 10, $1::text || '/am-contrat.pdf'),
    ($1::uuid, $3::uuid, 'Avenant 2026', 'application/pdf', 10, $1::text || '/am-avenant.pdf'),
    ($1::uuid, $4::uuid, 'Jugement', 'application/pdf', 10, $1::text || '/prive.pdf'),
    ($1::uuid, null, 'Racine', 'application/pdf', 10, $1::text || '/racine.pdf') returning id, name`, [A.id, fAm.id, fContrats, fPrive])
  const dContrat = docs.find((r) => r.name === 'Contrat Mme Lopez').id
  const dPrive = docs.find((r) => r.name === 'Jugement').id
  await db.query(`insert into storage.objects (bucket_id, name) select 'documents', $1::text || p from unnest(array['/am-contrat.pdf','/am-avenant.pdf','/prive.pdf','/racine.pdf']) p`, [A.id])
  check('le propriétaire range un document dans un dossier', (await as(db, A, `update public.documents set folder_id = $1 where id = $2 returning id`, [fAm.id, dPrive])).length === 1)
  await as(db, A, `update public.documents set folder_id = $1 where id = $2`, [fPrive, dPrive])

  // --- 2. Avant tout partage ----------------------------------------------------
  console.log(' -- avant partage')
  check('B : aucun dossier de A', (await as(db, B, `select id from public.vault_folders`)).length === 0)
  check('B : aucun document de A', (await as(db, B, `select id from public.documents`)).length === 0)

  // --- 3. Partage ---------------------------------------------------------------
  console.log(' -- partage avec le parent lié')
  check('A et B sont liés (vault_is_linked_parent)', (await as(db, A, `select public.vault_is_linked_parent($1) v`, [B.id]))[0].v === true)
  check('partage vers un tiers non lié → refusé (42501)', (await err(as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3)`, [fAm.id, A.id, X.id])))?.code === '42501')
  check('partage vers un proche → refusé (42501)', (await err(as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3)`, [fAm.id, A.id, D.id])))?.code === '42501')
  check('partage vers soi-même → refusé', !!(await err(as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $2)`, [fAm.id, A.id]))))
  check('B ne peut pas se partager le dossier de A', !!(await err(as(db, B, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3)`, [fAm.id, A.id, B.id]))))
  check('B ne peut pas créer un partage sur le dossier de A à son nom', !!(await err(as(db, B, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3)`, [fAm.id, B.id, A.id]))))
  const share = (await as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3) returning id`, [fAm.id, A.id, B.id]))[0].id
  check('A partage « Assistante maternelle » avec B', !!share)
  check('partage actif en double → 23505', (await err(as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3)`, [fAm.id, A.id, B.id])))?.code === '23505')

  // --- 4. Ce que voit B ------------------------------------------------------------
  console.log(' -- parent lié destinataire')
  const bFolders = await as(db, B, `select id, name from public.vault_folders`)
  check('B voit le dossier partagé et ses sous-dossiers, pas le dossier « Privé » racine',
    bFolders.length === 3 && bFolders.some((f) => f.id === fContrats) && !bFolders.some((f) => f.id === fPrive), names(bFolders))
  check('B voit les documents du dossier et du sous-dossier', names(await as(db, B, `select name from public.documents`)) === 'Avenant 2026,Contrat Mme Lopez', names(await as(db, B, `select name from public.documents`)))
  const objB = (await as(db, B, `select name from storage.objects where bucket_id = 'documents' order by name`)).map((r) => r.name)
  check('Storage : B lit uniquement les fichiers partagés', objB.join(',') === `${A.id}/am-avenant.pdf,${A.id}/am-contrat.pdf`, objB.join(','))
  check('B voit le partage qui le concerne', (await as(db, B, `select id from public.vault_folder_shares`)).length === 1)
  await as(db, A, `insert into public.documents (user_id, folder_id, name, mime, size_bytes, storage_path) values ($1::uuid, $2::uuid, 'Attestation Pajemploi', 'application/pdf', 10, $1::text || '/am-pajemploi.pdf')`, [A.id, fAm.id])
  check('document ajouté plus tard : visible par B', (await as(db, B, `select id from public.documents where name = 'Attestation Pajemploi'`)).length === 1)
  await as(db, A, `update public.documents set folder_id = $1 where id = $2`, [fAm.id, dPrive])
  check('document déplacé dans le dossier partagé : visible par B', (await as(db, B, `select id from public.documents where id = $1`, [dPrive])).length === 1)
  await as(db, A, `update public.documents set folder_id = $1 where id = $2`, [fPrive, dPrive])
  check('document ressorti du dossier partagé : invisible pour B', (await as(db, B, `select id from public.documents where id = $1`, [dPrive])).length === 0)
  await as(db, A, `select public.soft_delete_document($1)`, [dContrat])
  check('document mis à la corbeille : invisible pour B', (await as(db, B, `select id from public.documents where id = $1`, [dContrat])).length === 0)
  await as(db, A, `select public.restore_document($1)`, [dContrat])

  // --- 5. Le destinataire n'écrit rien ---------------------------------------------
  console.log(' -- écritures refusées au non-propriétaire')
  check('B ne renomme pas le dossier de A', (await as(db, B, `update public.vault_folders set name = 'pirate' where id = $1 returning id`, [fAm.id])).length === 0)
  check('B ne supprime pas le dossier de A', (await as(db, B, `delete from public.vault_folders where id = $1 returning id`, [fAm.id])).length === 0)
  check('B ne crée pas de sous-dossier chez A (à son nom → 23503)', (await err(as(db, B, `insert into public.vault_folders (user_id, parent_id, name) values ($1, $2, 'x')`, [B.id, fAm.id])))?.code === '23503')
  check('B ne crée pas de dossier au nom de A (42501)', (await err(as(db, B, `insert into public.vault_folders (user_id, parent_id, name) values ($1, $2, 'x')`, [A.id, fAm.id])))?.code === '42501')
  check('B ne renomme pas un document partagé', (await as(db, B, `update public.documents set name = 'pirate' where id = $1 returning id`, [dContrat])).length === 0)
  check('B ne sort pas un document du dossier', (await as(db, B, `update public.documents set folder_id = null where id = $1 returning id`, [dContrat])).length === 0)
  check('B ne met pas à la corbeille un document partagé (P0002)', (await err(as(db, B, `select public.soft_delete_document($1)`, [dContrat])))?.code === 'P0002')
  const bDoc = (await as(db, B, `insert into public.documents (user_id, name, mime, size_bytes, storage_path) values ($1::uuid, 'Doc de B', 'application/pdf', 1, $1::text || '/b.pdf') returning id`, [B.id]))[0].id
  check('B ne glisse pas son document dans le dossier de A (23503)', (await err(as(db, B, `update public.documents set folder_id = $1 where id = $2`, [fAm.id, bDoc])))?.code === '23503')
  check('B ne révoque pas le partage', (await as(db, B, `update public.vault_folder_shares set revoked_at = now() where id = $1 returning id`, [share])).length === 0)
  check('B ne supprime pas le partage', (await as(db, B, `delete from public.vault_folder_shares where id = $1 returning id`, [share])).length === 0)
  check('B ne supprime pas le fichier partagé', (await as(db, B, `delete from storage.objects where bucket_id = 'documents' and name = $1 returning name`, [`${A.id}/am-contrat.pdf`])).length === 0)
  check('A ne change pas le destinataire d\'un partage (privilège de colonne)', !!(await err(as(db, A, `update public.vault_folder_shares set grantee_id = $1 where id = $2`, [X.id, share]))))

  // --- 6. Personne d'autre ---------------------------------------------------------
  console.log(' -- tiers, proche, anonyme')
  for (const [who, label] of [[X, 'tiers non lié'], [D, 'proche']]) {
    const seen = [
      ...(await as(db, who, `select id from public.vault_folders`)),
      ...(await as(db, who, `select id from public.documents`)),
      ...(await as(db, who, `select id from public.vault_folder_shares`)),
      ...(await as(db, who, `select name as id from storage.objects where bucket_id = 'documents'`)),
    ]
    check(`${label} : aucun dossier, document, partage ni fichier`, seen.length === 0, JSON.stringify(seen))
  }
  check('tiers : rien même par identifiant', (await as(db, X, `select id from public.documents where id = $1`, [dContrat])).length === 0)
  check('anon ne peut pas lire les dossiers', !!(await err(asAnon(db, `select id from public.vault_folders`))))
  check('anon ne peut pas appeler vault_shared_folder_ids', (await err(asAnon(db, `select public.vault_shared_folder_ids()`)))?.code === '42501')

  // --- 7. Verrou du coffre du lecteur (0370) ------------------------------------------
  console.log(' -- verrou du coffre du lecteur')
  await db.query(`delete from public.vault_lock_settings where user_id = $1`, [B.id])
  const sidB = uuid()
  check('B verrouillé : aucun document partagé', (await as(db, B, `select id from public.documents`, [], sidB)).length === 0)
  check('B verrouillé : aucun partage lisible', (await as(db, B, `select id from public.vault_folder_shares`, [], sidB)).length === 0)
  await db.query(`insert into public.vault_lock_settings (user_id, enabled) values ($1, false)`, [B.id])

  // --- 7 bis. Verrou du coffre du PROPRIÉTAIRE : structure et réglage figés ------------
  console.log(' -- verrou du coffre du propriétaire (écritures de structure)')
  await db.query(`delete from public.vault_lock_settings where user_id = $1`, [A.id])
  const sidA = uuid()
  check('A verrouillé : lit encore ses dossiers (feuille de la messagerie)', (await as(db, A, `select id from public.vault_folders where user_id = $1`, [A.id], sidA)).length >= 3)
  check('A verrouillé : création de dossier refusée (42501)', (await err(as(db, A, `insert into public.vault_folders (user_id, name) values ($1, 'Verrouillé')`, [A.id], sidA)))?.code === '42501')
  check('A verrouillé : « Privé » ne passe pas sous le dossier partagé', (await as(db, A, `update public.vault_folders set parent_id = $1 where id = $2 returning id`, [fAm.id, fPrive], sidA)).length === 0)
  check('A verrouillé : renommage sans effet', (await as(db, A, `update public.vault_folders set name = 'x' where id = $1 returning id`, [fPrive], sidA)).length === 0)
  check('A verrouillé : suppression de dossier sans effet', (await as(db, A, `delete from public.vault_folders where id = $1 returning id`, [fPrive], sidA)).length === 0)
  check('A verrouillé : réglage du rangement automatique refusé (42501)', (await err(as(db, A, `insert into public.vault_settings (user_id, auto_import_messages, auto_import_folder_id) values ($1, true, $2)`, [A.id, fAm.id], sidA)))?.code === '42501')
  await db.query(`insert into public.vault_settings (user_id) values ($1)`, [A.id])
  check('A verrouillé : modification du réglage sans effet', (await as(db, A, `update public.vault_settings set auto_import_messages = true, auto_import_folder_id = $2 where user_id = $1 returning user_id`, [A.id, fAm.id], sidA)).length === 0)
  check('A verrouillé : le réglage reste lisible', (await as(db, A, `select auto_import_messages a from public.vault_settings`, [], sidA)).length === 1)
  await db.query(`delete from public.vault_settings where user_id = $1`, [A.id])
  check('A verrouillé : « Privé » toujours à la racine', (await db.query(`select parent_id from public.vault_folders where id = $1`, [fPrive])).rows[0].parent_id === null)
  await db.query(`insert into public.vault_lock_settings (user_id, enabled) values ($1, false)`, [A.id])

  // --- 8. Messagerie → coffre : réglage (0420) ----------------------------------------
  console.log(' -- rangement automatique des pièces jointes (0420)')
  const attach = async (who) => {
    const p = `${conv}/${uuid()}.pdf`
    const r = await as(db, who, `insert into public.messages (conversation_id, sender_id, body, attachment_path, attachment_meta) values ($1, $2, 'pj', $3, '{"name":"pj.pdf","mime":"application/pdf"}') returning id`, [conv, who.id, p])
    return (await db.query(`select user_id, folder_id from public.vault_imports where source_ref = $1`, [r[0].id])).rows
  }
  check('par défaut : aucune pièce jointe inscrite pour le coffre', (await attach(A)).length === 0)
  const fB = (await as(db, B, `insert into public.vault_folders (user_id, name) values ($1, 'Messagerie') returning id`, [B.id]))[0].id
  check('B ne cible pas un dossier de A (23503)', (await err(as(db, B, `insert into public.vault_settings (user_id, auto_import_messages, auto_import_folder_id) values ($1, true, $2)`, [B.id, fAm.id])))?.code === '23503')
  await as(db, B, `insert into public.vault_settings (user_id, auto_import_messages, auto_import_folder_id) values ($1, true, $2)`, [B.id, fB])
  const vi = await attach(A)
  check('réglage activé par B seul : inscription pour B, dans son dossier', vi.length === 1 && vi[0].user_id === B.id && vi[0].folder_id === fB, JSON.stringify(vi))
  // Forme exacte d'un upsert PostgREST (supabase-js .upsert(..., { onConflict: 'user_id' })).
  check('upsert du réglage par B (on conflict do update)', !(await err(as(db, B, `insert into public.vault_settings (user_id, auto_import_messages, auto_import_folder_id) values ($1, true, $2)
      on conflict (user_id) do update set user_id = excluded.user_id, auto_import_messages = excluded.auto_import_messages, auto_import_folder_id = excluded.auto_import_folder_id`, [B.id, fB]))))
  check('X ne lit pas les réglages de B', (await as(db, X, `select user_id from public.vault_settings`)).length === 0)
  check('X ne modifie pas les réglages de B', (await as(db, X, `update public.vault_settings set auto_import_messages = false where user_id = $1 returning user_id`, [B.id])).length === 0)
  await as(db, B, `delete from public.vault_folders where id = $1`, [fB])
  check('dossier cible supprimé : réglage conservé, dossier remis à vide', (await as(db, B, `select auto_import_messages a, auto_import_folder_id f from public.vault_settings`)).every((r) => r.a === true && r.f === null))

  // --- 9. Fin du partage -----------------------------------------------------------------
  console.log(' -- arrêt du partage')
  check('A arrête le partage', (await as(db, A, `update public.vault_folder_shares set revoked_at = now() where id = $1 returning id`, [share])).length === 1)
  check('après arrêt : B ne voit plus ni dossier ni document', (await as(db, B, `select id from public.vault_folders where user_id = $1 union all select id from public.documents where user_id = $1`, [A.id])).length === 0)
  check('après arrêt : B ne lit plus les fichiers', (await as(db, B, `select name from storage.objects where bucket_id = 'documents' and name like $1`, [`${A.id}/%`])).length === 0)
  check('révocation définitive (pas de réactivation)', !!(await err(as(db, A, `update public.vault_folder_shares set revoked_at = null where id = $1`, [share]))))

  console.log(' -- fin du lien entre parents')
  const share2 = (await as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3) returning id`, [fContrats, A.id, B.id]))[0].id
  check('nouveau partage (sous-dossier seul) : B voit « Contrats » et son sous-dossier, pas le parent', names(await as(db, B, `select name from public.vault_folders where user_id = $1`, [A.id])) === 'Contrats,Privé')
  const gB = (await db.query(`select id from public.child_guardians where user_id = $1 and status = 'active'`, [B.id])).rows[0].id
  await as(db, A, `select public.revoke_child_guardian($1)`, [gB])
  check('lien rompu : partage révoqué automatiquement', (await db.query(`select revoked_at from public.vault_folder_shares where id = $1`, [share2])).rows[0].revoked_at !== null)
  check('lien rompu : B ne voit plus rien', (await as(db, B, `select id from public.vault_folders where user_id = $1 union all select id from public.documents where user_id = $1`, [A.id])).length === 0)
  check('lien rompu : plus de nouveau partage possible (42501)', (await err(as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3)`, [fAm.id, A.id, B.id])))?.code === '42501')

  console.log(' -- fin du lien : messagerie V1 (coparent_links) et fiche supprimée')
  const link = (await db.query(`insert into public.coparent_links (user_id, invitee_email, coparent_user_id, status, accepted_at) values ($1, $3, $2, 'accepted', now()) returning id`, [A.id, X.id, X.email])).rows[0].id
  const shX = (await as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3) returning id`, [fPrive, A.id, X.id]))[0].id
  check('lien V1 accepté : X voit le dossier partagé', (await as(db, X, `select id from public.vault_folders where id = $1`, [fPrive])).length === 1)
  await db.query(`update public.coparent_links set status = 'pending' where id = $1`, [link])
  check('lien V1 repassé en attente : partage révoqué', (await db.query(`select revoked_at from public.vault_folder_shares where id = $1`, [shX])).rows[0].revoked_at !== null)
  check('lien V1 repassé en attente : X ne voit plus rien', (await as(db, X, `select id from public.vault_folders where user_id = $1`, [A.id])).length === 0)
  await db.query(`update public.coparent_links set status = 'accepted' where id = $1`, [link])
  const shX2 = (await as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3) returning id`, [fPrive, A.id, X.id]))[0].id
  await db.query(`delete from public.coparent_links where id = $1`, [link])
  check('lien V1 supprimé : partage révoqué', (await db.query(`select revoked_at from public.vault_folder_shares where id = $1`, [shX2])).rows[0].revoked_at !== null)

  const c2 = U('c2')
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Noé', '2021-02-02')`, [c2, A.id])
  const inv2 = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c2])
  await as(db, B, `select public.accept_family_invitation($1)`, [inv2[0].token])
  const shC = (await as(db, A, `insert into public.vault_folder_shares (folder_id, owner_id, grantee_id) values ($1, $2, $3) returning id`, [fPrive, A.id, B.id]))[0].id
  check('nouveau lien par un autre enfant : B voit « Privé »', (await as(db, B, `select id from public.vault_folders where id = $1`, [fPrive])).length === 1)
  await db.query(`update public.children set deleted_at = now() where id = $1`, [c2])
  check('fiche de l\'enfant commun supprimée : partage révoqué', (await db.query(`select revoked_at from public.vault_folder_shares where id = $1`, [shC])).rows[0].revoked_at !== null)
  check('fiche supprimée : B ne voit plus « Privé »', (await as(db, B, `select id from public.vault_folders where id = $1`, [fPrive])).length === 0)

  console.log(' -- pièce mise à la corbeille puis remise au coffre (0430)')
  const addPj = () => db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    return (await tx.query(`select * from public.vault_add_from_source($1, 'messagerie', 'pj-corbeille', $2, 'pj.pdf', 'application/pdf', 10)`, [A.id, `${A.id}/messagerie/pj-corbeille.pdf`])).rows[0]
  })
  const first = await addPj()
  check('premier ajout : document créé', first.created === true)
  // Rangée dans un dossier de A, puis jetée : la restauration doit la remettre à la racine.
  await db.query(`update public.documents set folder_id = $2 where id = $1`, [first.document_id, fAm.id])
  await as(db, A, `select public.soft_delete_document($1)`, [first.document_id])
  const again = await addPj()
  const row = (await db.query(`select deleted_at from public.documents where id = $1`, [again.document_id])).rows[0]
  check('ré-ajout après corbeille : document actif (restauré), pas « déjà dans le coffre »', row.deleted_at === null && again.document_id === first.document_id, JSON.stringify(again))
  const restored = (await db.query(`select folder_id from public.documents where id = $1`, [again.document_id])).rows[0]
  check('ré-ajout après corbeille : restauré à la racine (ancien dossier oublié)', restored.folder_id === null, JSON.stringify(restored))
  const third = await addPj()
  check('ajout suivant : sans doublon (created = false)', third.created === false && third.document_id === first.document_id)

  // --- 10. Suppression d'un dossier -------------------------------------------------------
  console.log(' -- suppression de dossier')
  await as(db, A, `delete from public.vault_folders where id = $1`, [fAm.id])
  const left = await db.query(`select name, folder_id from public.documents where user_id = $1 and name in ('Contrat Mme Lopez', 'Avenant 2026')`, [A.id])
  check('dossier supprimé : sous-dossiers supprimés, documents remis à la racine', left.rows.length === 2 && left.rows.every((r) => r.folder_id === null), JSON.stringify(left.rows))
  check('dossier supprimé : partages supprimés', (await db.query(`select 1 from public.vault_folder_shares where folder_id in ($1, $2)`, [fAm.id, fContrats])).rows.length === 0)

  // --- 11. Structure ---------------------------------------------------------------------
  const pol = await db.query(`select tablename, policyname from pg_policies where schemaname = 'public'
     and tablename in ('vault_folders','vault_folder_shares','vault_settings') and policyname = 'mfa_required' and permissive = 'RESTRICTIVE'`)
  check('mfa_required RESTRICTIVE sur les 3 nouvelles tables', pol.rows.length === 3)
  const wr = await db.query(`select tablename, cmd from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
     and tablename in ('vault_folders','vault_settings') and policyname like 'vault_unlocked_%' order by 1, 2`)
  check('vault_unlocked RESTRICTIVE en écriture seulement (dossiers, réglages)', wr.rows.map((r) => `${r.tablename}:${r.cmd}`).join(',')
    === 'vault_folders:DELETE,vault_folders:INSERT,vault_folders:UPDATE,vault_settings:DELETE,vault_settings:INSERT,vault_settings:UPDATE', JSON.stringify(wr.rows))
  check('vault_unlocked RESTRICTIVE sur vault_folder_shares', (await db.query(`select 1 from pg_policies where tablename = 'vault_folder_shares' and policyname = 'vault_unlocked' and permissive = 'RESTRICTIVE'`)).rows.length === 1)
  const noPath = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname in ('vault_folders_guard','documents_folder_guard','vault_folder_shares_guard','vault_is_linked_parent','vault_shared_folder_ids',
                         '_vault_folder_shares_prune_for_user','vault_shares_after_guardian_change','vault_shares_after_child_delete',
                         'vault_shares_after_coparent_link_change','vault_settings_guard','messages_enqueue_vault_imports')
       and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))`)
  check('SECURITY DEFINER 0410/0420 : search_path vide', noPath.rows.length === 0, noPath.rows.map((r) => r.proname).join(','))

  console.log(`\n0410 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
