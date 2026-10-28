import type { TemplateField, TemplateValues } from '@/lib/modeles/template'

/**
 * Valeurs à valider : chaque champ du modèle est présent (chaîne vide s'il n'a jamais été touché).
 * Sans cela, zod signale un champ absent avec son message par défaut, en anglais (« Required »),
 * au lieu du message traduit du schéma (« Champ obligatoire. » / « Required field. » / « Campo obrigatório. »).
 */
export function completeTemplateValues(fields: Pick<TemplateField, 'key'>[], values: TemplateValues): TemplateValues {
  const out: TemplateValues = {}
  for (const f of fields) out[f.key] = values[f.key] ?? ''
  return out
}
