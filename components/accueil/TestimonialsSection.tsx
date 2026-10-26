import { Mail, Quote } from 'lucide-react'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { cn } from '@/lib/cn'
import { BTN_OUTLINE, CARD, CONTAINER, IconBubble, SECTION, SectionHead } from './ui'
import { TESTIMONIALS } from './testimonials'
import { TestimonialCarousel } from './TestimonialCarousel'

// Mise en page de la maquette : « Ils utilisent déjà Lien Parental », 3 cartes et flèches (TestimonialCarousel).
// Aucun vrai témoignage publié pour l'instant (les avis de la maquette sont des exemples, confirmé par le client) :
// tant que TESTIMONIALS est vide, on affiche l'intention de l'équipe (signée par elle) et l'invitation à partager son avis.
export function Testimonials() {
  const hasReal = TESTIMONIALS.length > 0
  return (
    <section id="temoignages" aria-labelledby="testimonials-title" className={SECTION}>
      <div className={CONTAINER}>
        {hasReal ? (
          <>
            <SectionHead id="testimonials-title" title="Ils utilisent déjà Lien Parental" lead="Des parents racontent ce qui a changé pour eux." />
            <TestimonialCarousel items={TESTIMONIALS} />
          </>
        ) : (
          <>
            <SectionHead
              id="testimonials-title"
              title="Vos premiers retours arrivent"
              lead="Lien Parental vient d’ouvrir. Les avis publiés ici seront ceux de vrais parents, avec leur accord écrit."
            />
            <ul className="mx-auto mt-10 grid max-w-[920px] grid-cols-1 gap-5 md:grid-cols-2">
              <li>
                <figure className={cn(CARD, 'flex h-full flex-col p-7')}>
                  <Quote className="h-6 w-6 text-leaf-400" aria-hidden />
                  <blockquote className="mt-3 flex-1 text-[17px] font-semibold leading-relaxed text-night-900">
                    Que chaque parent s’organise sereinement, et que chaque enfant garde un lien apaisé avec ses deux parents.
                  </blockquote>
                  <figcaption className="mt-5 font-script text-[28px] leading-none text-leaf-500">L’équipe Lien Parental</figcaption>
                </figure>
              </li>
              <li className="flex flex-col rounded-2xl bg-[#F3F8F3] p-7 ring-1 ring-leaf-100">
                <IconBubble className="bg-white"><Mail strokeWidth={1.75} /></IconBubble>
                <h3 className="mt-4 text-[18px] font-bold text-night-900">Partagez votre avis</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-night-700">
                  Dites-nous ce qui vous aide et ce qui manque. Avec votre accord écrit, votre avis pourra figurer ici.
                </p>
                <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Mon avis sur Lien Parental')}`} className={cn(BTN_OUTLINE, 'mt-5 self-start')}>
                  <Mail className="h-4 w-4" aria-hidden />Partager mon avis
                </a>
              </li>
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
