import 'server-only'
/**
 * Flux Server-Sent Events minimal pour les Route Handlers (POST + fetch côté client).
 * - `send(event, data)` : une trame `event:` / `data:` JSON ;
 * - ping toutes les 15 s (commentaire SSE) pour garder la connexion ouverte pendant la réflexion ;
 * - `onCancel` : appelé si le navigateur ferme la connexion (on annule l'appel au modèle).
 */
export type SseSend = (event: string, data: unknown) => void

export function sseResponse(
  run: (send: SseSend, signal: AbortSignal) => Promise<void>,
  init?: { headers?: Record<string, string>; /** Message de l'erreur interne (traduit) ; défaut : français. */ errorMessage?: string },
): Response {
  const encoder = new TextEncoder()
  const abort = new AbortController()
  let closed = false
  let ping: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          closed = true
        }
      }
      const send: SseSend = (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      ping = setInterval(() => write(': ping\n\n'), 15_000)
      run(send, abort.signal)
        .catch(() => send('error', { code: 'internal', message: init?.errorMessage ?? 'Une erreur est survenue. Réessayez dans un instant.' }))
        .finally(() => {
          clearInterval(ping)
          if (!closed) {
            closed = true
            try {
              controller.close()
            } catch {
              // déjà fermé
            }
          }
        })
    },
    cancel() {
      closed = true
      clearInterval(ping)
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...init?.headers,
    },
  })
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })
