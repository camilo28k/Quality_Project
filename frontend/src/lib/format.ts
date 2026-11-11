const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

/** Pesos colombianos sin decimales (D-04). */
export function formatCOP(value: number): string {
  return cop.format(value).replace(/ /g, ' ');
}

export function formatQty(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(value);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota'
  }).format(new Date(iso));
}
