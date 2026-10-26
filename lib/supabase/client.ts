/**
 * Supabase browser client (Next.js App Router).
 * À utiliser dans les Client Components.
 * Instance unique par onglet (createBrowserClient la mémoïse déjà ; on garde
 * une référence locale pour éviter de recréer les listeners d'auth).
 */
'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

let browserClient: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient
  // Re-typage : voir la note dans lib/supabase/server.ts (génériques ssr ≠ supabase-js).
  browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as SupabaseClient<Database>
  return browserClient
}
