/**
 * Rendering helpers for @react-pdf/renderer.
 */
import type React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';

export async function renderPdfToBuffer(
  doc: React.ReactElement<DocumentProps>
): Promise<Buffer> {
  // react-pdf's renderToBuffer returns a Node Buffer in server environments.
  return renderToBuffer(doc);
}

/**
 * Sanitize a filename to be safe for an HTTP Content-Disposition header.
 * - Strip CR/LF (header injection), double quotes and backslashes.
 * - Collapse any non-ASCII to '_' (the RFC 5987 version keeps unicode).
 * - Cap length at 150.
 */
function sanitizeAsciiFilename(name: string): string {
  const stripped = name
    .replace(/[\r\n]/g, '')       // CRLF injection
    .replace(/["\\]/g, '_')       // break out of quoted-string
    .replace(/[^\x20-\x7E]/g, '_'); // non-ASCII → _
  const trimmed = stripped.slice(0, 150) || 'document.pdf';
  return trimmed;
}

/**
 * Build a Next.js Response carrying a PDF buffer with a sensible
 * Content-Disposition. Pass a filename ending in `.pdf`.
 */
export function pdfResponse(buffer: Buffer, filename: string): Response {
  const withExt = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const asciiName = sanitizeAsciiFilename(withExt);
  // RFC 5987 : filename*=UTF-8''<pct-encoded> (encodeURIComponent gère %).
  const encodedUtf8 = encodeURIComponent(withExt);

  // Convert to a Uint8Array so it fits BodyInit types in all runtimes.
  const body = new Uint8Array(buffer);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(body.byteLength),
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedUtf8}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
