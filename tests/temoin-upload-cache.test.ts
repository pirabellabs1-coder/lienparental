/** Témoin : une nouvelle tentative d'envoi ne redépose que les fichiers manquants (dépôt limité par IP). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileUploadKey, signatureUploadKey, uniqueKeys, uploadOnce } from '../lib/temoin/upload-cache'

const file = (name: string, size = 10, lastModified = 1) => ({ name, size, lastModified })

test('clé de fichier : stable pour le même fichier, distincte selon le rôle, le contenu ou la date', () => {
  assert.equal(fileUploadKey('attachment', file('a.pdf')), fileUploadKey('attachment', file('a.pdf')))
  assert.notEqual(fileUploadKey('attachment', file('a.pdf')), fileUploadKey('identity', file('a.pdf')))
  assert.notEqual(fileUploadKey('attachment', file('a.pdf', 10)), fileUploadKey('attachment', file('a.pdf', 11)))
  assert.notEqual(fileUploadKey('attachment', file('a.pdf', 10, 1)), fileUploadKey('attachment', file('a.pdf', 10, 2)))
})

test('clés uniques : le même fichier choisi deux fois donne deux dépôts distincts', () => {
  assert.deepEqual(uniqueKeys(['a', 'b', 'a', 'a']), ['a', 'b', 'a#1', 'a#2'])
})

test('signature : même image → même clé ; image différente → autre clé', async () => {
  const a = await signatureUploadKey('data:image/png;base64,AAAA')
  assert.equal(a, await signatureUploadKey('data:image/png;base64,AAAA'))
  assert.notEqual(a, await signatureUploadKey('data:image/png;base64,AAAB'))
  assert.match(a, /^signature:[0-9a-f]{64}$/)
})

test('nouvelle tentative après échec partiel : seuls les fichiers manquants sont redéposés', async () => {
  const cache = new Map<string, string>()
  const sent: string[] = []
  let failOn: string | null = 'p2'
  const upload = (name: string) => async () => {
    sent.push(name)
    if (name === failOn) throw new Error('quota')
    return `req/${name}.pdf`
  }
  const sendAll = async () => {
    const id = await uploadOnce(cache, fileUploadKey('identity', file('id')), upload('id'))
    const sig = await uploadOnce(cache, await signatureUploadKey('data:sig'), upload('sig'))
    const keys = uniqueKeys(['p1', 'p2', 'p3'].map((n) => fileUploadKey('attachment', file(n))))
    const att = []
    for (const [i, n] of ['p1', 'p2', 'p3'].entries()) att.push(await uploadOnce(cache, keys[i]!, upload(n)))
    return { id, sig, att }
  }
  await assert.rejects(sendAll(), /quota/)
  assert.deepEqual(sent, ['id', 'sig', 'p1', 'p2'])
  // 2e tentative : id, sig et p1 réutilisés ; p2 (échoué, non mémorisé) et p3 déposés.
  failOn = null
  sent.length = 0
  const r = await sendAll()
  assert.deepEqual(sent, ['p2', 'p3'])
  assert.deepEqual(r, { id: 'req/id.pdf', sig: 'req/sig.pdf', att: ['req/p1.pdf', 'req/p2.pdf', 'req/p3.pdf'] })
  // 3e tentative (ex. RPC refusée) : plus aucun dépôt.
  sent.length = 0
  await sendAll()
  assert.deepEqual(sent, [])
})
