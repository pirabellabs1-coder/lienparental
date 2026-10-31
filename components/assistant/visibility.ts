// Règle d'affichage de la bulle du Coach dans l'espace connecté (module pur, testé).

/** Routes où la bulle n'apparaît pas. */
export function bubbleHiddenOn(pathname: string): boolean {
  return (
    pathname === '/app/coach' ||
    pathname.startsWith('/app/coach/') ||
    pathname.startsWith('/app/messages/') ||
    pathname === '/app/coffre' ||
    pathname.startsWith('/app/coffre/')
  )
}
