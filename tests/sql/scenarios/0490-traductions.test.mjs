// Scénarios 0490_contenus_translations.sql : colonne `translations` des contenus éditoriaux.
// ADM administrateur, P parent. Contraintes CHECK, droits (RLS inchangée), historique (content_versions).
const U = (n) => `00000000-0000-0000-0000-0000000049${n}`
const ADM = { id: U('a1'), email: 'admin49@test.fr' }
const P = { id: U('01'), email: 'parent49@test.fr' }
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function as(db, who, sql, params = [], aal = 'aal2') {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal, role: 'authenticated', session_id: crypto.randomUUID() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function anon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }

const TABLES = ['guide_fiches', 'guide_parcours', 'guide_partners', 'document_templates', 'blog_posts', 'faq_items', 'tutorials', 'daily_tips']

export default async function run(db) {
  console.log('\n== Traductions du contenu (0490)')
  for (const u of [ADM, P]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, email_verified) values ($1, $2, true) on conflict (id) do nothing`, [u.id, u.email])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])

  const cols = (await db.query(`select table_name, data_type, is_nullable, column_default from information_schema.columns
     where table_schema = 'public' and column_name = 'translations' order by table_name`)).rows
  check('colonne translations sur les 8 tables', TABLES.every((t) => cols.some((c) => c.table_name === t)), cols.map((c) => c.table_name).join(','))
  check('jsonb not null default {}', cols.every((c) => c.data_type === 'jsonb' && c.is_nullable === 'NO' && /'\{\}'::jsonb/.test(c.column_default ?? '')),
    JSON.stringify(cols[0]))

  const ins = `insert into public.faq_items (slug, question, categorie, reponse_md, ordre, statut, published_at, translations)
               values ($1, 'Question ?', 'compte', 'Réponse.', 10, 'publie', now(), $2::jsonb) returning id, version`
  const [row] = await as(db, ADM, ins, ['trad-49', JSON.stringify({ en: { question: 'Question?', reponse: 'Answer.' } })])
  check('admin : insertion avec traduction', row && row.version === 1)

  for (const [label, value] of [
    ['clé hors en/pt refusée', { fr: { question: 'x' } }],
    ['valeur non objet refusée', { en: 'texte' }],
    ['tableau refusé', ['en']],
    ['scalaire refusé', 'en'],
    ['taille excessive refusée', { en: { reponse: 'x'.repeat(410000) } }],
  ]) {
    const e = await err(as(db, ADM, `update public.faq_items set translations = $1::jsonb where id = $2`, [JSON.stringify(value), row.id]))
    check(label, e && /chk_faq_items_translations|violates check constraint/.test(e.message), e?.message)
  }

  const upd = await as(db, ADM, `update public.faq_items set translations = translations || $1::jsonb where id = $2 and version = 1 returning version, translations`,
    [JSON.stringify({ pt: { question: 'Pergunta?', reponse: 'Resposta.' } }), row.id])
  check('admin : ajout pt, version + 1 (concurrence optimiste)', upd[0]?.version === 2 && upd[0]?.translations?.pt?.question === 'Pergunta?', JSON.stringify(upd[0]))

  const snaps = (await db.query(`select version, snapshot from public.content_versions where entity_type = 'faq_items' and entity_id = $1 order by version`, [row.id])).rows
  check('historique : instantané avec les traductions', snaps.length === 2 && snaps[1].snapshot?.translations?.pt?.reponse === 'Resposta.', JSON.stringify(snaps.map((s) => s.version)))

  const pub = await anon(db, `select translations from public.faq_items where id = $1`, [row.id])
  check('anon : lit les traductions d’un élément publié', pub[0]?.translations?.en?.question === 'Question?')

  const e1 = await err(anon(db, `update public.faq_items set translations = '{}'::jsonb where id = $1`, [row.id]))
  const r1 = e1 ? [] : await anon(db, `select 1`)
  check('anon : aucune écriture', Boolean(e1) || r1.length === 0, e1?.message)
  const r2 = await as(db, P, `update public.faq_items set translations = '{}'::jsonb where id = $1 returning id`, [row.id])
  check('parent : écriture sans effet (RLS admin)', r2.length === 0)

  const [draft] = await as(db, ADM, `insert into public.faq_items (slug, question, categorie, reponse_md, ordre, statut, translations)
     values ('brouillon-49', 'Q ?', 'compte', 'R.', 10, 'brouillon', '{"en":{"question":"Q?"}}'::jsonb) returning id`)
  const hidden = await anon(db, `select translations from public.faq_items where id = $1`, [draft.id])
  check('anon : brouillon invisible (traductions comprises)', hidden.length === 0)

  console.log(`\n== ${pass} réussis, ${fail} échecs`)
  if (fail) process.exitCode = 1
}
