// Mode démonstration de la liaison des parents : rien ne quitte l'appareil.
// État en sessionStorage (fermé avec l'onglet). Thomas est déjà lié, une
// invitation (Rose, proche) est en attente. Aperçus : ?apercu=demande, ?apercu=fusion,
// ?apercu=gardien (fiche d'Emma dont je suis parent NON titulaire, avec un proche que j'ai invité).
import { mockChildren } from '@/lib/mock-data'
import { libT } from '@/lib/i18n/runtime'
import { DEMO_ME, DEMO_OTHER } from '@/components/messages/seed'
import type {
  FamilyChild, FamilyOverview, GuardianRole, InvitationPreview, IssuedInvitation, LinkedParent,
  MergeCandidate, ReceivedInvitation, SentInvitation, SharingItem, SharingKind, SharingSummary,
} from './types'

const KEY = 'lp:famille-demo:v1'
const DAY = 86_400_000

type DemoState = {
  children: FamilyChild[]
  sent: SentInvitation[]
  received: ReceivedInvitation[]
  merge: MergeCandidate[]
  sharing: Record<string, boolean>
  dismissedPreviews: string[]
}

function hex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString()
}

function seed(): DemoState {
  const since = iso(-21)
  const children: FamilyChild[] = mockChildren.map((c) => ({
    id: c.id,
    prenom: c.prenom,
    dateNaissance: c.dateNaissance ?? null,
    myRole: 'owner',
    members: [
      { guardianId: null, userId: DEMO_ME.id, prenom: DEMO_ME.prenom, nom: DEMO_ME.nom, role: 'owner', since: c.createdAt ?? since, isMe: true, canManage: false },
      { guardianId: `g_${c.id}_thomas`, userId: DEMO_OTHER.id, prenom: DEMO_OTHER.prenom, nom: DEMO_OTHER.nom, role: 'parent', since, isMe: false, canManage: true },
    ],
  }))
  const lina = mockChildren[0]
  return {
    children,
    sent: [{
      id: 'inv_demo_rose',
      email: 'rose.martin@exemple.fr',
      role: 'proche',
      status: 'pending',
      expiresAt: iso(5),
      sentCount: 1,
      lastSentAt: iso(-2),
      createdAt: iso(-2),
      children: lina ? [{ id: lina.id, prenom: lina.prenom }] : [],
    }],
    received: [],
    merge: [],
    sharing: {},
    dismissedPreviews: [],
  }
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function read(): DemoState {
  const raw = storage()?.getItem(KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as DemoState
    } catch { /* état corrompu : on repart du jeu de démonstration */ }
  }
  return seed()
}

function write(s: DemoState) {
  try {
    storage()?.setItem(KEY, JSON.stringify(s))
  } catch { /* stockage indisponible : la vue garde l'état en mémoire */ }
}

/** Aperçus optionnels (?apercu=demande | fusion | gardien), injectés une seule fois par session. */
function withPreviews(s: DemoState): DemoState {
  if (typeof window === 'undefined') return s
  const p = new URLSearchParams(window.location.search).get('apercu')
  if (!p || s.dismissedPreviews.includes(p)) return s
  if (p === 'demande' && s.received.length === 0) {
    s.received.push({
      id: 'req_demo_sandra',
      fromPrenom: 'Sandra',
      fromNom: 'Leroy',
      role: 'proche',
      children: [{ id: 'c_demo_emma', prenom: 'Emma', dateNaissance: '2016-09-21' }],
      createdAt: iso(-1),
      expiresAt: iso(6),
    })
  }
  if (p === 'fusion' && s.merge.length === 0) {
    const lina = mockChildren[0]
    if (lina?.dateNaissance) {
      s.merge.push({
        myChild: { id: 'c_demo_lina_bis', prenom: 'Lina' },
        sharedChild: { id: lina.id, prenom: lina.prenom, ownerPrenom: 'Thomas' },
        dateNaissance: lina.dateNaissance,
      })
    }
  }
  // Gardien « parent » non titulaire : l'option « Parent » ne lui est pas proposée (0360, M2).
  if (p === 'gardien' && !s.children.some((c) => c.id === 'c_demo_emma')) {
    s.children.push({
      id: 'c_demo_emma',
      prenom: 'Emma',
      dateNaissance: '2016-09-21',
      myRole: 'parent',
      members: [
        { guardianId: null, userId: 'u_demo_sandra', prenom: 'Sandra', nom: 'Leroy', role: 'owner', since: iso(-40), isMe: false, canManage: false },
        { guardianId: 'g_emma_me', userId: DEMO_ME.id, prenom: DEMO_ME.prenom, nom: DEMO_ME.nom, role: 'parent', since: iso(-30), isMe: true, canManage: false },
        { guardianId: 'g_emma_mamie', userId: 'u_demo_mamie', prenom: 'Mireille', nom: 'Martin', role: 'proche', since: iso(-10), isMe: false, canManage: true },
      ],
    })
  }
  s.dismissedPreviews.push(p)
  write(s)
  return s
}

