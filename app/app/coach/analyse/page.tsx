'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, RefreshCw, Sparkles } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ProgressRing } from '@/components/coach/ProgressRing'
import { btn, ScreenTitle } from '@/components/coach/ui'
import { getPendingFile, loadDraft, saveAnalysis, type CoachAnalysisResult, type CoachDraft } from '@/components/coach/session'
import { errorMessage, readSse } from '@/components/coach/sse-client'
import { cn } from '@/lib/cn'
import { mockCoachAnalysis, mockCoachCapture } from '@/lib/mock-data'
import { LIVE } from '@/lib/data/core'

const STAGE_LABEL: Record<string, string> = {
  sending: 'Envoi du contenu…',
  received: 'Contenu reçu, analyse en préparation…',
  thinking: 'Le Coach réfléchit au contexte…',
  reading: 'Lecture du contenu…',
  writing: 'Rédaction de l’analyse…',
  done: 'Analyse terminée',
}

type Failure = { message: string; quota?: boolean }

// M09 — étape 3 « Analyse en cours » (maquette 12.12.07 (2)).
// La progression suit le flux réel de /api/coach/analyze : étapes du serveur, puis
// chaque critère coché quand le modèle l'a effectivement produit.
export default function CoachAnalysePage() {
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
      setFailure({ message: 'Aucun contenu à analyser. Importez une capture, un document ou un message depuis l’accueil du Coach.' })
      return
    }
    if (!draft) {
      // Parcours de démonstration (aucun import) : la capture d'exemple, transcrite.
      form.set('text', mockCoachCapture.messages.map((m) => m.text).join('\n'))
    } else if (draft.kind === 'message') {
      form.set('text', draft.text ?? '')
      title = 'Message écrit'
      kind = 'message'
    } else {
      const file = getPendingFile()
      if (!file) {
        setFailure({ message: 'Le fichier n’est plus disponible (la page a été rechargée). Importez-le à nouveau.' })
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

    try {
      const res = await fetch('/api/coach/analyze', { method: 'POST', body: form })
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        let quota = false
        let message: string
        if (res.status === 429) {
          const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
          quota = body?.error?.code === 'quota_exceeded'
          message = body?.error?.message ?? 'Trop de demandes. Patientez un instant.'
        } else {
          message = await errorMessage(res)
        }
        if (mounted.current) setFailure({ message, quota })
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
          setChecksDone(5)
          setStage('done')
          setProgress(100)
        } else if (event === 'error' && typeof d.message === 'string') {
          finished = true
          window.clearInterval(creep.current)
          setFailure({ message: d.message })
        }
      })
      if (!finished && mounted.current) setFailure({ message: 'La connexion a été interrompue. Réessayez.' })
    } catch {
      if (mounted.current) setFailure({ message: 'Connexion impossible. Vérifiez votre réseau et réessayez.' })
    } finally {
      window.clearInterval(creep.current)
    }
  }, [])

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
    const t = window.setTimeout(() => router.replace('/app/coach/reponse'), 450)
    return () => window.clearTimeout(t)
  }, [progress, failure, router])

  const checks = mockCoachAnalysis.checks
  const done = progress >= 100

  return (
    <>
      <TopBar title="Coach parental IA" showBack backHref="/app/coach/document" showBell={false} />

      <div className="w-full px-5 pb-8 pt-8">
        <ScreenTitle
          title={failure ? 'Analyse interrompue' : done ? 'Analyse terminée' : 'Analyse en cours…'}
          subtitle={failure ? undefined : 'Notre IA analyse le contenu et le contexte de votre message.'}
        />

        {failure ? (
          <div className="mt-8 space-y-4">
            <p role="alert" className="rounded-xl2 border border-alert-200 bg-alert-50 p-4 text-[13.5px] leading-relaxed text-night-900">
              {failure.message}
            </p>
            {failure.quota ? (
              <Link href="/app/abonnement?formule=premium&raison=coach" className={btn.primary}>
                <Sparkles className="h-5 w-5" aria-hidden="true" />
                Passer à Premium
              </Link>
            ) : (
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className={btn.primary}>
                <RefreshCw className="h-5 w-5" aria-hidden="true" />
                Réessayer
              </button>
            )}
            <Link href="/app/coach" className={btn.secondary}>
              Revenir au Coach
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-9 flex justify-center">
              <ProgressRing value={progress} />
            </div>

            <p role="status" aria-live="polite" className="mt-4 text-center text-[13px] text-night-700">
              {STAGE_LABEL[stage] ?? ''}
            </p>

            <section aria-labelledby="analyse-checks" className="mt-8 rounded-xl2 bg-night-50/70 px-5 py-4">
              <h3 id="analyse-checks" className="text-[14px] font-bold text-night-900">
                Ce que nous analysons
              </h3>
              <ul className="mt-3 space-y-3">
                {checks.map((c, i) => {
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
                        {c}
                        <span className="sr-only">{checked ? ' : vérifié' : ' : en attente'}</span>
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
