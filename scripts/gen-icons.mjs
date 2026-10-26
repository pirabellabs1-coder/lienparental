#!/usr/bin/env node
/**
 * gen-icons.mjs — Generate PNG icon variants from the SVG master.
 *
 * Prerequisites:
 *   npm install sharp
 *   (optional) npm install png-to-ico   # for favicon.ico generation
 *
 * Usage:
 *   node scripts/gen-icons.mjs
 *
 * Reads  : public/icons/icon.svg  (and maskable-512.svg for the maskable PNG)
 * Writes : public/icons/icon-192.png
 *          public/icons/icon-512.png
 *          public/icons/maskable-512.png
 *          public/icons/apple-touch-icon.png (180×180)
 *          public/favicon.ico (if png-to-ico is available)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ICONS = path.join(ROOT, 'public', 'icons');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('[gen-icons] "sharp" not installed. Run: npm install sharp');
  process.exit(1);
}

/** Render an SVG file to a PNG at the given size. */
async function render(svgPath, outPath, size) {
  const svg = await readFile(svgPath);
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`[gen-icons] wrote ${path.relative(ROOT, outPath)} (${size}×${size})`);
}

const master = path.join(ICONS, 'icon.svg');
const maskable = path.join(ICONS, 'maskable-512.svg');

await render(master, path.join(ICONS, 'icon-192.png'), 192);
await render(master, path.join(ICONS, 'icon-512.png'), 512);
await render(maskable, path.join(ICONS, 'maskable-512.png'), 512);
await render(master, path.join(ICONS, 'apple-touch-icon.png'), 180);

// Optional: write favicon.ico from a 32×32 PNG
try {
  const pngToIco = (await import('png-to-ico')).default;
  const png32 = await sharp(await readFile(path.join(ICONS, 'favicon.svg')), { density: 384 })
    .resize(32, 32)
    .png()
    .toBuffer();
  const buf = await pngToIco([png32]);
  await writeFile(path.join(ROOT, 'public', 'favicon.ico'), buf);
  console.log('[gen-icons] wrote public/favicon.ico');
} catch {
  console.log('[gen-icons] skipped favicon.ico (install png-to-ico to enable)');
}

console.log('[gen-icons] done.');
