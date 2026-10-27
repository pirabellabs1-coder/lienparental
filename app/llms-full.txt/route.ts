import { LLMS_HEADERS, llmsFullTxt } from '@/lib/seo/llms'

// Texte intégral des fiches du Guide et de la FAQ pour les assistants IA (jamais le champ `aConfirmer`).
export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(await llmsFullTxt(), { headers: LLMS_HEADERS })
}
