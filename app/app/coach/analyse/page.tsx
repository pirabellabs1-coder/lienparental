'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Coins, RefreshCw, Sparkles } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ProgressRing } from '@/components/coach/ProgressRing'
import { btn, ScreenTitle } from '@/components/coach/ui'
import { getPendingFile, loadDraft, newIdempotencyKey, saveAnalysis, saveDraft, type CoachAnalysisResult, type CoachDraft } from '@/components/coach/session'
import { errorMessage, readSse } from '@/components/coach/sse-client'
import { cn } from '@/lib/cn'
import { mockCoachCapture } from '@/lib/mock-data'
import { LIVE } from '@/lib/data/core'

const STAGES = ['sending', 'received', 'thinking', 'reading', 'writing', 'done']

// Critères affichés pendant l'analyse (libellés : coach.analysis.checks.<clé>).
const CHECKS = ['tone', 'hurtful', 'clarity', 'respect', 'impact'] as const

/**
 * `quota` : solde de crédits insuffisant (402 insufficient_credits) ; `upgrade` : formule Gratuite ;
 * `duplicate` : même clé d'idempotence déjà traitée (409, aucun second débit).
 */
type Failure = { message: string; quota?: boolean; upgrade?: boolean; duplicate?: boolean }

// M09 — étape 3 « Analyse en cours » (maquette 12.12.07 (2)).
// La progression suit le flux réel de /api/coach/analyze : étapes du serveur, puis
// chaque critère coché quand le modèle l'a effectivement produit.
export default function CoachAnalysePage() {
  const t = useTranslations('coach.analysis')
  const tc = useTranslations('coach.common')
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('sending')
  const [checksDone, setChecksDone] = useState(0)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const started = useRef(-1)
  const mounted = useRef(false)
  const creep = useRef<number | undefined>(undefined)

  const run = useCallback(async () => {
    const draft: CoachDraft | null = loadDraft()
    const form = new FormData()
    let title = mockCoachCapture.title
    let kind: CoachDraft['kind'] = 'capture'
    if (!draft && LIVE) {
      // Compte réel : jamais d'analyse du contenu d'exemple (quota décompté pour rien).
      setFailure({ message: t('noContent') })
      return
    }
    if (!draft) {
      // Parcours de démonstration (aucun import) : la capture d'exemple, transcrite.
      form.set('text', mockCoachCapture.messages.map((m) => m.text).join('\n'))
    } else if (draft.kind === 'message') {
      form.set('text', draft.text ?? '')
      title = tc('kinds.message')
      kind = 'message'
    } else {
      const file = getPendingFile()
      if (!file) {
        setFailure({ message: t('fileGone') })
        return
      }
      form.set('file', file, file.name)
      title = draft.name
      kind = draft.kind
    }

    setFailure(null)
    setProgress(4)
    setStage('sending')
    setChecksDone(0)

    // Clé d'idempotence posée au lancement (écran précédent) : un double envoi ne débite qu'une fois.
    let key = draft?.idempotencyKey
    if (!key) {
      key = newIdempotencyKey()
      if (draft) saveDraft({ ...draft, idempotencyKey: key })
    }

    try {
      const res = await fetch('/api/coach/analyze', { method: 'POST', body: form, headers: { 'Idempotency-Key': key } })
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        let quota = false
        let upgrade = false
        let duplicate = false
        let message: string
        if (res.status === 402 || res.status === 409 || res.status === 429 || res.status === 503) {
          const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string }; upgrade?: boolean; status?: string } | null
          quota = body?.error?.code === 'insufficient_credits'
          // Clé déjà utilisée par une tentative restituée (échec) : rien n'a été débité, on peut relancer.
          duplicate = body?.error?.code === 'duplicate_request' && body?.status !== 'released'
          upgrade = quota && body?.upgrade === true
          message = body?.error?.message ?? (res.status === 429 ? t('tooMany') : tc('errors.generic'))
        } else {
          message = await errorMessage(res, tc('errors.generic'), { sessionExpired: tc('errors.sessionExpired'), tooLarge: tc('errors.tooLarge') })
        }
        if (mounted.current) setFailure({ message, quota, upgrade, duplicate })
        return
      }
      let finished = false
      await readSse(res, (event, data) => {
        if (!mounted.current) return
        const d = data as Record<string, unknown>
        if (event === 'stage' && typeof d.stage === 'string') {
          setStage(d.stage)
          if (d.stage === 'received') setProgress((p) => Math.max(p, 12))
          if (d.stage === 'thinking') {
            setProgress((p) => Math.max(p, 15))
            // Phase de réflexion sans signal intermédiaire : progression lente et bornée (≤ 45 %).
            window.clearInterval(creep.current)
            creep.current = window.setInterval(() => setProgress((p) => (p < 45 ? p + 1 : p)), 700)
          }
          if (d.stage === 'reading') setProgress((p) => Math.max(p, 50))
          if (d.stage === 'writing') setProgress((p) => Math.max(p, 55))
        } else if (event === 'progress' && typeof d.done === 'number') {
          window.clearInterval(creep.current)
          setChecksDone(d.done)
          setProgress((p) => Math.max(p, Math.min(95, 55 + (d.done as number) * 8)))
        } else if (event === 'done' && d.result && typeof d.id === 'string') {
          finished = true
          window.clearInterval(creep.current)
          saveAnalysis({ id: d.id, title, kind, demo: d.demo === true, result: d.result as CoachAnalysisResult })
          // Action terminée : la clé ne doit plus servir (une nouvelle analyse = une nouvelle clé).
          if (draft) saveDraft({ ...draft, idempotencyKey: undefined })
          setChecksDone(5)
          setStage('done')
          setProgress(100)
        } else if (event === 'error' && typeof d.message === 'string') {
          finished = true
          window.clearInterval(creep.current)
          // Échec : crédits restitués côté serveur ; la prochaine tentative aura une nouvelle clé.
          const cur = loadDraft()
          if (cur) saveDraft({ ...cur, idempotencyKey: undefined })
          setFailure({ message: d.message })
        }
      })
      if (!finished && mounted.current) setFailure({ message: t('interrupted') })
    } catch {
      if (mounted.current) setFailure({ message: t('connectionFailed') })
    } finally {
      window.clearInterval(creep.current)
    }
  }, [t, tc])

  useEffect(() => {
    mounted.current = true
    // Garde StrictMode : une seule requête par tentative (pas d'annulation au démontage :
    // si le parent quitte l'écran, l'analyse se termine et reste dans l'historique).
    if (started.current !== attempt) {
      started.current = attempt
      void run()
    }
    return () => {
      mounted.current = false
    }
  }, [attempt, run])

  useEffect(() => {
    if (progress < 100 || failure) return
    const timer = window.setTimeout(() => router.replace('/app/coach/reponse'), 450)
    return () => window.clearTimeout(timer)
  }, [progress, failure, router])

  const done = progress >= 100

  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/coach/document" showBell={false} />

      <div className="w-full px-5 pb-8 pt-8">
        <ScreenTitle
          title={failure ? t('titleFailed') : done ? t('titleDone') : t('titleRunning')}
          subtitle={failure ? undefined : t('subtitle')}
        />

        {failure ? (
          <div className="mt-8 space-y-4">
            <p role="alert" className="rounded-xl2 border border-alert-200 bg-alert-50 p-4 text-[13.5px] leading-relaxed text-night-900">
              {failure.message}
            </p>
            {failure.quota ? (
              <>
                <Link href="/app/coach/credits" className={btn.primary}>
                  <Coins className="h-5 w-5" aria-hidden="true" />
                  {t('buyCredits')}
                </Link>
                {failure.upgrade && (
                  <Link href="/app/abonnement?formule=premium&raison=coach" className={btn.secondary}>
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                    {t('upgrade')}
                  </Link>
                )}
              </>
            ) : failure.duplicate ? (
              <Link href="/app/coach/historique" className={btn.primary}>
                {t('seeHistory')}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Nouvelle tentative explicite : nouvelle clé (la précédente a été restituée).
                  const d = loadDraft()
                  if (d) saveDraft({ ...d, idempotencyKey: newIdempotencyKey() })
                  setAttempt((a) => a + 1)
                }}
                className={btn.primary}
              >
                <RefreshCw className="h-5 w-5" aria-hidden="true" />
                {t('retry')}
              </button>
            )}
            <Link href="/app/coach" className={btn.secondary}>
              {t('back')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-9 flex justify-center">
              <ProgressRing value={progress} />
            </div>

            <p role="status" aria-live="polite" className="mt-4 text-center text-[13px] text-night-700">
              {STAGES.includes(stage) ? t(`stages.${stage}`) : ''}
            </p>

            <section aria-labelledby="analyse-checks" className="mt-8 rounded-xl2 bg-night-50/70 px-5 py-4">
              <h3 id="analyse-checks" className="text-[14px] font-bold text-night-900">
                {t('checksTitle')}
              </h3>
              <ul className="mt-3 space-y-3">
                {CHECKS.map((c, i) => {
                  const checked = checksDone > i
                  return (
                    <li key={c} className="flex items-center gap-3 text-[13px] text-night-800">
                      <span
                        className={cn(
                          'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 motion-safe:transition-colors',
                          checked ? 'border-iris-500 bg-iris-500 text-white' : 'border-iris-200 bg-white text-transparent',
                        )}
                        aria-hidden="true"
                      >
                        <Check className="h-3 w-3" strokeWidth={3.5} />
                      </span>
                      <span>
                        {t(`checks.${c}`)}
                        <span className="sr-only">{checked ? t('checked') : t('pending')}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  )
}
