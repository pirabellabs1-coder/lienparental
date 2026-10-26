// Fil de démonstration entre Julie (vous) et Thomas (autre parent).
// Module pur (aucune API navigateur) : utilisé par lib/messages.ts côté client
// et par le partage avocat côté serveur (mode démonstration).

export const DEMO_ME_ID = 'u_1'
export const DEMO_OTHER_ID = 'u_2'
export const DEMO_CONVERSATION_ID = 'conv_demo'

export const DEMO_THIRD_ID = 'u_3'

export const DEMO_ME = { id: DEMO_ME_ID, prenom: 'Julie', nom: 'Martin' }
export const DEMO_OTHER = { id: DEMO_OTHER_ID, prenom: 'Thomas', nom: 'Martin' }
/** Famille recomposée : parent lié supplémentaire (démonstration multi-parents). */
export const DEMO_THIRD = { id: DEMO_THIRD_ID, prenom: 'Karim', nom: 'Benali' }

export type SeedMessage = {
  id: string
  senderId: string
  body: string
  attachment: { name: string; mime: string; size: number; path: string } | null
  createdAt: string
  readAt: string | null
  /** v3 : type de message (déduit de la pièce jointe si absent). */
  kind?: 'text' | 'attachment' | 'audio'
  audioDurationMs?: number | null
}

function at(now: Date, daysAgo: number, h: number, m: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m, 0, 0)
  // Jamais dans le futur (démo ouverte tôt le matin).
  const latest = now.getTime() - 2 * 60_000
  return new Date(Math.min(d.getTime(), latest)).toISOString()
}

/** 12 messages sur 5 jours : récupérations, école, santé, vacances. */
export function demoSeedMessages(now: Date = new Date()): SeedMessage[] {
  const me = DEMO_ME_ID
  const other = DEMO_OTHER_ID
  const rows: Array<[string, number, number, number, string, SeedMessage['attachment']?]> = [
    [other, 5, 8, 12, "Bonjour Julie, je récupère Lina et Noah vendredi à 16h30 à l'école comme prévu."],
    [me, 5, 8, 40, 'Bonjour Thomas, très bien. Noah a son sac de judo, il a entraînement samedi à 10h.'],
    [other, 5, 9, 2, "Noté, je l'emmènerai. À quelle heure se termine le cours ?"],
    [me, 5, 9, 15, '11h30. La licence est dans la pochette avant du sac.'],
    [other, 3, 18, 47, "La maîtresse de Lina demande un rendez-vous la semaine prochaine. Tu as reçu le mot dans le cahier de liaison ?"],
    [me, 3, 19, 5, 'Oui, je l’ai vu. Je peux mardi ou jeudi après 17h. Tu préfères quel jour ?'],
    [other, 3, 19, 30, 'Jeudi me convient. Je confirme à l’école demain matin.'],
    [me, 2, 12, 20, 'Voici le planning des vacances de la Toussaint dont nous avions parlé.', { name: 'Planning-Toussaint.pdf', mime: 'application/pdf', size: 184_320, path: 'demo/planning-toussaint.pdf' }],
    [other, 2, 14, 3, 'Merci, ça me va. Je les dépose chez toi le samedi 31 à 18h.'],
    [me, 1, 7, 55, 'Lina a un peu de fièvre ce matin, je la garde à la maison. Je te tiens au courant.'],
    [other, 1, 8, 10, "Merci de me prévenir. Dis-moi si tu as besoin que je passe à la pharmacie."],
    [me, 0, 9, 30, 'Elle va mieux, 37,4 ce matin. Elle retourne à l’école demain.'],
  ]

  // Tous les messages sont lus, sauf le dernier envoyé (pas encore vu par Thomas).
  return rows.map(([sender, d, h, m, body, attachment], i) => {
    const createdAt = at(now, d, h, m)
    const isLast = i === rows.length - 1
    const readAt = isLast ? null : new Date(new Date(createdAt).getTime() + 12 * 60_000).toISOString()
    return { id: `msg_${i + 1}`, senderId: sender, body, attachment: attachment ?? null, createdAt, readAt }
  })
}

// --- v3 : plusieurs conversations (sujets, parents liés, archivage) ----------

export type SeedConversation = {
  id: string
  title: string | null
  /** Tous les participants, vous compris. */
  participantIds: string[]
  createdAt: string
  archivedAt: string | null
}

export type SeedVaultLink = { messageId: string; conversationId: string; categoryName: string }

type Row = [sender: string, daysAgo: number, h: number, m: number, body: string, attachment?: SeedMessage['attachment'], audioMs?: number]

