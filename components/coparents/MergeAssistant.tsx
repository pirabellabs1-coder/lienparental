'use client'

import { useEffect, useId, useState } from 'react'
import { ArrowRight, Copy as Duplicate } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn, card } from '@/components/ui/kit'
import { Modal } from '@/components/ui/Modal'
import type { MergeCandidate } from '@/lib/coparents'
import { frBirth } from './bits'

/** Bandeau « fiche en double » affiché en tête de page. */
export function MergeBanner({ candidate, onOpen }: { candidate: MergeCandidate; onOpen: () => void }) {
  return (
    <li className={cn(card, 'flex flex-wrap items-center gap-3 border-orange-200 bg-orange-50/40 p-4')}>
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-800">
        <Duplicate className="h-5 w-5" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] text-night-800">
        <strong className="font-semibold text-night-900">{candidate.myChild.prenom}</strong> apparaît deux fois : votre fiche et celle partagée par {candidate.sharedChild.ownerPrenom} (né(e) le {frBirth(candidate.dateNaissance)}).
      </p>
      <button type="button" onClick={onOpen} className={cn(btn.secondary, 'w-full sm:w-auto')}>Vérifier et fusionner</button>
    </li>
  )
}

type Props = {
  candidate: MergeCandidate | null
  busy: boolean
  error: string | null
  onClose: () => void
  onMerge: (c: MergeCandidate) => void
  onDismiss: (c: MergeCandidate) => void
}

/** Fusion guidée : comparaison, conséquences, confirmation manuelle explicite. */
export function MergeAssistant({ candidate, busy, error, onClose, onMerge, onDismiss }: Props) {
  const uid = useId()
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => { setConfirmed(false) }, [candidate])

  const born = candidate ? frBirth(candidate.dateNaissance) : ''

  return (
    <Modal
      open={!!candidate}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title="Fusionner deux fiches"
      description="Vérifiez qu’il s’agit bien du même enfant avant de confirmer."
      footer={candidate && (
        <>
          <button type="button" disabled={busy} onClick={() => onDismiss(candidate)} className={btn.secondary}>
            Ce n&apos;est pas le même enfant
          </button>
          <button type="button" disabled={!confirmed || busy} onClick={() => onMerge(candidate)} className={btn.primary}>
            {busy ? 'Fusion en cours…' : 'Fusionner les fiches'}
          </button>
        </>
      )}
    >
      {candidate && (
        <div className="space-y-4">
          <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-xl border border-night-100 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-night-600">Votre fiche</p>
              <p className="mt-1 text-[15px] font-bold text-night-900">{candidate.myChild.prenom}</p>
              <p className="text-[12px] text-night-600">Né(e) le {born}</p>
            </div>
            <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-night-500 sm:rotate-0" aria-hidden="true" />
            <div className="rounded-xl border border-leaf-200 bg-leaf-50/50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-leaf-800">Fiche partagée par {candidate.sharedChild.ownerPrenom}</p>
              <p className="mt-1 text-[15px] font-bold text-night-900">{candidate.sharedChild.prenom}</p>
              <p className="text-[12px] text-night-600">Né(e) le {born}</p>
            </div>
          </div>

          <div>
            <h3 className="text-[14px] font-bold text-night-900">Ce qui va se passer</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] text-night-800">
              <li>Vos vaccinations et traitements sont rattachés à la fiche partagée, visibles des parents liés.</li>
              <li>Vos entrées de Journal, événements, documents et frais pointent vers la fiche partagée. Votre Journal reste privé.</li>
              <li>Les champs vides de la fiche partagée sont complétés avec les vôtres ; rien n&apos;est écrasé.</li>
              <li>Votre fiche en double est archivée. Les adultes que vous y aviez invités devront être invités à nouveau.</li>
            </ul>
          </div>

          <label htmlFor={`${uid}-ok`} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-night-200 p-3">
            <input
              id={`${uid}-ok`}
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-leaf-600"
            />
            <span className="text-[13px] font-semibold text-night-900">Je confirme qu&apos;il s&apos;agit du même enfant.</span>
          </label>

          {error && <p role="alert" className="rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
