'use client'
import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/cn'

/** "Cet article vous a-t-il été utile ?" + pouces. */
export function ArticleFeedback({ slug }: { slug: string }) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  // NOTE Supabase: insert dans `help_votes` (slug, vote, user_id).
  return (
    <div className="mt-8 flex items-center gap-2 rounded-xl2 bg-night-50/80 px-4 py-2" data-slug={slug}>
      <p className="flex-1 text-[12.5px] text-night-800" aria-live="polite">
        {vote ? 'Merci pour votre retour !' : 'Cet article vous a-t-il été utile ?'}
      </p>
      {(['up', 'down'] as const).map(v => (
        <button
          key={v}
          type="button"
          onClick={() => setVote(v)}
          aria-pressed={vote === v}
          aria-label={v === 'up' ? 'Oui, utile' : 'Non, pas utile'}
          className={cn(
            'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400',
            vote === v ? 'text-leaf-600' : 'text-night-900',
          )}
        >
          {v === 'up' ? <ThumbsUp className="h-5 w-5" aria-hidden /> : <ThumbsDown className="h-5 w-5" aria-hidden />}
        </button>
      ))}
    </div>
  )
}
