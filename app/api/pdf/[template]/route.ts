/**
 * POST /api/pdf/[template]
 * Body: { data: <template-specific payload> }
 * Templates: 'dossier-jaf' | 'lettre-ecole' | 'chronologie' |
 *            'attestation-hebergement' | 'temoignage'
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import { z } from 'zod';

import { pdfResponse, renderPdfToBuffer } from '@/lib/pdf/render';
import { templateMap, type TemplateKey } from '@/lib/pdf/schemas';
import { requireAuthedUser } from '@/lib/auth/guard';

import { DossierJAF } from '@/lib/pdf/templates/DossierJAF';
import { LettreEcole } from '@/lib/pdf/templates/LettreEcole';
import { Chronologie } from '@/lib/pdf/templates/Chronologie';
import { AttestationHebergement } from '@/lib/pdf/templates/AttestationHebergement';
import { TemoignageCerfa } from '@/lib/pdf/templates/TemoignageCerfa';

// Node runtime: react-pdf relies on Node streams/fonts.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: TemplateKey[] = [
  'dossier-jaf',
  'lettre-ecole',
  'chronologie',
  'attestation-hebergement',
  'temoignage',
];

function isTemplateKey(x: string): x is TemplateKey {
  return (ALLOWED as string[]).includes(x);
}

function filenameFor(template: TemplateKey, data: unknown): string {
  const d = data as Record<string, unknown>;
  const ref =
    typeof d?.reference === 'string' ? d.reference : 'document';
  return `lien-parental-${template}-${ref}.pdf`;
}

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ template: string }> }
) {
  // --- auth (session revalidée + aal2 si 2FA) -----------------------
  // Démo (sans Supabase) : 503, le navigateur génère alors le PDF lui-même
  // (repli de app/app/dossier/page.tsx), comme auparavant.
  const t = await getTranslations('server.pdf');
  const tc = await getTranslations('server.common');
  const auth = await requireAuthedUser();
  if (!auth.ok) {
    const status = auth.reason === 'disabled' ? 503 : auth.reason === 'mfa_required' ? 403 : 401;
    return NextResponse.json(
      { error: tc(`denied.${auth.reason}`), code: auth.reason },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // --- payload size cap (par Content-Length) -----------------------
  const cl = req.headers.get('content-length');
  if (cl && Number(cl) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: t('payloadTooLarge') },
      { status: 413 }
    );
  }

  const { template } = await ctx.params;

  if (!isTemplateKey(template)) {
    return NextResponse.json(
      { error: t('unknownTemplate'), template, allowed: ALLOWED },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: t('invalidJson') },
      { status: 400 }
    );
  }

  const payload = (body as { data?: unknown })?.data;
  if (payload === undefined) {
    return NextResponse.json(
      { error: t('missingData') },
      { status: 400 }
    );
  }

  const schema = templateMap[template] as z.ZodTypeAny;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t('invalidPayload'),
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  // Render by template
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: React.ReactElement<any>;
  switch (template) {
    case 'dossier-jaf':
      doc = React.createElement(DossierJAF, parsed.data);
      break;
    case 'lettre-ecole':
      doc = React.createElement(LettreEcole, parsed.data);
      break;
    case 'chronologie':
      doc = React.createElement(Chronologie, parsed.data);
      break;
    case 'attestation-hebergement':
      doc = React.createElement(AttestationHebergement, parsed.data);
      break;
    case 'temoignage':
      doc = React.createElement(TemoignageCerfa, parsed.data);
      break;
  }

  try {
    const buffer = await renderPdfToBuffer(doc as React.ReactElement<import('@react-pdf/renderer').DocumentProps>);
    return pdfResponse(buffer, filenameFor(template, parsed.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de rendu';
    return NextResponse.json(
      { error: t('renderFailed'), detail: message },
      { status: 500 }
    );
  }
}
