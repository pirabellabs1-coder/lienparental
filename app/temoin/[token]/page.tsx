'use client'

import { use, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Check, ChevronDown, FileText, Paperclip, Sparkles, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { Logo } from '@/components/brand/Logo'
import { ConfettiBurst, EnvelopeShieldIcon, LockLeavesIllustration } from '@/components/illustrations'
import { SelectField, TextAreaField, TextField } from '@/components/onboarding/fields'
import { btn } from '@/components/onboarding/styles'
import { mockTestimonyRequest, type TestimonyPerson, type TestimonyRequestPublic } from '@/lib/mock-data'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { Q, SkipLink, WitnessBody, WitnessDots, WitnessFrame, WitnessHeader } from './_parts'

// M08 — Espace témoin public (/temoin/[token]) : aucun compte requis.
// Parcours (maquette « Côté témoin ») : intro → cible → questionnaire parents (lien, faits,
// contexte, autre fait ?) → questionnaire enfants → compléments → relecture (reformulation IA
// facultative, CDC) → merci → fin.

const MAX_TEXT = 2000
const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024

// Valeurs enregistrées (texte du témoignage, réponses) : en français, pour le dossier du parent.
// Seul le libellé affiché est traduit (public.witness.options.<liste>.<clé>).
const LIEN_ADULTE = [
  ['family', 'Membre de la famille'], ['friend', 'Ami(e)'], ['neighbour', 'Voisin(e)'], ['colleague', 'Collègue'],
  ['school', 'Enseignant(e) / personnel scolaire'], ['health', 'Professionnel(le) de santé'], ['other', 'Autre'],
] as const
const DUREE = [
  ['lt6m', 'Moins de 6 mois'], ['6m1y', '6 mois à 1 an'], ['1y3y', '1 à 3 ans'], ['3y5y', '3 à 5 ans'], ['gt5y', 'Plus de 5 ans'],
] as const
const LIEN_ENFANT = [
  ['family', 'Membre de la famille'], ['familyFriend', 'Ami(e) de la famille'], ['neighbour', 'Voisin(e)'],
  ['school', 'Enseignant(e) / personnel scolaire'], ['activity', 'Encadrant(e) d’activité'], ['health', 'Professionnel(le) de santé'], ['other', 'Autre'],
] as const
const LIEUX = ['home', 'school', 'public', 'handover', 'activity'] as const

type Fact = { faits: string; quand: string; ou: string; contexte: string }
type ParentAns = { lien: string; duree: string; facts: Fact[] }
type ChildAns = { lien: string; constate: string }

type Screen =
  | { k: 'intro' }
  | { k: 'cible' }
  | { k: 'p-lien'; p: number }
  | { k: 'p-faits'; p: number; f: number }
  | { k: 'p-contexte'; p: number; f: number }
  | { k: 'p-autre'; p: number; f: number }
  | { k: 'enfant'; c: number }
  | { k: 'complements' }
  | { k: 'relecture' }
  | { k: 'merci' }
  | { k: 'fin' }

const emptyFact = (): Fact => ({ faits: '', quand: '', ou: '', contexte: '' })

/** Short deterministic reference from the opaque token: TMG-YYYY-XXXX. */
function referenceFrom(token: string) {
  let h = 0
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0
  return `TMG-${new Date().getFullYear()}-${h.toString(36).toUpperCase().padStart(4, '0').slice(-4)}`
}

/** Mock "IA" reformulation: tidy spacing, capitalise sentences, close punctuation. Backend: /api/coach. */
function reformulate(text: string) {
  return text
    .split('\n')
    .map((line) => {
      const clean = line.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim()
      if (!clean) return ''
      const cap = clean.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase())
      return /[.!?:)]$/.test(cap) ? cap : `${cap}.`
    })
    .join('\n')
}

function formatDate(iso: string) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''
}

type LoadState = { k: 'loading' } | { k: 'ready'; request: TestimonyRequestPublic } | { k: 'error'; message: string }

async function apiError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  return body?.error?.message ?? fallback
}

