'use client'

/**
 * Planning de garde — une configuration par utilisateur.
 * - Supabase : table `garde_configs` (0210, PK user_id, RLS owner-only), config en jsonb.
 * - Démo : sessionStorage (components/garde/store, comportement historique).
 */
import { z } from 'zod'
import { defaultGardeConfig, normalizeZone, ZONE_OPTIONS, type GardeConfig, type ZoneScolaire } from '@/lib/garde'
import { loadGardeConfig as loadLocal, saveGardeConfig as saveLocal } from '@/components/garde/store'
import { DataError, LIVE, db, requireUserId, toDataError, dataMsg } from './core'
import { kickNotifications } from '@/lib/notify/client'

const parent = z.enum(['moi', 'autre'])
const zones = ZONE_OPTIONS.map((o) => o.value) as [ZoneScolaire, ...ZoneScolaire[]]
const configSchema = z.object({
  rythme: z.enum(['alternee', '2-2-3', 'weekends', 'personnalise']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  firstParent: parent,
  handoverWeekday: z.number().int().min(0).max(6),
  handoverTime: z.string().regex(/^\d{2}:\d{2}$/),
  lieu: z.enum(['ecole', 'domicile-moi', 'domicile-autre', 'autre']),
  lieuAutre: z.string().trim().max(120).optional(),
  customPattern: z.array(z.boolean()).length(14),
  weekendsAlternes: z.boolean(),
  vacances: z.object({
    moitie: z.boolean(),
    zone: z.enum(zones),
    premiereMoitieAnneesPaires: parent,
  }),
})

/**
 * Lit la configuration et indique si l'utilisateur en a enregistré une (`saved`).
 * Sans planning enregistré, `config` est le défaut de l'assistant : à ne jamais présenter
 * comme le planning réel. Démonstration : toujours `saved` (planning d'exemple).
 */
export async function fetchGardeState(today: Date): Promise<{ config: GardeConfig; saved: boolean }> {
  if (!LIVE) return { config: loadLocal(today), saved: true }
  const fallback = defaultGardeConfig(today)
  const { data, error } = await db().from('garde_configs').select('config').maybeSingle()
  if (error) throw toDataError(error, 'garde.load')
  if (!data) return { config: fallback, saved: false }
  const merged = { ...fallback, ...(data as { config: Partial<GardeConfig> }).config }
  merged.vacances = { ...fallback.vacances, ...(merged.vacances ?? {}) }
  merged.vacances.zone = normalizeZone(merged.vacances.zone)
  const p = configSchema.safeParse(merged)
  return { config: p.success ? (p.data as GardeConfig) : fallback, saved: true }
}

/** Lit la configuration (défaut si aucune n'est enregistrée ou si elle est illisible). */
export async function fetchGardeConfig(today: Date): Promise<GardeConfig> {
  return (await fetchGardeState(today)).config
}

/** Enregistre (upsert idempotent sur user_id). */
export async function storeGardeConfig(config: GardeConfig): Promise<void> {
  const p = configSchema.safeParse(config)
  if (!p.success) throw new DataError(dataMsg('garde.invalidConfig'), 'invalid')
  if (!LIVE) {
    saveLocal(config)
    return
  }
  const userId = await requireUserId()
  const { error } = await db().from('garde_configs').upsert({ user_id: userId, config: p.data, version: 1 }, { onConflict: 'user_id' })
  if (error) throw toDataError(error, 'garde.save')
  kickNotifications()
}
