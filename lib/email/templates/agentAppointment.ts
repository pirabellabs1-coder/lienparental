// lib/email/templates/agentAppointment.ts — Rendez-vous avec un représentant (agent d'accueil, 0640) :
// confirmation, rappel, annulation pour la personne ; avis interne pour l'équipe (nouveau rendez-vous,
// demande de rappel). Trilingue FR / EN / PT, heure de Cayenne affichée avec son libellé.

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import type { AgentLocale } from '@/lib/agent/core'

type Kind = 'verify' | 'confirmed' | 'reminder' | 'cancelled' | 'changed'

const T: Record<AgentLocale, Record<Kind, { subject: string; title: string; intro: string }> & { manage: string; confirm: string; tz: string; ref: string; topic: string; note: string; verifyNote: string; hello: string }> = {
  fr: {
    verify: { subject: 'Confirmez votre rendez-vous Lien Parental', title: 'Confirmez votre rendez-vous', intro: 'Une demande de rendez-vous avec Lien Parental a été faite avec cette adresse. Pour la confirmer, cliquez sur le bouton ci-dessous dans les 30 minutes.' },
    confirmed: { subject: 'Votre rendez-vous Lien Parental est confirmé', title: 'Rendez-vous confirmé', intro: 'Votre rendez-vous avec un représentant de Lien Parental est confirmé.' },
    reminder: { subject: 'Rappel : votre rendez-vous Lien Parental', title: 'Rappel de rendez-vous', intro: 'Petit rappel : votre rendez-vous avec Lien Parental approche.' },
    cancelled: { subject: 'Votre rendez-vous Lien Parental est annulé', title: 'Rendez-vous annulé', intro: 'Votre rendez-vous a bien été annulé.' },
    changed: { subject: 'Votre rendez-vous Lien Parental a été déplacé', title: 'Rendez-vous déplacé', intro: 'Votre rendez-vous a bien été déplacé.' },
    manage: 'Modifier ou annuler', confirm: 'Confirmer le rendez-vous', tz: 'heure de Cayenne', ref: 'Référence', topic: 'Motif', hello: 'Bonjour',
    note: 'Modification ou annulation possible jusqu’à 2 heures avant le rendez-vous.',
    verifyNote: 'Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : le créneau sera libéré automatiquement.',
  },
  en: {
    verify: { subject: 'Confirm your Lien Parental appointment', title: 'Confirm your appointment', intro: 'An appointment request with Lien Parental was made with this address. To confirm it, click the button below within 30 minutes.' },
    confirmed: { subject: 'Your Lien Parental appointment is confirmed', title: 'Appointment confirmed', intro: 'Your appointment with a Lien Parental representative is confirmed.' },
    reminder: { subject: 'Reminder: your Lien Parental appointment', title: 'Appointment reminder', intro: 'A quick reminder: your appointment with Lien Parental is coming up.' },
    cancelled: { subject: 'Your Lien Parental appointment is cancelled', title: 'Appointment cancelled', intro: 'Your appointment has been cancelled.' },
    changed: { subject: 'Your Lien Parental appointment has been moved', title: 'Appointment moved', intro: 'Your appointment has been moved.' },
    manage: 'Change or cancel', confirm: 'Confirm the appointment', tz: 'Cayenne time', ref: 'Reference', topic: 'Topic', hello: 'Hello',
    note: 'You can change or cancel up to 2 hours before the appointment.',
    verifyNote: 'Didn’t request this? Just ignore this message: the slot will be released automatically.',
  },
  pt: {
    verify: { subject: 'Confirme sua reunião com a Lien Parental', title: 'Confirme sua reunião', intro: 'Um pedido de reunião com a Lien Parental foi feito com este endereço. Para confirmar, clique no botão abaixo em até 30 minutos.' },
    confirmed: { subject: 'Sua reunião com a Lien Parental está confirmada', title: 'Reunião confirmada', intro: 'Sua reunião com um representante da Lien Parental está confirmada.' },
    reminder: { subject: 'Lembrete: sua reunião com a Lien Parental', title: 'Lembrete de reunião', intro: 'Um lembrete: sua reunião com a Lien Parental está chegando.' },
    cancelled: { subject: 'Sua reunião com a Lien Parental foi cancelada', title: 'Reunião cancelada', intro: 'Sua reunião foi cancelada.' },
    changed: { subject: 'Sua reunião com a Lien Parental foi remarcada', title: 'Reunião remarcada', intro: 'Sua reunião foi remarcada.' },
    manage: 'Alterar ou cancelar', confirm: 'Confirmar a reunião', tz: 'hora de Caiena', ref: 'Referência', topic: 'Motivo', hello: 'Olá',
    note: 'É possível alterar ou cancelar até 2 horas antes da reunião.',
    verifyNote: 'Não fez este pedido? Ignore esta mensagem: o horário será liberado automaticamente.',
  },
}

export function agentAppointmentEmail(p: {
  kind: Kind
  locale: AgentLocale
  /** Absent pour « verify » : aucun texte saisi par le visiteur avant la confirmation de l'adresse. */
  name?: string
  date: string
  time: string
  topic: string
  ref: string
  manageUrl?: string
}): { subject: string; html: string } {
  const t = T[p.locale]
  const k = t[p.kind]
  const body = `
    <p style="margin:0 0 16px 0;">${escapeHtml(p.name ?? t.hello)},</p>
    <p style="margin:0 0 16px 0;">${escapeHtml(k.intro)}</p>
    <p style="margin:0 0 8px 0;font-size:18px;"><strong>${escapeHtml(p.date)} · ${escapeHtml(p.time)}</strong> (${escapeHtml(t.tz)})</p>
    <p style="margin:0 0 4px 0;">${escapeHtml(t.topic)} : ${escapeHtml(p.topic)}</p>
    <p style="margin:0 0 16px 0;">${escapeHtml(t.ref)} : ${escapeHtml(p.ref)}</p>
    ${p.kind === 'verify' ? `<p style="margin:0;font-size:13px;">${escapeHtml(t.verifyNote)}</p>` : p.kind !== 'cancelled' ? `<p style="margin:0;font-size:13px;">${escapeHtml(t.note)}</p>` : ''}
  `
  return {
    subject: k.subject,
    html: baseLayout({
      title: k.title,
      preheader: `${p.date} · ${p.time}`,
      body,
      cta: p.kind !== 'cancelled' && p.manageUrl ? { label: p.kind === 'verify' ? t.confirm : t.manage, href: p.manageUrl } : undefined,
      locale: p.locale,
    }),
  }
}

/** Avis interne à l'équipe (français) : aucun lien de gestion, coordonnées en texte échappé. */
export function agentTeamEmail(p: { title: string; lines: [string, string][] }): { subject: string; html: string } {
  const rows = p.lines.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5b6478;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;">${escapeHtml(v).replace(/\r?\n/g, '<br>')}</td></tr>`).join('')
  return {
    subject: p.title,
    html: baseLayout({ title: p.title, body: `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>` }),
  }
}