function build(prefix: string, now: Date, rows: Row[], unreadFrom: number): SeedMessage[] {
  return rows.map(([sender, d, h, m, body, attachment, audioMs], i) => {
    const createdAt = at(now, d, h, m)
    const unread = i >= unreadFrom && sender !== DEMO_ME_ID
    const lastMine = sender === DEMO_ME_ID && i === rows.length - 1
    return {
      id: `${prefix}_${i + 1}`,
      senderId: sender,
      body,
      attachment: attachment ?? null,
      createdAt,
      readAt: unread || lastMine ? null : new Date(new Date(createdAt).getTime() + 9 * 60_000).toISOString(),
      kind: audioMs ? 'audio' : attachment ? 'attachment' : 'text',
      audioDurationMs: audioMs ?? null,
    }
  })
}

/** Conversations de démonstration et leurs messages (le fil historique reste conv_demo). */
export function demoConversations(now: Date = new Date()): {
  conversations: SeedConversation[]
  messages: Record<string, SeedMessage[]>
  vault: SeedVaultLink[]
} {
  const me = DEMO_ME_ID
  const th = DEMO_OTHER_ID
  const ka = DEMO_THIRD_ID

  const vacances = build('vac', now, [
    [th, 6, 20, 10, 'Pour les vacances, je propose de prendre Lina du 1er au 4 novembre. Qu’en penses-tu ?'],
    [me, 6, 20, 45, 'C’est d’accord pour moi. Voici le programme du centre de loisirs pour les jours suivants.', { name: 'Programme-centre-loisirs.pdf', mime: 'application/pdf', size: 248_000, path: 'demo/programme-centre-loisirs.pdf' }],
    [th, 1, 18, 20, '', { name: 'Note vocale', mime: 'audio/wav', size: 112_000, path: 'demo/voice-vacances' }, 14_000],
    [th, 1, 18, 21, 'Je t’ai laissé un message vocal pour l’heure d’arrivée samedi.'],
  ], 2)

  const karim = build('kar', now, [
    [ka, 2, 10, 0, 'Bonjour Julie, Léo aimerait inviter Noah samedi 8 novembre. Je peux venir le chercher à 14h ?'],
    [me, 2, 10, 30, 'Bonjour Karim, avec plaisir. Je confirme avec Thomas puisque c’est son week-end.'],
    [ka, 0, 8, 5, 'Voici l’invitation de Léo.', { name: 'Invitation-anniversaire.png', mime: 'image/png', size: 96_000, path: 'demo/invitation-anniversaire' }],
  ], 2)

  const sante = build('san', now, [
    [me, 20, 9, 15, 'Le rendez-vous chez l’orthodontiste est confirmé le 12 à 17h.'],
    [th, 20, 9, 40, 'Merci, je l’y emmène et je te fais un compte rendu.'],
    [me, 19, 12, 5, 'Voici l’ordonnance pour l’appareil.', { name: 'Ordonnance-orthodontiste.pdf', mime: 'application/pdf', size: 132_000, path: 'demo/ordonnance-orthodontiste.pdf' }],
    [th, 19, 13, 0, 'Bien reçu, merci.'],
  ], 99)

  const general = demoSeedMessages(now)
  const created = (list: SeedMessage[]) => list[0]?.createdAt ?? now.toISOString()

  return {
    conversations: [
      { id: DEMO_CONVERSATION_ID, title: null, participantIds: [me, th], createdAt: created(general), archivedAt: null },
      { id: 'conv_vacances', title: 'Vacances de Lina', participantIds: [me, th], createdAt: created(vacances), archivedAt: null },
      { id: 'conv_karim', title: 'Week-end du 8 novembre', participantIds: [me, ka], createdAt: created(karim), archivedAt: null },
      { id: 'conv_sante', title: 'Santé de Noah', participantIds: [me, th], createdAt: created(sante), archivedAt: at(now, 15, 10, 0) },
    ],
    messages: { [DEMO_CONVERSATION_ID]: general, conv_vacances: vacances, conv_karim: karim, conv_sante: sante },
    vault: [
      { messageId: 'msg_8', conversationId: DEMO_CONVERSATION_ID, categoryName: 'Courriers' },
      { messageId: 'vac_2', conversationId: 'conv_vacances', categoryName: 'Scolarité' },
      { messageId: 'vac_3', conversationId: 'conv_vacances', categoryName: 'Courriers' },
      { messageId: 'kar_3', conversationId: 'conv_karim', categoryName: 'Courriers' },
      { messageId: 'san_3', conversationId: 'conv_sante', categoryName: 'Santé' },
    ],
  }
}
