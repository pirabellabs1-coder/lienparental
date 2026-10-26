// lib/email/layout.ts — Wrapper HTML "bulletproof" pour les emails.
// Styles 100 % inline, tables pour la mise en page, VML pour les boutons Outlook.

import { emailTheme as t } from './theme'

export type BaseLayoutOptions = {
  /** Texte masqué affiché en aperçu dans les clients mail (Gmail, Apple Mail…). */
  preheader?: string
  /** Titre affiché en haut du contenu (H1). */
  title: string
  /** Corps HTML déjà rendu (paragraphes, listes…). */
  body: string
  /** Bouton d'action optionnel. */
  cta?: { label: string; href: string }
  /** Texte additionnel en pied de page (sous le CTA, avant le footer légal). */
  footer?: string
}

/**
 * Échappe uniquement les caractères critiques pour éviter la casse accidentelle
 * d'attributs. Les templates passent déjà du HTML contrôlé dans `body`.
 */
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function baseLayout(opts: BaseLayoutOptions): string {
  const preheader = opts.preheader ?? ''
  const title = opts.title
  const body = opts.body
  const extraFooter = opts.footer ?? ''

  const ctaHtml = opts.cta
    ? renderCta(opts.cta.label, opts.cta.href)
    : ''

  return `<!doctype html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeAttr(title)}</title>
<!--[if mso]>
<style type="text/css">
  body, table, td, a { font-family: Arial, sans-serif !important; }
</style>
<![endif]-->
<style>
  /* Styles minimaux : tout le reste est inline */
  a { color: ${t.colors.link}; }
  @media (max-width: 600px) {
    .lp-card { padding: 24px !important; }
    .lp-title { font-size: 22px !important; line-height: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${t.colors.pageBg};">
  <!-- Preheader (masqué) -->
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;mso-hide:all;">
    ${preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.colors.pageBg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="${t.maxWidth}" cellpadding="0" cellspacing="0" border="0" style="max-width:${t.maxWidth}px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:${t.font};color:${t.colors.night};font-size:16px;font-weight:600;">
                    <img src="${t.logoUrl}" width="${t.logoWidth}" height="${t.logoHeight}" alt="Lien Parental" style="display:block;border:0;outline:none;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td class="lp-card" style="background:${t.colors.cardBg};border:1px solid ${t.colors.border};border-radius:12px;padding:32px;font-family:${t.font};color:${t.colors.text};">
              <h1 class="lp-title" style="margin:0 0 16px 0;font-family:${t.font};font-size:24px;line-height:30px;color:${t.colors.night};font-weight:700;">${title}</h1>
              <div style="font-family:${t.font};font-size:16px;line-height:24px;color:${t.colors.text};">
                ${body}
              </div>
              ${ctaHtml ? `<div style="margin-top:28px;">${ctaHtml}</div>` : ''}
              ${extraFooter ? `<div style="margin-top:24px;font-family:${t.font};font-size:14px;line-height:20px;color:${t.colors.textMuted};">${extraFooter}</div>` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 8px;font-family:${t.font};font-size:12px;line-height:18px;color:${t.colors.footerText};text-align:center;">
              <p style="margin:0 0 8px 0;">
                Vous recevez cet e-mail car vous avez un compte sur ${t.brandName}.
              </p>
              <p style="margin:0 0 8px 0;">
                <a href="${t.unsubscribeUrlPlaceholder}" style="color:${t.colors.footerText};text-decoration:underline;">Gérer mes notifications</a>
                &nbsp;·&nbsp;
                <a href="${t.legalUrl}" style="color:${t.colors.footerText};text-decoration:underline;">Mentions légales</a>
              </p>
              <p style="margin:0;">
                ${t.addressPlaceholder}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Bouton CTA bulletproof : table HTML partout, VML (<v:roundrect>) pour Outlook
 * Windows qui ignore padding/border-radius sur les ancres stylées.
 */
function renderCta(label: string, href: string): string {
  const safeHref = escapeAttr(href)
  const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${t.colors.leaf}" style="border-radius:8px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="18%" stroke="f" fillcolor="${t.colors.leaf}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:600;">${safeLabel}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${safeHref}" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;padding:12px 24px;font-family:${t.font};font-size:16px;font-weight:600;color:#ffffff;background:${t.colors.leaf};border-radius:8px;text-decoration:none;mso-hide:all;">
        ${safeLabel}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`
}
