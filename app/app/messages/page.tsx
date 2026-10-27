'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FolderLock, Lock, MessageCircle, Plus, Search, Sparkles, X } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { SegmentedTabs } from '@/components/coffre/SegmentedTabs'
import { btn, card } from '@/components/ui/kit'
import { InviteCard } from '@/components/messages/InviteCard'
import { ConversationRow } from '@/components/messages/ConversationRow'
import { NewConversationSheet } from '@/components/messages/NewConversationSheet'
import { useMessagesFormat } from '@/components/messages/useMessagesFormat'
import { cn } from '@/lib/cn'
import {
  getMe, getPendingInvite, listConversations, listMessageableParents,
  setConversationArchived,
  type ConversationSummary, type CoparentInvite, type Participant,
} from '@/lib/messages'

type Data = {
  me: Participant
  conversations: ConversationSummary[]
  linked: Participant[]
  invite: CoparentInvite | null
}

type Tab = 'actives' | 'archives'

/** Comparaison insensible aux accents et à la casse. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Historique des conversations entre parents : recherche, archives, nouvelle discussion.
// Démo : ?apercu=invitation affiche l'écran sans parent lié ; ?nouvelle=1 ouvre la création.
export default function MessagesPage() {
  const t = useTranslations('messaging.list')
  const { conversationLabel, participantsLabel, previewText } = useMessagesFormat()
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('actives')
  const [creating, setCreating] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const { announce, node: announcer } = useAnnounce()

  const load = useCallback(async () => {
    setError(false)
    try {
      const [me, conversations, linked, invite] = await Promise.all([
        getMe(), listConversations(), listMessageableParents(), getPendingInvite(),
      ])
      setData({ me, conversations, linked, invite })
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('nouvelle') === '1') setCreating(true)
  }, [])

  const counts = useMemo(() => {
    const list = data?.conversations ?? []
    return { actives: list.filter((c) => !c.archived).length, archives: list.filter((c) => c.archived).length }
  }, [data])

  const visible = useMemo(() => {
    if (!data) return []
    const q = fold(query.trim())
    return data.conversations
      .filter((c) => (tab === 'archives' ? c.archived : !c.archived))
      .filter((c) => {
        if (!q) return true
        const hay = [conversationLabel(c), participantsLabel(c.participants), c.lastMessage ? previewText(c.lastMessage) : '']
        return hay.some((h) => fold(h).includes(q))
      })
  }, [data, query, tab, conversationLabel, participantsLabel, previewText])

  const totalUnread = useMemo(() => (data?.conversations ?? []).reduce((n, c) => n + (c.archived ? 0 : c.unread), 0), [data])

  const toggleArchive = async (c: ConversationSummary) => {
    setArchivingId(c.id)
    try {
      await setConversationArchived(c.id, !c.archived)
      setData((d) => d && { ...d, conversations: d.conversations.map((x) => (x.id === c.id ? { ...x, archived: !c.archived } : x)) })
      announce(c.archived ? t('unarchived') : t('archived'))
    } catch (err) {
      announce(err instanceof Error ? err.message : t('actionFailed'))
    } finally {
      setArchivingId(null)
    }
  }

  const setInvite = (invite: CoparentInvite | null) => setData((d) => (d ? { ...d, invite } : d))

  const noLink = data !== null && data.linked.length === 0 && data.conversations.length === 0

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app" />

      {error ? (
        <ErrorState compact title={t('errorTitle')} description={t('errorDescription')} primary={{ label: t('retry'), onClick: () => void load() }} />
      ) : !data ? (
        <LoadingState compact title={t('loading')} description="" />
      ) : (
        <div className="w-full space-y-5 px-5 pb-8 pt-2">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0 space-y-4">
              {noLink ? (
                <>
                  <div className={cn(card, 'flex items-center gap-3 p-4')}>
                    <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-night-50 text-night-700">
                      <MessageCircle className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <p className="text-[13px] text-night-700">
                      {t('noLink')}
                    </p>
                  </div>
                  <InviteCard invite={data.invite} senderPrenom={data.me.prenom} onChange={setInvite} announce={announce} />
                </>
              ) : (
                <section aria-labelledby="msg-threads" className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 id="msg-threads" className="text-[15px] font-bold text-night-900">
                      {t('threads')}
                      {totalUnread > 0 && <span className="sr-only">{t('unreadSr', { count: totalUnread })}</span>}
                    </h2>
                    <button type="button" onClick={() => setCreating(true)} aria-haspopup="dialog" className={cn(btn.primary, 'h-11 shrink-0 px-4')}>
                      <Plus className="h-5 w-5" aria-hidden="true" />
                      {t('newConversation')}
                    </button>
                  </div>

                  <div className="relative">
                    <label htmlFor="msg-search" className="sr-only">{t('searchLabel')}</label>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-500" aria-hidden="true" />
                    <input
                      id="msg-search"
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('searchPlaceholder')}
                      autoComplete="off"
                      className="h-12 w-full rounded-xl border border-night-200 bg-white pl-11 pr-12 text-[15px] text-night-900 placeholder:text-night-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => { setQuery(''); document.getElementById('msg-search')?.focus() }}
                        aria-label={t('clearSearch')}
                        className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-night-600 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <SegmentedTabs<Tab>
                    tabs={[
                      { key: 'actives', label: t('tabActive'), count: counts.actives },
                      { key: 'archives', label: t('tabArchived'), count: counts.archives },
                    ]}
                    value={tab}
                    onChange={setTab}
                    label={t('filterLabel')}
                    idPrefix="msg"
                  />

                  <div id="msg-panel" role="tabpanel" aria-labelledby={`msg-tab-${tab}`}>
                    <p className="sr-only" role="status" aria-live="polite">
                      {query ? t('found', { count: visible.length }) : ''}
                    </p>
                    {visible.length > 0 ? (
                      <ul aria-label={tab === 'archives' ? t('archivedList') : t('activeList')} className={cn(card, 'divide-y divide-night-100/80 p-1')}>
                        {visible.map((c) => (
                          <ConversationRow
                            key={c.id}
                            conversation={c}
                            meId={data.me.id}
                            busy={archivingId === c.id}
                            onToggleArchive={() => void toggleArchive(c)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <div className={cn(card, 'flex flex-col items-center px-5 py-8 text-center')}>
                        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-leaf-50 text-leaf-600">
                          {query ? <Search className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                        </span>
                        <p className="mt-3 text-[14px] font-bold text-night-900">
                          {query ? t('noResults') : tab === 'archives' ? t('noArchived') : t('noActive')}
                        </p>
                        <p className="mt-1 max-w-xs text-[13px] text-night-600">
                          {query
                            ? t('noResultsHint')
                            : tab === 'archives'
                              ? t('noArchivedHint')
                              : t('noActiveHint')}
                        </p>
                        {!query && tab === 'actives' && (
                          <button type="button" onClick={() => setCreating(true)} aria-haspopup="dialog" className={cn(btn.secondary, 'mt-4')}>
                            <Plus className="h-5 w-5" aria-hidden="true" />
                            {t('newConversation')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            <aside aria-label={t('asideLabel')} className="space-y-3">
              <div className={cn(card, 'p-4')}>
                <div className="flex gap-3">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" aria-hidden="true" />
                  <div>
                    <h2 className="text-[14px] font-bold text-night-900">{t('proofTitle')}</h2>
                    <p className="mt-1 text-[13px] text-night-600">
                      {t('proofText')}
                    </p>
                  </div>
                </div>
              </div>
              <div className={cn(card, 'p-4')}>
                <div className="flex gap-3">
                  <FolderLock className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" aria-hidden="true" />
                  <div>
                    <h2 className="text-[14px] font-bold text-night-900">{t('vaultTitle')}</h2>
                    <p className="mt-1 text-[13px] text-night-600">
                      {t('vaultText')}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-iris-100 bg-iris-50/60 p-4">
                <div className="flex gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-iris-600" aria-hidden="true" />
                  <div>
                    <h2 className="text-[14px] font-bold text-night-900">{t('toneTitle')}</h2>
                    <p className="mt-1 text-[13px] text-night-700">
                      {t('toneText')}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {data && (
        <NewConversationSheet
          open={creating}
          onClose={() => setCreating(false)}
          linked={data.linked}
          onCreated={(id) => {
            setCreating(false)
            router.push(`/app/messages/${encodeURIComponent(id)}`)
          }}
        />
      )}
      {announcer}
    </>
  )
}
