/**
 * Small French-locale date / number helpers used inside PDF templates.
 * No external deps — Intl is enough.
 */

const FR = 'fr-FR';

export function formatDateFR(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(FR, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateShortFR(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(FR, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatMonthFR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const label = d.toLocaleDateString(FR, {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
