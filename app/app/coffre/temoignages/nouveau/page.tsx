'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock, Pencil, Plus, Share2, Trash2 } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { StickyActions } from '@/components/coffre/StickyActions'
import { ClipboardPersonIllustration, LinkBurst } from '@/components/coffre/Illustrations'
import { CopyLinkField, copyText } from '@/components/coffre/CopyLinkField'
import { btn } from '@/components/coffre/buttons'
import { randomToken, useRequests } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { TESTIMONY_LINK_BASE, type TestimonyRequest } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'
import { LIVE } from '@/lib/data/core'
import { createTestimonyRequest, testimonyLink, testimonyUrl } from '@/lib/data/testimonies'
import { listChildren } from '@/lib/data/children'
import { listLinkedParents } from '@/lib/coparents/client'
import { useAccountProfile } from '@/lib/auth/browser'

type Step = 0 | 1 | 2 | 3 | 4
type Person = { id: string; name: string; editing: boolean }

const fieldCls = 'w-full rounded-xl border border-night-200 bg-white px-3.5 text-[14px] text-night-900 outline-none placeholder:text-night-400 focus:border-leaf-500'

const NO_PROFILE = { prenom: '', nom: '', email: '', memberSince: '' }

let seq = 0
const person = (name: string, editing = false): Person => ({ id: `p${++seq}`, name, editing })

