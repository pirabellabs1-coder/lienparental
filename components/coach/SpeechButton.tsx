import { Loader2, Square, Volume2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type BubbleSpeech = { playing: boolean; loading: boolean; onToggle: () => void }

/**
 * Bouton « Lire à haute voix » des réponses du Coach, partagé avec la bulle de l'assistant
 * (site public et espace connecté). Libellés fournis par l'appelant (namespaces différents).
 */
export function SpeechButton({ speech, labels }: { speech: BubbleSpeech; labels: { listen: string; listenStop: string; listenLoading: string } }) {
  return (
    <button
      type="button"
      onClick={speech.onToggle}
      aria-pressed={speech.playing}
      className={cn(
        '-ml-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-500',
        speech.playing || speech.loading ? 'bg-iris-50 text-iris-700' : 'text-iris-600 hover:bg-iris-50',
      )}
    >
      {speech.loading ? (
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
      ) : speech.playing ? (
        <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      ) : (
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      )}
      {speech.loading ? labels.listenLoading : speech.playing ? labels.listenStop : labels.listen}
    </button>
  )
}
