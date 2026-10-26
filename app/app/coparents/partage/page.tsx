'use client'

import { useCallback, useEffect, useState } from 'react'
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

const SECTIONS: { key: 'documents' | 'expenses' | 'events'; title: string; help: string; empty: string; icon: LucideIcon }[] = [
  { key: 'documents', title: 'Documents du coffre', help: 'Désactivé par défaut. Un document partagé peut être consulté et téléchargé par les parents liés.', empty: 'Aucun document rattaché à cet enfant.', icon: FileText },
  { key: 'expenses', title: 'Dépenses', help: 'Désactivé par défaut. Seuls le montant, la catégorie, le titre et la date sont visibles ; la description et les photos du Journal restent privées.', empty: 'Aucune dépense rattachée à cet enfant.', icon: Wallet },
  { key: 'events', title: 'Événements à venir', help: 'Les nouveaux événements liés à l’enfant sont partagés avec les parents et proches liés ; rendez privé ce qui doit le rester.', empty: 'Aucun événement à venir pour cet enfant.', icon: CalendarDays },
]

// Partage fin : ce que JE partage pour un enfant (documents, dépenses, événements).
export default function PartagePage() {
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
      .catch((e) => setError(e instanceof Error ? e.message : 'Chargement impossible.'))
  }, [])

  const load = useCallback(async (id: string) => {
    setSummary(null)
    setError(null)
    try {
      setSummary(await loadSharing(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.')
    }
  }, [])
  useEffect(() => { if (childId) void load(childId) }, [childId, load])

  const toggle = async (item: SharingItem, shared: boolean) => {
    setPending(item.id)
    setSummary((s) => s && patch(s, item, shared))
    try {
      await setSharing(item.kind, item.id, shared)
      announce(shared ? `« ${item.label} » est partagé.` : `« ${item.label} » est désormais privé.`)
    } catch (e) {
      setSummary((s) => s && patch(s, item, !shared))
      announce(e instanceof Error ? e.message : 'Modification impossible.')
    } finally {
      setPending(null)
    }
  }

  const prenom = kids?.find((k) => k.id === childId)?.prenom ?? ''

  return (
    <>
      <TopBar title="Ce que je partage" showBack backHref="/app/coparents" />
      {error ? (
        <ErrorState compact title="Partage indisponible" description={error} primary={{ label: 'Réessayer', onClick: () => childId ? void load(childId) : window.location.reload() }} />
      ) : !kids ? (
        <LoadingState compact title="Chargement" description="" />
      ) : kids.length === 0 ? (
        <p className={cn(card, 'mx-5 mt-2 p-4 text-[13px] text-night-700')}>Aucun enfant à partager pour le moment.</p>
      ) : (
        <div className="w-full space-y-5 px-5 pb-10 pt-2">
          {kids.length > 1 && (
            <div role="group" aria-label="Enfant" className="flex flex-wrap gap-2">
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
            Votre Journal, le Coach IA et vos témoignages ne sont jamais partagés. Ici, vous choisissez ce que les adultes liés à {prenom} peuvent voir parmi vos propres éléments.
          </p>

          {!summary ? (
            <LoadingState compact title="Chargement des éléments" description="" />
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
                        <h2 id={`sec-${sec.key}`} className="text-[15px] font-bold text-night-900">{sec.title}</h2>
                        <p className="mt-0.5 text-[12px] text-night-600">{sec.help}</p>
                      </div>
                    </div>
                    {sec.key === 'documents' && (vault !== 'open' || summary.documentsLocked) ? (
                      <VaultLockedNotice state={vault === 'open' ? 'locked' : vault} what="et partager vos documents" compact className="mt-3 shadow-none" />
                    ) : items.length === 0 ? (
                      <p className="mt-3 text-[13px] text-night-600">{sec.empty}</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-night-100">
                        {items.map((it) => (
                          <li key={it.id}>
                            <Switch
                              checked={it.shared}
                              disabled={pending === it.id}
                              onChange={(e) => void toggle(it, e.target.checked)}
                              label={it.label}
                              description={`${frDay(it.date, true)}${it.detail ? ` · ${it.detail}` : ''} · ${it.shared ? 'partagé' : 'privé'}`}
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
