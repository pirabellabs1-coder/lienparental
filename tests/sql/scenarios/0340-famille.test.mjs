// Scénarios RLS / RPC de 0340_famille.sql (PGlite + stubs Supabase).
// Scénario antérieur à 0370 : il teste la famille, pas le verrou. Le runner crée ses comptes avec le verrou
// du coffre désactivé (vault_lock_settings.enabled = false).
export const vaultOpen = true
const U = (n) => `00000000-0000-0000-0000-0000000000${n}`
const A = { id: U('0a'), email: 'julie@test.fr', prenom: 'Julie' }
const B = { id: U('0b'), email: 'thomas@test.fr', prenom: 'Thomas' }
const C = { id: U('0c'), email: 'tiers@test.fr', prenom: 'Tiers' }
const D = { id: U('0d'), email: 'rose@test.fr', prenom: 'Rose' }
const c1 = U('c1'), c2 = U('c2'), b1 = U('b1')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}

async function as(db, who, sql, params = [], opts = {}) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: opts.email ?? who.email, aal: opts.aal ?? 'aal1', role: 'authenticated' }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    const r = await tx.query(sql, params)
    return r.rows
  })
}
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function asAnon(db, sql) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql)).rows })
}
async function err(p) {
  try { await p; return null } catch (e) { return e }
}
const payload = { ciphertext: 'x', iv: 'y', tag: 'z', v: 1 }

