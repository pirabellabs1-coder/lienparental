import type { AccountPlan, AccountStatus, TestimonyStatus, TicketPriority, TicketStatus } from '@/lib/admin/ops/types'
import type { Tone } from './ui'

export const PLAN_TONE: Record<AccountPlan, Tone> = { free: 'neutral', premium: 'warn', coparentalite: 'dark', admin: 'info' }
export const STATUS_TONE: Record<AccountStatus, Tone> = { actif: 'ok', non_verifie: 'warn', suspendu: 'danger', supprime: 'neutral' }
export const TICKET_STATUS_TONE: Record<TicketStatus, Tone> = { open: 'warn', in_progress: 'info', waiting_user: 'neutral', resolved: 'ok', closed: 'neutral' }
export const PRIORITY_TONE: Record<TicketPriority, Tone> = { urgent: 'danger', high: 'dark', normal: 'ok', low: 'neutral' }
export const TESTIMONY_TONE: Record<TestimonyStatus, Tone> = { pending: 'neutral', opened: 'info', in_progress: 'warn', submitted: 'ok', expired: 'neutral', revoked: 'danger' }
