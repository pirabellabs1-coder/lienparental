'use client'

import { Fragment, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Archive, Info, Lock, MessageCircle } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { Composer } from '@/components/messages/Composer'
import { InfoSheet } from '@/components/messages/InfoSheet'
import { MessageBubble } from '@/components/messages/MessageBubble'
import { ToneCheckSheet } from '@/components/messages/ToneCheckSheet'
import { dayKey } from '@/components/messages/format'
import { useMessagesFormat } from '@/components/messages/useMessagesFormat'
import type { ConversationPdfLabels } from '@/components/messages/conversationPdf'
import { analyzeTone, TONE_THRESHOLD, type ToneAnalysis } from '@/components/messages/toneCheck'
import type { VoiceClip } from '@/components/messages/useVoiceRecorder'
import { FolderPickerSheet } from '@/components/coffre/FolderSheets'
import { listCategories } from '@/lib/data/vault'
import {
  DEFAULT_VAULT_SETTINGS, getVaultSettings, listFolders, listMyFolderShares, saveOutcomeMessage,
  type FolderShare, type VaultFolder, type VaultSettings,
} from '@/lib/data/vault-folders'
import {
  ALLOWED_ATTACHMENT_MIME, DEFAULT_VAULT_CATEGORY, MAX_ATTACHMENT_BYTES, getConversation, getMe, listMessages, markConversationRead,
  saveToVault, sendMessage, setConversationArchived, subscribeToConversation, syncVault, validateAttachment,
  type ConversationSummary, type Message, type Participant, type VaultLink,
} from '@/lib/messages'

const TONE_PREF_KEY = 'lp.messages.tonecheck'
const FALLBACK_CATEGORIES = ['Courriers', 'Dossier JAF', 'Scolarité', 'Santé', 'Finances', 'Autres']

type Pending = { text: string; file: File | null; analysis: ToneAnalysis }

function scrollToEnd(smooth: boolean) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' })
}

