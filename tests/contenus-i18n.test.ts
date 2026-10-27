/** lib/contenus/i18n : superposition des traductions sur le français (invariants, repli, structure). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkTranslation, contentLangAttr, isInvariantPath, localizeData, localizeWithLang, overlayTranslation,
  prefillTranslation, sanitizeTranslations, toContentLocale, translationStatus,
} from '../lib/contenus/i18n'
import type { ContentData } from '../lib/contenus/types'

const fiche: ContentData['fiche'] = {
  slug: 'acte-naissance',
  territoire: 'guyane',
  categorie: 'naissance',
  titre: 'Obtenir un acte de naissance',
  resume: 'Demander une copie ou un extrait d’acte de naissance pour votre enfant.',
  aQuoiCaSert: 'L’acte de naissance est demandé pour de nombreuses démarches.',
  quiEstConcerne: ['Les parents', 'L’enfant majeur'],
  aSavoir: ['La demande est gratuite.'],
  documents: [],
  etapes: [{ titre: 'Faire la demande en ligne', detail: 'Sur le site de la commune.' }],
  ou: [{ nom: 'Mairie du lieu de naissance', url: 'https://www.service-public.fr', telephone: '05 94 00 00 00' }],
  liens: [{ titre: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/F1427' }],
  actions: [],
  datesLimites: [],
  aConfirmer: [],
  motsCles: ['acte', 'naissance'],
  derniereVerification: '2026-10-20',
  sources: [{ titre: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/F1427', verifieLe: '2026-10-20' }],
}

const en = {
  slug: 'birth-certificate', // invariant : doit rester celui du français
  territoire: 'french-guiana', // invariant
  categorie: 'sante', // invariant
  titre: 'Get a birth certificate',
  resume: 'Request a copy or an extract of your child’s birth certificate.',
  aQuoiCaSert: 'The birth certificate is required for many procedures.',
  quiEstConcerne: ['Parents', 'The adult child'],
  aSavoir: ['The request is free.'],
  documents: [],
  etapes: [{ titre: 'Apply online', detail: 'On the town hall website.' }],
  ou: [{ nom: 'Town hall of the place of birth', url: 'https://evil.example.com', telephone: '00 00' }],
  liens: [{ titre: 'Service-public.fr (French government site)', url: 'https://evil.example.com/phishing' }],
  actions: [],
  datesLimites: [],
  aConfirmer: [],
  motsCles: ['certificate', 'birth'],
  derniereVerification: '2030-01-01',
  sources: [{ titre: 'Service-public.fr', url: 'https://evil.example.com', verifieLe: '2030-01-01' }],
}

test('textes traduits, invariants forcés depuis le français (à toute profondeur)', () => {
  const out = localizeData('fiche', fiche, en)
  assert.equal(out.titre, 'Get a birth certificate')
  assert.deepEqual(out.quiEstConcerne, ['Parents', 'The adult child'])
  assert.equal(out.etapes[0].detail, 'On the town hall website.')
  assert.equal(out.ou[0].nom, 'Town hall of the place of birth')
  assert.deepEqual(out.motsCles, ['certificate', 'birth'])
  // Invariants : identifiants, catégorie, URL, téléphone, dates.
  assert.equal(out.slug, 'acte-naissance')
  assert.equal(out.territoire, 'guyane')
  assert.equal(out.categorie, 'naissance')
  assert.equal(out.ou[0].url, 'https://www.service-public.fr')
  assert.equal(out.ou[0].telephone, '05 94 00 00 00')
  assert.equal(out.liens[0].url, fiche.liens[0].url)
  assert.equal(out.liens[0].titre, 'Service-public.fr (French government site)')
  assert.equal(out.sources[0].url, fiche.sources[0].url)
  assert.equal(out.sources[0].verifieLe, '2026-10-20')
  assert.equal(out.derniereVerification, '2026-10-20')
})

test('le français n’est jamais modifié (pas de partage de références)', () => {
  const before = JSON.stringify(fiche)
  const out = localizeData('fiche', fiche, en)
  out.ou[0].url = 'https://changed.example.com'
  assert.equal(JSON.stringify(fiche), before)
})

test('repli français : traduction absente, nulle ou non objet', () => {
  assert.equal(localizeData('fiche', fiche, undefined), fiche)
  assert.equal(localizeData('fiche', fiche, null), fiche)
  assert.equal(localizeData('fiche', fiche, 'texte'), fiche)
  assert.equal(localizeData('fiche', fiche, ['x']), fiche)
})

test('traduction partielle : textes manquants ou vides repris du français', () => {
  const out = localizeData('fiche', fiche, { titre: 'Get a birth certificate', resume: '   ' })
  assert.equal(out.titre, 'Get a birth certificate')
  assert.equal(out.resume, fiche.resume)
  assert.equal(out.aQuoiCaSert, fiche.aQuoiCaSert)
  assert.deepEqual(out.etapes, fiche.etapes)
})

test('tableau de longueur différente : toute la traduction est refusée (français)', () => {
  const tr = { ...en, quiEstConcerne: ['Parents'] }
  assert.equal(localizeData('fiche', fiche, tr), fiche)
  const r = checkTranslation('fiche', fiche, tr)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'structure')
  assert.equal(translationStatus('fiche', fiche, tr), 'a-revoir')
  // Pré-remplissage de l'éditeur : superposition « au mieux », longueur du français.
  const pre = prefillTranslation(fiche, tr)
  assert.deepEqual(pre.quiEstConcerne, ['Parents', 'L’enfant majeur'])
})

test('type inattendu (objet à la place d’un texte) : français', () => {
  assert.equal(localizeData('fiche', fiche, { ...en, titre: { x: 1 } }), fiche)
})

test('traduction invalide pour le schéma (limite de longueur) : français', () => {
  const tr = { ...en, titre: 'x'.repeat(500) }
  assert.equal(localizeData('fiche', fiche, tr), fiche)
  const r = checkTranslation('fiche', fiche, tr)
  assert.equal(!r.ok && r.reason, 'schema')
  assert.ok(!r.ok && r.issues.some((i) => i.path === 'titre'))
})

test('clés en trop dans la traduction : ignorées', () => {
  const out = localizeData('fiche', fiche, { ...en, piege: '<script>alert(1)</script>' }) as Record<string, unknown>
  assert.equal(out.piege, undefined)
})

test('texte facultatif vide en français : on n’ajoute rien', () => {
  const tuto: ContentData['tutoriel'] = { slug: 'bien-demarrer', titre: 'Bien démarrer', resume: '', dureeMin: 5, icone: 'rocket', contenu: 'Texte.', ordre: 10 }
  const out = localizeData('tutoriel', tuto, { titre: 'Getting started', resume: 'Ajout non prévu', contenu: 'Text.', dureeMin: 50, icone: 'star' })
  assert.equal(out.titre, 'Getting started')
  assert.equal(out.resume, '')
  assert.equal(out.dureeMin, 5) // nombre : jamais traduit
  assert.equal(out.icone, 'rocket')
})

test('modèle : le document produit reste en français, libellés traduits', () => {
  const modele: ContentData['modele'] = {
    slug: 'attestation', titre: 'Attestation sur l’honneur', categorie: 'autre', description: 'Une attestation simple.', badge: 'Nouveau',
    champs: [{ key: 'nom', label: 'Votre nom', type: 'texte', obligatoire: true, aide: 'Prénom et nom', exemple: 'Julie Martin', options: [] }],
    corps: 'Je soussigné(e) {{nom}} atteste sur l’honneur.',
    miseEnPage: { type: 'document', expediteur: '{{nom}}', destinataire: '', lieuDate: '', objet: 'Attestation', signature: '{{nom}}', piedDePage: '', logo: true, police: 'helvetica', taille: 'normale', marges: 'normales' },
  }
  const out = localizeData('modele', modele, {
    titre: 'Sworn statement', description: 'A simple statement.', badge: 'Populaire',
    champs: [{ key: 'name', label: 'Your name', type: 'date', aide: 'First and last name', exemple: 'John', options: [] }],
    corps: 'I, {{nom}}, hereby certify.', miseEnPage: { objet: 'Statement' },
  })
  assert.equal(out.titre, 'Sworn statement')
  assert.equal(out.champs[0].label, 'Your name')
  assert.equal(out.champs[0].aide, 'First and last name')
  assert.equal(out.champs[0].key, 'nom')
  assert.equal(out.champs[0].type, 'texte')
  assert.equal(out.champs[0].exemple, 'Julie Martin')
  assert.equal(out.corps, modele.corps)
  assert.equal(out.miseEnPage.objet, 'Attestation')
  assert.equal(out.badge, 'Nouveau')
})

test('localizeWithLang : langue réellement affichée', () => {
  assert.equal(localizeWithLang('fiche', fiche, { en }, 'en').lang, 'en')
  assert.equal(localizeWithLang('fiche', fiche, { en }, 'pt').lang, 'fr')
  assert.equal(localizeWithLang('fiche', fiche, { en }, 'fr').lang, 'fr')
  assert.equal(localizeWithLang('fiche', fiche, { en: { ...en, etapes: [] } }, 'en').lang, 'fr')
})

test('sanitizeTranslations : seulement en/pt, valeurs objets', () => {
  assert.deepEqual(sanitizeTranslations({ en: { a: 1 }, pt: 'x', fr: { a: 1 }, de: {} }), { en: { a: 1 } })
  assert.deepEqual(sanitizeTranslations(null), {})
  assert.deepEqual(sanitizeTranslations([]), {})
})

test('toContentLocale, contentLangAttr, isInvariantPath', () => {
  assert.equal(toContentLocale('en'), 'en')
  assert.equal(toContentLocale('de'), 'fr')
  assert.equal(toContentLocale(undefined), 'fr')
  assert.equal(contentLangAttr('fr', 'en'), 'fr')
  assert.equal(contentLangAttr('pt', 'en'), 'pt-BR')
  assert.equal(contentLangAttr('en', 'en'), undefined)
  assert.equal(contentLangAttr(undefined, 'en'), undefined)
  assert.equal(isInvariantPath('ou.0.url'), true)
  assert.equal(isInvariantPath('miseEnPage.objet'), true)
  assert.equal(isInvariantPath('champs.2.label'), false)
  assert.equal(isInvariantPath('titre'), false)
  assert.equal(isInvariantPath(undefined), false)
})

test('overlayTranslation signale une structure différente', () => {
  assert.equal(overlayTranslation({ a: ['x', 'y'] }, { a: ['x'] }).mismatch, true)
  assert.equal(overlayTranslation({ a: ['x', 'y'] }, { a: 'x' }).mismatch, true)
  assert.equal(overlayTranslation({ a: ['x', 'y'] }, {}).mismatch, false)
})
