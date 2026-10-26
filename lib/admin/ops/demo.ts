import 'server-only'
/**
 * Données FICTIVES du back-office opérationnel, mode démonstration uniquement
 * (DEMO_MODE, jamais en production) : reprend les jeux d'essai des anciennes maquettes.
 * En mémoire du serveur (globalThis), perdues au redémarrage ; les actions de la
 * démo modifient ce magasin et ajoutent une ligne au journal d'audit fictif.
 */
import { randomUUID } from 'node:crypto'
import type { AccountPlan, AccountRow, AuditRow, TestimonyRequestRow, TicketDetail, TicketMessage } from './types'

type DemoAccount = AccountRow & { deletedAt: string | null; bannedUntil: string | null }
type DemoTicket = TicketDetail & { lastReplyAt: string | null; lastReplyBy: 'user' | 'admin' | null }

type Store = {
  accounts: DemoAccount[]
  tickets: DemoTicket[]
  audit: AuditRow[]
  testimonies: TestimonyRequestRow[]
  nextAudit: number
}

const KEY = '__lienParentalAdminOpsDemo_v2'
type G = typeof globalThis & { [KEY]?: Store }

export const DEMO_ACTOR = 'admin@demo.lienparental.fr'

const day = (d: string, h = '10:00') => new Date(`${d}T${h}:00.000Z`).toISOString()
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const H = 3_600_000
const D = 24 * H

