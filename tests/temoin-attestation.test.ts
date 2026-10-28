/** Attestation de témoin (art. 202 CPC) : texte français enregistré, traduction de lecture, validation. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileAttestation, compileFacts, formatDay, personRole, type WitnessAnswers } from '../lib/temoin/attestation'
import { identityErrors, witnessDeclarationSchema } from '../lib/temoin/schema'

const answers: WitnessAnswers = {
  parents: [{ nom: 'Julie Martin', lien: 'friend', duree: '6m1y', facts: [{ faits: 'Elle est venue chercher les enfants.', quand: '2026-10-01', ou: 'School', contexte: 'Sortie d’école' }] }],
  children: [{ nom: 'Lina Martin', lien: 'familyFriend', constate: 'Lina était souriante.' }],
  complement: 'Rien d’autre.',
}

test('faits en français : même gabarit qu’avant (texte_original)', () => {
  assert.equal(
    compileFacts(answers, 'fr'),
    'Concernant Julie Martin — lien : Ami(e) — connu(e) depuis : 6 mois à 1 an\n'
      + 'Fait 1 (le 01/10/2026, lieu : École) :\nElle est venue chercher les enfants.\nContexte : Sortie d’école\n\n'
      + 'Concernant Lina Martin — lien : Ami(e) de la famille\nLina était souriante.\n\n'
      + 'Informations complémentaires :\nRien d’autre.',
  )
})

test('traduction de lecture : libellés dans la langue du témoin, données saisies inchangées', () => {
  const en = compileFacts(answers, 'en')
  assert.match(en, /^Regarding Julie Martin — relationship: Friend — known for: 6 months to 1 year/)
  assert.match(en, /Fact 1 \(on 10\/01\/2026, place: School\):/)
  assert.doesNotMatch(en, /Concernant|Ami\(e\)|lien :/)
  const pt = compileFacts(answers, 'pt')
  assert.match(pt, /^Sobre Julie Martin — vínculo: Amigo\(a\)/)
  assert.match(pt, /local: Escola/)
})

test('date du fait sans décalage de fuseau (Guyane UTC-3)', () => {
  assert.equal(formatDay('2026-10-01', 'fr'), '01/10/2026')
  assert.equal(formatDay('2026-10-01', 'pt', 'long'), '1 de outubro de 2026')
})

test('rôles traduits', () => {
  assert.equal(personRole('p_1', 'fr'), 'Parent 1')
  assert.equal(personRole('e_2', 'en'), 'Child 2')
  assert.equal(personRole('e_1', 'pt'), 'Filho(a) 1')
  assert.equal(personRole('x', 'fr'), null)
})

const decl = {
  identity: { nom: 'Silva', prenoms: 'Ana Maria', dateNaissance: '1985-03-02', lieuNaissance: 'Belém (Brésil)', adresse: '3 rue des Palmistes', cp: '97320', ville: 'Saint-Laurent-du-Maroni', pays: '', profession: 'Infirmière' },
  tie: { kind: 'none' as const, detail: '' },
  place: 'Saint-Laurent-du-Maroni',
  date: new Date().toISOString().slice(0, 10),
}

test('attestation française complète : identité, lien, mention pénale, lieu et date', () => {
  const fr = compileAttestation(decl, 'Fait 1 :\nTexte.', 'fr')
  assert.match(fr, /^Je soussigné\(e\) Ana Maria Silva, né\(e\) le 02\/03\/1985 à Belém \(Brésil\), demeurant 3 rue des Palmistes, 97320 Saint-Laurent-du-Maroni, profession : Infirmière,/)
  assert.match(fr, /aucun lien de parenté, d’alliance, de subordination/)
  assert.match(fr, /production en justice .* sanctions pénales \(article 441-7 du Code pénal\)/)
  assert.match(fr, /Fait à Saint-Laurent-du-Maroni, le /)
  const withTie = compileAttestation({ ...decl, tie: { kind: 'kin', detail: 'tante de Lina' } }, 'x', 'fr')
  assert.match(withTie, /le lien suivant : lien de parenté \(tante de Lina\)/)
  assert.doesNotMatch(compileAttestation(decl, 'x', 'pt'), /Je soussigné/)
})

test('validation serveur stricte de la déclaration', () => {
  const ok = witnessDeclarationSchema.safeParse({ ...decl, mention: true, locale: 'pt' })
  assert.equal(ok.success, true)
  assert.equal(witnessDeclarationSchema.safeParse({ ...decl, mention: false, locale: 'pt' }).success, false)
  assert.equal(witnessDeclarationSchema.safeParse({ ...decl, tie: { kind: 'kin', detail: ' ' }, mention: true, locale: 'fr' }).success, false)
  assert.equal(witnessDeclarationSchema.safeParse({ ...decl, date: '2020-01-01', mention: true, locale: 'fr' }).success, false)
  assert.equal(witnessDeclarationSchema.safeParse({ ...decl, mention: true, locale: 'fr', extra: 1 }).success, false)
  assert.deepEqual(identityErrors({ ...decl.identity, nom: '', dateNaissance: '2999-01-01' }), { nom: 'required', dateNaissance: 'birthDateInvalid' })
})