const pause = () => new Promise((r) => setTimeout(r, 250))

export async function demoOverview(): Promise<FamilyOverview> {
  const s = withPreviews(read())
  const sent = s.sent.map((i) => ({ ...i, status: i.status === 'pending' && Date.parse(i.expiresAt) <= Date.now() ? 'expired' as const : i.status }))
  return { children: s.children, sent, received: s.received, mergeCandidates: s.merge }
}

export async function demoCreateInvitation(email: string, role: GuardianRole, childIds: string[]): Promise<IssuedInvitation> {
  await pause()
  const s = read()
  if (s.sent.some((i) => i.email === email && i.status === 'pending')) {
    throw new Error(libT('auth.family')('pendingExists'))
  }
  if (email === 'julie.premium@demo.lienparental.fr' || email === 'julie.gratuit@demo.lienparental.fr') {
    throw new Error(libT('auth.family')('selfInvite'))
  }
  const token = hex(32)
  const inv: SentInvitation = {
    id: `inv_${hex(4)}`,
    email,
    role,
    status: 'pending',
    expiresAt: iso(7),
    sentCount: 1,
    lastSentAt: iso(0),
    createdAt: iso(0),
    children: s.children.filter((c) => childIds.includes(c.id)).map((c) => ({ id: c.id, prenom: c.prenom })),
  }
  s.sent.unshift(inv)
  write(s)
  return { id: inv.id, email, role, token, expiresAt: inv.expiresAt, emailStatus: 'skipped' }
}

export async function demoResend(id: string): Promise<IssuedInvitation> {
  await pause()
  const s = read()
  const inv = s.sent.find((i) => i.id === id)
  if (!inv) throw new Error(libT('auth.family')('notFound'))
  if (Date.now() - Date.parse(inv.lastSentAt) < 60_000) throw new Error(libT('auth.family')('resendWait'))
  inv.sentCount += 1
  inv.lastSentAt = iso(0)
  inv.expiresAt = iso(7)
  inv.status = 'pending'
  write(s)
  return { id, email: inv.email, role: inv.role, token: hex(32), expiresAt: inv.expiresAt, emailStatus: 'skipped' }
}

export async function demoCancel(id: string) {
  await pause()
  const s = read()
  s.sent = s.sent.filter((i) => i.id !== id)
  write(s)
}

export async function demoSetRole(guardianId: string, role: GuardianRole) {
  await pause()
  const s = read()
  for (const c of s.children) for (const m of c.members) if (m.guardianId === guardianId) m.role = role
  write(s)
}

export async function demoRemove(guardianId: string) {
  await pause()
  const s = read()
  for (const c of s.children) c.members = c.members.filter((m) => m.guardianId !== guardianId)
  // Je me suis retiré moi-même d'un enfant partagé : il disparaît de ma liste.
  s.children = s.children.filter((c) => c.members.some((m) => m.isMe))
  write(s)
}