export default function TemoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const t = useTranslations('public.witness')
  const opts = (list: string, items: ReadonlyArray<readonly [string, string]>) =>
    items.map(([key, value]) => ({ value, label: t(`options.${list}.${key}`) }))
  const localRef = useMemo(() => referenceFrom(token), [token])
  const [serverRef, setServerRef] = useState<string | null>(null)
  const ref = serverRef ?? localRef
  // Supabase : la demande est résolue côté serveur (/api/temoin/[token] → RPC SECURITY DEFINER),
  // sans jamais exposer l'identité ni les autres données du parent. Démo : données fictives.
  const [load, setLoad] = useState<LoadState>(
    SUPABASE_ENABLED ? { k: 'loading' } : { k: 'ready', request: mockTestimonyRequest },
  )
  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    let alive = true
    fetch(`/api/temoin/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!alive) return
        if (!res.ok) {
          setLoad({ k: 'error', message: await apiError(res, t('errInvalid')) })
          return
        }
        const body = (await res.json()) as TestimonyRequestPublic
        if (alive) setLoad({ k: 'ready', request: { parents: body.parents ?? [], enfants: body.enfants ?? [] } })
      })
      .catch(() => alive && setLoad({ k: 'error', message: t('errNetwork') }))
    return () => { alive = false }
  }, [token])
  const request: TestimonyRequestPublic = load.k === 'ready' ? load.request : { parents: [], enfants: [] }

  const [screen, setScreen] = useState<Screen>({ k: 'intro' })
  const [history, setHistory] = useState<Screen[]>([])
  const [learnMore, setLearnMore] = useState(false)

  const [parentIds, setParentIds] = useState<string[]>([])
  const [childIds, setChildIds] = useState<string[]>([])
  const [parentAns, setParentAns] = useState<Record<string, ParentAns>>({})
  const [childAns, setChildAns] = useState<Record<string, ChildAns>>({})
  const [complement, setComplement] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)

  const [iaText, setIaText] = useState<string | null>(null)
  const [useIa, setUseIa] = useState(false)
  const [certified, setCertified] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [closeHint, setCloseHint] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  // Move focus to the new screen title (screen-reader + keyboard context).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    document.getElementById('witness-title')?.focus()
    window.scrollTo({ top: 0 })
  }, [screen])

  const parents = request.parents.filter((p) => parentIds.includes(p.id))
  const children = request.enfants.filter((c) => childIds.includes(c.id))

  const go = (next: Screen) => {
    setHistory((h) => [...h, screen])
    setScreen(next)
  }
  const back = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory(history.slice(0, -1))
    setScreen(prev)
  }

  const pAns = (p: TestimonyPerson): ParentAns => parentAns[p.id] ?? { lien: '', duree: '', facts: [emptyFact()] }
  const patchParent = (p: TestimonyPerson, patch: Partial<ParentAns>) =>
    setParentAns((s) => ({ ...s, [p.id]: { ...pAns(p), ...patch } }))
  const patchFact = (p: TestimonyPerson, f: number, patch: Partial<Fact>) => {
    const a = pAns(p)
    const facts = [...a.facts]
    facts[f] = { ...(facts[f] ?? emptyFact()), ...patch }
    patchParent(p, { facts })
  }
  const cAns = (c: TestimonyPerson): ChildAns => childAns[c.id] ?? { lien: '', constate: '' }
  const patchChild = (c: TestimonyPerson, patch: Partial<ChildAns>) =>
    setChildAns((s) => ({ ...s, [c.id]: { ...cAns(c), ...patch } }))

  // After the parents' questionnaire (or when none), continue with children then complements.
  const afterParent = (p: number): Screen =>
    p + 1 < parents.length ? { k: 'p-lien', p: p + 1 } : children.length ? { k: 'enfant', c: 0 } : { k: 'complements' }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  // --- compiled testimony (texte_original) -----------------------------------
  const original = useMemo(() => {
    const blocks: string[] = []
    parents.forEach((p) => {
      const a = pAns(p)
      const head = [`Concernant ${p.nom}`, a.lien && `lien : ${a.lien}`, a.duree && `connu(e) depuis : ${a.duree}`]
        .filter(Boolean)
        .join(' — ')
      const facts = a.facts
        .filter((f) => f.faits.trim() || f.contexte.trim())
        .map((f, i) => {
          const meta = [f.quand && `le ${formatDate(f.quand)}`, f.ou && `lieu : ${f.ou}`].filter(Boolean).join(', ')
          return [`Fait ${i + 1}${meta ? ` (${meta})` : ''} :`, f.faits.trim(), f.contexte.trim() && `Contexte : ${f.contexte.trim()}`]
            .filter(Boolean)
            .join('\n')
        })
      if (facts.length) blocks.push([head, ...facts].join('\n'))
    })
    children.forEach((c) => {
      const a = cAns(c)
      if (a.constate.trim()) blocks.push([`Concernant ${c.nom}${a.lien ? ` — lien : ${a.lien}` : ''}`, a.constate.trim()].join('\n'))
    })
    if (complement.trim()) blocks.push(`Informations complémentaires :\n${complement.trim()}`)
    return blocks.join('\n\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentAns, childAns, complement, parentIds, childIds])

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    setFileError(null)
    const ok: File[] = []
    for (const f of picked) {
      if (!/^(image\/|application\/pdf$)/.test(f.type)) {
        setFileError(t('errFormat'))
        continue
      }
      if (f.size > MAX_FILE_BYTES) {
        setFileError(t('errSize', { name: f.name }))
        continue
      }
      ok.push(f)
    }
    setFiles((cur) => {
      const merged = [...cur, ...ok]
      if (merged.length > MAX_FILES) setFileError(t('errCount', { max: MAX_FILES }))
      return merged.slice(0, MAX_FILES)
    })
  }

  const send = async () => {
    if (!original.trim() || !certified) return
    setSending(true)
    setSendError(null)
    try {
      if (!SUPABASE_ENABLED) {
        await new Promise((r) => setTimeout(r, 700)) // démo
      } else {
        // 1) Pièces jointes : validées et stockées côté serveur (taille, type réel, jeton).
        const attachments: { path: string; name: string }[] = []
        for (const f of files) {
          const fd = new FormData()
          fd.append('file', f)
          const up = await fetch(`/api/temoin/${encodeURIComponent(token)}/upload`, { method: 'POST', body: fd })
          if (!up.ok) throw new Error(await apiError(up, t('errUpload', { name: f.name })))
          const body = (await up.json()) as { path: string }
          attachments.push({ path: body.path, name: f.name.slice(0, 120) })
        }
        // 2) Témoignage : RPC record_testimony_submission via le serveur (limitation de débit par IP).
        const firstParent = parents.map((p) => pAns(p)).find((a) => a.lien || a.duree)
        const firstChild = children.map((c) => cAns(c)).find((a) => a.lien)
        const sent = iaText !== null && useIa ? iaText.trim() : original.trim()
        const reponses: Record<string, string> = {}
        parents.forEach((p) => {
          const a = pAns(p)
          reponses[`parent:${p.nom}`.slice(0, 80)] = JSON.stringify({ lien: a.lien, duree: a.duree, facts: a.facts.filter((f) => f.faits.trim() || f.contexte.trim()) }).slice(0, 4000)
        })
        children.forEach((c) => {
          const a = cAns(c)
          reponses[`enfant:${c.nom}`.slice(0, 80)] = JSON.stringify(a).slice(0, 4000)
        })
        if (complement.trim()) reponses.complement = complement.trim().slice(0, 4000)
        const res = await fetch(`/api/temoin/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texte_original: original.trim(),
            texte_ia: iaText?.trim() || undefined,
            texte_envoye: sent || original.trim(),
            temoin: { lien: firstParent?.lien || firstChild?.lien || undefined, duree: firstParent?.duree || undefined },
            reponses,
            attachments,
            certified: true,
          }),
        })
        if (!res.ok) throw new Error(await apiError(res, t('errSend')))
        const body = (await res.json()) as { reference?: string | null }
        if (body.reference) setServerRef(body.reference)
      }
      setHistory([])
      setScreen({ k: 'merci' })
    } catch (e) {
      setSendError(e instanceof Error && e.message ? e.message : t('errSend'))
    } finally {
      setSending(false)
    }
  }

  const closePage = () => {
    window.close()
    // Browsers only allow closing script-opened tabs: tell the user otherwise.
    setTimeout(() => setCloseHint(true), 300)
  }

  // ------------------------------------------------------------------ screens
  let content: React.ReactNode = null

  if (load.k === 'loading') {
    return (
      <WitnessFrame>
        <LoadingState title={t('loadingTitle')} description={t('loadingText')} />
      </WitnessFrame>
    )
  }
  if (load.k === 'error') {
    return (
      <WitnessFrame>
        <ErrorState
          headingLevel={1}
          title={t('errorTitle')}
          description={load.message}
          primary={{ label: t('retry'), reload: true }}
          secondary={{ label: t('discover'), href: '/' }}
        />
      </WitnessFrame>
    )
  }

  switch (screen.k) {
    case 'intro':
      content = (
        <WitnessBody
          className="pt-8"
          footer={
            <>
              <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => go({ k: 'cible' })}>
                {t('start')}
              </button>
              <button
                type="button"
                aria-expanded={learnMore}
                aria-controls="learn-more"
                onClick={() => setLearnMore((v) => !v)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1 text-[13px] font-bold text-leaf-600"
              >
                {t('learnMore')}
                <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', learnMore && 'rotate-180')} aria-hidden="true" />
              </button>
            </>
          }
        >
          <div className="text-center">
            <Logo size="sm" layout="inline" className="mx-auto" />
            <EnvelopeShieldIcon className="mx-auto mt-8 h-28 w-28" />
            <h1 id="witness-title" tabIndex={-1} className="mt-6 text-[22px] font-extrabold leading-snug text-night-900 outline-none">
              {t('introTitle')}
            </h1>
            <p className="mx-auto mt-3 max-w-[18rem] text-sm leading-relaxed text-night-600">
              {t('introText')}
            </p>
            <div id="learn-more" hidden={!learnMore} className="mt-4 rounded-xl bg-leaf-50 p-4 text-left text-[13px] leading-relaxed text-night-700">
              {t('introMore')}
            </div>
          </div>
        </WitnessBody>
      )
      break

    case 'cible': {
      const none = parentIds.length + childIds.length === 0
      content = (
        <>
          <WitnessHeader title={t('targetTitle')} onBack={back} />
          <WitnessBody
            footer={
              <button type="button" className={cn(btn.primary, 'w-full')} disabled={none} onClick={() => go(parentIds.length ? { k: 'p-lien', p: 0 } : { k: 'enfant', c: 0 })}>
                {t('continue')}
              </button>
            }
          >
            <p className="text-center text-sm text-night-600">{t('targetHint')}</p>
            {(
              [
                [t('parents'), request.parents, parentIds, setParentIds],
                [t('children'), request.enfants, childIds, setChildIds],
              ] as const
            ).map(([legend, people, list, set]) => (
              <fieldset key={legend} className="mt-6">
                <legend className="mb-1 text-[13px] font-bold text-night-900">{legend}</legend>
                {people.map((p) => (
                  <label key={p.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 text-sm text-night-800">
                    <input
                      type="checkbox"
                      checked={list.includes(p.id)}
                      onChange={() => toggle(list, set, p.id)}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded accent-leaf-500"
                    />
                    {p.nom} ({p.role})
                  </label>
                ))}
              </fieldset>
            ))}
          </WitnessBody>
        </>
      )
      break
    }

    case 'p-lien': {
      const p = parents[screen.p]
      const a = pAns(p)
      const next = () => go({ k: 'p-faits', p: screen.p, f: 0 })
      content = (
        <>
          <WitnessHeader title={t('about', { name: p.nom })} counter={[1, 4]} onBack={back} />
          <WitnessBody
            footer={
              <>
                <button type="button" className={cn(btn.primary, 'w-full')} onClick={next}>
                  {t('next')}
                </button>
                <SkipLink onClick={next} />
                <WitnessDots current={1} total={4} />
              </>
            }
          >
            <div className="space-y-7">
              <SelectField label={<Q>{t('qLinkAdult')}</Q>} placeholder={t('select')} options={opts('linkAdult', LIEN_ADULTE)} value={a.lien} onChange={(e) => patchParent(p, { lien: e.target.value })} />
              <SelectField label={<Q>{t('qDuration')}</Q>} placeholder={t('select')} options={opts('duration', DUREE)} value={a.duree} onChange={(e) => patchParent(p, { duree: e.target.value })} />
            </div>
          </WitnessBody>
        </>
      )
      break
    }

    case 'p-faits': {
      const p = parents[screen.p]
      const fact = pAns(p).facts[screen.f] ?? emptyFact()
      const next = () => go({ k: 'p-contexte', p: screen.p, f: screen.f })
      content = (
        <>
          <WitnessHeader title={t('about', { name: p.nom })} counter={[2, 4]} onBack={back} />
          <WitnessBody
            footer={
              <>
                <button type="button" className={cn(btn.primary, 'w-full')} onClick={next}>
                  {t('next')}
                </button>
                <SkipLink onClick={next} />
                <WitnessDots current={2} total={4} />
              </>
            }
          >
            {screen.f > 0 && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-leaf-600">{t('factN', { n: screen.f + 1 })}</p>}
            <TextAreaField
              label={<Q>{t('qFacts')}</Q>}
              hint={t('factsHint')}
              placeholder={t('factsPh')}
              rows={8}
              maxLength={MAX_TEXT}
              value={fact.faits}
              onChange={(e) => patchFact(p, screen.f, { faits: e.target.value })}
            />
          </WitnessBody>
        </>
      )
      break
    }

    case 'p-contexte': {
      const p = parents[screen.p]
      const fact = pAns(p).facts[screen.f] ?? emptyFact()
      const next = () => go({ k: 'p-autre', p: screen.p, f: screen.f })
      content = (
        <>
          <WitnessHeader title={t('about', { name: p.nom })} counter={[3, 4]} onBack={back} />
          <WitnessBody
            footer={
              <>
                <button type="button" className={cn(btn.primary, 'w-full')} onClick={next}>
                  {t('next')}
                </button>
                <SkipLink onClick={next} />
                <WitnessDots current={3} total={4} />
              </>
            }
          >
            <div className="space-y-6">
              <TextField
                type="date"
                label={<Q>{t('qWhen')}</Q>}
                max={new Date().toISOString().slice(0, 10)}
                value={fact.quand}
                onChange={(e) => patchFact(p, screen.f, { quand: e.target.value })}
              />
              <TextField
                label={<Q>{t('qWhere')}</Q>}
                placeholder={t('wherePh')}
                list="lieux"
                value={fact.ou}
                onChange={(e) => patchFact(p, screen.f, { ou: e.target.value })}
              />
              <datalist id="lieux">
                {LIEUX.map((l) => (
                  <option key={l} value={t(`options.places.${l}`)} />
                ))}
              </datalist>
              <TextAreaField
                label={<Q>{t('qContext')}</Q>}
                placeholder={t('contextPh')}
                rows={4}
                maxLength={MAX_TEXT}
                value={fact.contexte}
                onChange={(e) => patchFact(p, screen.f, { contexte: e.target.value })}
              />
            </div>
          </WitnessBody>
        </>
      )
      break
    }

    case 'p-autre': {
      const p = parents[screen.p]
      const addFact = () => {
        const a = pAns(p)
        const f = a.facts.length
        patchParent(p, { facts: [...a.facts, emptyFact()] })
        go({ k: 'p-faits', p: screen.p, f })
      }
      const skip = () => go(afterParent(screen.p))
      content = (
        <>
          <WitnessHeader title={t('about', { name: p.nom })} counter={[4, 4]} onBack={back} />
          <WitnessBody
            footer={
              <>
                <SkipLink onClick={skip} />
                <WitnessDots current={4} total={4} />
              </>
            }
          >
            <Q>{t('qAnother')}</Q>
            <p className="mt-2 text-sm leading-relaxed text-night-600">{t('anotherHint')}</p>
            <div className="mt-6 space-y-3">
              <button type="button" className={cn(btn.secondary, 'w-full')} onClick={addFact}>
                {t('anotherYes')}
              </button>
              <button type="button" className={cn(btn.secondary, 'w-full')} onClick={skip}>
                {t('anotherNo')}
              </button>
            </div>
          </WitnessBody>
        </>
      )
      break
    }

    case 'enfant': {
      const c = children[screen.c]
      const a = cAns(c)
      const next = () => go(screen.c + 1 < children.length ? { k: 'enfant', c: screen.c + 1 } : { k: 'complements' })
      content = (
        <>
          <WitnessHeader title={t('about', { name: c.nom })} counter={[screen.c + 1, children.length]} onBack={back} />
          <WitnessBody
            footer={
              <>
                <button type="button" className={cn(btn.primary, 'w-full')} onClick={next}>
                  {t('next')}
                </button>
                <SkipLink onClick={next} />
                <WitnessDots current={screen.c + 1} total={children.length} />
              </>
            }
          >
            <div className="space-y-7">
              <SelectField label={<Q>{t('qLinkChild')}</Q>} placeholder={t('select')} options={opts('linkChild', LIEN_ENFANT)} value={a.lien} onChange={(e) => patchChild(c, { lien: e.target.value })} />
              <TextAreaField
                label={<Q>{t('qChild')}</Q>}
                placeholder={t('childPh')}
                rows={6}
                maxLength={MAX_TEXT}
                value={a.constate}
                onChange={(e) => patchChild(c, { constate: e.target.value })}
              />
            </div>
          </WitnessBody>
        </>
      )
      break
    }

    case 'complements':
      content = (
        <>
          <WitnessHeader title={t('complementsTitle')} counter={[1, 2]} onBack={back} />
          <WitnessBody
            footer={
              <>
                <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => go({ k: 'relecture' })}>
                  {t('next')}
                </button>
                <SkipLink onClick={() => go({ k: 'relecture' })} />
                <WitnessDots current={1} total={2} />
              </>
            }
          >
            <TextAreaField
              label={<Q>{t('qComplement')}</Q>}
              placeholder={t('complementPh')}
              rows={5}
              maxLength={MAX_TEXT}
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
            />

            <div className="mt-7">
              <Q>
                {t('qAttach')} <span className="font-medium text-night-500">{t('optional')}</span>
              </Q>
              <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFiles} />
              <button
                type="button"
                className={cn(btn.secondary, 'mt-3 w-full')}
                onClick={() => fileInput.current?.click()}
                disabled={files.length >= MAX_FILES}
                aria-describedby={fileError ? 'file-error' : undefined}
              >
                <Paperclip className="h-[18px] w-[18px] text-leaf-600" aria-hidden="true" />
                {t('attach')}
              </button>
              {fileError && (
                <p id="file-error" role="alert" className="mt-2 text-xs font-semibold text-alert-600">
                  {fileError}
                </p>
              )}
              {files.length > 0 && (
                <ul className="mt-3 space-y-2" aria-label={t('attached')}>
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-night-100 py-1 pl-3 pr-1 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-night-800">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                        aria-label={t('remove', { name: f.name })}
                        className="grid h-10 w-10 place-items-center rounded-lg text-night-500 hover:bg-night-50 hover:text-night-900"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </WitnessBody>
        </>
      )
      break

    case 'relecture': {
      const empty = !original.trim()
      content = (
        <>
          <WitnessHeader title={t('reviewTitle')} counter={[2, 2]} onBack={back} />
          <WitnessBody
            footer={
              <>
                {sendError && (
                  <p role="alert" className="text-sm font-semibold text-alert-600">
                    {sendError}
                  </p>
                )}
                <button type="button" className={cn(btn.primary, 'w-full')} disabled={empty || !certified || sending} aria-busy={sending} onClick={send}>
                  {sending ? t('sending') : t('send')}
                </button>
                <WitnessDots current={2} total={2} />
              </>
            }
          >
            {empty ? (
              <p role="alert" className="rounded-xl bg-night-50 p-4 text-sm text-night-700">
                {t('empty')}
              </p>
            ) : (
              <>
                <section aria-labelledby="ia-title" className="rounded-2xl border border-iris-100 bg-iris-50/60 p-4">
                  <h2 id="ia-title" className="flex items-center gap-2 text-sm font-bold text-iris-700">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    {t('iaTitle')}
                  </h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-night-700">
                    {t('iaText')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIaText(reformulate(original))
                      setUseIa(true)
                    }}
                    className="mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-night-200 bg-white px-4 text-sm font-semibold text-night-900 hover:bg-night-50"
                  >
                    {iaText === null ? t('iaPropose') : t('iaAgain')}
                  </button>
                </section>

                {iaText !== null && (
                  <fieldset className="mt-5">
                    <legend className="text-[13px] font-bold text-night-900">{t('versionLegend')}</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {([
                        [false, t('versionMine')],
                        [true, t('versionIa')],
                      ] as const).map(([val, label]) => (
                        <label
                          key={label}
                          className={cn(
                            'flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-leaf-100',
                            useIa === val ? 'border-leaf-500 bg-leaf-50 text-leaf-700' : 'border-night-100 text-night-700',
                          )}
                        >
                          <input type="radio" name="version" className="sr-only" checked={useIa === val} onChange={() => setUseIa(val)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {iaText !== null && useIa ? (
                  <TextAreaField
                    containerClassName="mt-4"
                    label={t('versionIaEditable')}
                    rows={9}
                    value={iaText}
                    onChange={(e) => setIaText(e.target.value)}
                  />
                ) : (
                  <div className="mt-4">
                    <p className="mb-1.5 text-[13px] font-bold text-night-900">{t('yourTestimony')}</p>
                    <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-night-100 p-4 text-sm leading-relaxed text-night-800">
                      {original}
                    </p>
                  </div>
                )}

                <label className="mt-5 flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-night-600">
                  <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-leaf-500" />
                  {t('certify')}
                </label>
              </>
            )}
          </WitnessBody>
        </>
      )
      break
    }

    case 'merci':
      content = (
        <WitnessBody
          className="pt-10"
          footer={
            <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => setScreen({ k: 'fin' })}>
              {t('finish')}
            </button>
          }
        >
          <div className="text-center">
            <div className="relative mx-auto h-40 w-60">
              <ConfettiBurst className="absolute inset-0 h-full w-full motion-safe:animate-fade-up" />
              <span className="absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-leaf-500 text-white shadow-[0_12px_30px_-12px_rgba(46,125,50,0.7)]" aria-hidden="true">
                <Check className="h-12 w-12" strokeWidth={3} />
              </span>
            </div>
            <h1 id="witness-title" tabIndex={-1} className="mt-4 text-[26px] font-extrabold text-night-900 outline-none">
              {t('thanksTitle')}
            </h1>
            <p className="mt-2 text-[15px] font-bold text-night-900">{t('thanksSent')}</p>
            <p className="mx-auto mt-4 max-w-[17rem] text-sm leading-relaxed text-night-600">
              {t('thanksText')}
            </p>
            <p className="mt-4 text-xs text-night-500">
              {t('reference')} <span className="font-mono font-semibold text-night-700">{ref}</span>
            </p>
          </div>
        </WitnessBody>
      )
      break

    case 'fin':
      content = (
        <WitnessBody
          className="pt-12"
          footer={
            <>
              <button type="button" className={cn(btn.primary, 'w-full')} onClick={closePage}>
                {t('close')}
              </button>
              <p role="status" className="min-h-[20px] text-center text-xs text-night-500">
                {closeHint ? t('closeHint') : ''}
              </p>
            </>
          }
        >
          <div className="text-center">
            <LockLeavesIllustration className="mx-auto w-full max-w-[240px]" />
            <h1 id="witness-title" tabIndex={-1} className="mt-6 text-[22px] font-extrabold text-night-900 outline-none">
              {t('endTitle')}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-night-600">
              {t('endText1')}
              <br />
              {t('endText2')}
            </p>
          </div>
        </WitnessBody>
      )
      break
  }

  return <WitnessFrame>{content}</WitnessFrame>
}
