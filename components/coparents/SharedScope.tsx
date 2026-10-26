import { Check, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { card } from '@/components/ui/kit'

const SHARED = [
  'Fiche de l’enfant (identité, classe, mensurations)',
  'Santé : vaccinations, traitements, informations médicales (parents uniquement)',
  'Calendrier : événements liés à l’enfant, sauf ceux rendus privés',
  'Documents du coffre que vous choisissez de partager',
  'Dépenses que vous marquez « partagées » (montant, catégorie, titre, date)',
]
const PRIVATE = [
  'Votre Journal personnel (preuve personnelle)',
  'Le Coach IA et ses analyses',
  'Vos témoignages',
  'Vos documents et dépenses non partagés',
]

/** Rappel clair de ce que voit un adulte lié, et de ce qui ne quitte jamais votre espace. */
export function SharedScope({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <section aria-labelledby="scope-title" className={cn(card, 'p-4', className)}>
      <h2 id="scope-title" className="text-[15px] font-bold text-night-900">Ce qui est partagé</h2>
      {!compact && (
        <p className="mt-1 text-[13px] text-night-600">
          Avec un adulte lié en tant que <strong className="font-semibold text-night-800">parent</strong>. Un <strong className="font-semibold text-night-800">proche</strong> voit seulement le prénom, la classe et le calendrier partagé (hors rendez-vous de santé), jamais de donnée de santé.
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {SHARED.map((s) => (
          <li key={s} className="flex gap-2.5 text-[13px] text-night-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" strokeWidth={2.6} />
            {s}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-[14px] font-bold text-night-900">Toujours privé</h3>
      <ul className="mt-2 space-y-2">
        {PRIVATE.map((s) => (
          <li key={s} className="flex gap-2.5 text-[13px] text-night-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-night-600" aria-hidden="true" />
            {s}
          </li>
        ))}
      </ul>
    </section>
  )
}
