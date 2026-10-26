// Génère les modèles d'e-mails d'authentification Supabase (supabase/templates/*.html) avec la même
// mise en page que les e-mails de l'application (lib/email/layout.ts).
// Usage : npx --yes tsx scripts/gen-supabase-emails.ts
// Puis coller chaque fichier dans Supabase > Authentication > Emails > Templates (sujets : supabase/templates/README.md).
//
// Variables Go de Supabase : {{ .Token }} (code à 6 chiffres), {{ .TokenHash }}, {{ .SiteURL }}, {{ .Email }}, {{ .NewEmail }}.
// Les liens passent par /auth/confirm (vérification côté serveur, fonctionne d'un appareil à l'autre).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseLayout } from '../lib/email/layout'
import { emailTheme as t } from '../lib/email/theme'

const OUT = join(process.cwd(), 'supabase', 'templates')
const confirmUrl = (type: string, next: string) =>
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${encodeURIComponent(next)}`

// Espace insécable avant « : » « ? » « ! » (typographie française, pas de ponctuation orpheline).
const nb = (html: string) => html.replace(/ ([:?!])/g, '&nbsp;$1')
const p = (html: string) => `<p style="margin:0 0 16px 0;">${nb(html)}</p>`
const small = (html: string) => `<p style="margin:0;font-size:14px;line-height:20px;color:${t.colors.textMuted};">${nb(html)}</p>`
const code = `<div style="margin:8px 0 20px 0;padding:16px 0;background:#f2f7f2;border:1px solid ${t.colors.border};border-radius:10px;text-align:center;font-family:${t.font};font-size:32px;line-height:36px;letter-spacing:10px;font-weight:700;color:${t.colors.night};">{{ .Token }}</div>`
const notYou = small(`Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet e-mail : rien ne sera modifié sur votre compte.`)

type Tpl = { file: string; subject: string; title: string; preheader: string; body: string; cta?: { label: string; href: string }; footer?: string }

const TEMPLATES: Tpl[] = [
  {
    file: 'confirmation.html',
    subject: 'Votre code de confirmation Lien Parental',
    title: 'Bienvenue sur Lien Parental',
    preheader: 'Votre code de confirmation : {{ .Token }}',
    body:
      p(`Pour confirmer votre adresse e-mail, saisissez ce code dans l'application :`) +
      code +
      small(`Ce code est valable 15 minutes. Vous pouvez aussi confirmer votre adresse avec le bouton ci-dessous.`),
    cta: { label: 'Confirmer mon adresse', href: confirmUrl('signup', '/onboarding/profil') },
    footer: notYou,
  },
  {
    file: 'recovery.html',
    subject: 'Réinitialisez votre mot de passe Lien Parental',
    title: 'Choisissez un nouveau mot de passe',
    preheader: 'Lien valable 60 minutes pour réinitialiser votre mot de passe.',
    body:
      p(`Vous avez demandé à réinitialiser le mot de passe de votre compte Lien Parental ({{ .Email }}).`) +
      p(`Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien est valable 60 minutes et ne peut servir qu'une fois.`),
    cta: { label: 'Choisir un nouveau mot de passe', href: confirmUrl('recovery', '/nouveau-mot-de-passe') },
    footer: notYou,
  },
  {
    file: 'email_change.html',
    subject: 'Confirmez votre nouvelle adresse e-mail',
    title: 'Confirmez votre nouvelle adresse',
    preheader: 'Confirmez le changement d’adresse de votre compte Lien Parental.',
    body:
      p(`Vous avez demandé à remplacer l'adresse de votre compte Lien Parental ({{ .Email }}) par <strong>{{ .NewEmail }}</strong>.`) +
      p(`Confirmez ce changement avec le bouton ci-dessous.`),
    cta: { label: 'Confirmer la nouvelle adresse', href: confirmUrl('email_change', '/app/profil') },
    footer: notYou,
  },
  {
    file: 'magic_link.html',
    subject: 'Votre lien de connexion Lien Parental',
    title: 'Connexion à Lien Parental',
    preheader: 'Votre lien de connexion, valable quelques minutes.',
    body: p(`Cliquez sur le bouton ci-dessous pour vous connecter à votre compte ({{ .Email }}). Ce lien ne peut servir qu'une fois.`),
    cta: { label: 'Me connecter', href: confirmUrl('magiclink', '/app') },
    footer: notYou,
  },
  {
    file: 'invite.html',
    subject: 'Vous êtes invité(e) sur Lien Parental',
    title: 'Vous êtes invité(e) sur Lien Parental',
    preheader: 'Activez votre compte Lien Parental.',
    body:
      p(`Un compte Lien Parental a été préparé pour vous ({{ .Email }}). Lien Parental aide les parents séparés à organiser, échanger et conserver tout ce qui concerne leurs enfants.`) +
      p(`Activez votre compte avec le bouton ci-dessous.`),
    cta: { label: 'Activer mon compte', href: confirmUrl('invite', '/onboarding/profil') },
    footer: small(`Vous ne vous attendiez pas à cette invitation ? Ignorez simplement cet e-mail.`),
  },
  {
    file: 'reauthentication.html',
    subject: 'Votre code de sécurité Lien Parental',
    title: 'Confirmez qu’il s’agit bien de vous',
    preheader: 'Votre code de sécurité : {{ .Token }}',
    body: p(`Pour confirmer cette opération sensible, saisissez ce code dans l'application :`) + code + small(`Ce code est valable quelques minutes.`),
    footer: small(`Vous n'êtes pas à l'origine de cette demande ? Changez votre mot de passe sans attendre.`),
  },
]

mkdirSync(OUT, { recursive: true })
for (const tpl of TEMPLATES) {
  const html = baseLayout({ title: tpl.title, preheader: tpl.preheader, body: tpl.body, cta: tpl.cta, footer: tpl.footer })
  writeFileSync(join(OUT, tpl.file), html)
}
const readme = `# Modèles d'e-mails d'authentification (Supabase)

Générés par \`npx --yes tsx scripts/gen-supabase-emails.ts\` à partir de \`lib/email/layout.ts\` : ne pas les modifier à la main.

À coller dans **Supabase > Authentication > Emails > Templates** (onglet « Source ») avec ces sujets :

| Modèle Supabase | Fichier | Sujet |
|---|---|---|
${TEMPLATES.map(x => `| ${({ 'confirmation.html': 'Confirm signup', 'recovery.html': 'Reset password', 'email_change.html': 'Change email address', 'magic_link.html': 'Magic link', 'invite.html': 'Invite user', 'reauthentication.html': 'Reauthentication' } as Record<string, string>)[x.file]} | \`${x.file}\` | ${x.subject} |`).join('\n')}

Prérequis : Auth > URL Configuration contient \`https://lienparental.fr/auth/confirm\` dans les Redirect URLs, et « Email OTP Expiration » vaut 900 s (15 min).
`
writeFileSync(join(OUT, 'README.md'), readme)
console.log('ok', TEMPLATES.length, 'modèles dans', OUT)
