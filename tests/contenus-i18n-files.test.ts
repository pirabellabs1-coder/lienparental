/** lib/contenus/i18n-files : lecture des traductions content/i18n/<locale>/… (dossier temporaire). */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileTranslations, localizeFromFiles, localizeTerritoire, rawFileTranslation } from '../lib/contenus/i18n-files'
import type { ContentData } from '../lib/contenus/types'

const cwd = process.cwd()
let dir = ''

function write(rel: string, content: string) {
  const f = path.join(dir, 'content', 'i18n', rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, content, 'utf8')
}

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-i18n-'))
  write('en/conseils.json', JSON.stringify({ 'parler-calmement': { titre: 'Speak calmly', texte: 'Keep a neutral tone.' } }))
  write('en/faq/index.json', JSON.stringify({ questions: [{ slug: 'qui-voit', question: 'Who can see my data?', categoryKey: 'compte' }] }))
  write('en/faq/qui-voit.md', '---\ntitle: "Who can see my data?"\ncategory: "Account"\n---\n\nOnly you.\n')
  write('pt/faq/index.json', JSON.stringify({ questions: [{ slug: 'qui-voit', question: 'Quem vê meus dados?', categoryKey: 'compte' }] }))
  // pt : pas de fichier .md → pas de traduction (la question seule ne suffit pas)
  write('en/blog/rentree.md', '---\ntitre: Back to school\nextrait: Getting ready.\ncategorie: demarches\ntags: school, Guyane\nauteur: The Lien Parental team\n---\nBody **text**.\n')
  write('en/guide/guyane/territoire.json', JSON.stringify({ code: 'autre', nom: 'French Guiana', disponible: false, ordre: 9 }))
  write('pt/conseils.json', '{ invalide')
  process.chdir(dir)
})

after(() => {
  process.chdir(cwd)
  fs.rmSync(dir, { recursive: true, force: true })
})

const conseil: ContentData['conseil'] = { slug: 'parler-calmement', titre: 'Parler calmement', texte: 'Gardez un ton neutre.', categorie: 'communication', ordre: 10 }
const faq: ContentData['faq'] = { slug: 'qui-voit', question: 'Qui voit mes données ?', categorie: 'compte', reponse: 'Vous seul.', ordre: 10 }

test('conseil : conseils.json, invariants conservés', () => {
  const r = localizeFromFiles('conseil', conseil, 'en')
  assert.equal(r.lang, 'en')
  assert.equal(r.data.titre, 'Speak calmly')
  assert.equal(r.data.categorie, 'communication')
  assert.equal(r.data.slug, 'parler-calmement')
})

test('JSON illisible : français, sans exception', () => {
  const r = localizeFromFiles('conseil', conseil, 'pt')
  assert.equal(r.lang, 'fr')
  assert.equal(r.data.titre, 'Parler calmement')
})

test('FAQ : question de index.json + réponse du .md ; sans .md, pas de traduction', () => {
  const r = localizeFromFiles('faq', faq, 'en')
  assert.equal(r.lang, 'en')
  assert.equal(r.data.question, 'Who can see my data?')
  assert.equal(r.data.reponse, 'Only you.')
  assert.equal(rawFileTranslation('faq', faq, 'pt'), null)
  assert.deepEqual(Object.keys(fileTranslations('faq', faq)), ['en'])
})

test('blog : frontmatter + corps, catégorie et slug du français', () => {
  const post: ContentData['article'] = {
    slug: 'rentree', titre: 'La rentrée', extrait: 'Se préparer.', contenu: 'Corps.', couverture: '', couvertureAlt: '',
    categorie: 'organisation', tags: ['école', 'Guyane'], auteur: 'L’équipe Lien Parental', seoTitre: '', seoDescription: '',
  }
  const r = localizeFromFiles('article', post, 'en')
  assert.equal(r.lang, 'en')
  assert.equal(r.data.titre, 'Back to school')
  assert.equal(r.data.contenu, 'Body **text**.')
  assert.equal(r.data.categorie, 'organisation')
  // Nombre d'étiquettes différent du français : structure refusée → français.
  assert.deepEqual(r.data.tags, ['school', 'Guyane'])
  const other = localizeFromFiles('article', { ...post, tags: ['a', 'b', 'c'] }, 'en')
  assert.equal(other.lang, 'fr')
  assert.deepEqual(other.data.tags, ['a', 'b', 'c'])
})

test('chemins : slug ou territoire non sûrs ignorés (pas de traversée de dossier)', () => {
  assert.equal(rawFileTranslation('conseil', { ...conseil, slug: '../../etc' }, 'en'), null)
  assert.equal(rawFileTranslation('fiche', { slug: 'x', territoire: '..' } as unknown as ContentData['fiche'], 'en'), null)
})

test('territoire : nom traduit, code et options inchangés', () => {
  const t = localizeTerritoire({ code: 'guyane', nom: 'Guyane', disponible: true, ordre: 1 }, 'en')
  assert.deepEqual(t, { code: 'guyane', nom: 'French Guiana', disponible: true, ordre: 1 })
  assert.equal(localizeTerritoire({ code: 'guyane', nom: 'Guyane', disponible: true, ordre: 1 }, 'pt').nom, 'Guyane')
})
