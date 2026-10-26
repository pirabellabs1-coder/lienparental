import { Fragment, type ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from '@/lib/blog/markdown'
import { cn } from '@/lib/cn'

/**
 * Rendu Markdown sûr : l'arbre produit par lib/blog/markdown est converti en éléments
 * React (aucun HTML injecté). Utilisé par les pages publiques et l'aperçu du back-office.
 */
function renderInline(nodes: Inline[], key = 'i'): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}-${i}`
    switch (n.t) {
      case 'text': return <Fragment key={k}>{n.v}</Fragment>
      case 'strong': return <strong key={k} className="font-bold text-night-900">{renderInline(n.c, k)}</strong>
      case 'em': return <em key={k}>{renderInline(n.c, k)}</em>
      case 'code': return <code key={k} className="rounded bg-night-50 px-1.5 py-0.5 font-mono text-[0.9em] text-night-800">{n.v}</code>
      case 'br': return <br key={k} />
      case 'a':
        return n.external ? (
          <a key={k} href={n.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-leaf-700 underline decoration-leaf-300 underline-offset-2 hover:decoration-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 rounded-sm">
            {renderInline(n.c, k)}<span className="sr-only"> (nouvel onglet)</span>
          </a>
        ) : (
          <a key={k} href={n.href} className="font-semibold text-leaf-700 underline decoration-leaf-300 underline-offset-2 hover:decoration-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 rounded-sm">
            {renderInline(n.c, k)}
          </a>
        )
    }
  })
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.t) {
    case 'h': {
      const cls = b.level === 2 ? 'mt-10 text-[22px] font-extrabold tracking-[-0.01em] text-night-900 sm:text-[24px]' : b.level === 3 ? 'mt-8 text-[18px] font-bold text-night-900' : 'mt-6 text-[16px] font-bold text-night-900'
      const Tag = (`h${b.level}`) as 'h2' | 'h3' | 'h4'
      return <Tag key={i} id={b.id} className={cn(cls, 'scroll-mt-24')}>{renderInline(b.c)}</Tag>
    }
    case 'p': return <p key={i} className="mt-4 leading-[1.75]">{renderInline(b.c)}</p>
    case 'ul': return <ul key={i} className="mt-4 list-disc space-y-2 pl-6 marker:text-leaf-500">{b.items.map((it, j) => <li key={j} className="leading-[1.7]">{renderInline(it, `${i}-${j}`)}</li>)}</ul>
    case 'ol': return <ol key={i} className="mt-4 list-decimal space-y-2 pl-6 marker:font-bold marker:text-leaf-600">{b.items.map((it, j) => <li key={j} className="leading-[1.7]">{renderInline(it, `${i}-${j}`)}</li>)}</ol>
    case 'quote': return <blockquote key={i} className="mt-6 rounded-r-xl border-l-4 border-leaf-400 bg-leaf-50/60 px-5 py-3 text-night-800">{b.paras.map((p, j) => <p key={j} className={cn('leading-[1.7]', j > 0 && 'mt-2')}>{renderInline(p, `${i}-${j}`)}</p>)}</blockquote>
    case 'hr': return <hr key={i} className="my-8 border-[#E5E7EB]" />
    case 'code': return <pre key={i} className="mt-4 overflow-x-auto rounded-xl bg-night-900 p-4 text-[13px] leading-relaxed text-night-50"><code>{b.v}</code></pre>
    case 'img':
      return (
        <figure key={i} className="mt-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- images d'article : chemin interne ou bucket public, dimensions inconnues */}
          <img src={b.src} alt={b.alt} loading="lazy" decoding="async" className="w-full rounded-2xl border border-[#E5E7EB] object-cover" />
          {b.alt && <figcaption className="mt-2 text-center text-[13px] text-night-600">{b.alt}</figcaption>}
        </figure>
      )
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={cn('text-[16px] text-night-800', className)}>{parseMarkdown(source).map(renderBlock)}</div>
}
