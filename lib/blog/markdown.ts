/**
 * Markdown → arbre de rendu (module PUR, sans dépendance).
 *
 * Sécurité par construction : le résultat est un arbre de nœuds typés, rendu en éléments
 * React par app/blog/_components/Markdown.tsx. Aucun HTML n'est jamais injecté
 * (pas de dangerouslySetInnerHTML) : une balise écrite dans l'article s'affiche comme du texte.
 * Les liens et images sont filtrés (https, mailto, chemins internes et ancres seulement).
 *
 * Sous-ensemble pris en charge : titres (#, ##, ###, ####), paragraphes, listes à puces et
 * numérotées, citations (>), séparateur (---), blocs de code (```), images seules sur leur
 * ligne, gras, italique, code en ligne, liens, saut de ligne (deux espaces en fin de ligne).
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; external: boolean; c: Inline[] }
  | { t: 'br' }

export type Block =
  | { t: 'h'; level: 2 | 3 | 4; id: string; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'quote'; paras: Inline[][] }
  | { t: 'hr' }
  | { t: 'code'; v: string }
  | { t: 'img'; src: string; alt: string }

const MAX_INPUT = 100_000

/** Adresse de lien acceptée, ou null (le texte du lien est alors affiché seul). */
export function safeHref(raw: string): string | null {
  const url = raw.trim()
  if (/^https?:\/\/[^\s<>"']+$/i.test(url)) return url
  if (/^mailto:[^\s<>"']+$/i.test(url)) return url
  if (/^\/(?!\/)[^\s<>"']*$/.test(url)) return url
  if (/^#[\w-]+$/.test(url)) return url
  return null
}

/** Source d'image acceptée (https ou chemin interne), ou null. */
export function safeImageSrc(raw: string): string | null {
  const url = raw.trim()
  if (/^https:\/\/[^\s<>"']+$/i.test(url)) return url
  if (/^\/(?!\/)[\w\-./]+$/.test(url)) return url
  return null
}

export function headingId(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section'
}

// --- Inline -------------------------------------------------------------------

const INLINE_PATTERNS: { re: RegExp; build: (m: RegExpExecArray) => Inline[] }[] = [
  { re: /`([^`\n]+)`/, build: (m) => [{ t: 'code', v: m[1] }] },
  {
    re: /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
    build: (m) => {
      const href = safeHref(m[2])
      const c = parseInline(m[1])
      // Adresse refusée (javascript:, data:, …) : seul le texte du lien est conservé.
      return href ? [{ t: 'a', href, external: /^https?:/i.test(href), c }] : c
    },
  },
  { re: /\*\*([^*\n](?:[^\n]*?[^*\n])?)\*\*/, build: (m) => [{ t: 'strong', c: parseInline(m[1]) }] },
  { re: /__([^_\n](?:[^\n]*?[^_\n])?)__/, build: (m) => [{ t: 'strong', c: parseInline(m[1]) }] },
  { re: /\*([^*\s](?:[^*\n]*?[^*\s])?)\*/, build: (m) => [{ t: 'em', c: parseInline(m[1]) }] },
  { re: /(?<![\w])_([^_\s](?:[^_\n]*?[^_\s])?)_(?![\w])/, build: (m) => [{ t: 'em', c: parseInline(m[1]) }] },
  { re: / {2,}\n|\\\n/, build: () => [{ t: 'br' }] },
]

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let rest = s
  while (rest) {
    let best: { idx: number; m: RegExpExecArray; build: (m: RegExpExecArray) => Inline[] } | null = null
    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(rest)
      if (m && (best === null || m.index < best.idx)) best = { idx: m.index, m, build: p.build }
    }
    if (!best) { pushText(out, rest); break }
    if (best.idx > 0) pushText(out, rest.slice(0, best.idx))
    for (const n of best.build(best.m)) {
      if (n.t === 'text') pushText(out, n.v)
      else out.push(n)
    }
    rest = rest.slice(best.idx + best.m[0].length)
  }
  return out
}

function pushText(out: Inline[], v: string) {
  const text = v.replace(/\n/g, ' ')
  const last = out[out.length - 1]
  if (last?.t === 'text') last.v += text
  else out.push({ t: 'text', v: text })
}

// --- Blocs --------------------------------------------------------------------

export function parseMarkdown(md: string): Block[] {
  const src = md.slice(0, MAX_INPUT).replace(/\r\n?/g, '\n')
  const linesArr = src.split('\n')
  const blocks: Block[] = []
  const ids = new Map<string, number>()
  let i = 0

  const uniqueId = (text: string) => {
    const base = headingId(text)
    const n = ids.get(base) ?? 0
    ids.set(base, n + 1)
    return n ? `${base}-${n + 1}` : base
  }

  while (i < linesArr.length) {
    const line = linesArr[i]
    const trimmed = line.trim()

    if (!trimmed) { i++; continue }

    // Bloc de code
    if (/^```/.test(trimmed)) {
      const buf: string[] = []
      i++
      while (i < linesArr.length && !/^```/.test(linesArr[i].trim())) buf.push(linesArr[i++])
      i++
      blocks.push({ t: 'code', v: buf.join('\n') })
      continue
    }

    // Séparateur
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { blocks.push({ t: 'hr' }); i++; continue }

    // Titre (le # unique devient un h2 : la page porte déjà le h1)
    const h = /^(#{1,4})\s+(.+?)\s*#*$/.exec(trimmed)
    if (h) {
      const level = Math.max(2, h[1].length) as 2 | 3 | 4
      blocks.push({ t: 'h', level, id: uniqueId(h[2]), c: parseInline(h[2]) })
      i++
      continue
    }

    // Image seule sur sa ligne
    const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(trimmed)
    if (img) {
      const src = safeImageSrc(img[2])
      if (src) blocks.push({ t: 'img', src, alt: img[1].trim() })
      else blocks.push({ t: 'p', c: [{ t: 'text', v: img[1] }] })
      i++
      continue
    }

    // Citation
    if (/^>\s?/.test(trimmed)) {
      const buf: string[] = []
      while (i < linesArr.length && /^>\s?/.test(linesArr[i].trim())) buf.push(linesArr[i++].trim().replace(/^>\s?/, ''))
      const paras = buf.join('\n').split(/\n\s*\n/).map((p) => parseInline(p.trim())).filter((p) => p.length)
      blocks.push({ t: 'quote', paras })
      continue
    }

    // Listes
    const ulRe = /^[-*+]\s+(.*)$/
    const olRe = /^\d{1,3}[.)]\s+(.*)$/
    if (ulRe.test(trimmed) || olRe.test(trimmed)) {
      const ordered = olRe.test(trimmed)
      const re = ordered ? olRe : ulRe
      const items: string[] = []
      while (i < linesArr.length) {
        const l = linesArr[i].trim()
        const m = re.exec(l)
        if (m) { items.push(m[1]); i++; continue }
        // Continuation indentée d'un élément
        if (l && /^\s{2,}/.test(linesArr[i]) && items.length) { items[items.length - 1] += ` ${l}`; i++; continue }
        break
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items: items.map((it) => parseInline(it)) })
      continue
    }

    // Paragraphe : jusqu'à la prochaine ligne vide ou le prochain bloc
    const buf: string[] = []
    while (i < linesArr.length) {
      const l = linesArr[i]
      const t = l.trim()
      if (!t || /^(#{1,4})\s/.test(t) || /^```/.test(t) || /^>\s?/.test(t) || /^[-*+]\s+/.test(t) || /^\d{1,3}[.)]\s+/.test(t) || /^(-{3,}|\*{3,}|_{3,})$/.test(t)) break
      buf.push(l.replace(/^\s+/, ''))
      i++
    }
    blocks.push({ t: 'p', c: parseInline(buf.join('\n')) })
  }
  return blocks
}

// --- Utilitaires ----------------------------------------------------------------

function inlineText(c: Inline[]): string {
  return c.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? ' ' : inlineText(n.c))).join('')
}

/** Texte brut (description SEO, temps de lecture, recherche). */
export function markdownToText(md: string): string {
  return parseMarkdown(md)
    .map((b) => {
      switch (b.t) {
        case 'h': case 'p': return inlineText(b.c)
        case 'ul': case 'ol': return b.items.map(inlineText).join(' ')
        case 'quote': return b.paras.map(inlineText).join(' ')
        case 'code': return b.v
        case 'img': return b.alt
        default: return ''
      }
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Temps de lecture estimé (230 mots par minute, au moins 1 minute). */
export function readingMinutes(md: string): number {
  const words = markdownToText(md).split(' ').filter(Boolean).length
  return Math.max(1, Math.round(words / 230))
}

/** Sommaire (titres de niveau 2). */
export function tableOfContents(md: string): { id: string; text: string }[] {
  return parseMarkdown(md).flatMap((b) => (b.t === 'h' && b.level === 2 ? [{ id: b.id, text: inlineText(b.c) }] : []))
}
