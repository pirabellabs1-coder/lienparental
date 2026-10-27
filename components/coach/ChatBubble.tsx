import { useTranslations } from 'next-intl'
import { CheckCheck, Database } from 'lucide-react'
import type { CoachChatMessage } from '@/lib/mock-data'
import { cn } from '@/lib/cn'
import { RobotMascot } from './RobotMascot'

export type ChatMessage = CoachChatMessage & {
  /** Réponse en cours de génération (flux). */
  streaming?: boolean
  /** Message d'erreur / de refus affiché dans une bulle IA. */
  tone?: 'error'
  /** Message local d'illustration, jamais renvoyé au serveur comme historique. */
  local?: boolean
}

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

/** Texte du modèle -> paragraphes + listes « - ». Aucun HTML interprété (pas d'injection). */
function toBlocks(text: string): { blocks: Block[]; sources: string | null } {
  const lines = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').split('\n')
  let sources: string | null = null
  let lastIdx = lines.length - 1
  while (lastIdx >= 0 && !lines[lastIdx]!.trim()) lastIdx--
  const last = lastIdx >= 0 ? lines[lastIdx]!.trim() : ''
  if (/^sources\s*:/i.test(last)) {
    sources = last.replace(/^sources\s*:\s*/i, '')
    lines.splice(lastIdx, 1)
  }
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') })
    para = []
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      flush()
      const prev = blocks.at(-1)
      if (prev?.kind === 'ul') prev.items.push(bullet[1]!)
      else blocks.push({ kind: 'ul', items: [bullet[1]!] })
    } else if (!line.trim()) {
      flush()
    } else {
      para.push(line)
    }
  }
  flush()
  return { blocks, sources }
}

export function RichText({ text, bullets }: { text: string; bullets?: string[] }) {
  const t = useTranslations('coach.chat')
  const { blocks, sources } = toBlocks(text)
  return (
    <>
      <div className="space-y-2">
        {blocks.map((b, i) =>
          b.kind === 'p' ? (
            <p key={i} className="whitespace-pre-line break-words">
              {b.text}
            </p>
          ) : (
            <ul key={i} className="space-y-1 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-night-900" />
                  <span className="min-w-0 break-words">{it}</span>
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
      {bullets && bullets.length > 0 && (
        <ul className="mt-2 space-y-1 pl-1">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-night-900" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {sources && (
        <p className="mt-2.5 flex items-start gap-1.5 border-t border-night-100 pt-2 text-[12px] leading-snug text-night-600">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{t('dataUsed')}</span>
            {sources}
          </span>
        </p>
      )}
    </>
  )
}

// Bulle de discussion Coach IA : utilisateur à droite (violet clair),
// IA à gauche (carte blanche + avatar robot).
export function ChatBubble({ message, live = false }: { message: ChatMessage; live?: boolean }) {
  const t = useTranslations('coach.chat')
  if (message.from === 'me') {
    return (
      <li className="flex justify-end">
        <div className="max-w-[80%] rounded-xl2 rounded-br-md bg-iris-100/70 px-4 pb-2 pt-3 text-[14px] leading-relaxed text-night-900">
          <span className="sr-only">{t('you')}</span>
          <p className="whitespace-pre-line break-words">{message.text}</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-night-500">
            <time>{message.time}</time>
            <CheckCheck className="h-3.5 w-3.5 text-iris-500" aria-label={t('sent')} />
          </p>
        </div>
      </li>
    )
  }

  const waiting = message.streaming && !message.text
  return (
    // Région live sur l'élément lui-même (stable pendant tout le flux) ; aria-busy fait
    // patienter les lecteurs d'écran jusqu'à la fin de la réponse.
    <li className="flex items-start gap-2.5" aria-live={live ? 'polite' : undefined} aria-busy={message.streaming || undefined}>
      <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center">
        <RobotMascot variant="head" size={34} />
      </span>
      <div
        className={cn(
          'max-w-[78%] rounded-xl2 rounded-tl-md border px-4 pb-2 pt-3 text-[14px] leading-relaxed shadow-soft',
          message.tone === 'error' ? 'border-alert-200 bg-alert-50 text-night-900' : 'border-night-100 bg-white text-night-900',
        )}
      >
        <span className="sr-only">{t('coachPrefix')}</span>
        {waiting ? (
          <span className="flex h-5 items-center gap-1">
            <span className="sr-only">{t('typing')}</span>
            {[0, 150, 300].map((d) => (
              <span key={d} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-iris-400 motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        ) : (
          <RichText text={message.text} bullets={message.bullets} />
        )}
        {message.streaming && !waiting && (
          <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 rounded-sm bg-iris-400 motion-safe:animate-pulse" />
        )}
        {message.time && (
          <p className="mt-1 text-right text-[11px] text-night-500">
            <time>{message.time}</time>
          </p>
        )}
      </div>
    </li>
  )
}

/** Indicateur « le coach écrit… ». */
export function TypingBubble() {
  const t = useTranslations('coach.chat')
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center">
        <RobotMascot variant="head" size={34} />
      </span>
      <div className="flex items-center gap-1 rounded-xl2 rounded-tl-md border border-night-100 bg-white px-4 py-3.5 shadow-soft">
        <span className="sr-only">{t('typing')}</span>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-iris-400 motion-safe:animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </li>
  )
}
