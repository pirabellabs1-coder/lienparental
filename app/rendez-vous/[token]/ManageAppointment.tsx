'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { CalendarCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

// Lien de l'e-mail d'un rendez-vous : confirmer (réservation tenue 30 min), voir, déplacer, annuler.
// La confirmation demande un clic (un lecteur de liens automatique ne confirme rien). Textes dans la
// langue du rendez-vous (FR / EN / PT), connue après lecture ; avant, français. Le même lien reste
// valable après un déplacement.

type View = {
  ref: string; status: 'pending' | 'confirmed' | 'cancelled' | 'expired'; start: string; date: string; time: string
  topic: string; typeCode: string; language: 'fr' | 'en' | 'pt'; canChange: boolean
}
type Slot = { start: string; date: string; time: string }

const T = {
  fr: {
    title: 'Votre rendez-vous', tz: 'heure de Cayenne', ref: 'Référence', topic: 'Motif', loading: 'Chargement…',
    notFound: 'Ce lien n’est pas valide.', pendingNote: 'Ce créneau vous est réservé : confirmez-le pour finaliser le rendez-vous.',
    confirm: 'Confirmer ce rendez-vous', confirmed: 'Rendez-vous confirmé. Vous pouvez le modifier ou l’annuler ici jusqu’à 2 heures avant.',
    expired: 'Le délai de confirmation (30 minutes) est dépassé : le créneau a été libéré. Reprenez rendez-vous depuis l’assistant du site.',
    cancelled: 'Ce rendez-vous est annulé.', tooLate: 'Ce rendez-vous commence dans moins de 2 heures : il ne peut plus être modifié en ligne.',
    move: 'Déplacer', cancel: 'Annuler le rendez-vous', confirmCancel: 'Oui, annuler', keep: 'Garder ce rendez-vous',
    pick: 'Choisissez un nouveau créneau :', none: 'Aucun autre créneau disponible pour le moment.',
    moved: 'Rendez-vous déplacé au', sameLink: 'Ce lien reste valable pour le nouveau rendez-vous.', emailSent: 'Un e-mail de confirmation vous a été envoyé.',
    done: 'Votre rendez-vous a bien été annulé.', error: 'La demande n’a pas abouti. Réessayez dans un instant.', home: 'Retour au site',
  },
  en: {
    title: 'Your appointment', tz: 'Cayenne time', ref: 'Reference', topic: 'Topic', loading: 'Loading…',
    notFound: 'This link is not valid.', pendingNote: 'This slot is held for you: confirm it to finalise the appointment.',
    confirm: 'Confirm this appointment', confirmed: 'Appointment confirmed. You can change or cancel it here up to 2 hours before.',
    expired: 'The 30-minute confirmation window has passed: the slot has been released. Please book again from the website assistant.',
    cancelled: 'This appointment is cancelled.', tooLate: 'This appointment starts in less than 2 hours: it can no longer be changed online.',
    move: 'Move', cancel: 'Cancel the appointment', confirmCancel: 'Yes, cancel', keep: 'Keep this appointment',
    pick: 'Choose a new slot:', none: 'No other slot is available right now.',
    moved: 'Appointment moved to', sameLink: 'This link remains valid for the new appointment.', emailSent: 'A confirmation e-mail has been sent to you.',
    done: 'Your appointment has been cancelled.', error: 'The request did not go through. Please try again in a moment.', home: 'Back to the website',
  },
  pt: {
    title: 'Sua reunião', tz: 'hora de Caiena', ref: 'Referência', topic: 'Motivo', loading: 'Carregando…',
    notFound: 'Este link não é válido.', pendingNote: 'Este horário está reservado para você: confirme para finalizar a reunião.',
    confirm: 'Confirmar esta reunião', confirmed: 'Reunião confirmada. Você pode alterá-la ou cancelá-la aqui até 2 horas antes.',
    expired: 'O prazo de confirmação (30 minutos) passou: o horário foi liberado. Marque novamente pelo assistente do site.',
    cancelled: 'Esta reunião foi cancelada.', tooLate: 'Esta reunião começa em menos de 2 horas: não pode mais ser alterada on-line.',
    move: 'Remarcar', cancel: 'Cancelar a reunião', confirmCancel: 'Sim, cancelar', keep: 'Manter esta reunião',
    pick: 'Escolha um novo horário:', none: 'Nenhum outro horário disponível no momento.',
    moved: 'Reunião remarcada para', sameLink: 'Este link continua válido para a nova reunião.', emailSent: 'Um e-mail de confirmação foi enviado.',
    done: 'Sua reunião foi cancelada.', error: 'O pedido não foi concluído. Tente novamente em instantes.', home: 'Voltar ao site',
  },
}

