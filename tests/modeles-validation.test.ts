/** Modèles : « Télécharger en PDF » sans rien remplir → messages de validation traduits, jamais « Required » (zod). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valuesSchemaFor, type TemplateField } from '../lib/modeles/template'
import { completeTemplateValues } from '../components/modeles/formValues'

const fields = [
  { key: 'nom', label: 'Nom', type: 'texte', obligatoire: true, options: [] },
  { key: 'date', label: 'Date', type: 'date', obligatoire: true, options: [] },
  { key: 'tel', label: 'Téléphone', type: 'telephone', obligatoire: false, options: [] },
] as unknown as TemplateField[]

function messagesFor(lang: string): string[] {
  const g = globalThis as { document?: unknown }
  g.document = { documentElement: { lang } }
  try {
    const r = valuesSchemaFor(fields).safeParse(completeTemplateValues(fields, {}))
    assert.equal(r.success, false)
    return r.success ? [] : r.error.issues.map((i) => i.message)
  } finally {
    delete g.document
  }
}

test('formulaire vide : chaque champ obligatoire a le message traduit (FR/EN/PT)', () => {
  assert.deepEqual(messagesFor('fr'), ['Champ obligatoire.', 'Champ obligatoire.'])
  assert.deepEqual(messagesFor('en'), ['Required field.', 'Required field.'])
  assert.deepEqual(messagesFor('pt'), ['Campo obrigatório.', 'Campo obrigatório.'])
})

test('sans complétion, zod renvoyait son message anglais par défaut (cause du bug)', () => {
  const r = valuesSchemaFor(fields).safeParse({})
  assert.equal(r.success, false)
  assert.ok(!r.success && r.error.issues.some((i) => i.message === 'Required'))
})

test('completeTemplateValues garde les saisies et ne crée que les clés du modèle', () => {
  assert.deepEqual(completeTemplateValues(fields, { nom: 'Julie', autre: 'x' }), { nom: 'Julie', date: '', tel: '' })
})
