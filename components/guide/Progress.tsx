'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronRight, CircleCheck, ListChecks } from 'lucide-react'
import { cn } from '@/lib/cn'
import { countProgress, useGuideProgress } from '@/lib/guide/progress'
import { FICHE_ELEMENT, PROGRESS_STATUSES, type Fiche, type Parcours, type ProgressStatus } from '@/lib/guide/types'
import { ficheHref, parcoursHref } from '@/lib/guide/links'

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-2 w-full overflow-hidden rounded-full bg-night-100"
    >
      <div className="h-full rounded-full bg-leaf-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${value}%` }} />
    </div>
  )
}

/** Carte de parcours avec progression (accueil du guide). */
export function ParcoursCard({ parcours, territoire }: { parcours: Parcours; territoire: string }) {
  const t = useTranslations('coach.guide.progress')
  const { getParcoursElement } = useGuideProgress(territoire)
  const p = countProgress(parcours.elements.map((e) => getParcoursElement(parcours.slug, e)))
  return (
    <Link
      href={parcoursHref(parcours.slug, territoire)}
      className="group flex h-full flex-col rounded-2xl border border-night-100 bg-white p-4 transition-shadow duration-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
    >
      <span className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-50 text-leaf-700">
          <ListChecks className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold text-night-900">{parcours.titre}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-night-600">{parcours.resume}</span>
        </span>
        <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-leaf-600 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="mt-auto block pt-4">
        <span className="mb-1.5 flex justify-between text-[12.5px] font-semibold text-night-700">
          <span>{t('doneOf', { done: p.termine, total: p.total })}</span>
          <span>{t('percent', { value: p.pourcent })}</span>
        </span>
        <ProgressBar value={p.pourcent} label={t('ariaLabel', { title: parcours.titre })} />
      </span>
    </Link>
  )
}