/** Liste éditable « Parent 1 / Enfant 1 » : nom + crayon + corbeille, ajout en pointillés. */
function PeopleEditor({ kind, people, setPeople, error }: { kind: 'Parent' | 'Enfant'; people: Person[]; setPeople: (fn: (p: Person[]) => Person[]) => void; error?: string }) {
  const t = useTranslations('vault.testimonials.new')
  const uid = useId()
  const lastAdded = useRef<string | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (lastAdded.current) { inputs.current[lastAdded.current]?.focus(); lastAdded.current = null }
  })

  const update = (id: string, patch: Partial<Person>) => setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  return (
    <div>
      <ul className="space-y-4">
        {people.map((p, i) => {
          const label = kind === 'Parent' ? t('parent', { n: i + 1 }) : t('child', { n: i + 1 })
          return (
            <li key={p.id}>
              <label htmlFor={`${uid}-${p.id}`} className="mb-1.5 block text-[13px] font-semibold text-night-700">{label}</label>
              <div className="flex h-12 items-center gap-1 rounded-xl border border-night-200 bg-white pl-3.5 pr-1 focus-within:border-leaf-500">
                <input
                  id={`${uid}-${p.id}`}
                  ref={(el) => { inputs.current[p.id] = el }}
                  value={p.name}
                  readOnly={!p.editing}
                  onChange={(e) => update(p.id, { name: e.target.value })}
                  onBlur={() => update(p.id, { editing: false, name: p.name.trim() })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
                  placeholder={t('namePlaceholder')}
                  maxLength={60}
                  autoComplete="off"
                  className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-night-900 outline-none placeholder:font-normal placeholder:text-night-400"
                />
                <button
                  type="button"
                  onClick={() => { update(p.id, { editing: true }); requestAnimationFrame(() => inputs.current[p.id]?.focus()) }}
                  aria-label={t('editAria', { label })}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-leaf-600 hover:bg-leaf-50"
                >
                  <Pencil className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setPeople((ps) => ps.filter((x) => x.id !== p.id))}
                  aria-label={t('removeAria', { label: `${label}${p.name ? ` (${p.name})` : ''}` })}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-alert-500 hover:bg-alert-50"
                >
                  <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={() => { const np = person('', true); lastAdded.current = np.id; setPeople((ps) => [...ps, np]) }}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-night-300 text-[14px] font-bold text-night-900 hover:bg-night-50"
      >
        <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" /> {kind === 'Parent' ? t('addParent') : t('addChild')}
      </button>
      {error && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-alert-600">{error}</p>}
    </div>
  )
}

export default function NouveauTemoignagePage() {
  const t = useTranslations('vault.testimonials.new')
  const tc = useTranslations('vault.common')
  const uid = useId()
  const { add } = useRequests()
  const { announce, node } = useAnnounce()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false)

  const [step, setStep] = useState<Step>(0)
  const [tried, setTried] = useState(false)
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  // Démonstration : famille fictive. Compte réel : pré-remplissage avec le compte, le parent lié
  // et les enfants du compte (modifiable), jamais avec des noms inventés.
  const [parents, setParents] = useState<Person[]>(() => (LIVE ? [] : [person('Julie Martin'), person('Thomas Martin')]))
  const [enfants, setEnfants] = useState<Person[]>(() => (LIVE ? [] : [person('Lina Martin'), person('Noah Martin')]))
  const { profile: me, loading: meLoading } = useAccountProfile(NO_PROFILE)

  useEffect(() => {
    if (!LIVE || meLoading) return
    let alive = true
    Promise.allSettled([listLinkedParents(), listChildren()]).then(([linked, kids]) => {
      if (!alive) return
      const parentNames = [
        `${me.prenom} ${me.nom}`.trim(),
        ...(linked.status === 'fulfilled' ? linked.value.map((p) => `${p.prenom} ${p.nom ?? ''}`.trim()) : []),
      ].filter(Boolean)
      const childNames = kids.status === 'fulfilled' ? kids.value.map((c) => c.prenom.trim()).filter(Boolean) : []
      setParents((cur) => (cur.length ? cur : parentNames.map((n) => person(n))))
      setEnfants((cur) => (cur.length ? cur : childNames.map((n) => person(n))))
    })
    return () => { alive = false }
    // `me` est stable une fois le chargement terminé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading])
  const [created, setCreated] = useState<TestimonyRequest | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    headingRef.current?.focus()
  }, [step])

  const names = (ps: Person[]) => ps.map((p) => p.name.trim()).filter(Boolean)
  const errors = {
    title: !title.trim() ? t('errors.title') : '',
    parents: names(parents).length === 0 ? t('errors.parents') : '',
    enfants: names(enfants).length === 0 ? t('errors.children') : '',
  }

  const next = async () => {
    setTried(true)
    if (step === 1 && errors.title) return
    if (step === 2 && errors.parents) return
    if (step === 3 && errors.enfants) return
    setTried(false)
    if (step === 3) {
      if (creating) return
      const today = new Date()
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      // Supabase : création serveur (jeton 32 caractères crypto.randomBytes). Démo : jeton local.
      let id = `n-${randomToken(8)}`
      let token = randomToken()
      if (LIVE) {
        setCreating(true)
        setCreateError('')
        try {
          const res = await createTestimonyRequest({ subject: title.trim(), context: context.trim() || undefined, parents: names(parents), enfants: names(enfants) })
          id = res.id
          token = res.token
        } catch (e) {
          setCreateError(e instanceof Error ? e.message : t('errors.createFailed'))
          setCreating(false)
          return
        }
        setCreating(false)
      }
      const req: TestimonyRequest = {
        id,
        token,
        subject: title.trim(),
        icon: 'users',
        tone: 'violet',
        createdAt: ymd,
        status: 'attente',
        autoReminder: true,
        context: context.trim() || undefined,
        parents: names(parents),
        enfants: names(enfants),
        witnesses: LIVE ? [{ n: 1, status: 'envoi', invitedAt: ymd, invitedTime: `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}` }] : [],
      }
      add(req)
      setCreated(req)
    }
    setStep((s) => (s + 1) as Step)
  }
  const back = () => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))

  const link = created ? (LIVE ? testimonyLink(created.token) : `${TESTIMONY_LINK_BASE}${created.token}`) : ''
  const share = async () => {
    const url = created && LIVE ? testimonyUrl(created.token) : `https://${link}`
    if (navigator.share) {
      try { await navigator.share({ title: t('shareTitle'), text: t('shareText'), url }) } catch { /* annulé */ }
      return
    }
    if (await copyText(url)) announce(t('copied'))
  }

  /* --------------------------- Intro (0) --------------------------- */
  if (step === 0) {
    return (
      <>
        <ScreenHeader title={t('title')} leading="none" />
        <div className="mx-auto w-full max-w-md px-5 pt-4 text-center">
          <ClipboardPersonIllustration />
          <p className="mx-auto mt-6 max-w-[290px] text-[14.5px] leading-relaxed text-night-800">
            {t('intro')}
          </p>
          <div className="mt-8 space-y-3">
            <button type="button" onClick={() => setStep(1)} className={btn({ variant: 'primary' })}>{t('create')}</button>
            <Link href="/app/coffre/temoignages" className={btn({ variant: 'secondary' })}>{t('seeRequests')}</Link>
          </div>
        </div>
      </>
    )
  }

  /* ------------------------ Lien généré (4) ------------------------ */
  if (step === 4 && created) {
    return (
      <>
        <ScreenHeader title={t('linkTitle')} leading="none" />
        <div className="mx-auto w-full max-w-md px-5 pt-2 text-center">
          <LinkBurst />
          <h2 ref={headingRef} tabIndex={-1} className="text-[16px] font-extrabold text-night-900 outline-none">
            {t('linkReady')}
          </h2>
          <CopyLinkField className="mt-5 text-left" variant="field" link={link} />
          <p className="mx-auto mt-4 max-w-[280px] text-[13px] leading-relaxed text-night-600">
            {t('linkHelp')}
          </p>
          <div className="mt-7 space-y-3">
            <button type="button" onClick={() => void share()} className={btn({ variant: 'primary' })}>
              <Share2 className="h-[18px] w-[18px]" aria-hidden="true" /> {t('shareLink')}
            </button>
            <Link href={`/app/coffre/temoignages/${created.id}`} className={btn({ variant: 'secondary' })}>
              {t('manage')}
            </Link>
          </div>
        </div>
        {node}
      </>
    )
  }

  const titles = { 1: t('titles.1'), 2: t('titles.2'), 3: t('titles.3') } as const
  const s = step as 1 | 2 | 3

  return (
    <>
      <ScreenHeader title={titles[s]} srSuffix={t('stepOf', { step: s })} onBack={back} backLabel={t('prevStep')} />
      <div className="mx-auto w-full max-w-md px-5 pt-2">
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">{titles[s]} — {t('stepOf', { step: s })}</h2>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label htmlFor={`${uid}-title`} className="mb-1.5 block text-[13px] font-bold text-night-900">{t('titleLabel')}</label>
              <input
                id={`${uid}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('titlePlaceholder')}
                maxLength={90}
                aria-required="true"
                aria-invalid={tried && !!errors.title}
                aria-describedby={tried && errors.title ? `${uid}-title-error` : undefined}
                className={cn(fieldCls, 'h-12', tried && errors.title && 'border-alert-400')}
              />
              {tried && errors.title && <p id={`${uid}-title-error`} role="alert" className="mt-1.5 text-[12.5px] font-semibold text-alert-600">{errors.title}</p>}
            </div>
            <div>
              <label htmlFor={`${uid}-ctx`} className="mb-1.5 block text-[13px] font-bold text-night-900">{t('contextLabel')}</label>
              <textarea
                id={`${uid}-ctx`}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={4}
                maxLength={600}
                aria-describedby={`${uid}-ctx-note`}
                placeholder={t('contextPlaceholder')}
                className={cn(fieldCls, 'min-h-[112px] resize-y py-3')}
              />
            </div>
            <p id={`${uid}-ctx-note`} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-night-600">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-night-500" aria-hidden="true" />
              {t('contextNote')}
            </p>
          </div>
        )}

        {step === 2 && <PeopleEditor kind="Parent" people={parents} setPeople={setParents} error={tried ? errors.parents : ''} />}
        {step === 3 && <PeopleEditor kind="Enfant" people={enfants} setPeople={setEnfants} error={tried ? errors.enfants : ''} />}
      </div>

      <StickyActions>
        {createError && <p role="alert" className="mb-2 text-center text-[12.5px] font-semibold text-alert-600">{createError}</p>}
        <button type="button" onClick={() => void next()} disabled={creating} aria-busy={creating} className={btn({ variant: 'primary' })}>
          {creating ? t('creating') : tc('continue')}
        </button>
      </StickyActions>
    </>
  )
}
