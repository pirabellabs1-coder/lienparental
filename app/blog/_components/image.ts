/**
 * Images du blog servies par next/image. Seuls les chemins internes et le stockage public Supabase
 * passent par l'optimiseur (remotePatterns de next.config.mjs) ; toute autre URL https acceptée par
 * imageUrlSchema est affichée telle quelle (`unoptimized`) plutôt que de faire échouer le rendu.
 */
const SUPABASE_PUBLIC = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//

export const isOptimizable = (src: string) => (src.startsWith('/') && !src.startsWith('//')) || SUPABASE_PUBLIC.test(src)