function seed(): Store {
  const raw: [string, string, string, string, 'gratuit' | 'premium' | 'coparentalite', string, number][] = [
    ['u_001', 'Camille', 'Durand', 'camille.d@mail.fr', 'premium', '2025-11-02', 3.4],
    ['u_002', 'Nassim', 'Ouali', 'n.ouali@mail.fr', 'gratuit', '2025-09-18', 0.4],
    ['u_003', 'Sofia', 'Martinez', 'sofia.m@proton.me', 'premium', '2025-12-14', 1.9],
    ['u_004', 'Thomas', 'Petit', 't.petit@mail.fr', 'gratuit', '2026-01-04', 0.2],
    ['u_005', 'Léa', 'Fontaine', 'lea.f@mail.fr', 'coparentalite', '2025-07-21', 5.8],
    ['u_006', 'Hugo', 'Bernard', 'h.bernard@mail.fr', 'gratuit', '2026-02-12', 0.1],
    ['u_007', 'Yasmine', 'El-Amrani', 'yas.ea@mail.fr', 'premium', '2025-10-30', 2.6],
    ['u_008', 'Paul', 'Girard', 'paul.g@mail.fr', 'gratuit', '2025-08-05', 0.9],
    ['u_009', 'Inès', 'Lopez', 'ines.l@mail.fr', 'premium', '2026-03-01', 4.1],
    ['u_010', 'Antoine', 'Roche', 'a.roche@mail.fr', 'gratuit', '2025-12-28', 0],
    ['u_011', 'Claire', 'Moreau', 'c.moreau@mail.fr', 'premium', '2025-06-11', 7.2],
    ['u_012', 'Mehdi', 'Benali', 'mehdi.b@mail.fr', 'gratuit', '2026-04-02', 0.3],
  ]
  const planOf = (p: string): AccountPlan => (p === 'gratuit' ? 'free' : (p as AccountPlan))
  const accounts: DemoAccount[] = raw.map(([id, prenom, nom, email, plan, inscrit, go], i) => ({
    id, prenom, nom, email,
    plan: planOf(plan),
    status: id === 'u_010' ? 'non_verifie' : 'actif',
    createdAt: day(inscrit),
    lastSignInAt: id === 'u_010' ? null : ago((i + 1) * 7 * H),
    emailVerified: id !== 'u_010',
    mfaEnabled: plan !== 'gratuit' && i % 2 === 0,
    storageMb: Math.round(go * 1024),
    childrenCount: id === 'u_010' ? 0 : (i % 3) + 1,
    deletedAt: null,
    bannedUntil: null,
  }))

  const msg = (from: 'user' | 'admin', body: string, at: string): TicketMessage => ({ id: randomUUID(), from, body, at })
  const requester = (id: string) => {
    const a = accounts.find((x) => x.id === id)!
    return { id: a.id, email: a.email, prenom: a.prenom, plan: a.plan === 'admin' ? 'free' : a.plan, deleted: false }
  }
  const ticket = (id: string, uid: string, subject: string, body: string, category: DemoTicket['category'], status: DemoTicket['status'],
    priority: DemoTicket['priority'], created: string, messages: TicketMessage[] = []): DemoTicket => ({
    id, subject, body, category, status, priority, messages,
    createdAt: created, updatedAt: messages.at(-1)?.at ?? created,
    closedAt: status === 'closed' || status === 'resolved' ? messages.at(-1)?.at ?? created : null,
    lastReplyAt: messages.at(-1)?.at ?? null, lastReplyBy: messages.at(-1)?.from ?? null,
    requester: requester(uid),
  })
  const tickets: DemoTicket[] = [
    ticket('4821', 'u_001', 'Impossible d’ajouter un document de plus de 20 Mo', 'Bonjour, j’essaie d’ajouter un PDF de 24 Mo au coffre et j’obtiens une erreur « fichier trop volumineux ». Pouvez-vous m’aider ?',
      'technique', 'open', 'normal', ago(4 * D), [
        msg('admin', 'Bonjour Camille, merci pour votre message. La limite est de 20 Mo par fichier. Je regarde si on peut l’augmenter pour les comptes Premium.', ago(4 * D - 50 * 60_000)),
        msg('user', 'Super, merci. En attendant je peux le découper en deux PDF ?', ago(4 * D - 90 * 60_000)),
      ]),
    ticket('4820', 'u_004', 'Export RGPD : relancer la génération', 'L’export de mes données s’est arrêté en cours de route.', 'bug', 'in_progress', 'low', ago(5 * D)),
    ticket('4819', 'u_005', 'Facturation Coparentalité+ : remboursement', 'J’ai été prélevée deux fois ce mois-ci.', 'contact', 'open', 'high', ago(5 * D + 3 * H)),
    ticket('4818', 'u_003', 'Le témoin n’a pas reçu l’e-mail', 'Ma sœur n’a pas reçu le lien de témoignage.', 'technique', 'waiting_user', 'normal', ago(6 * D), [
      msg('admin', 'Pouvez-vous lui demander de vérifier ses courriers indésirables ? Vous pouvez aussi copier le lien depuis la demande.', ago(2 * D)),
    ]),
    ticket('4817', 'u_002', 'Changer l’e-mail du compte', 'Comment modifier mon adresse e-mail ?', 'contact', 'closed', 'low', ago(11 * D), [
      msg('admin', 'Rendez-vous dans Profil, puis Informations : un code de confirmation sera envoyé à la nouvelle adresse.', ago(10 * D)),
    ]),
    ticket('4816', 'u_006', 'Lien de témoignage reçu par erreur', 'J’ai reçu un lien de témoignage d’une personne que je ne connais pas, avec un message insistant.', 'abus', 'open', 'low', ago(1 * D)),
  ]

  let n = 1
  const line = (action: string, actorType: AuditRow['actorType'], at: string, extra: Partial<AuditRow> = {}): AuditRow => ({
    id: String(n++), createdAt: at, action, actorType,
    actorEmail: actorType === 'admin' ? extra.actorEmail ?? 'claire.m@pirabellabs.com' : null,
    subjectId: null, entity: null, entityId: null, metadata: {}, ...extra,
  })
  const audit: AuditRow[] = [
    line('admin.content.create', 'admin', ago(48 * H), { entity: 'faq_items', entityId: 'autorite-parentale-conjointe', metadata: { statut: 'brouillon', version: 1 } }),
    line('security.mfa_enabled', 'system', ago(45 * H), { subjectId: 'u_001', entity: 'users', entityId: 'u_001' }),
    line('admin.content.update', 'admin', ago(40 * H), { entity: 'faq_items', entityId: 'residence-alternee', metadata: { statut: 'publie', version: 3 } }),
    line('account.export', 'user', ago(34 * H), { subjectId: 'u_008', entity: 'users', entityId: 'u_008', metadata: { tables: 24 } }),
    line('admin.content.unpublish', 'admin', ago(30 * H), { entity: 'daily_tips', entityId: 'preparer-l-ecole', metadata: { statut: 'brouillon', version: 2 } }),
    line('admin.account.suspend', 'admin', ago(26 * H), { actorEmail: DEMO_ACTOR, subjectId: 'u_012', entity: 'users', entityId: 'u_012', metadata: { reason: 'signalement' } }),
    line('admin.account.reactivate', 'admin', ago(25 * H), { actorEmail: DEMO_ACTOR, subjectId: 'u_012', entity: 'users', entityId: 'u_012' }),
    line('admin.content.create', 'admin', ago(20 * H), { entity: 'tutorials', entityId: 'partager-chronologie', metadata: { statut: 'brouillon', version: 1 } }),
    line('security.password_changed', 'system', ago(16 * H), { subjectId: 'u_003', entity: 'users', entityId: 'u_003' }),
    line('admin.support.reply', 'admin', ago(12 * H), { actorEmail: DEMO_ACTOR, subjectId: 'u_003', entity: 'support_tickets', entityId: '4818', metadata: { length: 132, resolved: false } }),
    line('admin.content.publish', 'admin', ago(6 * H), { entity: 'faq_items', entityId: 'dossier-jaf-pieces', metadata: { statut: 'publie', version: 4 } }),
    line('account.delete', 'user', ago(2 * H), { entity: 'users', entityId: 'u_099', metadata: { purge_after_days: 30 } }),
  ].reverse()

  const req = (id: string, uid: string, status: TestimonyRequestRow['status'], createdDaysAgo: number, has = false): TestimonyRequestRow => ({
    id, userId: uid, status,
    createdAt: ago(createdDaysAgo * D), expiresAt: new Date(Date.now() + (30 - createdDaysAgo) * D).toISOString(),
    openedAt: status === 'pending' ? null : ago((createdDaysAgo - 1) * D),
    submittedAt: status === 'submitted' ? ago((createdDaysAgo - 2) * D) : null,
    revokedAt: status === 'revoked' ? ago((createdDaysAgo - 1) * D) : null,
    hasTestimony: has,
  })
  const testimonies: TestimonyRequestRow[] = [
    req('7a1c0d2e-0000-4000-8000-000000024081', 'u_001', 'opened', 6),
    req('7a1c0d2e-0000-4000-8000-000000024082', 'u_005', 'submitted', 8, true),
    req('7a1c0d2e-0000-4000-8000-000000024083', 'u_002', 'pending', 11),
    req('7a1c0d2e-0000-4000-8000-000000024084', 'u_003', 'expired', 40),
    req('7a1c0d2e-0000-4000-8000-000000024085', 'u_006', 'in_progress', 16),
    req('7a1c0d2e-0000-4000-8000-000000024086', 'u_005', 'submitted', 20, true),
  ]

  return { accounts, tickets, audit, testimonies, nextAudit: n }
}

export function opsDemo(): Store {
  const g = globalThis as G
  if (!g[KEY]) g[KEY] = seed()
  return g[KEY]
}

/** Ajoute une ligne au journal d'audit fictif (actions de la démo). */
export function demoAudit(action: string, opts: { subjectId?: string | null; entity?: string; entityId?: string; metadata?: Record<string, unknown> } = {}) {
  const s = opsDemo()
  s.audit.unshift({
    id: String(s.nextAudit++), createdAt: new Date().toISOString(), action, actorType: 'admin', actorEmail: DEMO_ACTOR,
    subjectId: opts.subjectId ?? null, entity: opts.entity ?? null, entityId: opts.entityId ?? null, metadata: opts.metadata ?? {},
  })
}