/** Contrôle segmenté À faire / En cours / Terminé (groupe de boutons radio). */
function StatusControl({ value, onChange, label, disabled }: { value: ProgressStatus; onChange: (s: ProgressStatus) => void; label: string; disabled?: boolean }) {
  const t = useTranslations('coach.guide.progress')
  const name = useId()
  return (
    <fieldset className="mt-3 disabled:opacity-60" disabled={disabled}>
      <legend className="sr-only">{t('statusLegend', { label })}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-night-50 p-1">
        {PROGRESS_STATUSES.map((s) => (
          <label
            key={s}
            className={cn(
              'relative flex min-h-[40px] cursor-pointer items-center has-[:disabled]:cursor-not-allowed justify-center gap-1 rounded-lg px-1 text-center text-[12.5px] font-semibold transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-500',
              value === s ? (s === 'termine' ? 'bg-leaf-500 text-white' : 'bg-white text-leaf-700 shadow-soft ring-1 ring-leaf-200') : 'text-night-700 hover:bg-white/70',
            )}
          >
            <input type="radio" name={name} value={s} checked={value === s} onChange={() => onChange(s)} className="sr-only" />
            {value === s && <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />}
            {t(`status.${s}`)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Chargement de la progression : erreur + « Réessayer », ou indication de chargement. */
function LoadNotice({ ready, error, retry }: { ready: boolean; error: string | null; retry: () => void }) {
  const t = useTranslations('coach.guide.progress')
  if (error) {
    return (
      <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-alert-50 px-3 py-2 text-[13px] font-medium text-alert-700">
        <span>{error}</span>
        <button
          type="button"
          onClick={retry}
          className="inline-flex min-h-[40px] items-center rounded-lg px-3 font-semibold text-alert-800 underline underline-offset-2 hover:bg-alert-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
        >
          {t('retry')}
        </button>
      </div>
    )
  }
  if (!ready) return <p role="status" className="mt-3 text-[12.5px] text-night-600">{t('loading')}</p>
  return null
}

function useSaveError() {
  const t = useTranslations('coach.guide.progress')
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : t('saveFailed')) }
  }
  return { error, run }
}

/** Liste des éléments d'un parcours, chacun avec son statut et sa fiche liée. */
export function ParcoursChecklist({ parcours, territoire, ficheTitles }: { parcours: Parcours; territoire: string; ficheTitles: Record<string, string> }) {
  const t = useTranslations('coach.guide.progress')
  // Étape liée à une fiche = même démarche : statut partagé avec la fiche (lib/guide/progress-rules).
  const { getParcoursElement, setParcoursElement, ready, error: loadError, retry } = useGuideProgress(territoire)
  const { error, run } = useSaveError()
  const statuses = parcours.elements.map((e) => getParcoursElement(parcours.slug, e))
  const p = countProgress(statuses)

  return (
    <div>
      <div className="rounded-2xl bg-leaf-50 p-4 ring-1 ring-leaf-100">
        <p className="mb-2 flex justify-between text-[13px] font-semibold text-leaf-800">
          <span>{t('doneOf', { done: p.termine, total: p.total })}{p.enCours > 0 ? t('inProgress', { count: p.enCours }) : ''}</span>
          <span>{t('percent', { value: p.pourcent })}</span>
        </p>
        <ProgressBar value={p.pourcent} label={t('ariaLabel', { title: parcours.titre })} />
      </div>
      <LoadNotice ready={ready} error={loadError} retry={retry} />
      {error && <p role="alert" className="mt-3 rounded-xl bg-alert-50 px-3 py-2 text-[13px] font-medium text-alert-700">{error}</p>}
      <ol className="mt-4 space-y-3" aria-busy={!ready}>
        {parcours.elements.map((e, i) => {
          const s = statuses[i]
          return (
            <li key={e.id} className={cn('rounded-2xl border p-4', s === 'termine' ? 'border-leaf-200 bg-leaf-50/40' : 'border-night-100 bg-white')}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', s === 'termine' ? 'bg-leaf-500 text-white' : 'bg-night-50 text-night-700')}>
                  {s === 'termine' ? <Check className="h-4 w-4" strokeWidth={2.25} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold leading-snug text-night-900">{e.titre}</h3>
                  {e.detail && <p className="mt-0.5 text-[13px] leading-snug text-night-600">{e.detail}</p>}
                  {e.fiche && (
                    <Link href={ficheHref(e.fiche, territoire)} className="mt-1.5 inline-flex min-h-[32px] items-center gap-1 text-[13px] font-semibold text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                      {t('seeFiche')}<span className="sr-only"> {ficheTitles[e.fiche] ?? ''}</span>
                      <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
              <StatusControl value={s} label={e.titre} disabled={!ready} onChange={(v) => run(() => setParcoursElement(parcours.slug, e, v))} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Checklist des documents d'une fiche + bouton « Marquer comme terminé ». */
export function FicheChecklist({ fiche, territoire }: { fiche: Fiche; territoire: string }) {
  const t = useTranslations('coach.guide.progress')
  const { get, set, ready, error: loadError, retry } = useGuideProgress(territoire)
  const { error, run } = useSaveError()
  const checked = fiche.documents.filter((d) => get('fiche', fiche.slug, d.id) === 'termine').length

  return (
    <div>
      {fiche.documents.length > 0 && (
        <>
          <p className="text-[12.5px] font-semibold text-night-600" aria-live="polite">{t('readyOf', { done: checked, total: fiche.documents.length })}</p>
          <ul className="mt-2 space-y-2">
            {fiche.documents.map((d) => {
              const isOn = get('fiche', fiche.slug, d.id) === 'termine'
              return (
                <li key={d.id}>
                  <label className={cn('flex cursor-pointer items-start has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-500', isOn ? 'border-leaf-200 bg-leaf-50/50' : 'border-night-100 bg-white hover:bg-night-50')}>
                    <input
                      type="checkbox"
                      checked={isOn}
                      disabled={!ready}
                      onChange={(ev) => run(() => set('fiche', fiche.slug, d.id, ev.target.checked ? 'termine' : 'a_faire'))}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-night-300 accent-leaf-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[14px] font-semibold leading-snug', isOn ? 'text-night-600 line-through decoration-night-300' : 'text-night-900')}>{d.libelle}</span>
                      {d.detail && <span className="mt-0.5 block text-[12.5px] leading-snug text-night-600">{d.detail}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {fiche.documents.length > 0 && <LoadNotice ready={ready} error={loadError} retry={retry} />}
      {error && <p role="alert" className="mt-3 rounded-xl bg-alert-50 px-3 py-2 text-[13px] font-medium text-alert-700">{error}</p>}
    </div>
  )
}

/** Bouton principal de la fiche : « Marquer comme terminé » (bascule). */
export function MarkDoneButton({ fiche, territoire }: { fiche: Fiche; territoire: string }) {
  const t = useTranslations('coach.guide.progress')
  const { get, set, ready, error: loadError, retry } = useGuideProgress(territoire)
  const { error, run } = useSaveError()
  const done = get('fiche', fiche.slug, FICHE_ELEMENT) === 'termine'
  return (
    <div>
      <button
        type="button"
        aria-pressed={done}
        disabled={!ready}
        onClick={() => run(() => set('fiche', fiche.slug, FICHE_ELEMENT, done ? 'a_faire' : 'termine'))}
        className={cn(
          'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 transition-[transform,background-color] duration-200 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
          done ? 'border border-leaf-200 bg-leaf-50 text-leaf-800 hover:bg-leaf-100' : 'bg-leaf-500 text-white shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)] hover:bg-leaf-600',
        )}
      >
        <CircleCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        {done ? t('done') : t('markDone')}
      </button>
      {done && ready && <p className="mt-1.5 text-center text-[12.5px] text-night-600">{t('undoHint')}</p>}
      <LoadNotice ready={ready} error={loadError} retry={retry} />
      {error && <p role="alert" className="mt-2 text-[13px] font-medium text-alert-700">{error}</p>}
    </div>
  )
}

/** Pastille de statut d'une fiche dans une liste. */
export function FicheStatusBadge({ slug, territoire }: { slug: string; territoire: string }) {
  const t = useTranslations('coach.guide.progress')
  const { get } = useGuideProgress(territoire)
  if (get('fiche', slug, FICHE_ELEMENT) !== 'termine') return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-leaf-100 px-2 py-0.5 text-[11.5px] font-semibold text-leaf-800">
      <Check className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />{t('badgeDone')}
    </span>
  )
}