export function ManageAppointment({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'moving' | 'confirmCancel'>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = T[view?.language ?? 'fr']
  const url = `/api/rendez-vous/${encodeURIComponent(token)}`

  const load = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) return setState('notfound')
      setView((await r.json()) as View)
      setState('ready')
    } catch {
      setState('notfound')
    }
  }, [url])
  useEffect(() => { void load() }, [load])

  const post = async (body: object) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await r.json().catch(() => null)) as { date?: string; time?: string; emailSent?: boolean; error?: { message?: string } } | null
      if (!r.ok) {
        setError(data?.error?.message ?? t.error)
        return null
      }
      return data ?? {}
    } catch {
      setError(t.error)
      return null
    } finally {
      setBusy(false)
    }
  }

  const startMove = async () => {
    if (!view) return
    setState('moving')
    setSlots(null)
    try {
      const r = await fetch(`/api/assistant/creneaux?${new URLSearchParams({ type: view.typeCode, lang: view.language })}`)
      const data = (await r.json().catch(() => null)) as { slots?: Slot[] } | null
      setSlots((data?.slots ?? []).filter((s) => s.start !== view.start))
    } catch {
      setSlots([])
    }
  }

  const btn = 'flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-bold disabled:opacity-60'
  const status = view?.status

  return (
    <div data-safe-all className="min-h-dvh bg-[#f6f7fb] px-4 py-10 pwa-safe">
      <main className="mx-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_24px_60px_-24px_rgba(11,45,91,0.18)] ring-1 ring-night-100" lang={view?.language ?? 'fr'}>
        <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-night-900">
          <CalendarCheck className="h-6 w-6 text-iris-600" aria-hidden />
          {t.title}
        </h1>

        {state === 'loading' && <p role="status" className="mt-6 flex items-center gap-2 text-night-700"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.loading}</p>}
        {state === 'notfound' && <p className="mt-6 text-[15px] text-night-800">{t.notFound}</p>}

        {view && state !== 'loading' && state !== 'notfound' && (
          <div className="mt-6 space-y-4">
            <div className={cn('rounded-2xl p-4 ring-1', status === 'cancelled' || status === 'expired' ? 'bg-night-50 ring-night-100' : 'bg-iris-50 ring-iris-100')}>
              <p className="text-[17px] font-bold text-night-900 first-letter:uppercase">{view.date} · {view.time}</p>
              <p className="text-[13px] text-night-600">{t.tz}</p>
              <p className="mt-2 text-[14px] text-night-800">{t.topic} : {view.topic}</p>
              <p className="text-[14px] text-night-800">{t.ref} : {view.ref}</p>
            </div>

            {notice && <p role="status" className="rounded-2xl bg-leaf-50 p-4 text-[15px] text-leaf-900 ring-1 ring-leaf-200">{notice}</p>}
            {status === 'cancelled' && !notice && <p role="status" className="text-[15px] font-semibold text-night-800">{t.cancelled}</p>}
            {status === 'expired' && <p role="status" className="text-[15px] text-night-800">{t.expired}</p>}

            {status === 'pending' && state === 'ready' && (
              <div className="space-y-2">
                <p className="text-[14.5px] text-night-700">{t.pendingNote}</p>
                <button type="button" disabled={busy} onClick={async () => {
                  const r = await post({ action: 'confirm' })
                  if (r) { setNotice(`${t.confirmed}${r.emailSent ? ` ${t.emailSent}` : ''}`); await load() } else await load()
                }} className={cn(btn, 'bg-leaf-600 text-white hover:bg-leaf-700')}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{t.confirm}
                </button>
                <button type="button" onClick={() => setState('confirmCancel')} className={cn(btn, 'bg-white text-alert-700 ring-1 ring-alert-200 hover:bg-alert-50')}>{t.cancel}</button>
              </div>
            )}

            {status === 'confirmed' && state === 'ready' && !view.canChange && <p className="text-[14.5px] text-night-700">{t.tooLate}</p>}
            {status === 'confirmed' && view.canChange && state === 'ready' && (
              <div className="space-y-2">
                <button type="button" onClick={() => void startMove()} className={cn(btn, 'bg-iris-600 text-white hover:bg-iris-700')}>{t.move}</button>
                <button type="button" onClick={() => setState('confirmCancel')} className={cn(btn, 'bg-white text-alert-700 ring-1 ring-alert-200 hover:bg-alert-50')}>{t.cancel}</button>
              </div>
            )}

            {state === 'confirmCancel' && (
              <div className="space-y-2">
                <button type="button" disabled={busy} onClick={async () => {
                  if (await post({ action: 'cancel' })) { setNotice(t.done); setState('ready'); await load() }
                }} className={cn(btn, 'bg-alert-600 text-white hover:bg-alert-700')}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{t.confirmCancel}
                </button>
                <button type="button" onClick={() => setState('ready')} className={cn(btn, 'bg-white text-night-800 ring-1 ring-night-200')}>{t.keep}</button>
              </div>
            )}

            {state === 'moving' && (
              <div className="space-y-2">
                {slots === null ? <p role="status" className="flex items-center gap-2 text-night-700"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.loading}</p> : slots.length === 0 ? <p>{t.none}</p> : (
                  <>
                    <p className="text-[14.5px] font-semibold text-night-800">{t.pick}</p>
                    {slots.map((s) => (
                      <button key={s.start} type="button" disabled={busy} onClick={async () => {
                        const r = await post({ action: 'reschedule', start: s.start })
                        if (!r) return
                        setNotice(`${t.moved} ${r.date ?? s.date} · ${r.time ?? s.time} (${t.tz}). ${t.sameLink}${r.emailSent ? ` ${t.emailSent}` : ''}`)
                        setState('ready')
                        await load()
                      }} className="flex w-full justify-between rounded-2xl bg-white px-4 py-3 text-left text-[15px] font-semibold text-iris-700 ring-1 ring-iris-200 hover:bg-iris-50 disabled:opacity-60">
                        <span className="first-letter:uppercase">{s.date}</span><span>{s.time}</span>
                      </button>
                    ))}
                  </>
                )}
                <button type="button" onClick={() => setState('ready')} className="w-full text-[14px] font-semibold text-night-600 underline">{t.keep}</button>
              </div>
            )}

            {error && <p role="alert" className="rounded-xl bg-alert-50 px-3 py-2 text-[14px] text-alert-800">{error}</p>}
          </div>
        )}

        <Link href="/" className="mt-8 inline-block text-[14px] font-semibold text-iris-700 underline">{t.home}</Link>
      </main>
    </div>
  )
}
