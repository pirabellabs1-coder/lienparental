// lib/email/templates/format.ts — Formatage partagé des templates de facturation.

/** ISO 8601 → "12 août 2026" (America/Cayenne). Renvoie la valeur brute si invalide. */
export function formatDateFr(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'America/Cayenne' }).format(d)
  } catch {
    return iso
  }
}

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** 1199 (centimes) → "11,99 €". Devise autre que l'euro : affichée en code ISO. */
export function formatCents(cents: number, currency = 'EUR'): string {
  if (currency.toUpperCase() === 'EUR') return eur.format(cents / 100)
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
}
