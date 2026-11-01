'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowLeftRight, CalendarDays, CircleDot, Clock3, CreditCard, Download, EllipsisVertical, FileText, Hash, Image as ImageIcon,
  MapPin, Paperclip, Pencil, PieChart, Plus, Repeat, Share, Tag, Trash2, Users,
} from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { EventTypePill } from '@/components/journal/EventTypePill'
import { JournalTypeIcon } from '@/components/journal/journalTypes'
import { useFinanceLabels } from '@/components/journal/financeLabels'
import { useFamilyFormat } from '@/components/famille/useFamilyFormat'
import {
  createdParts, fmtDateFull, fmtDateMedium, fmtHeure, fmtPlage, fmtSize, parseDay,
} from '@/components/journal/journalData'
import { clearDraft, useImageDraft } from '@/components/journal/imageDraft'
import { LIVE } from '@/lib/data/core'
import { useChildOptions } from '@/lib/data/children'
import { addJournalFiles, removeJournal, signJournalMedia, signJustificatifs, useJournalEntry } from '@/lib/data/journal'
import { FinancesNotice, StatutBadge } from '@/components/journal/FinancesView'
import {
  allJustificatifs, fluxOf, partsCents, recurrenceOf, resteDuCents, sensOf, statutOf,
} from '@/lib/journal-finances'
import { saveBlob } from '@/lib/download'

