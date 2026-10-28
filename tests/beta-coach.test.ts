/** Coach IA : dates localisées de l'historique et compteur d'utilisation de démo aligné sur le profil. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localizedDateLabel } from '../components/coach/history-items'
import { demoCoachUsage } from '../lib/ai/quota-demo'
import { usage } from '../components/profil/data'
import { mockCoachArchives, mockCoachHistory } from '../lib/mock-data'

const fmt = (today: string, yesterday: string, at: string) => ({
  today: (time: string) => `${today} ${time}`,
  yesterday: (time: string) => `${yesterday} ${time}`,
  dateAt: (date: string, time: string) => `${date} ${at} ${time}`,
})

test('historique de démo : chaque élément a une date ISO valide', () => {
  for (const it of [...mockCoachHistory, ...mockCoachArchives]) {
    assert.ok(it.createdAt && !Number.isNaN(Date.parse(it.createdAt)), it.id)
  }
})

test('dates localisées (EN/PT), fuseau Guyane', () => {
  const now = new Date('2026-10-28T15:00:00Z') // 12:00 à Cayenne
  const iso = '2026-07-29T17:21:00Z' // 29 juillet 14:21 à Cayenne
  assert.equal(localizedDateLabel(iso, 'en-US', fmt('today at', 'yesterday at', 'at'), now), 'July 29 at 02:21 PM')
  assert.equal(localizedDateLabel(iso, 'pt-BR', fmt('hoje às', 'ontem às', 'às'), now), '29 de julho às 14:21')
  assert.equal(localizedDateLabel('2026-10-28T13:32:00Z', 'pt-BR', fmt('hoje às', 'ontem às', 'às'), now), 'hoje às 10:32')
  assert.equal(localizedDateLabel('2026-10-27T19:45:00Z', 'en-US', fmt('today at', 'yesterday at', 'at'), now), 'yesterday at 04:45 PM')
})

test('utilisation de démo : même compteur que le profil, date localisée', () => {
  const labels = { current: 'Current cycle', cycleN: (n: number) => `Cycle -${n}` }
  const now = Date.parse('2026-10-28T15:00:00Z')
  const free = demoCoachUsage('gratuit', 'en', labels, now)
  assert.deepEqual([free.used, free.total], [usage.gratuit.coachUsed, usage.gratuit.coachMax])
  assert.equal(free.cycles.at(-1)?.used, free.used)
  assert.equal(free.log.length, free.used)
  assert.ok(free.cycles.every((c) => c.used <= free.total))
  assert.match(free.resetDateLabel, /^November \d{2}, 2026$/)
  const prem = demoCoachUsage('premium', 'pt', labels, now)
  assert.deepEqual([prem.used, prem.total], [usage.premium.coachUsed, usage.premium.coachMax])
  assert.match(prem.resetDateLabel, /^\d{2} de novembro de 2026$/)
})
