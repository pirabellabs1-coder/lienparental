/**
 * Données structurées schema.org. JSON.stringify n'échappe pas `<` : on le neutralise
 * pour qu'un texte d'article contenant « </script> » ne puisse pas sortir de la balise.
 * Les séparateurs de ligne Unicode (U+2028, U+2029) sont aussi échappés.
 */
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .split(LS).join('\\u2028')
    .split(PS).join('\\u2029')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
