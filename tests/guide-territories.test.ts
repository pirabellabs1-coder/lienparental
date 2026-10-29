/**
 * Guide multi-territoires : disponibilité dérivée du contenu (territoire.json `disponible`), choix
 * mémorisé du territoire, SQL d'import qui met à jour un territoire existant.
 * Fixture : dossier temporaire content/guide/<code>/ (jamais le vrai content/guide du dépôt).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFileTerritoires } from '../lib/guide/territories-fs'
import {
  GUIDE_TERRITORY_COOKIE, isTerritoryCode, pickAvailable, preferredTerritoire, territoireUpsertSql,
  territoryCookieString, withAvailability,
} from '../lib/guide/territories'
import { guideHref, homeHref } from '../lib/guide/links'
import type { Territoire } from '../lib/guide/types'

let root = ''

function write(rel: string, value: unknown) {
  const f = path.join(root, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
}

before(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-guide-terr-')), 'content', 'guide')
  write('guyane/territoire.json', { code: 'guyane', nom: 'Guyane', disponible: true, ordre: 1 })
  // Territoire factice ouvert : doit apparaître « Disponible » sans aucune modification du code.
  write('testland/territoire.json', { code: 'testland', nom: 'Testland', disponible: true, ordre: 5 })
  write('brouillon/territoire.json', { code: 'brouillon', nom: 'Brouillon', disponible: false, ordre: 3 })
  // Dossier en cours de rédaction (pas encore de territoire.json) : ignoré, sans erreur.
  write('en-cours/fiches/a.json', { slug: 'a' })
  // Dossier au nom non conforme : ignoré.
  write('Pas_Valide/territoire.json', { code: 'pas-valide', nom: 'X', disponible: true, ordre: 1 })
})

after(() => {
  fs.rmSync(path.dirname(path.dirname(root)), { recursive: true, force: true })
})

test('readFileTerritoires : un dossier = un territoire, triés par ordre, sans territoire.json ignoré', () => {
  const list = readFileTerritoires(root)
  assert.deepEqual(list.map((t) => t.code), ['guyane', 'brouillon', 'testland'])
  assert.deepEqual(list.filter((t) => t.disponible).map((t) => t.code), ['guyane', 'testland'])
})

test('readFileTerritoires : dossier absent → liste vide', () => {
  assert.deepEqual(readFileTerritoires(path.join(root, 'nulle-part')), [])
})

test('readFileTerritoires : code différent du dossier → erreur explicite', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-guide-bad-'))
  try {
    fs.mkdirSync(path.join(dir, 'martinique'))
    fs.writeFileSync(path.join(dir, 'martinique', 'territoire.json'), JSON.stringify({ code: 'guadeloupe', nom: 'G', disponible: true, ordre: 1 }))
    assert.throws(() => readFileTerritoires(dir), /différent du dossier/)
    fs.writeFileSync(path.join(dir, 'martinique', 'territoire.json'), JSON.stringify({ code: 'martinique', disponible: 'oui' }))
    assert.throws(() => readFileTerritoires(dir), /invalide/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('withAvailability : disponibilité lue dans le contenu, disponibles en tête', () => {
  const catalog = [{ code: 'guyane' }, { code: 'france' }, { code: 'testland' }, { code: 'brouillon' }] as const
  const rows = withAvailability(catalog, readFileTerritoires(root))
  assert.deepEqual(rows.map((r) => [r.code, r.available]), [
    ['guyane', true], ['testland', true], ['france', false], ['brouillon', false],
  ])
  // Aucun territoire lu : tout est « Bientôt ».
  assert.ok(withAvailability(catalog, []).every((r) => !r.available))
})

test('pickAvailable : voulu s’il est disponible, sinon Guyane, sinon le premier disponible', () => {
  const all = readFileTerritoires(root)
  assert.equal(pickAvailable(all, 'testland')?.code, 'testland')
  assert.equal(pickAvailable(all, 'brouillon')?.code, 'guyane') // indisponible
  assert.equal(pickAvailable(all, 'inconnu')?.code, 'guyane')
  assert.equal(pickAvailable(all, undefined)?.code, 'guyane')
  const sansGuyane: Territoire[] = all.filter((t) => t.code !== 'guyane')
  assert.equal(pickAvailable(sansGuyane, undefined)?.code, 'testland')
  assert.equal(pickAvailable([], 'guyane'), undefined)
})

test('preferredTerritoire : paramètre d’URL, sinon cookie mémorisé, valeurs invalides ignorées', () => {
  assert.equal(preferredTerritoire('martinique', 'reunion'), 'martinique')
  assert.equal(preferredTerritoire(['mayotte', 'x'], undefined), 'mayotte')
  assert.equal(preferredTerritoire(undefined, 'reunion'), 'reunion')
  assert.equal(preferredTerritoire('../etc', 'reunion'), 'reunion')
  assert.equal(preferredTerritoire('', '<script>'), undefined)
  assert.equal(preferredTerritoire(undefined, undefined), undefined)
  assert.equal(isTerritoryCode('a'.repeat(41)), false)
})

test('cookie du territoire : 1 an, tout le site, SameSite=Lax, Secure en HTTPS', () => {
  const c = territoryCookieString('martinique', true)
  assert.ok(c.startsWith(`${GUIDE_TERRITORY_COOKIE}=martinique;`))
  assert.match(c, /path=\//)
  assert.match(c, /max-age=31536000/)
  assert.match(c, /samesite=lax/)
  assert.match(c, /; secure$/)
  assert.doesNotMatch(territoryCookieString('guyane', false), /secure/)
})

test('liens du Guide : territoire toujours explicite (Guyane comprise), le cookie ne peut pas le contredire', () => {
  assert.equal(homeHref('guyane'), '/app/guide?territoire=guyane')
  assert.equal(guideHref('/app/guide/x', 'martinique'), '/app/guide/x?territoire=martinique')
})

test('territoireUpsertSql : crée ou met à jour nom, disponibilité et ordre (plus de « do nothing »)', () => {
  const sql = territoireUpsertSql({ code: 'reunion', nom: 'La Réunion d\'abord', disponible: true, ordre: 4 })
  assert.match(sql, /^insert into public\.guide_territoires \(code, nom, disponible, ordre\) values \('reunion', 'La Réunion d''abord', true, 4\)/)
  assert.match(sql, /on conflict \(code\) do update set nom = excluded\.nom, disponible = excluded\.disponible, ordre = excluded\.ordre;$/)
  assert.doesNotMatch(sql, /do nothing/)
  assert.match(territoireUpsertSql({ code: 'mayotte', nom: 'Mayotte', disponible: false, ordre: 6 }), /, false, 6\)/)
})

test('messages du Guide : préposition juste pour chaque territoire (FR « à La Réunion », PT « na Martinica »)', async () => {
  const { IntlMessageFormat } = await import('intl-messageformat')
  const read = (l: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'messages', l, 'public.json'), 'utf8'))
  const fmt = (l: string, key: 'lead' | 'metaDescription', territory: string, code: string) =>
    String(new IntlMessageFormat(read(l).public.guide.territory[key], l).format({ territory, code, count: 3 }))
  assert.match(fmt('fr', 'lead', 'La Réunion', 'reunion'), /parents à La Réunion,/)
  assert.match(fmt('fr', 'lead', 'Guyane', 'guyane'), /parents en Guyane,/)
  assert.match(fmt('fr', 'metaDescription', 'Mayotte', 'mayotte'), /parents à Mayotte/)
  assert.match(fmt('pt', 'lead', 'Martinica', 'martinique'), /pais na Martinica,/)
  assert.match(fmt('pt', 'lead', 'Guadalupe', 'guadeloupe'), /pais em Guadalupe,/)
  assert.match(fmt('en', 'lead', 'Réunion', 'reunion'), /parents in Réunion,/)
  for (const l of ['fr', 'en', 'pt']) assert.ok(read(l).public.guide.territory.change)
})

test('préférences : territoire du Guide facultatif, code validé', async () => {
  const { preferencesSchema } = await import('../lib/auth/validation')
  const t = preferencesSchema.shape.territoire
  assert.equal(t.safeParse('reunion').success, true)
  assert.equal(t.safeParse('').success, true) // jamais choisi
  assert.equal(t.safeParse(undefined).success, true) // écran Préférences d'avant le champ
  assert.equal(t.safeParse('La Réunion').success, false)
  assert.equal(t.safeParse('../guyane').success, false)
})
