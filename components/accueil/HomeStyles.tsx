// Règles propres à la page d'accueil (aucune modification de la config globale).
// Focus visible et lien d'évitement : components/site/SiteShell.tsx.
// Animations sobres : uniquement transform / opacity, coupées en prefers-reduced-motion.
// Les entrées sont en CSS pur : le contenu reste visible sans JavaScript.
const CSS = `
@keyframes home-rise{from{opacity:0;transform:translate3d(0,16px,0)}to{opacity:1;transform:none}}
.home-rise{animation:home-rise .7s cubic-bezier(.22,1,.36,1) both;animation-delay:var(--d,0ms)}
.home summary::-webkit-details-marker{display:none}
.home-scroll{scrollbar-width:none}
.home-scroll::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion:reduce){
  .home-rise{animation:none!important}
}
`

export function HomeStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />
}
