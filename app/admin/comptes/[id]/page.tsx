import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CreditCard, Gavel, HardDrive, History, KeyRound, LifeBuoy, MonitorSmartphone, UserRound } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { RepoError } from '@/lib/contenus/repo'
import { getAccount, isSelfAccount } from '@/lib/admin/ops/comptes'
import { PLAN_LABEL, actionLabel, type AccountDetail } from '@/lib/admin/ops/types'
import { MODERATION_KIND_LABEL, MODERATION_REASON_LABEL, durationLabelOf, type ModerationEntry, type ModerationKind } from '@/lib/admin/ops/moderation'
import { planLabelOf } from '@/lib/admin/stats/db'
import { AccountActions } from '@/components/admin/ops/AccountActions'
import { ModerationPill, WarningCount } from '@/components/admin/ops/moderation/ModerationPill'
import { DemoNotice, ErrorBox, KV, Note, Panel, Pill, fmtDate, fmtDateTime, fmtMb, hrefWith, linkCls, type Tone } from '@/components/admin/ops/ui'
import { PLAN_TONE } from '@/components/admin/ops/tones'

export const metadata: Metadata = { title: 'Fiche compte' }
export const dynamic = 'force-dynamic'

const EFFECTIVE: Record<string, string> = { free: 'Gratuit', premium: 'Premium', coparentalite: 'Coparentalité+' }
const SUB_STATUS: Record<string, string> = {
  active: 'Actif', trialing: 'Essai', past_due: 'Impayé', canceled: 'Résilié', incomplete: 'Incomplet', incomplete_expired: 'Expiré', unpaid: 'Impayé', paused: 'En pause',
}
const PAY_STATUS: Record<string, string> = { succeeded: 'Réussi', failed: 'Échoué', refunded: 'Remboursé', pending: 'En cours', canceled: 'Annulé' }
const KIND_TONE: Record<ModerationKind, Tone> = { warning: 'warn', suspension: 'danger', deactivation: 'dark', reactivation: 'ok' }
const eur = (cents: number, cur: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur || 'EUR' }).format(cents / 100)

