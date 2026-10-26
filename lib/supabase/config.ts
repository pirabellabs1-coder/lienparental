// Interrupteur unique : le vrai backend s'active dès que les clés Supabase sont présentes.
// Sans clés, l'application reste en mode démonstration (données fictives, comptes de démo).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const STRIPE_ENABLED = Boolean(process.env.STRIPE_SECRET_KEY)
export const AI_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY)
export const EMAIL_ENABLED = Boolean(process.env.RESEND_API_KEY)
