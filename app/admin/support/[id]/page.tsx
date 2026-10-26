'use client'
import { useState, useRef, useEffect, use } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader, Button, Textarea, Badge, Avatar } from '@/components/ui'
import { ChevronLeft, Send, Lock, LockOpen } from 'lucide-react'

type Message = {
  id: string
  from: 'user' | 'admin'
  author: string
  when: string
  body: string
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  // TODO: Supabase service_role — SELECT support_ticket + messages
  const [statut, setStatut] = useState<'ouvert' | 'ferme'>('ouvert')
  const [reponse, setReponse] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    { id: 'm1', from: 'user',  author: 'camille.d@mail.fr', when: '22/10/2026 09:14', body: "Bonjour, j'essaie d'ajouter un PDF de 24 Mo au coffre et j'obtiens une erreur « fichier trop volumineux ». Pouvez-vous m'aider ?" },
    { id: 'm2', from: 'admin', author: 'claire.m@pirabellabs.com', when: '22/10/2026 10:02', body: 'Bonjour Camille, merci pour votre message. La limite est de 20 Mo par fichier. Je regarde si on peut l’augmenter pour les comptes Premium.' },
    { id: 'm3', from: 'user',  author: 'camille.d@mail.fr', when: '22/10/2026 10:48', body: 'Super, merci. En attendant je peux le découper en deux PDF ?' },
  ])

  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages.length])

  const send = () => {
    const text = reponse.trim()
    if (!text) return
    // TODO: Supabase service_role — INSERT support_messages
    setMessages((m) => [
      ...m,
      { id: `m${m.length + 1}`, from: 'admin', author: 'moi@pirabellabs.com', when: new Date().toLocaleString('fr-FR'), body: text },
    ])
    setReponse('')
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/support" className="inline-flex items-center gap-1 text-sm text-night-600 hover:text-night-900">
        <ChevronLeft className="h-4 w-4" /> Retour aux tickets
      </Link>

      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-night-500">#{id}</p>
          <h1 className="font-display text-3xl text-night-900">Impossible d&rsquo;ajouter un document &gt; 20 Mo</h1>
          <p className="text-sm text-night-600 mt-1 flex items-center gap-2">
            Statut : <Badge variant={statut === 'ouvert' ? 'warning' : 'neutral'} dot>{statut === 'ouvert' ? 'ouvert' : 'fermé'}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          {statut === 'ouvert' ? (
            <Button variant="secondary" onClick={() => setStatut('ferme')}><Lock className="h-4 w-4" /> Fermer</Button>
          ) : (
            <Button variant="primary" onClick={() => setStatut('ouvert')}><LockOpen className="h-4 w-4" /> Rouvrir</Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg text-night-900">Fil de discussion</h2>
        </CardHeader>
        <CardBody>
          <ol className="space-y-4">
            {messages.map((m) => (
              <li key={m.id} className={`flex gap-3 ${m.from === 'admin' ? 'flex-row-reverse' : ''}`}>
                <Avatar
                  size="sm"
                  tone={m.from === 'admin' ? 'leaf' : 'iris'}
                  name={m.author.split('@')[0]}
                  aria-hidden="true"
                />
                <div className={`max-w-[80%] rounded-xl2 border p-3 ${
                  m.from === 'admin' ? 'bg-leaf-50 border-leaf-100' : 'bg-white border-night-100'
                }`}>
                  <div className="flex items-center justify-between gap-3 text-xs text-night-500 mb-1">
                    <span className="font-medium text-night-700">{m.author}</span>
                    <time>{m.when}</time>
                  </div>
                  <p className="text-sm text-night-900 whitespace-pre-line">{m.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div ref={endRef} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg text-night-900">Répondre</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <Textarea
            aria-label="Votre réponse"
            placeholder="Rédigez votre réponse…"
            value={reponse}
            onChange={(e) => setReponse(e.target.value)}
            disabled={statut === 'ferme'}
            rows={5}
          />
          <div className="flex justify-end">
            <Button variant="primary" onClick={send} disabled={!reponse.trim() || statut === 'ferme'}>
              <Send className="h-4 w-4" /> Envoyer
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