// M05 — Détail d'une entrée. Supabase : journal_entries (RLS user_id = auth.uid()), images en URL signées 15 min.
export default function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('family.journal.detail')
  const fl = useFinanceLabels()
  const fmt = useFamilyFormat()
  const loc = fl.locale
  const formatMontant = fl.money
  const { id } = use(params)
  const router = useRouter()
  const { data: entry, loading, error, refresh } = useJournalEntry(id)
  const { options: childOptions } = useChildOptions()
  const draft = useImageDraft(id)
  const [sheet, setSheet] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')
  const [thumbs, setThumbs] = useState<(string | null)[]>([])
  const [justifUrls, setJustifUrls] = useState<(string | null)[]>([])
  const uploading = useRef(false)

  // URL signées (15 min) des justificatifs d'une dépense (mode connecté).
  const justifList = entry?.depense ? allJustificatifs(entry.depense) : []
  const justifKey = justifList.map((j) => j.path ?? '').filter(Boolean).join('|')
  useEffect(() => {
    if (!LIVE || !justifKey) return
    let alive = true
    void signJustificatifs(justifList).then((u) => { if (alive) setJustifUrls(u) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justifKey])

  // URL signées (15 min) des pièces jointes stockées.
  const mediaKey = entry?.media?.map((m) => m.path).join('|') ?? ''
  useEffect(() => {
    if (!LIVE || !entry?.media?.length) return
    let alive = true
    void signJournalMedia(entry.media).then((urls) => { if (alive) setThumbs(urls) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey])

  // Retour de « Ajouter des images » : envoi immédiat des fichiers choisis (mode connecté).
  useEffect(() => {
    if (!LIVE || !entry || draft.length === 0 || uploading.current) return
    uploading.current = true
    setNotice(t('uploadingImages'))
    addJournalFiles(entry.id, draft.map((d) => d.file))
      .then(async () => {
        clearDraft(id)
        await refresh()
        setNotice(t('imagesAdded'))
      })
      .catch((err: unknown) => setNotice(err instanceof Error ? err.message : t('uploadFailed')))
      .finally(() => { uploading.current = false })
  }, [entry, draft, id, refresh, t])

  if (!entry && (loading || error)) {
    return (
      <>
        <TopBar title={t('titleEvent')} showBack backHref="/app/journal" showBell={false} />
        {error ? (
          <ErrorState compact description={error.message} primary={{ label: t('retry'), onClick: () => void refresh() }} secondary={{ label: t('backToJournal'), href: '/app/journal' }} />
        ) : (
          <LoadingState compact title={t('loading')} description="" />
        )}
      </>
    )
  }

  if (!entry) {
    return (
      <>
        <TopBar title={t('titleEvent')} showBack backHref="/app/journal" showBell={false} />
        <EmptyState
          title={t('notFoundTitle')}
          description={t('notFoundText')}
          primary={{ label: t('backToJournal'), href: '/app/journal' }}
        />
      </>
    )
  }

  const day = parseDay(entry.date)
  // Horodatage de création (preuve) : date ET heure dans le fuseau de l'utilisateur (pas la date UTC).
  const createdAt = createdParts(entry)
  const created = parseDay(createdAt.day)
  const createdTime = createdAt.time
  const kids = childOptions.filter((c) => entry.childIds.includes(c.id)).map((c) => t('childOption', { name: c.prenom, count: c.age })).join(', ')
  const imageCount = entry.images.length + draft.length
  const dep = entry.type === 'depense' ? entry.depense : undefined
  const backHref = entry.type === 'depense' ? `/app/journal?filtre=finances&mois=${entry.date.slice(0, 7)}` : '/app/journal'

  // Champs financiers (affichage + export texte).
  const sens = dep ? sensOf(dep) : 'depense'
  const statut = dep ? statutOf(dep) : 'paye'
  const rec = dep ? recurrenceOf(dep) : 'ponctuel'
  // Sens « sortant » (dépense payée, remboursement versé), indépendamment du payeur.
  const outgoing = fluxOf({ sens }) === 'sortie'
  const payeur = dep ? fl.partieLabel(dep.payeurType ?? (outgoing ? 'moi' : undefined), dep.payeurLibelle) : undefined
  const beneficiaire = dep ? fl.partieLabel(dep.beneficiaireType ?? (outgoing ? undefined : 'moi'), dep.beneficiaire) : undefined
  const parts = dep ? partsCents(dep) : null
  const reste = dep ? resteDuCents(dep) : 0
  const fmtDay = (k: string) => fmt.day(k)
  const partsText = dep && parts
    ? t('summary.partsText', { mine: formatMontant(parts.moi, dep.devise), pct: parts.pct !== undefined ? ` (${parts.pct} %)` : '', other: formatMontant(parts.autre, dep.devise) })
    : ''

  const summary = [
    t('summary.typeTitle', { type: fl.type(entry.type), title: entry.title }),
    `${fmtDateFull(day, loc)}${entry.heure && !dep ? ` · ${fmtPlage(entry, loc)}` : ''}`,
    dep ? t('summary.direction', { value: fl.sens(sens) }) : '',
    dep ? t('summary.amount', { value: formatMontant(dep.montantCents, dep.devise) }) : '',
    dep ? t('summary.status', { value: fl.statut(statut) }) : '',
    dep && statut === 'partiel' && dep.montantPayeCents !== undefined
      ? t('summary.alreadyPaid', { paid: formatMontant(dep.montantPayeCents, dep.devise), rest: formatMontant(reste, dep.devise) }) : '',
    dep ? t('summary.category', { value: fl.category(dep.categorie) }) : '',
    dep ? t('summary.paymentMode', { value: fl.modeLabel(dep) }) : '',
    dep?.reference ? t('summary.reference', { value: dep.reference }) : '',
    payeur ? t('summary.payer', { value: payeur }) : '',
    beneficiaire ? t('summary.beneficiary', { value: beneficiaire }) : '',
    partsText ? t('summary.split', { value: partsText }) : '',
    dep && rec !== 'ponctuel' ? `${t('summary.recurrence', { value: fl.recurrence(rec) })}${dep.echeanceSuivante ? t('summary.nextDue', { date: fmtDay(dep.echeanceSuivante) }) : ''}` : '',
    dep ? t('summary.receipts', { value: justifList.length ? justifList.map((j) => j.name).join(', ') : t('summary.none') }) : '',
    entry.lieu ? t('summary.place', { value: entry.lieu }) : '',
    kids ? t('summary.children', { value: kids }) : '',
    entry.description ? `\n${entry.description}` : '',
  ].filter(Boolean).join('\n')

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: entry!.title, text: summary })
        return
      }
      await navigator.clipboard.writeText(summary)
      setNotice(t('copied'))
    } catch {
      /* partage annulé */
    }
  }

  function exportEntry() {
    // Export texte local ; l'export PDF signé passera par lib/pdf côté serveur.
    const createdLine = createdTime
      ? t('createdOnAt', { date: fmtDateMedium(created, loc), time: fmtHeure(createdTime, loc) })
      : t('createdOn', { date: fmtDateMedium(created, loc) })
    const blob = new Blob([summary + `\n\n${createdLine}\n`], { type: 'text/plain;charset=utf-8' })
    saveBlob(blob, `journal-${entry!.date}-${entry!.id}.txt`)
    setNotice(t('exported'))
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      // Supabase : suppression logique (deleted_at) ; purge des pièces par le job de rétention.
      await removeJournal(entry!.id)
      router.push(backHref)
    } catch (err) {
      setDeleting(false)
      setConfirm(false)
      setNotice(err instanceof Error ? err.message : t('deleteFailed'))
    }
  }

  const iconBtn = 'grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50'

  return (
    <>
      <TopBar
        title={dep ? t('titleExpense') : t('titleEvent')}
        showBack
        backHref={backHref}
        showBell={false}
        rightSlot={
          <span className="-mr-2 flex">
            <Link href={`/app/journal/nouveau?id=${entry.id}`} aria-label={t('edit')} className={iconBtn}>
              <Pencil aria-hidden="true" className="h-[19px] w-[19px]" />
            </Link>
            <button type="button" onClick={() => setSheet(true)} aria-label={t('moreActions')} aria-haspopup="dialog" className={iconBtn}>
              <EllipsisVertical aria-hidden="true" className="h-5 w-5" />
            </button>
          </span>
        }
      />

      <article className="px-4 pb-6 pt-3">
        <header className="flex flex-col items-center text-center">
          <JournalTypeIcon type={entry.type} size="lg" className="motion-safe:animate-fade-up" />
          <EventTypePill type={entry.type} className="mt-2" />
          <h2 className="mt-3 text-[19px] font-extrabold leading-tight text-night-900">{entry.title}</h2>
          {dep && (
            <>
              <p className="mt-2 text-[26px] font-extrabold tabular-nums tracking-tight text-night-900">
                {formatMontant(dep.montantCents, dep.devise)}
              </p>
              <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[12px] font-semibold text-night-700">
                {fl.sens(sens)}
                <StatutBadge statut={statut} />
              </p>
            </>
          )}
          <p className="mt-2 text-[13px] text-night-700">{fmtDateFull(day, loc)}</p>
          {entry.heure && !dep && <p className="mt-0.5 text-[13px] tabular-nums text-night-700">{fmtPlage(entry, loc)}</p>}
        </header>

        {dep && (
          <dl className="mt-5 divide-y divide-night-100 rounded-2xl border border-night-100 bg-white px-4 shadow-soft">
            <Row icon={<Tag className="h-5 w-5" />} label={t('category')}>{fl.category(dep.categorie)}</Row>
            <Row icon={<CreditCard className="h-5 w-5" />} label={t('paymentMode')}>{fl.modeLabel(dep)}</Row>
            {dep.reference && <Row icon={<Hash className="h-5 w-5" />} label={t('reference')}><span className="break-all">{dep.reference}</span></Row>}
            {(payeur || beneficiaire) && (
              <Row icon={<ArrowLeftRight className="h-5 w-5" />} label={t('payerAndBeneficiary')}>
                {payeur && <span className="block">{t('paidBy', { value: payeur })}</span>}
                {beneficiaire && <span className="block">{t('beneficiaryValue', { value: beneficiaire })}</span>}
              </Row>
            )}
            {statut !== 'paye' && (
              <Row icon={<CircleDot className="h-5 w-5" />} label={t('status')}>
                {fl.statut(statut)}
                {statut === 'partiel' && dep.montantPayeCents !== undefined && (
                  <span className="block tabular-nums">
                    {t('alreadyPaidRest', { paid: formatMontant(dep.montantPayeCents, dep.devise), rest: formatMontant(reste, dep.devise) })}
                  </span>
                )}
                {statut === 'en-attente' && <span className="block">{t('pendingNote')}</span>}
              </Row>
            )}
            {parts && (
              <Row icon={<PieChart className="h-5 w-5" />} label={t('split')}>
                <span className="block tabular-nums">{t('myShare', { value: formatMontant(parts.moi, dep.devise) })}{parts.pct !== undefined ? ` (${parts.pct} %)` : ''}</span>
                <span className="block tabular-nums">{t('otherShare', { value: formatMontant(parts.autre, dep.devise) })}{parts.pct !== undefined ? ` (${100 - parts.pct} %)` : ''}</span>
              </Row>
            )}
            {rec !== 'ponctuel' && (
              <Row icon={<Repeat className="h-5 w-5" />} label={t('recurrence')}>
                {fl.recurrence(rec)}
                {dep.echeanceSuivante && <span className="block">{t('nextDue', { date: fmtDay(dep.echeanceSuivante) })}</span>}
              </Row>
            )}
            <Row icon={<Paperclip className="h-5 w-5" />} label={justifList.length > 1 ? t('receiptsCount', { count: justifList.length }) : t('receipt')}>
              {justifList.length ? (
                <ul className="space-y-0.5">
                  {justifList.map((j, i) => (
                    <li key={`${j.path ?? j.name}-${i}`}>
                      {justifUrls[i] ? (
                        <a href={justifUrls[i]!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-leaf-600 underline-offset-2 hover:underline">
                          <FileText aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                          {j.name}
                          <span className="sr-only"> {t('newTab')}</span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <FileText aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                          {j.name}{j.sizeBytes ? ` · ${fmtSize(j.sizeBytes, loc)}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  {t('noReceipt')}{' '}
                  <Link href={`/app/journal/nouveau?id=${entry.id}`} className="font-semibold text-leaf-600 underline underline-offset-2">{t('addReceipt')}</Link>
                </>
              )}
            </Row>
          </dl>
        )}

        <dl className="mt-5 divide-y divide-night-100 rounded-2xl border border-night-100 bg-white px-4 shadow-soft">
          <Row icon={<CalendarDays className="h-5 w-5" />} label={dep ? (outgoing ? t('dateExpense') : t('dateReceived')) : t('dateTime')}>
            {entry.heure && !dep ? t('dateAt', { date: fmtDateMedium(day, loc), time: fmtHeure(entry.heure, loc) }) : fmtDateMedium(day, loc)}
          </Row>
          {entry.lieu && <Row icon={<MapPin className="h-5 w-5" />} label={t('place')}>{entry.lieu}</Row>}
          {kids && <Row icon={<Users className="h-5 w-5" />} label={t('children')}>{kids}</Row>}
          {entry.description && (
            <Row icon={<Clock3 className="h-5 w-5" />} label={t('description')}>
              <span className="whitespace-pre-wrap">{entry.description}</span>
            </Row>
          )}
        </dl>

        {dep && <FinancesNotice className="mt-5" />}

        {(!dep || entry.images.length > 0) && <section aria-labelledby="imgs" className="mt-5">
          <h3 id="imgs" className="mb-2.5 text-[13px] font-bold text-night-900">{t('images', { count: imageCount })}</h3>
          <ul className="grid grid-cols-3 gap-2.5">
            {entry.images.map((img, i) => (
              <li key={`${img.name}-${i}`}>
                {thumbs[i] && entry.media?.[i]?.mime.startsWith('image/') ? (
                  <a href={thumbs[i]!} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
                    <img src={thumbs[i]!} alt={img.name} width={120} height={108} className="aspect-[1/0.9] w-full rounded-xl object-cover" />
                  </a>
                ) : (
                <figure
                  className={
                    'grid aspect-[1/0.9] place-items-center overflow-hidden rounded-xl ' +
                    (i % 2 ? 'bg-gradient-to-br from-gold-100 to-alert-100 text-alert-300' : 'bg-gradient-to-br from-night-100 to-gold-100 text-night-300')
                  }
                >
                  <ImageIcon aria-hidden="true" className="h-7 w-7" strokeWidth={1.5} />
                  <figcaption className="sr-only">{img.name}</figcaption>
                </figure>
                )}
              </li>
            ))}
            {draft.map((d) => (
              <li key={d.id}>
                {d.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local (object URL)
                  <img src={d.previewUrl} alt={d.file.name} width={120} height={108} className="aspect-[1/0.9] w-full rounded-xl object-cover" />
                ) : (
                  <span className="grid aspect-[1/0.9] place-items-center rounded-xl bg-night-50 px-2 text-center text-[11px] text-night-700">{d.file.name}</span>
                )}
              </li>
            ))}
            {imageCount < 10 && (
              <li>
                <Link
                  href={`/app/journal/${entry.id}/images`}
                  aria-label={t('addImages')}
                  className="grid aspect-[1/0.9] place-items-center rounded-xl border border-night-100 bg-night-50/70 text-night-900 transition-colors hover:bg-night-50"
                >
                  <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
                </Link>
              </li>
            )}
          </ul>
        </section>}

        <dl className="mt-5 rounded-2xl border border-night-100 bg-white px-4 shadow-soft">
          <Row icon={<CalendarDays className="h-5 w-5" />} label={t('createdLabel')}>
            {createdTime ? t('dateAt', { date: fmtDateMedium(created, loc), time: fmtHeure(createdTime, loc) }) : fmtDateMedium(created, loc)}
          </Row>
        </dl>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <ActionTile icon={<Share className="h-5 w-5" />} label={t('share')} onClick={share} />
          <ActionTile icon={<Download className="h-5 w-5" />} label={t('export')} onClick={exportEntry} />
          <ActionTile icon={<Trash2 className="h-5 w-5" />} label={t('delete')} danger onClick={() => setConfirm(true)} />
        </div>

        <p role="status" aria-live="polite" className="mt-3 min-h-[1rem] text-center text-xs font-medium text-leaf-700">
          {notice}
        </p>
      </article>

      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={t('actions')}
        actions={[
          { key: 'edit', label: t('edit'), icon: <Pencil className="h-5 w-5" aria-hidden="true" />, onClick: () => router.push(`/app/journal/nouveau?id=${entry.id}`) },
          { key: 'share', label: t('share'), icon: <Share className="h-5 w-5" aria-hidden="true" />, onClick: () => void share() },
          { key: 'export', label: t('export'), icon: <Download className="h-5 w-5" aria-hidden="true" />, onClick: exportEntry },
          { key: 'delete', label: t('delete'), variant: 'danger', icon: <Trash2 className="h-5 w-5" aria-hidden="true" />, onClick: () => setConfirm(true) },
        ]}
      />

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title={dep ? t('deleteExpenseTitle') : t('deleteEventTitle')}
        description={dep ? t('deleteExpenseText') : t('deleteEventText')}
        confirmLabel={t('delete')}
        tone="danger"
      />
    </>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 py-3.5">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-leaf-600">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] font-bold text-night-900">{label}</dt>
        <dd className="mt-0.5 break-words text-[12px] leading-relaxed text-night-700">{children}</dd>
      </div>
    </div>
  )
}

function ActionTile({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border bg-white text-[11.5px] font-bold transition-colors motion-safe:active:scale-[.98] ' +
        (danger ? 'border-alert-100 text-alert-600 hover:bg-alert-50' : 'border-night-100 text-night-900 hover:bg-night-50')
      }
    >
      <span aria-hidden="true" className={danger ? 'text-alert-500' : 'text-night-900'}>{icon}</span>
      {label}
    </button>
  )
}