export default async function run(db) {
  console.log('\n== Scénarios famille (0340, adaptés 0360 : fusion via merge_child_into_as en service_role)')
  for (const u of [A, B, C, D]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values
    ($1, $4, 'Lina', '2019-05-12'), ($2, $4, 'Noah', '2018-03-02'), ($3, $5, 'lina', '2019-05-12')`, [c1, c2, b1, A.id, B.id])
  // Journal privé de A + dépenses (une partagée, une non).
  const je = await db.query(`insert into public.journal_entries (user_id, type, titre, description, occurred_at, children_ids) values
    ($1, 'visite', 'PRIVÉ : retard de 2 h', 'détail privé', now(), array[$2]::uuid[]),
    ($1, 'depense', 'Cantine octobre', 'note privée', now(), array[$2]::uuid[]),
    ($1, 'depense', 'Avocat', 'note privée', now(), array[$2]::uuid[]) returning id`, [A.id, c1])
  const [jPriv, jShared, jUnshared] = je.rows.map((r) => r.id)
  await db.query(`insert into public.journal_expenses (entry_id, user_id, amount_cents, categorie, payment_method, family_shared, justificatif)
    values ($1, $3, 4500, 'cantine', 'virement', true, $4::jsonb), ($2, $3, 90000, 'autre', 'virement', false, null)`,
    [jShared, jUnshared, A.id, JSON.stringify({ path: `${A.id}/journal/f.pdf`, mime: 'application/pdf', size: 10, name: 'f.pdf' })])
  // Calendrier : un événement nouveau (défaut partagé), un privé.
  await db.query(`insert into public.calendar_events (user_id, type, titre, start_at, children_ids) values ($1, 'ecole', 'Réunion école', now() + interval '2 days', array[$2]::uuid[])`, [A.id, c1])
  await db.query(`insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared) values ($1, 'rendez_vous', 'PRIVÉ : avocat', now() + interval '3 days', array[$2]::uuid[], false)`, [A.id, c1])
  // Coffre : un document partagé, un non partagé + objets Storage.
  await db.query(`insert into public.documents (user_id, name, mime, size_bytes, storage_path, children_ids, family_shared) values
    ($1::uuid, 'Carnet de vaccination', 'application/pdf', 10, $1::text || '/doc-shared.pdf', array[$2]::uuid[], true),
    ($1::uuid, 'Jugement', 'application/pdf', 10, $1::text || '/doc-private.pdf', array[$2]::uuid[], false)`, [A.id, c1])
  await db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1::text || '/doc-shared.pdf'), ('documents', $1::text || '/doc-private.pdf'), ('documents', $1 || '/journal/f.pdf')`, [A.id])
  await db.query(`insert into public.child_vaccinations (user_id, child_id, payload) values ($1, $2, $3)`, [A.id, c1, payload])
  const bv = await db.query(`insert into public.child_vaccinations (user_id, child_id, payload) values ($1, $2, $3) returning id`, [B.id, b1, payload])
  const bVacc = bv.rows[0].id

  // 1. Invitation A → B (parent, Lina + Noah)
  const inv = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2, $3]::uuid[])`, [B.email, c1, c2])
  const token = inv[0].token
  check('création : jeton 64 hex renvoyé une fois', /^[0-9a-f]{64}$/.test(token))
  const stored = await db.query(`select encode(token_hash, 'hex') h from public.family_invitations`)
  check('seul le hachage est stocké', stored.rows[0].h !== token && stored.rows[0].h.length === 64)
  check('token_hash non lisible par authenticated', !!(await err(as(db, A, `select token_hash from public.family_invitations`))))
  check('doublon en attente → 23505', (await err(as(db, A, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [B.email, c1])))?.code === '23505')
  check('invitation à soi-même → 22023', (await err(as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [A.email, c1])))?.code === '22023')
  check('partager l\'enfant d\'un autre → 42501', (await err(as(db, A, `select * from public.create_family_invitation('x@y.fr', 'parent', array[$1]::uuid[])`, [b1])))?.code === '42501')
  check('anon ne peut pas appeler create_family_invitation', !!(await err(asAnon(db, `select * from public.create_family_invitation('x@y.fr','parent','{}')`))))

  // 2. Avant acceptation
  check('B avant acceptation : seulement sa fiche', (await as(db, B, `select id from public.children`)).length === 1)
  check('B voit la demande reçue', (await as(db, B, `select * from public.list_received_family_invitations()`)).length === 1)
  const prevC = await as(db, C, `select * from public.get_family_invitation($1)`, [token])
  check('aperçu par un tiers : pas de détails, indice masqué', prevC[0].email_matches === false && prevC[0].children === null && prevC[0].invitee_hint === 't***@test.fr')
  check('tiers avec le lien → P0002', (await err(as(db, C, `select public.accept_family_invitation($1)`, [token])))?.code === 'P0002')
  check('JWT e-mail ≠ e-mail du compte → P0002', (await err(as(db, B, `select public.accept_family_invitation($1)`, [token], { email: 'autre@test.fr' })))?.code === 'P0002')
  await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [B.id])
  check('e-mail non vérifié → P0002', (await err(as(db, B, `select public.accept_family_invitation($1)`, [token])))?.code === 'P0002')
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [B.id])

  // 3. Acceptation
  const acc = await as(db, B, `select public.accept_family_invitation($1) r`, [token])
  check('B accepte : 2 enfants partagés', acc[0].r.child_ids.length === 2, JSON.stringify(acc[0].r))
  check('conversation créée (compat messagerie)', !!acc[0].r.conversation_id)
  check('jeton à usage unique', (await err(as(db, B, `select public.accept_family_invitation($1)`, [token])))?.code === 'P0002')

  // 4. Ce que B voit
  const kids = (await as(db, B, `select prenom from public.children order by prenom`)).map((r) => r.prenom)
  check('B voit Lina, Noah + sa fiche', kids.length === 3, kids.join(','))
  const ev = (await as(db, B, `select titre from public.calendar_events`)).map((r) => r.titre)
  check('B voit l\'événement partagé, pas le privé', ev.length === 1 && ev[0] === 'Réunion école', ev.join(','))
  check('JOURNAL de A invisible pour B', (await as(db, B, `select id from public.journal_entries where user_id = $1`, [A.id])).length === 0)
  check('JOURNAL : même par id', (await as(db, B, `select id from public.journal_entries where id = $1`, [jPriv])).length === 0)
  const exp = await as(db, B, `select entry_id from public.journal_expenses`)
  check('B voit uniquement la dépense partagée', exp.length === 1 && exp[0].entry_id === jShared)
  const lfe = await as(db, B, `select * from public.list_family_expenses()`)
  check('list_family_expenses : titre et montant, sans description', lfe.length === 1 && lfe[0].titre === 'Cantine octobre' && !('description' in lfe[0]))
  const docs = (await as(db, B, `select name from public.documents`)).map((r) => r.name)
  check('B voit le document partagé seulement', docs.length === 1 && docs[0] === 'Carnet de vaccination', docs.join(','))
  const objs = (await as(db, B, `select name from storage.objects order by name`)).map((r) => r.name)
  check('Storage : fichier partagé + justificatif partagé, pas le jugement', objs.length === 2 && !objs.some((n) => n.includes('private')), objs.join(','))
  check('B voit la vaccination saisie par A', (await as(db, B, `select id from public.child_vaccinations where child_id = $1`, [c1])).length === 1)
  check('Témoignages / IA : aucune politique famille', (await db.query(`select 1 from pg_policies where tablename in ('journal_entries','ai_analyses','testimonies','testimony_requests') and policyname ~ 'family'`)).rows.length === 0)

  // 5. Écritures de B sur la fiche partagée
  check('B peut compléter la classe', (await as(db, B, `update public.children set classe = 'CP' where id = $1 returning id`, [c1])).length === 1)
  check('B ne peut pas supprimer la fiche (trigger)', (await err(as(db, B, `update public.children set deleted_at = now() where id = $1`, [c1])))?.code === '42501')
  check('B ne peut pas changer le titulaire', !!(await err(as(db, B, `update public.children set user_id = $2 where id = $1`, [c1, B.id]))))
  check('B ne peut pas DELETE', (await as(db, B, `delete from public.children where id = $1 returning id`, [c1])).length === 0)
  check('B ne modifie pas l\'événement de A', (await as(db, B, `update public.calendar_events set titre = 'x' where user_id = $1 returning id`, [A.id])).length === 0)
  check('B ne peut pas partager un document de A', !!(await err(as(db, B, `update public.documents set family_shared = true where user_id = $1 returning id`, [A.id]))) || (await as(db, B, `update public.documents set family_shared = true where user_id = $1 returning id`, [A.id])).length === 0)
  check('B ajoute une vaccination sur Lina partagée', (await as(db, B, `insert into public.child_vaccinations (user_id, child_id, payload) values ($1, $2, $3) returning id`, [B.id, c1, payload])).length === 1)
  check('C ne peut pas ajouter sur Lina', !!(await err(as(db, C, `insert into public.child_vaccinations (user_id, child_id, payload) values ($1, $2, $3)`, [C.id, c1, payload]))))

  // 6. Contacts / messagerie
  const lp = await as(db, A, `select * from public.list_linked_parents()`)
  check('list_linked_parents (A) contient Thomas', lp.some((r) => r.user_id === B.id))
  const fc = await as(db, B, `select * from public.list_family_contacts()`)
  check('list_family_contacts (B) : Julie, parent, messageable', fc.length === 1 && fc[0].role === 'parent' && fc[0].messageable === true, JSON.stringify(fc))
  const mem = await as(db, A, `select * from public.list_family_members() where child_id = $1`, [c1])
  check('membres de Lina vus par A : titulaire + Thomas gérable', mem.length === 2 && mem.some((m) => m.role === 'parent' && m.can_manage), JSON.stringify(mem.map((m) => [m.prenom, m.role, m.can_manage])))

  // 7. Fusion des doublons
  const mc = await as(db, B, `select * from public.list_merge_candidates()`)
  check('candidat de fusion : lina (B) ↔ Lina (A)', mc.length === 1 && mc[0].my_child_id === b1 && mc[0].shared_child_id === c1, JSON.stringify(mc))
  check('fusion sans les entrées de santé → merge_incomplete', (await err(svc(db, `select public.merge_child_into_as($3, $1, $2, '[]'::jsonb)`, [b1, c1, B.id])))?.hint === 'merge_incomplete')
  check('A ne peut pas fusionner la fiche de B', (await err(svc(db, `select public.merge_child_into_as($3, $1, $2, '[]'::jsonb)`, [b1, c1, A.id])))?.code === '42501')
  check('fusion vers un enfant d\'une autre date → refus', !!(await err(svc(db, `select public.merge_child_into_as($3, $1, $2, '[]'::jsonb)`, [b1, c2, B.id]))))
  const health = JSON.stringify([{ kind: 'vaccination', id: bVacc, payload: { ...payload, ciphertext: 'reencrypted' } }])
  const mr = await svc(db, `select public.merge_child_into_as($4, $1, $2, $3::jsonb) r`, [b1, c1, health, B.id])
  check('fusion OK : 1 entrée de santé déplacée', mr[0].r.health_moved === 1, JSON.stringify(mr[0].r))
  check('fiche doublon supprimée logiquement', (await db.query(`select deleted_at from public.children where id = $1`, [b1])).rows[0].deleted_at !== null)
  check('A voit la vaccination re-chiffrée de B', (await as(db, A, `select payload->>'ciphertext' c from public.child_vaccinations where id = $1`, [bVacc]))[0]?.c === 'reencrypted')
  check('plus de candidat après fusion', (await as(db, B, `select * from public.list_merge_candidates()`)).length === 0)

  // 8. Proche invité par B
  const inv2 = await as(db, B, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [D.email, c1])
  await as(db, D, `select public.accept_family_invitation($1)`, [inv2[0].token])
  check('proche : aucune fiche via RLS', (await as(db, D, `select id from public.children`)).length === 0)
  check('proche : vue limitée list_family_children', (await as(db, D, `select * from public.list_family_children()`)).length === 1)
  check('proche : calendrier partagé visible', (await as(db, D, `select id from public.calendar_events`)).length === 1)
  check('proche : pas de santé', (await as(db, D, `select id from public.child_vaccinations`)).length === 0)
  check('proche : pas de documents', (await as(db, D, `select id from public.documents`)).length === 0)
  check('proche : pas de dépenses', (await as(db, D, `select entry_id from public.journal_expenses`)).length === 0)
  check('proche : pas de Journal', (await as(db, D, `select id from public.journal_entries`)).length === 0)
  check('proche : non joignable par messagerie', !(await as(db, A, `select * from public.list_linked_parents()`)).some((r) => r.user_id === D.id))
  const gD = (await db.query(`select id from public.child_guardians where user_id = $1 and status = 'active'`, [D.id])).rows[0].id
  const gB = (await db.query(`select id from public.child_guardians where user_id = $1 and child_id = $2 and status = 'active'`, [B.id, c1])).rows[0].id
  check('proche ne peut pas retirer Thomas', (await err(as(db, D, `select public.revoke_child_guardian($1)`, [gB])))?.code === '42501')
  check('Thomas (inviteur) change le rôle de Rose', !(await err(as(db, B, `select public.set_child_guardian_role($1, 'proche')`, [gD]))))
  check('on ne change pas son propre rôle', (await err(as(db, B, `select public.set_child_guardian_role($1, 'parent')`, [gB])))?.code === '42501')

  // 9. MFA
  await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [D.id])
  check('MFA aal1 : RPC refusée', (await err(as(db, D, `select * from public.list_family_children()`)))?.code === '42501')
  check('MFA aal1 : calendrier masqué', (await as(db, D, `select id from public.calendar_events`)).length === 0)
  check('MFA aal2 : accès rétabli', (await as(db, D, `select id from public.calendar_events`, [], { aal: 'aal2' })).length === 1)

  // 10. Révocation par la titulaire
  await as(db, A, `select public.revoke_child_guardian($1)`, [gB])
  const after = (await as(db, B, `select prenom from public.children where deleted_at is null`)).map((r) => r.prenom)
  check('après retrait : Thomas ne voit plus Lina (Noah reste partagé)', after.length === 1 && after[0] === 'Noah', after.join(','))
  check('après retrait : plus d\'événement de Lina', (await as(db, B, `select id from public.calendar_events`)).length === 0)
  check('après retrait : plus de document', (await as(db, B, `select id from public.documents`)).length === 0)
  check('après retrait : A ne voit plus les saisies santé de B sur Lina', (await as(db, A, `select id from public.child_vaccinations where user_id = $1`, [B.id])).length === 0)

  // 11. Tiers
  check('tiers : 0 enfant', (await as(db, C, `select id from public.children`)).length === 0)
  check('tiers : 0 lien', (await as(db, C, `select id from public.child_guardians`)).length === 0)
  check('tiers : 0 fichier', (await as(db, C, `select name from storage.objects`)).length === 0)

  // 12. Renvoi / annulation
  const inv3 = await as(db, A, `select * from public.create_family_invitation('new@test.fr', 'proche', array[$1]::uuid[])`, [c2])
  check('renvoi trop rapproché → 54000', (await err(as(db, A, `select * from public.resend_family_invitation($1)`, [inv3[0].invitation_id])))?.code === '54000')
  await db.query(`update public.family_invitations set last_sent_at = now() - interval '2 minutes' where id = $1`, [inv3[0].invitation_id])
  const rs = await as(db, A, `select * from public.resend_family_invitation($1)`, [inv3[0].invitation_id])
  check('renvoi : nouveau jeton', rs[0].token !== inv3[0].token)
  const old = await as(db, A, `select * from public.get_family_invitation($1)`, [inv3[0].token])
  check('ancien jeton invalidé', old.length === 0)
  await as(db, A, `select public.cancel_family_invitation($1)`, [inv3[0].invitation_id])
  check('annulée : n\'apparaît plus', !(await as(db, A, `select id from public.list_sent_family_invitations()`)).some((r) => r.id === inv3[0].invitation_id))

  console.log(`\n== ${pass} réussis, ${fail} échecs`)
  if (fail) process.exitCode = 1
}
