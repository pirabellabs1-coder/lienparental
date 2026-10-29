'use client'

import Link from 'next/link'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, FileText, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { localePathFor } from '@/lib/i18n/routing'
import { PARTNER_PROFILES, PARTNER_TERRITORIES, partnerApplicationSchema, type PartnerProfile, type PartnerTerritory } from '@/lib/partenaires/types'
import { PARTNERSHIP_EMAIL } from '@/lib/seo/site'

type Field = 'profil' | 'structure' | 'contactName' | 'email' | 'telephone' | 'territoire' | 'site' | 'reseaux' | 'presentation' | 'proposition' | 'consent'
/** Ordre de focus en cas d'erreurs (ordre visuel du formulaire). */
const ORDER: Field[] = ['profil', 'structure', 'contactName', 'email', 'telephone', 'territoire', 'site', 'reseaux', 'presentation', 'proposition', 'consent']
const MIN_TEXT = 30
const MAX_TEXT = 2000

type Values = {
  profil: PartnerProfile
  structure: string
  contactName: string
  email: string
  telephone: string
  territoire: PartnerTerritory
  site: string
  reseaux: string
  presentation: string
  proposition: string
  consent: boolean
}

const INITIAL: Values = {
  profil: 'association', structure: '', contactName: '', email: '', telephone: '', territoire: 'guyane',
  site: '', reseaux: '', presentation: '', proposition: '', consent: false,
}

const KNOWN = new Set(['required', 'invalidEmail', 'invalidPhone', 'invalidUrl', 'tooShort'])

