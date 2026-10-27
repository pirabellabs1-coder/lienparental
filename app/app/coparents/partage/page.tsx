'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarDays, FileText, Lock, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { Switch } from '@/components/ui/Switch'
import { card } from '@/components/ui/kit'
import { frDay } from '@/components/coparents/bits'
import { cn } from '@/lib/cn'
import { loadFamilyOverview, loadSharing, setSharing, type SharingItem, type SharingSummary } from '@/lib/coparents'
import { useVaultLockState } from '@/components/vault-lock/useVaultLockState'
import { VaultLockedNotice } from '@/components/vault-lock/VaultLockedNotice'

type ChildOpt = { id: string; prenom: string }

// Textes : family.coparents.sharing.sections.<clé>.{title,help,empty} (traduits au rendu).
const SECTIONS: { key: 'documents' | 'expenses' | 'events'; icon: LucideIcon }[] = [
  { key: 'documents', icon: FileText },
  { key: 'expenses', icon: Wallet },
  { key: 'events', icon: CalendarDays },
]

// Partage fin : ce que JE partage pour un enfant (documents, dépenses, événements).
export default function PartagePage() {
  const t = useTranslations('family.coparents.sharing')
  const locale = useLocale()
  const [kids, setKids] = useState<ChildOpt[] | null>(null)
  const [childId, setChildId] = useState<string | null>(null)
  const [summary, setSummary] = useState<SharingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const { announce, node: announcer } = useAnnounce()
  // Documents du coffre : affichés seulement coffre déverrouillé (le serveur l'exige aussi).
  const { state: vault } = useVaultLockState()

  useEffect(() => {
    loadFamilyOverview()
      .then((o) => {
        const list = o.children.filter((c) => c.myRole === 'owner' || c.myRole === 'parent').map((c) => ({ id: c.id, prenom: c.prenom }))
        setKids(list)
        const wanted = new URLSearchParams(window.location.search).get('enfant')
        setChildId(list.find((c) => c.id === wanted)?.id ?? list[0]?.id ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('loadFailed')))
  }, [t])

  const load = useCallback(async (id: string) => {
    setSummary(null)
    setError(null)
    try {
      setSummary(await loadSharing(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'))
    }
  }, [t])
  useEffect(() => { if (childId) void load(childId) }, [childId, load])

  const toggle = async (item: SharingItem, shared: boolean) => {
    setPending(item.id)
    setSummary((s) => s && patch(s, item, shared))
    try {
      await setSharing(item.kind, item.id, shared)
      announce(shared ? t('nowShared', { label: item.label }) : t('nowPrivate', { label: item.label }))
    } catch (e) {
      setSummary((s) => s && patch(s, item, !shared))
      announce(e instanceof Error ? e.message : t('updateFailed'))
    } finally {
      setPending(null)
    }
  }

  const prenom = kids?.find((k) => k.id === childId)?.prenom ?? ''

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/coparents" />
      {error ? (
        <ErrorState compact title={t('unavailable')} description={error} primary={{ label: t('retry'), onClick: () => childId ? void load(childId) : window.location.reload() }} />
      ) : !kids ? (
        <LoadingState compact title={t('loading')} description="" />
      ) : kids.length === 0 ? (
        <p className={cn(card, 'mx-5 mt-2 p-4 text-[13px] text-night-700')}>{t('noChildren')}</p>
      ) : (
        <div className="w-full space-y-5 px-5 pb-10 pt-2">
          {kids.length > 1 && (
            <div role="group" aria-label={t('child')} className="flex flex-wrap gap-2">
              {kids.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={k.id === childId}
                  onClick={() => setChildId(k.id)}
                  className={cn(
                    'min-h-[44px] rounded-full border px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2',
                    k.id === childId ? 'border-leaf-500 bg-leaf-50 text-leaf-800' : 'border-night-200 bg-white text-night-800 hover:bg-night-50',
                  )}
                >
                  {k.prenom}
                </button>
              ))}
            </div>
          )}

          <p className="flex gap-2.5 rounded-xl bg-night-50/70 p-3 text-[13px] text-night-700">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-night-600" aria-hidden="true" />
            {t('privacyNote', { name: prenom })}
          </p>

          {!summary ? (
            <LoadingState compact title={t('loadingItems')} description="" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {SECTIONS.map((sec) => {
                const items = summary[sec.key]
                const Icon = sec.icon
                return (
                  <section key={sec.key} aria-labelledby={`sec-${sec.key}`} className={cn(card, 'p-4', sec.key === 'events' && 'lg:col-span-2')}>
                    <div className="flex items-start gap-3">
                      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-50 text-night-700"><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <h2 id={`sec-${sec.key}`} className="text-[15px] font-bold text-night-900">{t(`sections.${sec.key}.title`)}</h2>
                        <p className="mt-0.5 text-[12px] text-night-600">{t(`sections.${sec.key}.help`)}</p>
                      </div>
                    </div>
                    {sec.key === 'documents' && (vault !== 'open' || summary.documentsLocked) ? (
                      <VaultLockedNotice state={vault === 'open' ? 'locked' : vault} what={t('vaultWhat')} compact className="mt-3 shadow-none" />
                    ) : items.length === 0 ? (
                      <p className="mt-3 text-[13px] text-night-600">{t(`sections.${sec.key}.empty`)}</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-night-100">
                        {items.map((it) => (
                          <li key={it.id}>
                            <Switch
                              checked={it.shared}
                              disabled={pending === it.id}
                              onChange={(e) => void toggle(it, e.target.checked)}
                              label={it.label}
                              description={`${frDay(it.date, true, locale)}${it.detail ? ` · ${it.detail}` : ''} · ${it.shared ? t('shared') : t('private')}`}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}
      {announcer}
    </>
  )
}

function patch(s: SharingSummary, item: SharingItem, shared: boolean): SharingSummary {
  const key = item.kind === 'document' ? 'documents' : item.kind === 'expense' ? 'expenses' : 'events'
  return { ...s, [key]: s[key].map((x) => (x.id === item.id ? { ...x, shared } : x)) }
}