// Conversation : messages horodatés et immuables, accusés de lecture, pièces jointes et
// notes vocales à mettre au coffre-fort (à la demande, ou automatiquement si le parent l'a
// activé dans les réglages du coffre), vérification du ton (Coach IA), export PDF.
export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params)
  const t = useTranslations('messaging.conversation')
  const tm = useTranslations('messaging')
  const fmt = useMessagesFormat()
  const { conversationLabel, displayName, participantsLabel, dayLabel } = fmt
  const conversationId = decodeURIComponent(rawId)

  const [me, setMe] = useState<Participant | null>(null)
  const [conv, setConv] = useState<ConversationSummary | null>(null)
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading')
  const [vault, setVault] = useState<Record<string, VaultLink>>({})
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES)
  const [vaultCategory, setVaultCategory] = useState(DEFAULT_VAULT_CATEGORY)
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>(DEFAULT_VAULT_SETTINGS)
  const [folders, setFolders] = useState<VaultFolder[]>([])
  const [folderShares, setFolderShares] = useState<FolderShare[]>([])
  const [saveFor, setSaveFor] = useState<Message | null>(null)
  const autoVault = vaultSettings.autoImportMessages

  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [toneCheck, setToneCheck] = useState(true)
  const [busy, setBusy] = useState<'idle' | 'checking' | 'sending'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { announce, node: announcer } = useAnnounce()

  // Préférence « Vérification du ton » (activée par défaut).
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(TONE_PREF_KEY) === 'off') setToneCheck(false)
    } catch { /* stockage indisponible */ }
  }, [])

  const onToneCheckChange = (v: boolean) => {
    setToneCheck(v)
    try { window.sessionStorage.setItem(TONE_PREF_KEY, v ? 'on' : 'off') } catch { /* mémoire seule */ }
  }

  const refreshVault = useCallback(async (opts: { messageId?: string; categoryName?: string } = {}) => {
    try {
      const links = await syncVault(conversationId, opts)
      setVault(links)
    } catch {
      /* rangement repris à la prochaine ouverture : jamais bloquant pour la conversation */
    }
  }, [conversationId])

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const [who, c] = await Promise.all([getMe(), getConversation(conversationId)])
      if (!c) { setStatus('notfound'); return }
      const list = await listMessages(conversationId)
      setMe(who)
      setConv(c)
      setMessages(list)
      setStatus('ready')
      void markConversationRead(conversationId, who.id)
      void refreshVault()
    } catch {
      setStatus('error')
    }
  }, [conversationId, refreshVault])

  useEffect(() => { void load() }, [load])

  // Réglage « Ranger automatiquement » (désactivé par défaut) et dossiers du coffre
  // (feuille « Mettre au coffre-fort »). Échec : valeurs par défaut, jamais bloquant.
  useEffect(() => {
    let alive = true
    getVaultSettings().then((v) => { if (alive) setVaultSettings(v) }, () => { /* désactivé */ })
    listFolders().then((f) => { if (alive) setFolders(f.filter((x) => x.mine)) }, () => { /* racine seule */ })
    listMyFolderShares().then((x) => { if (alive) setFolderShares(x) }, () => { /* pas d'indication de partage */ })
    return () => { alive = false }
  }, [])

  // Catégories du coffre (sélecteur « Ranger dans »).
  useEffect(() => {
    let alive = true
    listCategories()
      .then((cats) => {
        if (!alive) return
        const names = cats.map((c) => c.name)
        if (names.length) setCategories(names.includes(DEFAULT_VAULT_CATEGORY) ? names : [DEFAULT_VAULT_CATEGORY, ...names])
      })
      .catch(() => { /* liste par défaut */ })
    return () => { alive = false }
  }, [])

  const others = conv?.participants ?? []
  const nameOf = useCallback(
    (id: string) => {
      const p = others.find((x) => x.id === id)
      return p ? displayName(p) : tm('format.otherParent')
    },
    [others, displayName, tm],
  )

  // Temps réel : nouveaux messages et accusés de lecture.
  useEffect(() => {
    if (status !== 'ready' || !me) return
    return subscribeToConversation(conversationId, ({ type, message }) => {
      setMessages((list) => {
        if (!list) return list
        const idx = list.findIndex((m) => m.id === message.id)
        if (type === 'insert' && idx < 0) return [...list, message]
        if (idx >= 0) {
          const next = list.slice()
          next[idx] = message
          return next
        }
        return list
      })
      if (type === 'insert' && message.senderId !== me.id) {
        announce(t('newMessageFrom', { name: nameOf(message.senderId) }))
        if (document.visibilityState === 'visible') void markConversationRead(conversationId, me.id)
        if (message.attachment) void refreshVault()
      }
    })
  }, [status, me, conversationId, announce, nameOf, refreshVault, t])

  // Contenu chargé après coup (aperçus d'images, mentions « Dans le coffre-fort ») :
  // si l'on était en bas de la conversation, on y reste.
  const listRef = useRef<HTMLOListElement>(null)
  const atBottom = useRef(true)
  useEffect(() => {
    const onScroll = () => {
      atBottom.current = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 160
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const hasList = status === 'ready' && (messages?.length ?? 0) > 0
  useEffect(() => {
    const el = listRef.current
    if (!hasList || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (atBottom.current) scrollToEnd(false) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasList])

  // Défilement en bas : au chargement, puis à chaque nouveau message.
  const count = messages?.length ?? 0
  const firstScroll = useRef(true)
  useEffect(() => {
    if (count === 0) return
    scrollToEnd(!firstScroll.current)
    firstScroll.current = false
  }, [count])

  const pickFile = (f: File | null) => {
    setError(null)
    if (f) {
      const err = validateAttachment(f)
      if (err) {
        // Même contrôle que validateAttachment, message dans la langue de l'utilisateur.
        const key = !(ALLOWED_ATTACHMENT_MIME as readonly string[]).includes(f.type) ? 'format'
          : f.size > MAX_ATTACHMENT_BYTES ? 'tooBig'
            : f.size === 0 ? 'empty' : null
        setError(key ? tm(`attachmentErrors.${key}`) : err)
        return
      }
    }
    setFile(f)
  }

  const afterSend = (sent: Message, category: string) => {
    setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [...list, sent] : list))
    if (sent.attachment && autoVault) {
      setVault((v) => ({ ...v, [sent.id]: v[sent.id] ?? { messageId: sent.id, documentId: null, status: 'pending', categoryName: category } }))
      void refreshVault({ messageId: sent.id, categoryName: category })
    }
  }

  const deliver = async (body: string, attachment: File | null) => {
    if (!me) return
    setBusy('sending')
    setError(null)
    const category = vaultCategory
    try {
      const sent = await sendMessage({ me, conversationId }, body, attachment, { vaultCategory: category })
      afterSend(sent, category)
      setText('')
      setFile(null)
      setVaultCategory(DEFAULT_VAULT_CATEGORY)
      announce(attachment && autoVault ? t('sentWithVault', { category }) : t('sent'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sendFailed'))
    } finally {
      setBusy('idle')
      textareaRef.current?.focus()
    }
  }

  const sendVoice = async (clip: VoiceClip): Promise<boolean> => {
    if (!me || busy !== 'idle') return false
    setBusy('sending')
    setError(null)
    const category = vaultCategory
    try {
      const ext = clip.mime === 'audio/mp4' ? 'm4a' : clip.mime.split('/')[1] ?? 'webm'
      const f = new File([clip.blob], `note-vocale.${ext}`, { type: clip.mime })
      const sent = await sendMessage({ me, conversationId }, '', f, { audioDurationMs: clip.durationMs, vaultCategory: category })
      afterSend(sent, category)
      setVaultCategory(DEFAULT_VAULT_CATEGORY)
      announce(autoVault ? t('voiceSentWithVault', { category }) : t('voiceSent'))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : t('voiceFailed'))
      return false
    } finally {
      setBusy('idle')
    }
  }

  const onSubmit = async () => {
    if (!me || busy !== 'idle') return
    const body = text.trim()
    if (toneCheck && body.length >= 4) {
      setBusy('checking')
      // Alerte et reformulation locale dans la langue de l'interface (détection multilingue : toneLocal).
      const analysis = await analyzeTone(body, others.length === 1 ? others[0].prenom : '', {
        openingNamed: (name) => tm('tone.local.openingNamed', { name }),
        opening: tm('tone.local.opening'),
        closing: tm('tone.local.closing'),
        resume: tm('tone.local.resume'),
      })
      setBusy('idle')
      if (analysis && analysis.agressivite >= TONE_THRESHOLD) {
        setPending({ text: body, file, analysis })
        return
      }
    }
    await deliver(body, file)
  }

  const exportPdf = async () => {
    if (!me || !conv || !messages) return
    setExporting(true)
    try {
      const { renderConversationPdf, downloadBlob } = await import('@/components/messages/conversationPdf')
      const labels: ConversationPdfLabels = {
        noMessages: tm('pdf.noMessages'),
        dateTime: fmt.numericStamp,
        displayName: fmt.displayName,
        participantsLabel: fmt.participantsLabel,
        otherParent: tm('pdf.otherParent'),
        voiceNote: (duration) => tm('pdf.voiceNote', { duration }),
        attachment: (name) => tm('pdf.attachment', { name }),
        readOn: (date) => tm('pdf.readOn', { date }),
        docTitle: (meName, othersNames) => tm('pdf.docTitle', { me: meName, others: othersNames }),
        header: tm('pdf.header'),
        footer: (date) => tm('pdf.footer', { date }),
        eyebrow: tm('pdf.eyebrow'),
        titleWith: (names) => tm('pdf.titleWith', { names }),
        topic: tm('pdf.topic'),
        participants: tm('pdf.participants'),
        count: tm('pdf.count'),
        period: tm('pdf.period'),
        periodValue: (from, to) => tm('pdf.periodValue', { from, to }),
        generated: tm('pdf.generated'),
        notice: tm('pdf.notice'),
      }
      const blob = await renderConversationPdf({ me, participants: conv.participants, title: conv.title, messages, labels })
      const stamp = new Date().toISOString().slice(0, 10)
      const slug = (conv.title ?? conv.participants.map((p) => p.prenom).join('-'))
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'conversation'
      downloadBlob(blob, `Conversation-${slug}-${stamp}.pdf`)
      announce(t('exported'))
      setInfoOpen(false)
    } catch {
      announce(t('exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const toggleArchive = async () => {
    if (!conv) return
    setArchiving(true)
    try {
      await setConversationArchived(conv.id, !conv.archived)
      setConv({ ...conv, archived: !conv.archived })
      announce(conv.archived ? t('unarchived') : t('archived'))
    } catch (err) {
      announce(err instanceof Error ? err.message : t('actionFailed'))
    } finally {
      setArchiving(false)
    }
  }

  const now = useMemo(() => new Date(), [])

  if (status === 'error' || status === 'notfound') {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app/messages" showBell={false} />
        {status === 'notfound' ? (
          <ErrorState compact title={t('notFoundTitle')} description={t('notFoundDescription')} primary={{ label: t('backToMessages'), href: '/app/messages' }} />
        ) : (
          <ErrorState compact title={t('errorTitle')} description={t('errorDescription')} primary={{ label: t('retry'), onClick: () => void load() }} secondary={{ label: t('backToMessages'), href: '/app/messages' }} />
        )}
      </>
    )
  }

  if (status === 'loading' || !me || !conv || !messages) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app/messages" showBell={false} />
        <LoadingState compact title={t('loading')} description="" />
      </>
    )
  }

  const group = others.length > 1
  const recipients = others.length === 1 ? others[0].prenom || displayName(others[0]) : t('everyParticipant')

  return (
    <>
      <TopBar
        title={conversationLabel(conv)}
        subtitle={conv.title ? t('with', { names: participantsLabel(others) }) : others.length === 1 ? t('linkedParent') : t('participants', { count: others.length + 1 })}
        showBack
        backHref="/app/messages"
        showBell={false}
        className="border-b border-night-100/70"
        rightSlot={
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label={t('infoButton')}
            aria-haspopup="dialog"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
          >
            <Info className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
        }
      />

      <div className="flex w-full flex-col px-5 pt-3 lg:px-6">
        <p className="mx-auto mb-3 inline-flex max-w-md items-center gap-2 rounded-full bg-night-50 px-3 py-1.5 text-center text-[11px] font-semibold text-night-700">
          <Lock className="h-3.5 w-3.5 shrink-0 text-leaf-600" aria-hidden="true" />
          {t('immutableBanner')}
        </p>
        {conv.archived && (
          <p className="mx-auto mb-3 inline-flex max-w-md items-center gap-2 rounded-xl bg-night-50 px-3 py-2 text-[12px] text-night-800">
            <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('archivedBanner')}
          </p>
        )}

        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xs flex-col items-center py-12 text-center">
            <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-leaf-50 text-leaf-600">
              <MessageCircle className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-[15px] font-bold text-night-900">{t('emptyTitle')}</h2>
            <p className="mt-1 text-[13px] text-night-600">
              {t('emptyHint', { lead: conv.title ? t('emptyStartTopic', { title: conv.title }) : t('emptyWriteTo', { name: recipients }) })}
            </p>
          </div>
        ) : (
          <ol ref={listRef} aria-label={t('listLabel', { label: conversationLabel(conv) })} className="space-y-3 pb-4">
            {messages.map((m, i) => {
              const newDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt)
              const showSender = group && (i === 0 || messages[i - 1].senderId !== m.senderId || newDay)
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className="flex items-center gap-3 py-1">
                      <span aria-hidden="true" className="h-px flex-1 bg-night-100" />
                      <h2 className="text-[11px] font-bold uppercase tracking-wide text-night-600">{dayLabel(m.createdAt, now)}</h2>
                      <span aria-hidden="true" className="h-px flex-1 bg-night-100" />
                    </li>
                  )}
                  <MessageBubble
                    message={m}
                    mine={m.senderId === me.id}
                    senderName={nameOf(m.senderId)}
                    showSender={showSender}
                    vault={vault[m.id]}
                    onSaveToVault={setSaveFor}
                  />
                </Fragment>
              )
            })}
          </ol>
        )}

        <div className="sticky z-20 -mx-5 bg-white/95 px-3 pb-2 pt-2 backdrop-blur [bottom:calc(4rem+env(safe-area-inset-bottom,0px))] lg:mx-0 lg:px-0 lg:[bottom:1rem]">
          <Composer
            value={text}
            onChange={(v) => { setText(v); if (error) setError(null) }}
            file={file}
            onPickFile={pickFile}
            toneCheck={toneCheck}
            onToneCheckChange={onToneCheckChange}
            onSubmit={() => void onSubmit()}
            onSendVoice={sendVoice}
            busy={busy}
            error={error}
            textareaRef={textareaRef}
            vaultCategories={autoVault ? categories : []}
            vaultCategory={vaultCategory}
            onVaultCategoryChange={setVaultCategory}
            recipients={recipients.charAt(0).toUpperCase() + recipients.slice(1)}
            announce={announce}
          />
        </div>
      </div>

      <ToneCheckSheet
        open={pending !== null}
        original={pending?.text ?? ''}
        analysis={pending?.analysis ?? null}
        onUseReformulation={() => {
          if (!pending) return
          const p = pending
          setPending(null)
          void deliver(p.analysis.reformulation, p.file)
        }}
        onSendAsIs={() => {
          if (!pending) return
          const p = pending
          setPending(null)
          void deliver(p.text, p.file)
        }}
        onEdit={() => {
          setPending(null)
          requestAnimationFrame(() => textareaRef.current?.focus())
        }}
      />

      <FolderPickerSheet
        open={saveFor !== null}
        onClose={() => setSaveFor(null)}
        title={t('saveTitle')}
        description={saveFor?.attachment
          ? t('saveDescription', { name: saveFor.kind === 'audio' ? tm('format.voiceNote') : saveFor.attachment.name })
          : undefined}
        folders={folders}
        initial={null}
        shares={folderShares}
        confirmLabel={t('saveConfirm')}
        onConfirm={async (folderId) => {
          if (!saveFor) return null
          try {
            const { link, outcome } = await saveToVault(conversationId, saveFor.id, folderId)
            setVault((v) => ({ ...v, [saveFor.id]: link }))
            setSaveFor(null)
            announce(saveOutcomeMessage(outcome))
            return null
          } catch (e) {
            return e instanceof Error ? e.message : t('saveFailed')
          }
        }}
      />

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        me={me}
        participants={others}
        title={conv.title}
        count={messages.length}
        exporting={exporting}
        onExport={() => void exportPdf()}
        archived={conv.archived}
        archiving={archiving}
        onToggleArchive={() => void toggleArchive()}
      />
      {announcer}
    </>
  )
}
