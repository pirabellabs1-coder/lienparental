import { TopBar } from '@/components/mobile/TopBar'
import { CoachChat } from '@/components/coach/CoachChat'
import { RobotMascot } from '@/components/coach/RobotMascot'
import { AI_ENABLED } from '@/lib/supabase/config'

export const metadata = { title: 'Demandez à votre Coach' }

const SUGGESTIONS = [
  'Résume les événements de ce mois',
  'Quels documents me manquent pour mon dossier JAF ?',
  'Prépare un message pour proposer un changement de garde',
  'Combien me doit l’autre parent ?',
]

// Assistant général : questions libres sur l'espace du parent (base de connaissances).
export default function CoachAssistantPage() {
  return (
    <>
      <TopBar title="Demandez à votre Coach" showBack backHref="/app/coach" showBell={false} />
      <div className="w-full px-4 pb-8 pt-3">
        <div className="flex items-center gap-3 rounded-xl2 bg-iris-50 p-4">
          <RobotMascot variant="head" size={44} />
          <p className="text-[13px] leading-relaxed text-night-800">
            Le Coach s’appuie sur votre journal, votre calendrier, votre planning de garde, les noms de vos documents et vos frais
            partagés. Il indique les données utilisées et vous dit quand une information manque.
          </p>
        </div>
        <div className="mt-5">
          <CoachChat
            aiEnabled={AI_ENABLED}
            suggestions={SUGGESTIONS}
            seed={[{ id: 'greet', from: 'ia', local: true, time: '', text: 'Bonjour, que souhaitez-vous savoir ou préparer aujourd’hui ?' }]}
            inputLabel="Votre question au Coach IA"
            placeholder="Posez votre question ou collez un message…"
            conversationLabel="Conversation avec le Coach IA"
          />
        </div>
      </div>
    </>
  )
}
