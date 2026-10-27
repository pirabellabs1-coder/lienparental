// Lecture d'un flux SSE renvoyé par un POST (EventSource ne gère que GET).

export type SseHandler = (event: string, data: unknown) => void

/** Message d'erreur lisible depuis une réponse non-SSE ({ error: { message } }). */
export async function errorMessage(
  res: Response,
  fallback = 'Une erreur est survenue. Réessayez dans un instant.',
  /** Libellés traduits pour les statuts gérés côté client (repli : français). */
  statusMessages?: { sessionExpired?: string; tooLarge?: string },
): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } | string }
    if (typeof body.error === 'string') return body.error
    if (body.error && typeof body.error.message === 'string') return body.error.message
  } catch {
    // corps non JSON
  }
  if (res.status === 401) return statusMessages?.sessionExpired ?? 'Votre session a expiré. Reconnectez-vous.'
  if (res.status === 413) return statusMessages?.tooLarge ?? 'Contenu trop volumineux.'
  return fallback
}

export async function readSse(res: Response, onEvent: SseHandler): Promise<void> {
  if (!res.body) throw new Error('no body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (!data.length) continue
      try {
        onEvent(event, JSON.parse(data.join('\n')))
      } catch {
        // trame invalide ignorée
      }
    }
  }
}
