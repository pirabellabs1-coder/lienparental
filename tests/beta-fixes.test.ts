/** Corrections bêta-test : âge des enfants, progression du Guide, noms de territoires, compteurs du coffre. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ageFromBirthDate, mockChildren } from '../lib/mock-data'
import { parcoursElementStatus, parcoursElementWrites, persistOrResync } from '../lib/guide/progress-rules'
import { territoryDisplayName } from '../lib/guide/territory-name'
import { withDemoCounts } from '../lib/vault/counts'
import { FICHE_ELEMENT, type ProgressStatus } from '../lib/guide/types'
import { VAULT_CATEGORIES, VAULT_DOCS } from '../lib/mock-vault'

test('âge : années révolues depuis la date de naissance', () => {
  const now = new Date('2026-10-28T15:00:00Z')
  assert.equal(ageFromBirthDate('2019-05-12', now), 7) // Lina : 7 ans (et non 5)
  assert.equal(ageFromBirthDate('2018-03-02', now), 8) // Noah : 8 ans (et non 7)
  assert.equal(ageFromBirthDate('2030-01-01', now), 0)
  assert.equal(ageFromBirthDate('pas une date', now), 0)
})

test('âge : jour de l’anniversaire lu dans le fuseau de Cayenne, pas en UTC', () => {
  // 12 mai 2026, 01:00 UTC = 11 mai 22:00 à Cayenne : Lina n'a pas encore 7 ans.
  assert.equal(ageFromBirthDate('2019-05-12', new Date('2026-05-12T01:00:00Z')), 6)
  // 12 mai 2026, 04:00 UTC = 12 mai 01:00 à Cayenne : 7 ans.
  assert.equal(ageFromBirthDate('2019-05-12', new Date('2026-05-12T04:00:00Z')), 7)
})

test('enfants de démo : âge dérivé de la date de naissance (même source que « Mes enfants »)', () => {
  for (const c of mockChildren) assert.equal(c.age, ageFromBirthDate(c.dateNaissance!))
})

test('Guide : fiche « Démarche terminée » → étape liée terminée dans le parcours', () => {
  const map: Record<string, ProgressStatus> = { [`fiche:caf-allocations:${FICHE_ELEMENT}`]: 'termine' }
  const read = (r: string, s: string, e: string) => map[`${r}:${s}:${e}`]
  assert.equal(parcoursElementStatus(read, 'je-viens-de-me-separer', { id: 'caf', fiche: 'caf-allocations' }), 'termine')
  // Étape sans fiche : son propre statut, « à faire » par défaut.
  assert.equal(parcoursElementStatus(read, 'je-viens-de-me-separer', { id: 'autre' }), 'a_faire')
})

test('Guide : la fiche fait foi (une fiche rouverte rouvre l’étape), ancien statut d’étape en repli', () => {
  const map: Record<string, ProgressStatus> = {
    'parcours:p:caf': 'termine',
    [`fiche:caf-allocations:${FICHE_ELEMENT}`]: 'a_faire',
    'parcours:p:legacy': 'en_cours',
  }
  const read = (r: string, s: string, e: string) => map[`${r}:${s}:${e}`]
  assert.equal(parcoursElementStatus(read, 'p', { id: 'caf', fiche: 'caf-allocations' }), 'a_faire')
  assert.equal(parcoursElementStatus(read, 'p', { id: 'legacy', fiche: 'sans-statut' }), 'en_cours')
})

test('Guide : changer une étape liée écrit aussi la fiche, la fiche (source de vérité) en premier', () => {
  assert.deepEqual(parcoursElementWrites('p', { id: 'caf', fiche: 'caf-allocations' }), [
    { refType: 'fiche', slug: 'caf-allocations', element: FICHE_ELEMENT },
    { refType: 'parcours', slug: 'p', element: 'caf' },
  ])
  assert.deepEqual(parcoursElementWrites('p', { id: 'x' }), [{ refType: 'parcours', slug: 'p', element: 'x' }])
})

test('Guide : échec partiel (fiche enregistrée, étape refusée) → rechargement depuis la source, pas de retour arrière', async () => {
  // « Base » simulée : la 1re écriture (fiche) passe, la 2e (étape) échoue.
  const db: Record<string, ProgressStatus> = {}
  let ui: Record<string, ProgressStatus> = {}
  const k = (w: { refType: string; slug: string; element: string }) => `${w.refType}:${w.slug}:${w.element}`
  const writes = parcoursElementWrites('p', { id: 'caf', fiche: 'caf-allocations' })
  for (const w of writes) ui[k(w)] = 'termine' // mise à jour optimiste
  const calls: string[] = []
  let resyncs = 0
  const boom = new Error('réseau')
  await assert.rejects(
    persistOrResync(
      writes,
      async (w) => {
        calls.push(w.refType)
        if (w.refType === 'parcours') throw boom
        db[k(w)] = 'termine'
      },
      async () => { resyncs++; ui = { ...db } },
    ),
    (e) => e === boom,
  )
  assert.deepEqual(calls, ['fiche', 'parcours'])
  assert.equal(resyncs, 1)
  // L'écran reflète la base : la fiche reste terminée, donc l'étape liée aussi (statut effectif).
  const read = (r: string, s: string, e: string) => ui[`${r}:${s}:${e}`]
  assert.equal(parcoursElementStatus(read, 'p', { id: 'caf', fiche: 'caf-allocations' }), 'termine')
  assert.equal(ui['parcours:p:caf'], undefined)
})

test('Guide : 1re écriture (fiche) refusée → étape jamais écrite, rechargement ; succès → aucun rechargement', async () => {
  const writes = parcoursElementWrites('p', { id: 'caf', fiche: 'caf-allocations' })
  const calls: string[] = []
  let resyncs = 0
  await assert.rejects(persistOrResync(writes, async (w) => { calls.push(w.refType); throw new Error('x') }, async () => { resyncs++ }))
  assert.deepEqual(calls, ['fiche'])
  assert.equal(resyncs, 1)
  // Un rechargement en échec ne masque pas l'erreur d'écriture.
  const boom = new Error('écriture')
  await assert.rejects(persistOrResync(writes, async () => { throw boom }, async () => { throw new Error('resync') }), (e) => e === boom)
  resyncs = 0
  await persistOrResync(writes, async () => undefined, async () => { resyncs++ })
  assert.equal(resyncs, 0)
})

test('territoires : traduction du contenu, sinon catalogue, jamais « Guyane » en EN/PT', () => {
  assert.equal(territoryDisplayName('guyane', 'Guyane', 'Guyane', 'fr'), 'Guyane')
  assert.equal(territoryDisplayName('guyane', 'Guyane', 'Guyane', 'en'), 'French Guiana')
  assert.equal(territoryDisplayName('guyane', 'Guyane', 'Guyane', 'pt'), 'Guiana Francesa')
  assert.equal(territoryDisplayName('guyane', 'Guyane', 'Guyane (EN)', 'en'), 'Guyane (EN)')
  assert.equal(territoryDisplayName('inconnu', 'Inconnu', 'Inconnu', 'en'), 'Inconnu')
  assert.equal(territoryDisplayName('reunion', 'La Réunion', 'La Réunion', 'pt'), 'Reunião')
})

test('coffre : compteurs = documents de la liste (plus de « 12 » figé pour Dossier JAF)', () => {
  const cats = withDemoCounts(VAULT_CATEGORIES, VAULT_DOCS)
  const total = cats.reduce((s, c) => s + c.count, 0)
  const listed = VAULT_DOCS.filter((d) => cats.some((c) => c.id === d.categoryId)).length
  assert.equal(total, listed)
  assert.equal(cats.find((c) => c.id === 'jaf')!.count, VAULT_DOCS.filter((d) => d.categoryId === 'jaf').length)
})
