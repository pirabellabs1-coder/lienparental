'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Baby, ShieldCheck, UserPlus } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { btn, card } from '@/components/ui/kit'
import { ChildFamilyCard } from '@/components/coparents/ChildFamilyCard'
import { InviteForm } from '@/components/coparents/InviteForm'
import { ReceivedCard, SentRow } from '@/components/coparents/Invitations'
import { MergeAssistant, MergeBanner } from '@/components/coparents/MergeAssistant'
import { ShareInvite } from '@/components/coparents/ShareInvite'
import { SharedScope } from '@/components/coparents/SharedScope'
import { cn } from '@/lib/cn'
import {
  FAMILY_LIVE, acceptFamilyInvitation, cancelFamilyInvitation, changeGuardianRole, declineFamilyInvitation,
  dismissMergeCandidate, loadFamilyOverview, mergeChildren, removeGuardian, resendFamilyInvitation,
  type FamilyChild, type FamilyMember, type FamilyOverview, type GuardianRole, type IssuedInvitation,
  type MergeCandidate, type SentInvitation,
} from '@/lib/coparents'

// Famille et co-parents : adultes liés par enfant, invitations, demandes reçues, fusion guidée.
// Démo : Thomas déjà lié, une invitation en attente ; ?apercu=demande | ?apercu=fusion.
export default function CoparentsPage() {
  const t = useTranslations('family.coparents.page')
  const [data, setData] = useState<FamilyOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [issued, setIssued] = useState<IssuedInvitation | null>(null)
  const [merge, setMerge] = useState<MergeCandidate | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [removal, setRemoval] = useState<{ member: FamilyMember; child: FamilyChild } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<SentInvitation | null>(null)
  const { announce, node: announcer } = useAnnounce(3200)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await loadFamilyOverview())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'))
    }
  }, [t])
  useEffect(() => { void load() }, [load])

  const myPrenom = useMemo(() => {
    for (const c of data?.children ?? []) for (const m of c.members) if (m.isMe) return m.prenom
    return ''
  }, [data])
  const shareable = useMemo(
    () => (data?.children ?? []).filter((c) => c.myRole === 'owner' || c.myRole === 'parent').map((c) => ({ id: c.id, prenom: c.prenom })),
    [data],
  )

  const run = async (id: string, fn: () => Promise<void>, done: string) => {
    setBusyId(id)
    try {
      await fn()
      announce(done)
      await load()
    } catch (e) {
      announce(e instanceof Error ? e.message : t('actionFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const onChangeRole = (m: FamilyMember, role: GuardianRole) =>
    m.guardianId && void run(m.guardianId, () => changeGuardianRole(m.guardianId as string, role), role === 'parent' ? t('nowParent', { name: m.prenom }) : t('nowProche', { name: m.prenom }))

  const confirmRemoval = async () => {
    if (!removal?.member.guardianId) return
    const { member, child } = removal
    setRemoval(null)
    await run(member.guardianId as string, () => removeGuardian(member.guardianId as string),
      member.isMe ? t('youLeft', { child: child.prenom }) : t('accessRemoved', { name: member.prenom, child: child.prenom }))
  }

  const onResend = async (inv: SentInvitation) => {
    setBusyId(inv.id)
    try {
      const next = await resendFamilyInvitation(inv.id)
      setIssued(next)
      setInviteOpen(true)
      await load()
    } catch (e) {
      announce(e instanceof Error ? e.message : t('resendFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const onMerge = async (c: MergeCandidate) => {
    setBusyId('merge')
    setMergeError(null)
    try {
      await mergeChildren(c.myChild.id, c.sharedChild.id)
      setMerge(null)
      announce(t('merged', { name: c.sharedChild.prenom }))
      await load()
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : t('mergeFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const onDismiss = async (c: MergeCandidate) => {
    setMerge(null)
    await run('merge', () => dismissMergeCandidate(c.myChild.id, c.sharedChild.id), t('keptSeparate'))
  }

  const closeInvite = () => {
    setInviteOpen(false)
    setIssued(null)
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app" />

      {error ? (
        <ErrorState compact title={t('unavailable')} description={error} primary={{ label: t('retry'), onClick: () => void load() }} />
      ) : !data ? (
        <LoadingState compact title={t('loading')} description="" />
      ) : (
        <div className="w-full space-y-5 px-5 pb-10 pt-2">
          <div className={cn(card, 'flex flex-col gap-3 p-4 sm:flex-row sm:items-center')}>
            <p className="min-w-0 flex-1 text-[13px] text-night-700">
              {t('intro')}
            </p>
            {shareable.length > 0 && (
              <button type="button" onClick={() => { setIssued(null); setInviteOpen(true) }} className={cn(btn.primary, 'w-full shrink-0 sm:w-auto')}>
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                {t('invite')}
              </button>
            )}
          </div>

          {!FAMILY_LIVE && (
            <p className="rounded-xl bg-night-50 px-3 py-2 text-[12px] text-night-700">
              {t('demo')}
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <div className="min-w-0 space-y-6">
              {data.received.length > 0 && (
                <section aria-labelledby="received-title">
                  <h2 id="received-title" className="mb-2.5 text-[15px] font-bold text-night-900">{t('received')}</h2>
                  <ul className="space-y-3">
                    {data.received.map((r) => (
                      <ReceivedCard
                        key={r.id}
                        inv={r}
                        busy={busyId === r.id}
                        onAccept={() => void run(r.id, async () => { await acceptFamilyInvitation({ id: r.id }) }, t('joined', { names: r.children.map((c) => c.prenom).join(', ') }))}
                        onDecline={() => void run(r.id, () => declineFamilyInvitation(r.id), t('declined'))}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {(data.nameConflicts ?? []).length > 0 && (
                <section aria-labelledby="conflict-title">
                  <h2 id="conflict-title" className="mb-2.5 text-[15px] font-bold text-night-900">{t('conflicts.title')}</h2>
                  <ul className="space-y-3">
                    {(data.nameConflicts ?? []).map((c) => (
                      <li key={`${c.myChild.id}-${c.sharedChild.id}`} className={cn(card, 'flex flex-wrap items-center gap-3 border-orange-200 bg-orange-50/40 p-4')}>
                        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-night-800">{t('conflicts.text', { name: c.myChild.prenom, owner: c.sharedChild.ownerPrenom || t('conflicts.otherParent') })}</p>
                        <Link href={`/app/enfants/${c.myChild.id}`} className={cn(btn.secondary, 'w-full sm:w-auto')}>{t('conflicts.action')}</Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.mergeCandidates.length > 0 && (
                <section aria-labelledby="merge-title">
                  <h2 id="merge-title" className="mb-2.5 text-[15px] font-bold text-night-900">{t('duplicates')}</h2>
                  <ul className="space-y-3">
                    {data.mergeCandidates.map((m) => (
                      <MergeBanner key={`${m.myChild.id}-${m.sharedChild.id}`} candidate={m} onOpen={() => { setMergeError(null); setMerge(m) }} />
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="members-title">
                <h2 id="members-title" className="mb-2.5 text-[15px] font-bold text-night-900">{t('membersByChild')}</h2>
                {data.children.length === 0 ? (
                  <div className={cn(card, 'flex flex-col items-center gap-3 p-6 text-center')}>
                    <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-leaf-50 text-leaf-600"><Baby className="h-7 w-7" /></span>
                    <p className="text-[14px] text-night-700">{t('addChildFirst')}</p>
                    <Link href="/app/enfants/nouveau" className={btn.primary}>{t('addChild')}</Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.children.map((c) => (
                      <ChildFamilyCard key={c.id} child={c} busyId={busyId} onChangeRole={onChangeRole} onRemove={(member, child) => setRemoval({ member, child })} />
                    ))}
                  </div>
                )}
              </section>

              <section aria-labelledby="sent-title">
                <h2 id="sent-title" className="mb-2.5 text-[15px] font-bold text-night-900">{t('sent')}</h2>
                {data.sent.length === 0 ? (
                  <p className={cn(card, 'p-4 text-[13px] text-night-600')}>{t('noPending')}</p>
                ) : (
                  <ul className={cn(card, 'divide-y divide-night-100 p-4')}>
                    {data.sent.map((inv) => (
                      <SentRow key={inv.id} inv={inv} busy={busyId === inv.id} onResend={() => void onResend(inv)} onCancel={() => setCancelTarget(inv)} />
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside aria-label={t('goodToKnow')} className="space-y-3">
              <SharedScope />
              <div className={cn(card, 'flex gap-3 p-4')}>
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" aria-hidden="true" />
                <p className="text-[13px] text-night-700">
                  {t('securityNote')}
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={closeInvite}
        title={issued ? t('shareInvitation') : t('invite')}
        description={issued ? undefined : t('inviteDescription')}
      >
        {issued ? (
          <div className="space-y-4">
            <ShareInvite issued={issued} senderPrenom={myPrenom} announce={announce} />
            <button type="button" onClick={closeInvite} className={cn(btn.secondary, 'w-full')}>{t('done')}</button>
          </div>
        ) : (
          <InviteForm
            childOptions={shareable}
            ownerChildIds={(data?.children ?? []).filter((c) => c.myRole === 'owner').map((c) => c.id)}
            onCreated={(i) => { setIssued(i); void load() }}
          />
        )}
      </Modal>

      <MergeAssistant
        candidate={merge}
        busy={busyId === 'merge'}
        error={mergeError}
        onClose={() => setMerge(null)}
        onMerge={(c) => void onMerge(c)}
        onDismiss={(c) => void onDismiss(c)}
      />

      <ConfirmDialog
        open={!!removal}
        onClose={() => setRemoval(null)}
        onConfirm={() => void confirmRemoval()}
        title={removal?.member.isMe ? t('leaveTitle', { child: removal.child.prenom }) : t('removeTitle', { name: removal?.member.prenom ?? '' })}
        description={removal?.member.isMe
          ? t('leaveText')
          : t('removeText', { name: removal?.member.prenom ?? '', child: removal?.child.prenom ?? '' })}
        confirmLabel={removal?.member.isMe ? t('leave') : t('removeAccess')}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          const inv = cancelTarget
          setCancelTarget(null)
          if (inv) void run(inv.id, () => cancelFamilyInvitation(inv.id), t('cancelled'))
        }}
        title={t('cancelTitle')}
        description={t('cancelText', { email: cancelTarget?.email ?? '' })}
        confirmLabel={t('cancelConfirm')}
        cancelLabel={t('keep')}
      />
      {announcer}
    </>
  )
}
