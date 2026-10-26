/** Dossiers du coffre (0410) : arborescence, partages visibles, message de « Mettre au coffre-fort ». */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  flattenFolders, folderAudience, folderPath, folderSubtitle, folderSubtreeIds, saveOutcomeMessage, sharedRoots,
  type FolderShare, type SharedWithMe, type VaultFolder,
} from '../lib/vault/folder-tree'

const f = (id: string, parentId: string | null, name = id): VaultFolder => ({ id, name, parentId, ownerId: 'me', mine: true })
const TREE = [f('am', null, 'Assistante maternelle'), f('contrats', 'am', 'Contrats'), f('2026', 'contrats', '2026'), f('ecole', null, 'École')]
const share = (folderId: string, granteePrenom = 'Thomas'): FolderShare => ({ id: `s_${folderId}`, folderId, granteeId: 'u2', granteePrenom, createdAt: '' })

test('folderPath : racine → dossier', () => {
  assert.deepEqual(folderPath(TREE, '2026').map((x) => x.id), ['am', 'contrats', '2026'])
  assert.deepEqual(folderPath(TREE, null), [])
  assert.deepEqual(folderPath(TREE, 'inconnu'), [])
})

test('folderPath : parent absent (dossier partagé dont l\'ancêtre est invisible)', () => {
  assert.deepEqual(folderPath([f('contrats', 'am'), f('2026', 'contrats')], '2026').map((x) => x.id), ['contrats', '2026'])
})

test('folderPath : cycle sans boucle infinie', () => {
  const cyc = [f('a', 'b'), f('b', 'a')]
  assert.deepEqual(folderPath(cyc, 'a').map((x) => x.id), ['b', 'a'])
})

test('flattenFolders : ordre alphabétique et profondeur', () => {
  assert.deepEqual(flattenFolders(TREE).map((x) => `${x.depth}:${x.id}`), ['0:am', '1:contrats', '2:2026', '0:ecole'])
})

test('flattenFolders : cycle et dossier orphelin ignorés', () => {
  const list = [...TREE, f('x', 'y'), f('y', 'x'), f('orphelin', 'absent')]
  assert.deepEqual(flattenFolders(list).map((x) => x.id), ['am', 'contrats', '2026', 'ecole'])
})

test('folderSubtreeIds : descendants, cycle toléré', () => {
  assert.deepEqual([...folderSubtreeIds(TREE, 'am')].sort(), ['2026', 'am', 'contrats'])
  assert.deepEqual([...folderSubtreeIds([f('a', 'b'), f('b', 'a')], 'a')].sort(), ['a', 'b'])
  assert.deepEqual([...folderSubtreeIds(TREE, 'ecole')], ['ecole'])
})

test('folderAudience : partage du dossier ou d\'un ancêtre', () => {
  const shares = [share('am')]
  assert.deepEqual(folderAudience(TREE, shares, '2026'), ['Thomas'])
  assert.deepEqual(folderAudience(TREE, shares, 'ecole'), [])
  assert.deepEqual(folderAudience(TREE, shares, null), [])
  assert.deepEqual(folderAudience(TREE, [share('am'), share('contrats')], '2026'), ['Thomas'])
})

test('sharedRoots : un sous-dossier partagé avec son ancêtre n\'apparaît qu\'une fois', () => {
  const s = (folderId: string): SharedWithMe => ({ shareId: folderId, folderId, ownerId: 'u2', ownerPrenom: 'Thomas', createdAt: '' })
  const visible = TREE.map((x) => ({ ...x, mine: false }))
  assert.deepEqual(sharedRoots([s('contrats'), s('am'), s('ecole')], visible).map((x) => x.folderId), ['am', 'ecole'])
  assert.deepEqual(sharedRoots([s('contrats')], visible).map((x) => x.folderId), ['contrats'])
})

test('folderSubtitle : documents « ici » et partages', () => {
  assert.equal(folderSubtitle(TREE[0], TREE, 2, [share('am')]), '1 sous-dossier · 2 documents ici · Partagé avec Thomas')
  assert.equal(folderSubtitle(TREE[3], TREE, 0, []), '0 document ici')
})

test('saveOutcomeMessage : nouveau, déjà présent, dossier non appliqué', () => {
  assert.equal(saveOutcomeMessage({ created: true, placed: null, folderName: null }), 'Pièce jointe ajoutée au coffre-fort')
  assert.equal(saveOutcomeMessage({ created: true, placed: true, folderName: 'École' }), 'Pièce jointe ajoutée au coffre-fort, dossier « École »')
  assert.equal(saveOutcomeMessage({ created: true, placed: false, folderName: null }), 'Ajouté au coffre-fort, mais pas dans le dossier choisi')
  assert.equal(saveOutcomeMessage({ created: false, placed: null, folderName: 'Contrats' }), 'Déjà dans votre coffre-fort (dossier « Contrats »)')
  assert.equal(saveOutcomeMessage({ created: false, placed: null, folderName: null }), 'Déjà dans votre coffre-fort')
})