/** Erreurs zod (client ou renvoyées par l'API) → codes de message par champ. */
function errorsFrom(issues: { path: string; message: string }[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {}
  for (const i of issues) {
    const f = i.path.split('.')[0] as Field
    if (!ORDER.includes(f) || out[f]) continue
    out[f] = f === 'consent' ? 'consent' : KNOWN.has(i.message) ? i.message : 'invalid'
  }
  return out
}

function validate(v: Values): Partial<Record<Field, string>> {
  const r = partnerApplicationSchema.safeParse(v)
  return r.success ? {} : errorsFrom(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
}

const input = 'block w-full rounded-xl border bg-white px-3.5 text-[15px] text-night-900 outline-none transition-colors placeholder:text-night-400 focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100'

function Section({ n, id, title, help, children, className }: { n: number; id: string; title: string; help?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0', className)}>
      <h3 id={id} className="flex items-center gap-3 text-[19px] font-extrabold tracking-[-0.01em] text-night-900">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-leaf-500 text-[14px] font-bold text-white">{n}</span>
        {title}
      </h3>
      {help && <p className="mt-1.5 pl-11 text-[13.5px] text-night-600">{help}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function PartnerApplicationForm() {
  const t = useTranslations('public.partners.apply')
  const lp = localePathFor(useLocale())
  const uid = useId()
  const id = (f: string) => `${uid}-${f}`
  const formRef = useRef<HTMLFormElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)

  const [v, setV] = useState<Values>(INITIAL)
  const [trap, setTrap] = useState('')
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [tried, setTried] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [sendError, setSendError] = useState('')

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    const next = { ...v, [k]: value }
    setV(next)
    // Après une première tentative, les erreurs se mettent à jour pendant la saisie.
    if (tried) setErrors(validate(next))
  }

  const msg = (f: Field) => {
    const code = errors[f]
    if (!code) return ''
    return code === 'tooShort' ? t('errors.tooShort', { min: MIN_TEXT }) : t(`errors.${code}`)
  }
  const a11y = (f: Field, extra?: string) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': cn(errors[f] && id(`${f}-err`), extra) || undefined,
  })
  const ErrorText = ({ f }: { f: Field }) =>
    errors[f] ? (
      <p id={id(`${f}-err`)} className="mt-1.5 flex items-start gap-1.5 text-[13px] font-semibold text-alert-600">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {msg(f)}
      </p>
    ) : null
  const Label = ({ f, children, optional }: { f: Field; children: ReactNode; optional?: boolean }) => (
    <label htmlFor={id(f)} className="mb-1.5 block text-[14px] font-semibold text-night-900">
      {children}
      {optional ? <span className="font-normal text-night-600"> {t('optional')}</span> : <span aria-hidden className="text-alert-500"> *</span>}
    </label>
  )
  const border = (f: Field) => (errors[f] ? 'border-alert-400' : 'border-night-200')

  const focusFirst = (errs: Partial<Record<Field, string>>) => {
    const first = ORDER.find((f) => errs[f])
    if (!first) return
    const el = formRef.current?.querySelector<HTMLElement>(first === 'profil' ? `input[name="profil"]:checked` : `#${CSS.escape(id(first))}`)
    el?.focus()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    setTried(true)
    setSendError('')
    const errs = validate(v)
    setErrors(errs)
    if (Object.keys(errs).length) {
      summaryRef.current?.focus()
      focusFirst(errs)
      return
    }
    setStatus('sending')
    try {
      const res = await fetch('/api/partenaires/candidature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, url_confirm: trap }),
      })
      if (res.status === 201) {
        setStatus('sent')
        requestAnimationFrame(() => successRef.current?.focus())
        return
      }
      setStatus('idle')
      const body = (await res.json().catch(() => null)) as { error?: { issues?: { path: string; message: string }[] } } | null
      if (res.status === 422 && body?.error?.issues?.length) {
        const errs2 = errorsFrom(body.error.issues)
        setErrors(errs2)
        focusFirst(errs2)
        return
      }
      setSendError(res.status === 429 ? t('errors.rateLimited') : t('errors.failed', { email: PARTNERSHIP_EMAIL }))
    } catch {
      setStatus('idle')
      setSendError(t('errors.failed', { email: PARTNERSHIP_EMAIL }))
    }
  }

  const errorCount = Object.keys(errors).length

  if (status === 'sent') {
    return (
      <div className="rounded-[28px] bg-white p-8 text-center ring-1 ring-[#E5E7EB] shadow-[0_1px_2px_rgba(11,45,91,0.04),0_24px_48px_-32px_rgba(11,45,91,0.3)] sm:p-12">
        <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-leaf-50">
          <CheckCircle2 className="h-9 w-9 text-leaf-500" />
        </span>
        <h2 ref={successRef} tabIndex={-1} className="mt-4 text-[26px] font-extrabold text-night-900 outline-none">{t('success.title')}</h2>
        <p className="mx-auto mt-3 max-w-[48ch] text-[15.5px] leading-relaxed text-night-700" role="status">
          {t('success.text', { email: v.email })}
        </p>
        <Link href={lp('/partenaires')} className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full px-5 font-semibold text-leaf-700 ring-1 ring-inset ring-leaf-200 hover:bg-leaf-50">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t('success.back')}
        </Link>
      </div>
    )
  }

  const textarea = (f: 'presentation' | 'proposition', ph: string, rows: number) => (
    <>
      <textarea
        id={id(f)}
        name={f}
        rows={rows}
        value={v[f]}
        onChange={(e) => set(f, e.target.value)}
        placeholder={ph}
        maxLength={MAX_TEXT}
        aria-required="true"
        {...a11y(f, id(`${f}-count`))}
        className={cn(input, 'min-h-[120px] resize-y py-3 leading-relaxed', border(f))}
      />
      <p id={id(`${f}-count`)} className="mt-1 text-right text-[12px] text-night-500">{t('counter', { n: v[f].length, max: MAX_TEXT })}</p>
      <ErrorText f={f} />
    </>
  )

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-labelledby={id('title')}
      className="relative rounded-[28px] bg-white p-5 ring-1 ring-[#E5E7EB] shadow-[0_1px_2px_rgba(11,45,91,0.04),0_24px_48px_-32px_rgba(11,45,91,0.3)] sm:p-8"
    >
      <header className="flex items-start gap-4">
        <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-night-50 text-night-700">
          <FileText className="h-7 w-7" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <h2 id={id('title')} className="text-[22px] font-extrabold tracking-[-0.015em] text-night-900 sm:text-[24px]">{t('formTitle')}</h2>
          <p className="mt-1 text-[14.5px] leading-relaxed text-night-700">{t('formLead')}</p>
          <p className="mt-1 text-[13px] text-night-600">{t('requiredNote')}</p>
        </div>
      </header>

      <div ref={summaryRef} tabIndex={-1} role="alert" className="outline-none">
        {tried && errorCount > 0 && (
          <p className="mt-6 flex items-start gap-2 rounded-xl bg-alert-50 px-4 py-3 text-[14px] font-semibold text-alert-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {t('errors.summary', { count: errorCount })}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-x-8 gap-y-10 lg:grid-cols-2">
        <Section n={1} id={id('s1')} title={t('s1')} help={t('s1Help')}>
          <fieldset aria-describedby={errors.profil ? id('profil-err') : undefined}>
            <legend className="sr-only">{t('s1')}</legend>
            <div className="space-y-1">
              {PARTNER_PROFILES.map((p) => (
                <label key={p} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-night-50/70">
                  <input
                    type="radio"
                    name="profil"
                    value={p}
                    checked={v.profil === p}
                    onChange={() => set('profil', p)}
                    className="h-5 w-5 shrink-0 accent-leaf-500"
                  />
                  <span className="text-[15px] text-night-900">{t(`profiles.${p}`)}</span>
                </label>
              ))}
            </div>
            <ErrorText f="profil" />
          </fieldset>
        </Section>

        <Section n={2} id={id('s2')} title={t('s2')}>
          {/* Deux colonnes seulement quand le bloc a la place (pleine largeur sur tablette, très grand écran). */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 min-[1400px]:grid-cols-2">
            <div>
              <Label f="structure">{t('structure')}</Label>
              <input id={id('structure')} name="structure" value={v.structure} onChange={(e) => set('structure', e.target.value)} placeholder={t('structurePh')} maxLength={120} autoComplete="organization" aria-required="true" {...a11y('structure')} className={cn(input, 'h-12', border('structure'))} />
              <ErrorText f="structure" />
            </div>
            <div>
              <Label f="contactName">{t('contactName')}</Label>
              <input id={id('contactName')} name="contactName" value={v.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder={t('contactNamePh')} maxLength={120} autoComplete="name" aria-required="true" {...a11y('contactName')} className={cn(input, 'h-12', border('contactName'))} />
              <ErrorText f="contactName" />
            </div>
            <div>
              <Label f="email">{t('email')}</Label>
              <input id={id('email')} name="email" type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} placeholder={t('emailPh')} maxLength={254} autoComplete="email" aria-required="true" {...a11y('email')} className={cn(input, 'h-12', border('email'))} />
              <ErrorText f="email" />
            </div>
            <div>
              <Label f="telephone" optional>{t('phone')}</Label>
              <input id={id('telephone')} name="telephone" type="tel" inputMode="tel" value={v.telephone} onChange={(e) => set('telephone', e.target.value)} placeholder={t('phonePh')} maxLength={25} autoComplete="tel" {...a11y('telephone')} className={cn(input, 'h-12', border('telephone'))} />
              <ErrorText f="telephone" />
            </div>
            <div className="sm:col-span-2 lg:col-span-1 min-[1400px]:col-span-2">
              <Label f="territoire">{t('territory')}</Label>
              <div className="relative">
                <select id={id('territoire')} name="territoire" value={v.territoire} onChange={(e) => set('territoire', e.target.value as PartnerTerritory)} aria-required="true" {...a11y('territoire')} className={cn(input, 'h-12 appearance-none pr-10', border('territoire'))}>
                  {PARTNER_TERRITORIES.map((c) => <option key={c} value={c}>{t(`territories.${c}`)}</option>)}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-night-500" />
              </div>
              <ErrorText f="territoire" />
            </div>
          </div>
        </Section>

        <Section n={3} id={id('s3')} title={t('s3')}>
          <div className="space-y-4">
            <div>
              <Label f="site" optional>{t('site')}</Label>
              <input id={id('site')} name="site" type="url" inputMode="url" value={v.site} onChange={(e) => set('site', e.target.value)} placeholder={t('sitePh')} maxLength={2000} autoComplete="url" {...a11y('site')} className={cn(input, 'h-12', border('site'))} />
              <ErrorText f="site" />
            </div>
            <div>
              <Label f="reseaux" optional>{t('networks')}</Label>
              <textarea id={id('reseaux')} name="reseaux" rows={2} value={v.reseaux} onChange={(e) => set('reseaux', e.target.value)} placeholder={t('networksPh')} maxLength={1000} {...a11y('reseaux')} className={cn(input, 'min-h-[76px] resize-y py-3 leading-relaxed', border('reseaux'))} />
              <ErrorText f="reseaux" />
            </div>
            <div>
              <Label f="presentation">{t('presentation')}</Label>
              {textarea('presentation', t('presentationPh'), 3)}
            </div>
          </div>
        </Section>

        <Section n={4} id={id('s4')} title={t('s4')}>
          <Label f="proposition">{t('proposition')}</Label>
          {textarea('proposition', t('propositionPh'), 7)}
        </Section>

        <Section n={5} id={id('s5')} title={t('s5')} className="lg:col-span-2">
          <label htmlFor={id('consent')} className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1">
            <input
              id={id('consent')}
              type="checkbox"
              name="consent"
              checked={v.consent}
              onChange={(e) => set('consent', e.target.checked)}
              aria-required="true"
              {...a11y('consent')}
              className="mt-0.5 h-5 w-5 shrink-0 accent-leaf-500"
            />
            <span className="text-[14.5px] leading-relaxed text-night-900">
              {t('consent')} <span aria-hidden className="text-alert-500">*</span>
            </span>
          </label>
          <ErrorText f="consent" />
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-night-50/70 p-4 sm:p-5">
            <ShieldCheck aria-hidden className="mt-0.5 h-7 w-7 shrink-0 text-leaf-500" strokeWidth={1.8} />
            <div>
              <p className="text-[15px] font-bold text-night-900">{t('reviewTitle')}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-night-700">
                {t.rich('reviewText', {
                  link: (c) => <Link href={lp('/legal/confidentialite')} className="font-semibold text-leaf-700 underline underline-offset-4 hover:text-leaf-600">{c}</Link>,
                })}
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* Piège à robots : invisible et hors tabulation ; un humain ne le remplit jamais. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={id('url_confirm')}>URL</label>
        <input id={id('url_confirm')} name="url_confirm" type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      {sendError && (
        <p role="alert" className="mt-8 flex items-start gap-2 rounded-xl bg-alert-50 px-4 py-3 text-[14px] font-semibold text-alert-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {sendError}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        aria-busy={status === 'sending'}
        className="mt-8 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-leaf-500 px-6 text-[16.5px] font-semibold text-white transition-colors hover:bg-leaf-600 disabled:opacity-70"
      >
        {status === 'sending' ? t('sending') : <>{t('submit')} <ArrowRight className="h-5 w-5" aria-hidden /></>}
      </button>
    </form>
  )
}
