/**
 * Types TypeScript (écrits à la main, concis) pour Supabase.
 * À tenir synchronisés avec les migrations supabase/migrations/*.sql.
 *
 * Pour une génération auto en plus (recommandée en CI) :
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/types.gen.ts
 */

// --- ENUMs -----------------------------------------------------------
export type PlanTier = 'free' | 'premium' | 'coparentalite' | 'admin'   // 'admin' : 0102 ; 'coparentalite' : 0380

export type JournalEntryType =
  | 'visite' | 'appel' | 'message' | 'sante' | 'depense' | 'autre'   // 'depense' ajouté par 0240_journal_finances.sql

export type CalendarEventType =
  | 'visite' | 'appel_video' | 'message' | 'sante' | 'rendez_vous'
  | 'ecole' | 'activite' | 'sortie' | 'repas' | 'deplacement'
  | 'anniversaire' | 'autre'

export type DocumentConfidentialite =
  | 'standard' | 'confidentiel' | 'tres_confidentiel'

export type TestimonyRequestStatus =
  | 'pending' | 'opened' | 'in_progress' | 'submitted' | 'expired' | 'revoked'

export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled'
  | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused'

export type SubscriptionPlan = 'premium_monthly' | 'premium_yearly' | 'coparentalite_monthly' | 'coparentalite_yearly' // coparentalite_* : 0380

export type PaymentStatus =
  | 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded'

export type NotificationChannel = 'push' | 'email' | 'inapp'
export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed'

// --- Payload chiffré AES-256-GCM (voir lib/crypto) -------------------
export type EncryptedPayload = {
  ciphertext: string  // base64
  iv: string          // base64 (12 octets)
  tag: string         // base64 (16 octets)
  v: number           // version de schéma de chiffrement
}

