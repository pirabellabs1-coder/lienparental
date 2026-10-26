/** En-tête « clé: valeur » entre deux lignes `---` (module PUR, aussi utilisé par les scripts). */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')
  }
  return { meta, body: m[2].trim() }
}
