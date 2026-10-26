import { FolderLock, HeartHandshake, MessagesSquare, Sun } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CARD, CONTAINER, IconBubble, SECTION, SectionHead } from './ui'

const REASONS = [
  { id: 'pourquoi-stress', icon: Sun, title: 'Moins de stress', text: 'Rendez-vous, dépenses, documents : tout est au même endroit. Vous ne cherchez plus, vous anticipez.' },
  { id: 'pourquoi-communication', icon: MessagesSquare, title: 'Une communication apaisée', text: 'Des échanges écrits, clairs et datés, et le Coach IA pour trouver le bon ton.' },
  { id: 'pourquoi-documents', icon: FolderLock, title: 'Vos documents en sécurité', text: 'Jugements, certificats, factures : chiffrés, classés dans le coffre-fort et retrouvés en un instant.' },
  { id: 'pourquoi-enfant', icon: HeartHandshake, title: 'Toujours dans l’intérêt de votre enfant', text: 'Chaque outil est pensé pour préserver le lien de votre enfant avec ses deux parents.' },
]

export function WhyChoose() {
  return (
    <section aria-labelledby="why-title" className={cn(SECTION, 'bg-[#F4F6F9]')}>
      <div className={CONTAINER}>
        <SectionHead
          id="why-title"
          title="Pourquoi choisir Lien Parental ?"
          lead="Parce qu’être parent séparé demande déjà beaucoup, Lien Parental vous simplifie l’essentiel."
        />
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
          {REASONS.map(({ id, icon: Icon, title, text }) => (
            <li key={id} id={id} className={cn(CARD, 'scroll-mt-28 p-6')}>
              <IconBubble><Icon strokeWidth={1.75} /></IconBubble>
              <h3 className="mt-4 text-[17px] font-bold leading-snug text-night-900">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-night-700">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