// --- Tables ---------------------------------------------------------
export type UserRow = {
  id: string
  email: string
  prenom: string | null
  nom: string | null
  photo_url: string | null
  plan: PlanTier
  storage_used_mb: number
  email_verified: boolean
  mfa_enabled: boolean
  // 0200_auth_profiles.sql — coordonnées facultatives (écran « Informations »)
  date_naissance: string | null
  genre: string | null
  situation_familiale: string | null
  telephone: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  pays: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Colonnes de public.users modifiables par l'utilisateur (GRANT par colonne, 0200). */
export type UserEditableColumns = Pick<UserRow,
  'prenom' | 'nom' | 'photo_url' | 'date_naissance' | 'genre' | 'situation_familiale'
  | 'telephone' | 'adresse' | 'code_postal' | 'ville' | 'pays'>

export type ChildRow = {
  id: string
  user_id: string
  prenom: string
  nom: string | null
  date_naissance: string         // date ISO
  classe: string | null
  langue: string | null
  photo_url: string | null
  taille_cm: number | null
  poids_kg: number | null
  couleur_yeux: string | null
  couleur_cheveux: string | null
  infos_medicales: EncryptedPayload | null   // chiffré côté app
  profil_complet: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type PreferenceRow = {
  user_id: string
  theme: 'dark' | 'light' | 'system'
  langue: string
  notif_push: boolean
  notif_email: boolean
  notif_rappels: boolean
  rappel_defaut_min: number
  rappels_par_type: Record<string, number>
  active_child_id: string | null
  /** 0200 : préférences d'interface libres (fuseau, format, couleur, taille…). */
  ui: Record<string, unknown>
  updated_at: string
}

export type JournalEntryRow = {
  id: string
  user_id: string
  type: JournalEntryType
  titre: string
  description: string | null
  lieu: string | null
  occurred_at: string
  children_ids: string[]
  media: Array<{ path: string; mime: string; size: number }>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CalendarEventRow = {
  id: string
  user_id: string
  type: CalendarEventType
  titre: string
  description: string | null
  lieu: string | null
  start_at: string
  end_at: string | null
  all_day: boolean
  children_ids: string[]
  reminder_minutes: number | null
  reminder_sent_at: string | null
  ics_uid: string | null
  // 0340_famille.sql : visible en lecture seule par les adultes liés (défaut true à la création)
  family_shared: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CategoryRow = {
  id: string
  user_id: string
  name: string
  icon: string | null
  color: string | null
  visible_filtres: boolean
  position: number
  created_at: string
  updated_at: string
}

export type DocumentRow = {
  id: string
  user_id: string
  category_id: string | null
  name: string
  mime: string
  size_bytes: number
  confidentialite: DocumentConfidentialite
  storage_path: string
  checksum_sha256: string | null
  children_ids: string[]
  tags: string[]
  // 0340_famille.sql : partage explicite avec les adultes liés (défaut false)
  family_shared: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// 0340_famille.sql — adultes liés à une fiche enfant (en plus du titulaire children.user_id)
export type ChildGuardianRole = 'parent' | 'proche'
export type ChildGuardianRow = {
  id: string
  child_id: string
  user_id: string
  role: ChildGuardianRole
  status: 'active' | 'revoked'
  invited_by: string | null
  invitation_id: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
  revoked_by: string | null
  revoke_reason: 'removed' | 'left' | 'merged' | null
}

export type ShareRow = {
  id: string
  document_id: string
  user_id: string
  token: string
  password_hash: string | null
  expires_at: string
  revoked_at: string | null
  download_count: number
  max_downloads: number | null
  created_at: string
}

export type TestimonyRequestRow = {
  id: string
  user_id: string
  token: string
  temoin_nom_pref: string | null
  message_parent: string | null
  questions: Array<{ id: string; label: string; type: string; required?: boolean }>
  context_children: string[]
  status: TestimonyRequestStatus
  expires_at: string
  sent_at: string
  opened_at: string | null
  submitted_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type TestimonyRow = {
  id: string
  request_id: string
  user_id: string
  reference: string              // TMG-YYYY-XXXX
  temoin: {
    nom: string
    prenom: string
    email?: string
    lien?: string
    telephone?: string
  }
  reponses: Record<string, string>
  texte_original: string
  texte_ia: string | null
  texte_envoye: string
  attachments: Array<{ path: string; mime: string; size: number }>
  ip_hash: string | null
  user_agent: string | null
  sent_at: string
  created_at: string
}

export type AiAnalysisRow = {
  id: string
  user_id: string
  entree: string | null
  resultat: Record<string, unknown>
  messages: Array<{ role: 'user' | 'assistant'; content: string; at: string }>
  input_kind: 'text' | 'image' | 'document' | 'voice'
  cycle: string
  archived: boolean
  created_at: string
  updated_at: string
}

export type SubscriptionRow = {
  id: string
  user_id: string
  stripe_customer_id: string
  stripe_subscription_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  trial_end: string | null
  created_at: string
  updated_at: string
}

export type PaymentRow = {
  id: string
  user_id: string
  subscription_id: string | null
  stripe_payment_intent_id: string | null
  stripe_invoice_id: string | null
  amount_cents: number
  currency: string
  status: PaymentStatus
  invoice_url: string | null
  invoice_pdf_url: string | null
  paid_at: string | null
  created_at: string
}

export type NotificationRow = {
  id: string
  user_id: string
  channel: NotificationChannel
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  read_at: string | null
  sent_at: string | null
  created_at: string
}

export type SessionRow = {
  id: string
  user_id: string
  refresh_token_id: string | null
  device_label: string | null
  ip_hash: string | null
  user_agent: string | null
  last_seen_at: string
  revoked_at: string | null
  created_at: string
}

export type AuditLogRow = {
  id: number
  user_id: string | null
  actor_type: 'user' | 'admin' | 'system' | 'witness'
  action: string
  entity: string | null
  entity_id: string | null
  ip_hash: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type HelpArticleRow = {
  id: string
  slug: string
  title: string
  category: 'faq' | 'tuto' | 'conseil' | 'modele' | string
  content_md: string
  tags: string[]
  published: boolean
  position: number
  created_at: string
  updated_at: string
}

export type SupportTicketRow = {
  id: string
  user_id: string
  subject: string
  body: string
  status: TicketStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  messages: Array<{ from: 'user' | 'admin'; body: string; at: string }>
  attachments: Array<{ path: string; mime: string; size: number }>
  created_at: string
  updated_at: string
  closed_at: string | null
}

// --- Database schema aggregate --------------------------------------
// Shape consommée par @supabase/supabase-js >= 2.4x (GenericSchema) :
// chaque table expose Row / Insert / Update / Relationships. Les Row sont
// des alias `type` (et non des `interface`) pour satisfaire
// Record<string, unknown>. Les Insert/Update sont dérivés manuellement
// (toutes les colonnes à défauts restent optionnelles).
type Insert<T> = Partial<T> & { user_id?: string }
type Table<R> = { Row: R; Insert: Insert<R>; Update: Partial<R>; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      users:                Table<UserRow>
      children:             Table<ChildRow>
      preferences:          Table<PreferenceRow>
      journal_entries:      Table<JournalEntryRow>
      calendar_events:      Table<CalendarEventRow>
      categories:           Table<CategoryRow>
      documents:            Table<DocumentRow>
      shares:               Table<ShareRow>
      testimony_requests:   Table<TestimonyRequestRow>
      testimonies:          Table<TestimonyRow>
      ai_analyses:          Table<AiAnalysisRow>
      subscriptions:        Table<SubscriptionRow>
      payments:             Table<PaymentRow>
      notifications:        Table<NotificationRow>
      sessions:             Table<SessionRow>
      audit_log:            Table<AuditLogRow>
      help_articles:        Table<HelpArticleRow>
      support_tickets:      Table<SupportTicketRow>
      child_guardians:      Table<ChildGuardianRow>
    }
    // public_testimony_request_view supprimée par 0270_security_hardening.sql (C1).
    Views: { [_ in never]: never }
    Functions: {
      generate_testimony_reference: { Args: Record<string, never>; Returns: string }
      compute_ai_cycle_window: {
        Args: { p_user_id: string }
        Returns: Array<{
          window_start: string
          window_end: string
          used: number
          quota: number | null
          remaining: number | null
        }>
      }
      soft_delete_document: { Args: { p_document_id: string }; Returns: DocumentRow }
      restore_document:     { Args: { p_document_id: string }; Returns: DocumentRow }
      is_admin:             { Args: Record<string, never>; Returns: boolean }
      // 0200_auth_profiles.sql
      list_my_sessions: {
        Args: Record<string, never>
        Returns: Array<{ id: string; created_at: string; updated_at: string; user_agent: string | null; aal: string | null }>
      }
      revoke_my_session:      { Args: { p_session_id: string }; Returns: boolean }
      purge_deleted_accounts: { Args: Record<string, never>; Returns: string[] }
      // 0340_famille.sql (SECURITY DEFINER + MFA)
      list_family_contacts: {
        Args: Record<string, never>
        Returns: Array<{ user_id: string; prenom: string; nom: string | null; role: string; photo_path: string | null; messageable: boolean }>
      }
    }
    Enums: {
      plan_tier: PlanTier
      journal_entry_type: JournalEntryType
      calendar_event_type: CalendarEventType
      document_confidentialite: DocumentConfidentialite
      testimony_request_status: TestimonyRequestStatus
      subscription_status: SubscriptionStatus
      subscription_plan: SubscriptionPlan
      payment_status: PaymentStatus
      notification_channel: NotificationChannel
      ticket_status: TicketStatus
    }
    CompositeTypes: Record<string, never>
  }
}
