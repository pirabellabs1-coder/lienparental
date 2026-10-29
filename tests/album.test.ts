/** Album de l'enfant : chronologie, filtres, tri, schémas, redimensionnement (logique pure). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byPhotoDateDesc, filterPhotos, photoPatchSchema, thumbsRequestSchema, timeline, type AlbumPhoto } from '../lib/album/types'
import { fitWithin } from '../lib/vault/photo-process'

const p = (id: string, date: string, extra: Partial<AlbumPhoto> = {}): AlbumPhoto => ({
  id, title: id, date, addedAt: date, addedTime: '10:00', childIds: ['lina'], album: null, important: false, shared: false, size: 1, ...extra,
})

test('chronologie : années puis mois, les plus récents d’abord', () => {
  const years = timeline([p('a', '2025-12-24'), p('b', '2026-09-01'), p('c', '2026-09-15'), p('d', '2026-07-20')])
  assert.deepEqual(years.map((y) => [y.year, y.count]), [[2026, 3], [2025, 1]])
  assert.deepEqual(years[0].months.map((m) => m.key), ['2026-09', '2026-07'])
  assert.deepEqual(years[0].months[0].photos.map((x) => x.id), ['c', 'b'])
})

test('tri : même jour → ajout le plus récent d’abord', () => {
  const a = p('a', '2026-05-01', { addedAt: '2026-05-02', addedTime: '08:00' })
  const b = p('b', '2026-05-01', { addedAt: '2026-05-02', addedTime: '19:30' })
  assert.deepEqual([a, b].sort(byPhotoDateDesc).map((x) => x.id), ['b', 'a'])
})

test('filtres : enfant, album, moments importants, partagées, privées, de l’autre parent', () => {
  const list = [
    p('mine-private', '2026-01-01'),
    p('mine-shared', '2026-01-02', { shared: true, album: 'ecole', important: true }),
    p('theirs', '2026-01-03', { shared: true, sharedBy: { prenom: 'David' }, childIds: ['noah'] }),
  ]
  const ids = (f: Parameters<typeof filterPhotos>[1]) => filterPhotos(list, f).map((x) => x.id)
  assert.deepEqual(ids({ childId: 'noah' }), ['theirs'])
  assert.deepEqual(ids({ album: 'ecole' }), ['mine-shared'])
  assert.deepEqual(ids({ view: 'important' }), ['mine-shared'])
  assert.deepEqual(ids({ view: 'shared' }), ['mine-shared']) // mes photos partagées, pas celles reçues
  assert.deepEqual(ids({ view: 'private' }), ['mine-private'])
  assert.deepEqual(ids({ view: 'theirs' }), ['theirs'])
  assert.equal(ids({ view: 'all', album: 'all' }).length, 3)
})

test('modification : note ≤ 280, album connu, date au format AAAA-MM-JJ', () => {
  assert.equal(photoPatchSchema.safeParse({ note: 'x'.repeat(280), album: 'vacances', date: '2026-08-01', shared: true }).success, true)
  assert.equal(photoPatchSchema.safeParse({ note: 'x'.repeat(281) }).success, false)
  assert.equal(photoPatchSchema.safeParse({ album: 'soiree' }).success, false)
  assert.equal(photoPatchSchema.safeParse({ date: '01/08/2026' }).success, false)
  assert.equal(photoPatchSchema.safeParse({ note: null, album: null }).success, true) // effacer la note / l'album
})

test('vignettes : 1 à 60 identifiants UUID par requête', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  assert.equal(thumbsRequestSchema.safeParse({ ids: [id] }).success, true)
  assert.equal(thumbsRequestSchema.safeParse({ ids: [] }).success, false)
  assert.equal(thumbsRequestSchema.safeParse({ ids: Array(61).fill(id) }).success, false)
  assert.equal(thumbsRequestSchema.safeParse({ ids: ['../x'] }).success, false)
})

test('redimensionnement : côté le plus long borné, jamais agrandi, proportions gardées', () => {
  assert.deepEqual(fitWithin(4032, 3024, 2560), { width: 2560, height: 1920 })
  assert.deepEqual(fitWithin(3024, 4032, 480), { width: 360, height: 480 })
  assert.deepEqual(fitWithin(800, 600, 2560), { width: 800, height: 600 })
})
