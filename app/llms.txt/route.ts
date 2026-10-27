import { LLMS_HEADERS, llmsTxt } from '@/lib/seo/llms'

// Sommaire pour les assistants IA (https://llmstxt.org) : contenu français généré depuis le code.
export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(await llmsTxt(), { headers: LLMS_HEADERS })
}
