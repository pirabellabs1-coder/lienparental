// Mini-rendu Markdown pour les contenus d'aide (content/faq, content/tutoriels).
// Couvre uniquement ce qu'utilisent ces fichiers : front-matter, ## titres,
// paragraphes, listes à puces, listes numérotées, **gras**. Les images sont ignorées.
// Le texte est rendu en nœuds React (jamais en HTML brut) : pas de risque XSS.
import { Check } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

export type Block =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }

export type ParsedDoc = { meta: Record<string, string>; blocks: Block[] }

const FEEDBACK_LINE = /^cet article a-t-il été utile/i

export function parseMarkdown(src: string): ParsedDoc {
  const meta: Record<string, string> = {}
  let body = src.replace(/\r\n/g, '\n')
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/)
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(\w+):\s*"?(.*?)"?\s*$/)
      if (m) meta[m[1]] = m[2]
    }
    body = body.slice(fm[0].length)
  }

  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') })
    para = []
  }
  const last = () => blocks[blocks.length - 1]

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('![') || FEEDBACK_LINE.test(line)) { flush(); continue }
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'h2', text: line.slice(3) }); continue }
    if (line.startsWith('# ')) { flush(); continue } // titre déjà fourni par le front-matter
    const ul = line.match(/^[-*]\s+(.*)$/)
    if (ul) {
      flush()
      const b = last()
      if (b?.type === 'ul') b.items.push(ul[1])
      else blocks.push({ type: 'ul', items: [ul[1]] })
      continue
    }
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (ol) {
      flush()
      const b = last()
      if (b?.type === 'ol') b.items.push(ol[1])
      else blocks.push({ type: 'ol', items: [ol[1]] })
      continue
    }
    // Ligne indentée qui prolonge un élément de liste
    const b = last()
    if (raw.startsWith('   ') && para.length === 0 && (b?.type === 'ol' || b?.type === 'ul')) {
      b.items[b.items.length - 1] += ` ${line}`
      continue
    }
    para.push(line)
  }
  flush()
  return { meta, blocks }
}

/** **gras** → <strong>. */
export function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-bold text-night-900">{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p}</Fragment>,
  )
}

/** Sépare "**Titre.** Texte" en { title, rest } pour les étapes de tutoriel. */
function splitStep(item: string) {
  const m = item.match(/^\*\*(.+?)\*\*\s*(.*)$/)
  return m ? { title: m[1].replace(/[.:]$/, ''), rest: m[2] } : { title: null, rest: item }
}

export function MarkdownBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-night-800">
      {blocks.map((b, i) => {
        if (b.type === 'h2') return <h2 key={i} className="pt-2 text-[14.5px] font-bold text-night-900">{b.text}</h2>
        if (b.type === 'p') return <p key={i}>{inline(b.text)}</p>
        if (b.type === 'ul') {
          return (
            <ul key={i} className="space-y-2.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex items-start gap-3">
                  <span aria-hidden className="mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-leaf-500 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span>{inline(it)}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <ol key={i} className="space-y-4">
            {b.items.map((it, j) => {
              const { title, rest } = splitStep(it)
              return (
                <li key={j} className="flex items-start gap-3.5">
                  <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-[12.5px] font-bold text-white">{j + 1}</span>
                  <span className="pt-0.5">
                    <span className="sr-only">Étape {j + 1} : </span>
                    {title && <span className="block font-bold text-night-900">{title}</span>}
                    <span className="block">{inline(rest)}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        )
      })}
    </div>
  )
}