export async function demoAccept(id: string) {
  await pause()
  const s = read()
  const inv = s.received.find((r) => r.id === id)
  if (!inv) throw new Error(libT('shared.family')('inviteInvalid'))
  s.received = s.received.filter((r) => r.id !== id)
  for (const k of inv.children) {
    if (s.children.some((c) => c.id === k.id)) continue
    s.children.push({
      id: k.id,
      prenom: k.prenom,
      dateNaissance: k.dateNaissance ?? null,
      myRole: inv.role,
      members: [
        { guardianId: null, userId: 'u_demo_sandra', prenom: inv.fromPrenom, nom: inv.fromNom, role: 'owner', since: inv.createdAt, isMe: false, canManage: false },
        { guardianId: `g_${k.id}_me`, userId: DEMO_ME.id, prenom: DEMO_ME.prenom, nom: DEMO_ME.nom, role: inv.role, since: iso(0), isMe: true, canManage: false },
      ],
    })
  }
  write(s)
  return { childIds: inv.children.map((c) => c.id), role: inv.role, conversationId: null }
}

export async function demoDecline(id: string) {
  await pause()
  const s = read()
  s.received = s.received.filter((r) => r.id !== id)
  write(s)
}

export async function demoMerge(dropChildId: string) {
  await pause()
  const s = read()
  s.merge = s.merge.filter((m) => m.myChild.id !== dropChildId)
  write(s)
  return { keptChildId: '', healthMoved: 2, referencesUpdated: 5, guardiansRevoked: 0 }
}

export async function demoDismissMerge(myChildId: string, sharedChildId: string) {
  const s = read()
  s.merge = s.merge.filter((m) => !(m.myChild.id === myChildId && m.sharedChild.id === sharedChildId))
  write(s)
}

export async function demoPreview(token: string): Promise<InvitationPreview> {
  await pause()
  if (!/^[0-9a-f]{64}$/.test(token)) return { state: 'invalid' }
  return {
    state: 'ready',
    id: 'req_demo_link',
    inviterPrenom: DEMO_OTHER.prenom,
    role: 'parent',
    children: mockChildren.map((c) => ({ id: c.id, prenom: c.prenom, dateNaissance: c.dateNaissance })),
    expiresAt: iso(6),
  }
}

export async function demoLinkedParents(): Promise<LinkedParent[]> {
  const s = read()
  const seen = new Map<string, LinkedParent>()
  for (const c of s.children) {
    const meParent = c.myRole === 'owner' || c.myRole === 'parent'
    for (const m of c.members) {
      if (m.isMe || !meParent || m.role === 'proche') continue
      seen.set(m.userId, { userId: m.userId, prenom: m.prenom, nom: m.nom || undefined, role: 'parent' })
    }
  }
  return [...seen.values()]
}

const DEMO_SHARING: Record<SharingKind, Array<{ id: string; label: string; days: number; detail?: string; shared: boolean }>> = {
  document: [
    { id: 'doc_vaccins', label: 'Carnet de vaccination.pdf', days: -40, shared: true },
    { id: 'doc_scolarite', label: 'Certificat de scolarité.pdf', days: -12, shared: false },
    { id: 'doc_jugement', label: 'Jugement JAF.pdf', days: -90, shared: false },
  ],
  expense: [
    { id: 'exp_cantine', label: 'Cantine octobre', days: -6, detail: '45,00 €', shared: true },
    { id: 'exp_judo', label: 'Licence de judo', days: -20, detail: '120,00 €', shared: false },
  ],
  event: [
    { id: 'evt_reunion', label: 'Réunion parents-professeurs', days: 3, shared: true },
    { id: 'evt_pediatre', label: 'Pédiatre, vaccin de rappel', days: 9, shared: true },
  ],
}

export async function demoSharing(childId: string): Promise<SharingSummary> {
  const s = read()
  const map = (kind: SharingKind): SharingItem[] =>
    DEMO_SHARING[kind].map((d) => ({
      kind, id: `${childId}:${d.id}`, label: d.label, date: iso(d.days), detail: d.detail,
      shared: s.sharing[`${childId}:${d.id}`] ?? d.shared,
    }))
  return { childId, documents: map('document'), expenses: map('expense'), events: map('event') }
}

export async function demoSetSharing(id: string, shared: boolean) {
  const s = read()
  s.sharing[id] = shared
  write(s)
}
