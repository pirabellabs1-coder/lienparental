'use client'

import Link from 'next/link'
import { useId } from 'react'
import { ChevronRight, LogOut, UserMinus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { card } from '@/components/ui/kit'
import type { FamilyChild, FamilyMember, GuardianRole } from '@/lib/coparents'
import { PersonAvatar, RoleBadge, dePrenom, frBirth, frDay, linkBtn } from './bits'

type Props = {
  child: FamilyChild
  busyId: string | null
  onChangeRole: (member: FamilyMember, role: GuardianRole) => void
  onRemove: (member: FamilyMember, child: FamilyChild) => void
}

/** Adultes liés à un enfant, avec les actions autorisées (changer le rôle, retirer, quitter). */
export function ChildFamilyCard({ child, busyId, onChangeRole, onRemove }: Props) {
  const uid = useId()
  const canShare = child.myRole === 'owner' || child.myRole === 'parent'
  // 0360 (M2) : seul le titulaire nomme un « parent ». Un gardien parent ne gère que les
  // proches qu'il a invités : l'option « Parent » ne lui est pas proposée.
  const isOwner = child.myRole === 'owner'
  const managesSomeone = child.members.some((m) => m.canManage && m.guardianId)
  const born = frBirth(child.dateNaissance)

  return (
    <section aria-labelledby={`${uid}-t`} className={cn(card, 'p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${uid}-t`} className="text-[16px] font-bold text-night-900">{child.prenom}</h3>
          {born && <p className="text-[12px] text-night-600">Né(e) le {born}</p>}
        </div>
        {child.myRole !== 'owner' && (
          <span className="text-[12px] text-night-600">
            Votre rôle : <RoleBadge role={child.myRole} className="ml-1" />
          </span>
        )}
      </div>

      <ul className="mt-3 divide-y divide-night-100">
        {child.members.map((m) => {
          const busy = busyId === (m.guardianId ?? m.userId)
          return (
            <li key={`${m.userId}-${m.guardianId ?? 'owner'}`} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <PersonAvatar prenom={m.prenom} nom={m.nom} seed={m.userId} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-night-900">
                  {m.prenom} {m.nom}{m.isMe && <span className="font-normal text-night-600"> (vous)</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-night-600">
                  <RoleBadge role={m.role} />
                  {m.role !== 'owner' && <span>depuis le {frDay(m.since)}</span>}
                </p>
              </div>
              {m.canManage && m.guardianId && (
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  {/* Non-titulaire : seulement parent → proche ; un proche reste proche. */}
                  {(isOwner || m.role === 'parent') && (
                    <>
                      <label htmlFor={`${uid}-${m.guardianId}`} className="sr-only">Rôle de {m.prenom}</label>
                      <select
                        id={`${uid}-${m.guardianId}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => onChangeRole(m, e.target.value as GuardianRole)}
                        aria-describedby={isOwner ? undefined : `${uid}-owner-note`}
                        className="h-11 flex-1 rounded-xl border border-night-200 bg-white px-3 text-[13px] font-semibold text-night-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200 sm:flex-none"
                      >
                        <option value="parent">Parent</option>
                        <option value="proche">Proche</option>
                      </select>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemove(m, child)}
                    className={cn(linkBtn, 'border border-alert-200 bg-white text-alert-700 hover:bg-alert-50')}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden="true" />
                    Retirer<span className="sr-only"> {m.prenom} de l&apos;espace de {child.prenom}</span>
                  </button>
                </div>
              )}
              {m.isMe && m.guardianId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(m, child)}
                  className={cn(linkBtn, 'border border-night-200 bg-white text-night-800 hover:bg-night-50')}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Quitter<span className="sr-only"> l&apos;espace de {child.prenom}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {!isOwner && managesSomeone && (
        <p id={`${uid}-owner-note`} className="mt-3 rounded-xl bg-night-50/70 p-3 text-[12px] leading-relaxed text-night-700">
          Seul le parent titulaire de la fiche {dePrenom(child.prenom)} peut nommer un autre parent. Vous pouvez gérer les proches que vous avez invités.
        </p>
      )}

      {canShare && (
        <Link
          href={`/app/coparents/partage?enfant=${encodeURIComponent(child.id)}`}
          className="mt-3 flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-night-50/70 px-3 text-[13px] font-semibold text-night-800 transition-colors hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
        >
          Choisir ce que je partage pour {child.prenom}
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </section>
  )
}
