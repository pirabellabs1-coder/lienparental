import { useTranslations } from 'next-intl'
import { ageFromBirthDate, type Child } from '@/lib/mock-data'
import { childClassKey } from '@/components/onboarding/fields'

// Libellés des listes de valeurs livrées dans le code (lib/mock-data : classes, couleurs,
// groupe sanguin, allergies). La valeur stockée reste le libellé français ; seul l'affichage
// est traduit. Une valeur inconnue (saisie libre, ancienne donnée) est affichée telle quelle.

const EYE_KEYS: Record<string, string> = { Marron: 'brown', Noisette: 'hazel', Vert: 'green', Bleu: 'blue', Gris: 'grey', Autre: 'other' }
const HAIR_KEYS: Record<string, string> = { Blonds: 'blond', 'Châtains': 'lightBrown', Bruns: 'darkBrown', Roux: 'red', Noirs: 'black', Autre: 'other' }
const BLOOD_KEYS: Record<string, string> = { Inconnu: 'unknown' }
const ALLERGY_KEYS: Record<string, string> = {
  Arachides: 'peanuts', Pollen: 'pollen', Lactose: 'lactose', Gluten: 'gluten', 'Œuf': 'egg',
  'Fruits à coque': 'treeNuts', Acariens: 'dustMites', 'Poils d’animaux': 'petHair', 'Pénicilline': 'penicillin',
}

export function useChildLabels() {
  const t = useTranslations('family.children.values')
  // Classes : clés partagées avec l'onboarding (public.onboarding.classes, childClassKey).
  const tClasses = useTranslations('public.onboarding.classes')
  const pick = (group: string, keys: Record<string, string>) => (v: string | undefined | null) => {
    if (!v) return v ?? ''
    const k = keys[v]
    return k ? t(`${group}.${k}`) : v
  }
  const classLabel = (v: string | undefined | null) => {
    if (!v) return v ?? ''
    const k = childClassKey(v)
    return k ? tClasses(k) : v
  }
  /** "5 ans", "1 an", "8 mois" — pluriels ICU. */
  const ageLabel = (child: Pick<Child, 'age' | 'dateNaissance'>) => {
    if (child.dateNaissance) {
      const years = ageFromBirthDate(child.dateNaissance)
      if (years === 0) {
        const b = new Date(child.dateNaissance)
        const now = new Date()
        const months = Math.max((now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth(), 0)
        return t('ageMonths', { count: months })
      }
      return t('ageYears', { count: years })
    }
    return t('ageYears', { count: child.age })
  }
  return {
    classLabel,
    classOptions: (values: string[]) => values.map((v) => ({ value: v, label: classLabel(v) })),
    eyeLabel: pick('eyes', EYE_KEYS),
    hairLabel: pick('hair', HAIR_KEYS),
    bloodLabel: pick('blood', BLOOD_KEYS),
    allergyLabel: pick('allergies', ALLERGY_KEYS),
    options: (values: string[], label: (v: string) => string) => values.map((v) => ({ value: v, label: label(v) })),
    ageLabel,
  }
}
