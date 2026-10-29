import 'server-only'
/**
 * Paramètres (lecture seule). Aucun réglage applicatif n'est stocké en base : formules,
 * quotas et tarifs vivent dans le code (lib/billing/plans.ts, components/profil/pricing.ts)
 * et les prix facturés dans Stripe. Afficher des champs modifiables qui ne changent rien
 * serait trompeur : on montre donc l'état RÉEL du déploiement, sans aucun secret
 * (seulement « configuré / non configuré »), et les réglages en base qui existent
 * (territoires du Guide, modifiables dans /admin/guides).
 */
import type { AdminCtx } from '@/lib/contenus/repo'
import { listTerritoiresAdmin } from '@/lib/contenus/repo'
import { AI_ENABLED, EMAIL_ENABLED, STRIPE_ENABLED, SUPABASE_ENABLED } from '@/lib/supabase/config'
import { DEMO_MODE } from '@/lib/demo-auth'
import { BILLING_GRACE_DAYS, STRIPE_TAX_ENABLED, appOrigin } from '@/lib/billing/config'
import { supportPriorityFor } from '@/lib/billing/plans'
import { getCreditConfig } from '@/lib/ai/credit-config-server'
import { isOfferConfigured } from '@/lib/billing/prices'
import { PLAN_NAME, PRICING, formatPrice, type PlanId } from '@/components/profil/pricing'
import { googleCalendarConfigured, googleOAuthConfig } from '@/lib/integrations/google/config'
import { AI_COST_PER_ANALYSIS_EUR, AI_MONTHLY_BUDGET_EUR } from '@/lib/admin/stats/config'
import { PRIORITY_LABEL } from './types'

export type Setting = { label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'neutral' }
export type SettingsGroup = { title: string; description?: string; items: Setting[] }

const on = (b: boolean, okLabel = 'Configuré', offLabel = 'Non configuré'): Pick<Setting, 'value' | 'tone'> =>
  ({ value: b ? okLabel : offLabel, tone: b ? 'ok' : 'warn' })

const PLANS: PlanId[] = ['gratuit', 'premium', 'coparentalite']

export async function getSettings(ctx: AdminCtx): Promise<{ groups: SettingsGroup[]; territoires: { code: string; nom: string; disponible: boolean }[]; territoiresError: boolean }> {
  const { config: credits } = await getCreditConfig()
  const groups: SettingsGroup[] = [
    {
      title: 'Déploiement',
      items: [
        { label: 'Mode', value: DEMO_MODE ? 'Démonstration (comptes fictifs)' : SUPABASE_ENABLED ? 'Production (Supabase)' : 'Non configuré', tone: DEMO_MODE ? 'warn' : 'ok' },
        { label: 'Adresse publique', value: appOrigin() ?? 'Non définie (NEXT_PUBLIC_APP_URL)', tone: appOrigin() ? 'neutral' : 'warn' },
        { label: 'Clé service Supabase (serveur)', ...on(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)), hint: 'Nécessaire pour suspendre, supprimer un compte et renvoyer un e-mail.' },
        { label: 'Tâches planifiées (CRON_SECRET)', ...on(Boolean(process.env.CRON_SECRET)) },
      ],
    },
    {
      title: 'Intégrations',
      items: [
        { label: 'Paiements Stripe', ...on(STRIPE_ENABLED) },
        { label: 'Stripe Tax', ...on(STRIPE_TAX_ENABLED, 'Activé', 'Désactivé') },
        { label: 'Prix Premium mensuel / annuel', ...on(isOfferConfigured({ plan: 'premium', cycle: 'mensuel' }) && isOfferConfigured({ plan: 'premium', cycle: 'annuel' })) },
        { label: 'Prix Coparentalité+ mensuel / annuel', ...on(isOfferConfigured({ plan: 'coparentalite', cycle: 'mensuel' }) && isOfferConfigured({ plan: 'coparentalite', cycle: 'annuel' })) },
        { label: 'E-mails (Resend)', ...on(EMAIL_ENABLED) },
        { label: 'Coach IA (Anthropic)', ...on(AI_ENABLED) },
        { label: 'Connexion Google', ...on(Boolean(googleOAuthConfig())) },
        { label: 'Google Agenda', ...on(googleCalendarConfigured()) },
      ],
    },
    {
      title: 'Formules et quotas',
      description: 'Tarifs d’abonnement définis dans le code (components/profil/pricing.ts) et dans Stripe (prix immuables). Crédits IA : configuration versionnée, modifiable dans « Crédits IA ».',
      items: PLANS.flatMap((p) => [
        {
          label: `${PLAN_NAME[p]} : tarif`,
          value: p === 'gratuit' ? 'Gratuit' : `${formatPrice(PRICING[p].monthly)} / mois · ${formatPrice(PRICING[p].yearly)} / an`,
        },
        {
          label: `${PLAN_NAME[p]} : stockage, crédits IA, support`,
          value: `${p === 'gratuit' ? PRICING.storage.free : PRICING.storage[p]} Go · ${credits.monthlyCredits[p]} crédits IA / mois · priorité ${PRIORITY_LABEL[supportPriorityFor(p)].split(' ')[0].toLowerCase()}`,
        },
      ]),
    },
    {
      title: 'Facturation et suivi',
      items: [
        { label: 'Délai de grâce après un impayé', value: `${BILLING_GRACE_DAYS} jours` },
        { label: 'Coût estimé d’une analyse IA', value: formatPrice(AI_COST_PER_ANALYSIS_EUR), hint: 'ADMIN_AI_COST_PER_ANALYSIS_EUR' },
        { label: 'Budget IA mensuel (alerte)', value: AI_MONTHLY_BUDGET_EUR ? formatPrice(AI_MONTHLY_BUDGET_EUR) : 'Aucun', hint: 'ADMIN_AI_MONTHLY_BUDGET_EUR' },
        { label: 'Conservation du journal d’audit', value: '12 mois glissants' },
        { label: 'Purge des comptes supprimés', value: '30 jours après la demande' },
      ],
    },
  ]

  let territoires: { code: string; nom: string; disponible: boolean }[] = []
  let territoiresError = false
  try {
    territoires = (await listTerritoiresAdmin(ctx)).map((t) => ({ code: t.code, nom: t.nom, disponible: t.disponible }))
  } catch {
    territoiresError = true
  }
  return { groups, territoires, territoiresError }
}
