import 'server-only'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'content')

export type FaqIndex = {
  categories: { key: string; label: string }[]
  questions: { slug: string; question: string; categoryKey: string }[]
}

export function readFaqIndex(): FaqIndex {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'faq', 'index.json'), 'utf8'))
}

export function readMarkdown(rel: string): { meta: Record<string, string>; body: string } | null {
  const file = path.join(ROOT, rel)
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return null
  const raw = fs.readFileSync(file, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '')
  }
  return { meta, body: m[2].replace(/\n*Cet article a-t-il été utile \?\s*$/, '').trim() }
}
