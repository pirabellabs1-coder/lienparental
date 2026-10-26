'use client'

import { Fragment, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Info, Lock, MessageCircle } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { Composer } from '@/components/messages/Composer'
import { InfoSheet } from '@/components/messages/InfoSheet'
import { MessageBubble } from '@/components/messages/MessageBubble'
import { ToneCheckSheet } from '@/components/messages/ToneCheckSheet'
import { dayKey, dayLabel } from '@/components/messages/format'
import { analyzeTone, TONE_THRESHOLD, type ToneAnalysis } from '@/components/messages/toneCheck'
import type { VoiceClip } from '@/components/messages/useVoiceRecorder'
import { FolderPickerSheet } from '@/components/coffre/FolderSheets'
import { listCategories } from '@/lib/data/vault'
import {
  DEFAULT_VAULT_SETTINGS, getVaultSettings, listFolders, listMyFolderShares, saveOutcomeMessage,
  type FolderShare, type VaultFolder, type VaultSettings,
} from '@/lib/data/vault-folders'
import {
  DEFAULT_VAULT_CATEGORY, conversationLabel, displayName, getConversation, getMe, listMessages, markConversationRead,
  participantsLabel, saveToVault, sendMessage, setConversationArchived, subscribeToConversation, syncVault, validateAttachment,
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
      return p ? displayName(p) : 'Autre parent'
    },
    [others],
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
        announce(`Nouveau message de ${nameOf(message.senderId)}`)
        if (document.visibilityState === 'visible') void markConversationRead(conversationId, me.id)
        if (message.attachment) void refreshVault()
      }
    })
  }, [status, me, conversationId, announce, nameOf, refreshVault])

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
      if (err) { setError(err); return }
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
      announce(attachment && autoVault ? `Message envoyé. Pièce jointe ajoutée au coffre-fort (${category}).` : 'Message envoyé')
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le message n'a pas pu être envoyé. Réessayez.")
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
      announce(autoVault ? `Note vocale envoyée et ajoutée au coffre-fort (${category}).` : 'Note vocale envoyée')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "La note vocale n'a pas pu être envoyée. Réessayez.")
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
      const analysis = await analyzeTone(body, others.length === 1 ? others[0].prenom : '')
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
      const blob = await renderConversationPdf({ me, participants: conv.participants, title: conv.title, messages })
      const stamp = new Date().toISOString().slice(0, 10)
      const slug = (conv.title ?? conv.participants.map((p) => p.prenom).join('-'))
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'conversation'
      downloadBlob(blob, `Conversation-${slug}-${stamp}.pdf`)
      announce('Conversation exportée en PDF')
      setInfoOpen(false)
    } catch {
      announce("L'export PDF a échoué. Réessayez.")
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
      announce(conv.archived ? 'Conversation ressortie des archives' : 'Conversation archivée')
    } catch (err) {
      announce(err instanceof Error ? err.message : "L'action n'a pas abouti. Réessayez.")
    } finally {
      setArchiving(false)
    }
  }

  const now = useMemo(() => new Date(), [])

  if (status === 'error' || status === 'notfound') {
    return (
      <>
        <TopBar title="Conversation" showBack backHref="/app/messages" showBell={false} />
        {status === 'notfound' ? (
          <ErrorState compact title="Conversation introuvable" description="Elle n'existe pas ou vous n'y participez pas." primary={{ label: 'Retour aux messages', href: '/app/messages' }} />
        ) : (
          <ErrorState compact title="Conversation indisponible" description="Vérifiez votre connexion puis réessayez." primary={{ label: 'Réessayer', onClick: () => void load() }} secondary={{ label: 'Retour aux messages', href: '/app/messages' }} />
        )}
      </>
    )
  }

  if (status === 'loading' || !me || !conv || !messages) {
    return (
      <>
        <TopBar title="Conversation" showBack backHref="/app/messages" showBell={false} />
        <LoadingState compact title="Chargement de la conversation" description="" />
      </>
    )
  }

  const group = others.length > 1
  const recipients = others.length === 1 ? others[0].prenom || displayName(others[0]) : 'chaque participant'

  return (
    <>
      <TopBar
        title={conversationLabel(conv)}
        subtitle={conv.title ? `Avec ${participantsLabel(others)}` : others.length === 1 ? 'Parent lié' : `${others.length + 1} participants`}
        showBack
        backHref="/app/messages"
        showBell={false}
        className="border-b border-night-100/70"
        rightSlot={
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="Informations, archivage et export de la conversation"
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
          Messages horodatés, ni modifiables ni supprimables
        </p>
        {conv.archived && (
          <p className="mx-auto mb-3 inline-flex max-w-md items-center gap-2 rounded-xl bg-night-50 px-3 py-2 text-[12px] text-night-800">
            <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
            Conversation archivée. Vous pouvez toujours écrire, ou la ressortir des archives depuis le bouton Informations.
          </p>
        )}

        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xs flex-col items-center py-12 text-center">
            <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-leaf-50 text-leaf-600">
              <MessageCircle className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-[15px] font-bold text-night-900">Aucun message pour le moment</h2>
            <p className="mt-1 text-[13px] text-night-600">
              {conv.title ? `Lancez la discussion « ${conv.title} »` : `Écrivez à ${recipients}`} : un message court et factuel facilite l&apos;échange.
            </p>
          </div>
        ) : (
          <ol ref={listRef} aria-label={`Messages, ${conversationLabel(conv)}`} className="space-y-3 pb-4">
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
        title="Mettre au coffre-fort"
        description={saveFor?.attachment
          ? `« ${saveFor.kind === 'audio' ? 'Note vocale' : saveFor.attachment.name} » sera copié dans votre coffre-fort. Choisissez son emplacement.`
          : undefined}
        folders={folders}
        initial={null}
        shares={folderShares}
        confirmLabel="Ajouter"
        onConfirm={async (folderId) => {
          if (!saveFor) return null
          try {
            const { link, outcome } = await saveToVault(conversationId, saveFor.id, folderId)
            setVault((v) => ({ ...v, [saveFor.id]: link }))
            setSaveFor(null)
            announce(saveOutcomeMessage(outcome))
            return null
          } catch (e) {
            return e instanceof Error ? e.message : "La pièce jointe n'a pas pu être ajoutée au coffre-fort."
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