export default async function CompteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await pageAdminCtx()
  let d: AccountDetail
  try {
    d = await getAccount(ctx, id)
  } catch (e) {
    if (e instanceof RepoError && e.code === 'not_found') notFound()
    return (
      <div>
        <BackLink />
        <ErrorBox message={e instanceof RepoError ? e.message : 'Fiche indisponible.'} />
      </div>
    )
  }
  const p = d.profile
  const m = d.moderation
  const name = [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'
  const hasSubscription = !!d.subscription && ['active', 'trialing', 'past_due'].includes(d.subscription.status)

  return (
    <div className="space-y-5">
      <BackLink />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-[26px] font-extrabold leading-tight text-night-900 sm:text-[30px]">{name}</h1>
          <p className="mt-1 break-all text-[14px] text-night-700">{p.email}</p>
          <p className="mt-1 font-mono text-[12px] text-night-500">{p.id}</p>
        </div>
        <p className="flex flex-wrap gap-1.5">
          <Pill tone={PLAN_TONE[p.plan]}>{PLAN_LABEL[p.plan]}</Pill>
          <ModerationPill state={m.state} until={m.until} />
          <WarningCount count={m.warnings} />
        </p>
      </header>
      <DemoNotice mode={ctx.mode} />
      <Note tone="privacy">
        Fiche minimale : profil, formule, abonnement, stockage, nombre d’enfants et connexions. Le Journal, le coffre-fort, les témoignages, la messagerie et la santé ne sont jamais accessibles à l’administration.
      </Note>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Actions" icon={<KeyRound className="h-4 w-4 text-night-500" aria-hidden="true" />} className="lg:col-span-2">
          <AccountActions target={{
            id: p.id, email: p.email, name, state: m.state, until: m.until, isAdmin: p.plan === 'admin',
            isSelf: isSelfAccount(ctx, p), emailVerified: p.emailVerified, hasSubscription,
          }} />
        </Panel>
        <Panel title="Historique de modération" icon={<Gavel className="h-4 w-4 text-night-500" aria-hidden="true" />} className="lg:col-span-3">
          <ModerationHistory history={m.history} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Profil" icon={<UserRound className="h-4 w-4 text-night-500" aria-hidden="true" />}>
          <KV items={[
            { k: 'Prénom', v: p.prenom ?? 'Non renseigné' },
            { k: 'Nom', v: p.nom ?? 'Non renseigné' },
            { k: 'Inscription', v: fmtDate(p.createdAt) },
            { k: 'E-mail vérifié', v: p.emailVerified ? 'Oui' : 'Non' },
            { k: 'Double authentification', v: p.mfaEnabled ? 'Activée' : 'Non activée' },
            { k: 'Dernière connexion', v: fmtDateTime(p.lastSignInAt) || 'Jamais' },
            ...(m.state === 'suspendu' ? [{ k: 'Connexion', v: `Bloquée jusqu’au ${fmtDateTime(m.until)}` }] : []),
            ...(m.state === 'desactive' ? [{ k: 'Connexion', v: 'Bloquée (désactivé)' }] : []),
            ...(p.deletedAt ? [{ k: 'Suppression demandée', v: fmtDateTime(p.deletedAt) }] : []),
          ]} />
        </Panel>

        <Panel title="Formule et abonnement" icon={<CreditCard className="h-4 w-4 text-iris-500" aria-hidden="true" />}>
          <KV items={[
            { k: 'Formule propre', v: PLAN_LABEL[p.plan] },
            {
              k: 'Formule effective',
              v: `${EFFECTIVE[d.effective.plan] ?? d.effective.plan}${d.effective.via === 'famille' ? ' (via un parent lié en Coparentalité+)' : ''}`,
            },
            ...(d.subscription ? [
              { k: 'Abonnement Stripe', v: planLabelOf(d.subscription.plan) },
              { k: 'Statut', v: `${SUB_STATUS[d.subscription.status] ?? d.subscription.status}${d.subscription.cancelAtPeriodEnd ? ' (résiliation en fin de période)' : ''}` },
              { k: 'Fin de période', v: fmtDate(d.subscription.currentPeriodEnd) || 'Non renseignée' },
              { k: 'Client Stripe', v: <span className="font-mono text-[12px]">{d.subscription.stripeCustomerId ?? 'Inconnu'}</span> },
              { k: 'Abonnement', v: <span className="font-mono text-[12px]">{d.subscription.stripeSubscriptionId ?? 'Inconnu'}</span> },
            ] : [{ k: 'Abonnement Stripe', v: 'Aucun' }]),
          ]} />
          {d.payments.length > 0 && (
            <>
              <h3 className="mt-4 text-[13px] font-bold text-night-800">Derniers paiements</h3>
              <ul className="mt-1 divide-y divide-night-100 text-[13.5px]">
                {d.payments.map((x, i) => (
                  <li key={`${x.createdAt}-${i}`} className="flex justify-between gap-3 py-1.5">
                    <span className="text-night-600">{fmtDate(x.paidAt ?? x.createdAt)}</span>
                    <span className="font-semibold text-night-900">{eur(x.amountCents, x.currency)} · {PAY_STATUS[x.status] ?? x.status}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Stockage et famille" icon={<HardDrive className="h-4 w-4 text-leaf-600" aria-hidden="true" />}>
          <KV items={[
            { k: 'Stockage utilisé', v: fmtMb(p.storageMb) },
            { k: 'Enfants (titulaire, nombre)', v: String(p.childrenCount) },
            {
              k: 'Tickets de support ouverts',
              v: d.openTickets > 0
                ? <Link className={linkCls} href={hrefWith('/admin/support', { q: p.email, statut: 'en_cours' })}>{d.openTickets}</Link>
                : '0',
            },
          ]} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Dernières connexions" icon={<MonitorSmartphone className="h-4 w-4 text-night-500" aria-hidden="true" />}>
          {d.sessions.length === 0 ? (
            <p className="text-[14px] text-night-600">Aucune session enregistrée.</p>
          ) : (
            <ul className="divide-y divide-night-100 text-[14px]">
              {d.sessions.map((s, i) => (
                <li key={`${s.createdAt}-${i}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                  <span className="font-semibold text-night-900">{s.device}{s.aal === 'aal2' ? ' · 2FA' : ''}</span>
                  <span className="text-night-600">Ouverte le {fmtDate(s.createdAt)} · vue le {fmtDateTime(s.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[12.5px] text-night-500">Adresse IP jamais affichée (minimisation).</p>
        </Panel>

        <Panel
          title="Historique (journal d’audit)"
          icon={<History className="h-4 w-4 text-night-500" aria-hidden="true" />}
          actions={<Link className={`${linkCls} text-[13px]`} href={hrefWith('/admin/journaux', { compte: /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : undefined })}>Tout voir</Link>}
        >
          {d.audit.length === 0 ? (
            <p className="text-[14px] text-night-600">Aucun événement.</p>
          ) : (
            <ol className="divide-y divide-night-100 text-[14px]">
              {d.audit.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span className="font-semibold text-night-900">{actionLabel(a.action)}</span>
                  <span className="text-night-600">{fmtDateTime(a.createdAt)} · {a.actorType === 'admin' ? 'administration' : a.actorType === 'system' ? 'système' : 'utilisateur'}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <p className="flex items-center gap-2 text-[12.5px] text-night-500">
        <LifeBuoy className="h-4 w-4" aria-hidden="true" /> Une question de l’utilisateur ? Répondez depuis le support plutôt que par un autre canal : l’échange reste tracé.
      </p>
    </div>
  )
}

function ModerationHistory({ history }: { history: ModerationEntry[] | null }) {
  if (history === null) {
    return <p className="text-[14px] text-night-600">Journal de modération indisponible : appliquez la migration <span className="font-mono text-[12.5px]">0500_moderation.sql</span>. Les actions de modération sont refusées tant qu’il est absent.</p>
  }
  if (history.length === 0) return <p className="text-[14px] text-night-600">Aucune décision de modération pour ce compte.</p>
  return (
    <ol className="divide-y divide-night-100 text-[14px]" aria-label="Décisions de modération, de la plus récente à la plus ancienne">
      {history.map((h) => {
        const duration = h.kind === 'suspension' ? durationLabelOf(h.createdAt, h.until) : null
        return (
          <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Pill tone={KIND_TONE[h.kind]}>{MODERATION_KIND_LABEL[h.kind]}</Pill>
              <span className="text-[13px] text-night-600"><time dateTime={h.createdAt}>{fmtDateTime(h.createdAt)}</time> · {h.adminEmail ?? 'administrateur supprimé'}</span>
            </div>
            <dl className="mt-1.5 grid gap-x-3 gap-y-0.5 text-[13.5px] sm:grid-cols-[110px_1fr]">
              {h.reasonCode && (<><dt className="text-night-500">Motif</dt><dd className="font-semibold text-night-900">{MODERATION_REASON_LABEL[h.reasonCode]}</dd></>)}
              {h.kind === 'suspension' && (<><dt className="text-night-500">Durée</dt><dd className="text-night-900">{duration ?? 'Inconnue'}{h.until ? ` · jusqu’au ${fmtDateTime(h.until)}` : ''}</dd></>)}
              {h.kind === 'deactivation' && (<><dt className="text-night-500">Durée</dt><dd className="text-night-900">Jusqu’à réactivation manuelle</dd></>)}
              {h.reason && (<><dt className="text-night-500">{h.kind === 'reactivation' ? 'Note interne' : 'Précisions'}</dt><dd className="whitespace-pre-line break-words text-night-800">{h.reason}</dd></>)}
            </dl>
          </li>
        )
      })}
    </ol>
  )
}

function BackLink() {
  return (
    <Link href="/admin/comptes" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[14px] font-semibold text-night-700 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour aux comptes
    </Link>
  )
}
