/** Plantillas de correo. Todo dato que viene de usuarios se escapa (no hay HTML inyectable). */

export function escapeHtml(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : typeof value === 'string'
          ? value
          : `${value as number | boolean | bigint}`;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
export const formatCOP = (n: number) => cop.format(n).replace(/\u00a0/g, ' ');
const qty = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(n);
const when = (d: Date | string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(d));

const UNIT: Record<string, string> = { UNIT: 'unidad', KG: 'kg', LB: 'lb' };
const PAY: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
};

export interface MailCompany {
  tradeName: string;
  taxId: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  invoiceFooter: string | null;
}

export interface MailSale {
  invoiceNumber: string;
  createdAt: Date | string;
  paymentMethod: string;
  total: number;
  sellerName: string;
  voidReason?: string | null;
  correctsInvoice?: string | null;
  items: {
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    subtotal: number;
  }[];
}

export type InvoiceMailKind = 'INVOICE' | 'VOID_NOTICE' | 'REISSUE';

const SUBJECT: Record<
  InvoiceMailKind,
  (s: MailSale, c: MailCompany) => string
> = {
  INVOICE: (s, c) => `Factura ${s.invoiceNumber} de ${c.tradeName}`,
  REISSUE: (s, c) => `Factura corregida ${s.invoiceNumber} de ${c.tradeName}`,
  VOID_NOTICE: (s, c) =>
    `Anulación de la factura ${s.invoiceNumber} de ${c.tradeName}`,
};

/** Factura, factura corregida o aviso de anulación, en HTML y texto plano. */
export function invoiceMail(
  kind: InvoiceMailKind,
  sale: MailSale,
  company: MailCompany,
) {
  const e = escapeHtml;
  const head =
    kind === 'VOID_NOTICE'
      ? `<p style="color:#b91c1c"><strong>La factura ${e(sale.invoiceNumber)} fue anulada.</strong>${sale.voidReason ? ` Motivo: ${e(sale.voidReason)}.` : ''}</p>`
      : kind === 'REISSUE' && sale.correctsInvoice
        ? `<p>Esta factura reemplaza a la ${e(sale.correctsInvoice)}, que fue anulada.</p>`
        : '<p>Gracias por su compra.</p>';
  const rows = sale.items
    .map(
      (i) =>
        `<tr><td>${e(i.name)}</td><td align="right">${e(qty(i.quantity))} ${e(UNIT[i.unit] ?? i.unit)}</td><td align="right">${e(formatCOP(i.unitPrice))}</td><td align="right">${e(formatCOP(i.subtotal))}</td></tr>`,
    )
    .join('');
  const contact = [company.address, company.city, company.phone]
    .filter(Boolean)
    .map(e)
    .join(' · ');
  const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1e293b">
<h2 style="margin:0">${e(company.tradeName)}</h2>
${company.taxId ? `<p style="margin:0">NIT ${e(company.taxId)}</p>` : ''}
${contact ? `<p style="margin:0;color:#64748b">${contact}</p>` : ''}
<h3>Factura ${e(sale.invoiceNumber)}</h3>
${head}
<p>Fecha: ${e(when(sale.createdAt))}<br>Vendedor: ${e(sale.sellerName)}<br>Medio de pago: ${e(PAY[sale.paymentMethod] ?? sale.paymentMethod)}</p>
<table cellpadding="6" style="border-collapse:collapse;width:100%">
<thead><tr><th align="left">Producto</th><th align="right">Cantidad</th><th align="right">Precio</th><th align="right">Subtotal</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="3" align="right"><strong>Total</strong></td><td align="right"><strong>${e(formatCOP(sale.total))}</strong></td></tr></tfoot>
</table>
${company.invoiceFooter ? `<p style="color:#64748b">${e(company.invoiceFooter)}</p>` : ''}
${company.email ? `<p style="color:#64748b">Para cualquier consulta responda este correo o escriba a ${e(company.email)}.</p>` : ''}
</body></html>`;
  const text = [
    company.tradeName,
    company.taxId ? `NIT ${company.taxId}` : '',
    `Factura ${sale.invoiceNumber}`,
    kind === 'VOID_NOTICE'
      ? `ANULADA${sale.voidReason ? `: ${sale.voidReason}` : ''}`
      : '',
    kind === 'REISSUE' && sale.correctsInvoice
      ? `Reemplaza a la ${sale.correctsInvoice}`
      : '',
    `Fecha: ${when(sale.createdAt)} · Vendedor: ${sale.sellerName}`,
    ...sale.items.map(
      (i) =>
        `- ${i.name}: ${qty(i.quantity)} ${UNIT[i.unit] ?? i.unit} × ${formatCOP(i.unitPrice)} = ${formatCOP(i.subtotal)}`,
    ),
    `Total: ${formatCOP(sale.total)}`,
    company.invoiceFooter ?? '',
  ]
    .filter(Boolean)
    .join('\n');
  return { subject: SUBJECT[kind](sale, company), html, text };
}

export function verificationMail(companyName: string, code: string) {
  return {
    subject: `Código para verificar el correo de ${companyName}`,
    html: `<p>Use este código en TiendApp para verificar el correo de <strong>${escapeHtml(companyName)}</strong>:</p><p style="font-size:24px;letter-spacing:4px"><strong>${escapeHtml(code)}</strong></p><p>Vence en 15 minutos. Si no lo pidió, ignore este mensaje.</p>`,
    text: `Código para verificar el correo de ${companyName}: ${code}\nVence en 15 minutos.`,
  };
}
