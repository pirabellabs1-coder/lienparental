'use client'
/**
 * Remplissage d'un modèle publié et génération du document (PDF ou Word) dans le navigateur.
 * Les valeurs saisies ne quittent jamais l'appareil (aucun envoi serveur).
 * À monter dans l'écran parent d'un modèle, par ex. app/app/modeles/[slug] :
 *   <ModeleGenerator template={t} />   (t : usePublishedTemplate(slug).data)
 */
import { useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download, FileText, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { valuesSchemaFor, type DocumentTemplate, type TemplateValues } from '@/lib/modeles/template'
import { TemplatePaper } from './TemplatePaper'

const input =
  'w-full min-h-[48px] rounded-xl border border-night-200 bg-white px-4 py-3 text-base text-night-900 shadow-soft placeholder:text-night-400 focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500/30 aria-[invalid=true]:border-alert-400'

export function ModeleGenerator({ template: t, onGenerated }: { template: DocumentTemplate; onGenerated?: (file: { blob: Blob; filename: string }) => void }) {
  const tg = useTranslations('coach.templates.generator')
  const uid = useId()
  const [values, setValues] = useState<TemplateValues>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<null | 'pdf' | 'word'>(null)
  const [status, setStatus] = useState('')
  const summaryRef = useRef<HTMLDivElement>(null)
  const schema = useMemo(() => valuesSchemaFor(t.champs), [t.champs])

  const generate = async (format: 'pdf' | 'word') => {
    const r = schema.safeParse(values)
    if (!r.success) {
      const errs: Record<string, string> = {}
      for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message
      setErrors(errs)
      setStatus('')
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    setErrors({})
    setBusy(format)
    setStatus(tg('generating'))
    try {
      const mod = await import('@/lib/modeles/pdf')
      const file = await mod.buildTemplateFile(t, r.data as TemplateValues, format)
      mod.downloadBlob(file.blob, file.filename)
      onGenerated?.(file)
      setStatus(tg('ready', { filename: file.filename }))
    } catch (e) {
      console.warn('[modeles] génération impossible', e)
      setStatus(tg('failed'))
    } finally {
      setBusy(null)
    }
  }

  const errorList = Object.entries(errors)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void generate('pdf') }}>
        {errorList.length > 0 && (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-xl border border-alert-200 bg-alert-50 p-4 text-sm text-alert-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-alert-400">
            <p className="font-bold">{tg('fixFields')}</p>
            <ul className="mt-1 list-disc pl-5">
              {errorList.map(([k, m]) => (
                <li key={k}><a className="underline" href={`#${uid}-${k}`}>{t.champs.find((f) => f.key === k)?.label ?? k}</a> : {m}</li>
              ))}
            </ul>
          </div>
        )}
        {t.champs.map((f) => {
          const id = `${uid}-${f.key}`
          const err = errors[f.key]
          const describedBy = [f.aide ? `${id}-aide` : null, err ? `${id}-err` : null].filter(Boolean).join(' ') || undefined
          const common = {
            id, name: f.key, value: values[f.key] ?? '', 'aria-invalid': err ? true : undefined, 'aria-describedby': describedBy,
            required: f.obligatoire,
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.key]: e.target.value })),
          }
          return (
            <div key={f.key}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-night-900">
                {f.label}{f.obligatoire ? <span aria-hidden="true" className="ml-0.5 text-alert-500">*</span> : <span className="ml-1 font-normal text-night-500">{tg('optional')}</span>}
              </label>
              {f.type === 'texte_long' ? (
                <textarea {...common} rows={5} className={cn(input, 'min-h-[120px] resize-y')} />
              ) : f.type === 'choix' ? (
                <select {...common} className={input}>
                  <option value="">{tg('choose')}</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  {...common}
                  type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'telephone' ? 'tel' : 'text'}
                  inputMode={f.type === 'nombre' ? 'decimal' : undefined}
                  autoComplete={f.type === 'email' ? 'email' : f.type === 'telephone' ? 'tel' : 'off'}
                  className={input}
                />
              )}
              {f.aide && <p id={`${id}-aide`} className="mt-1 text-xs text-night-600">{f.aide}</p>}
              {err && <p id={`${id}-err`} className="mt-1 text-xs font-semibold text-alert-600">{err}</p>}
            </div>
          )
        })}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <button type="submit" disabled={busy !== null} className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-leaf-500 px-5 font-semibold text-white hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:opacity-60">
            {busy === 'pdf' ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {tg('downloadPdf')}
          </button>
          <button type="button" onClick={() => void generate('word')} disabled={busy !== null} className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-night-200 bg-white px-5 font-semibold text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:opacity-60">
            <FileText className="h-4 w-4" aria-hidden="true" /> {tg('wordVersion')}
          </button>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-night-700">{status}</p>
        <p className="text-xs text-night-500">{tg('privacy')}</p>
      </form>
      <section aria-label={tg('previewLabel')}>
        <TemplatePaper template={t} values={values} mode="final" />
      </section>
    </div>
  )
}
