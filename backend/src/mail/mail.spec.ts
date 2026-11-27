import { MailNotConfiguredError, MailService } from './mail.service';
import { escapeHtml, invoiceMail, verificationMail } from './templates';

const company = {
  tradeName: 'Doña <Rosa> & Cía',
  taxId: '900123456-8',
  address: 'Calle 1',
  city: 'Neiva',
  phone: '3001234567',
  email: 'ventas@donarosa.test',
  invoiceFooter: 'Gracias',
};
const sale = {
  invoiceNumber: 'DR-100',
  createdAt: '2026-11-27T15:00:00Z',
  paymentMethod: 'CASH',
  total: 7500,
  sellerName: 'Carlos',
  items: [
    {
      name: '<script>alert(1)</script>',
      quantity: 3,
      unit: 'UNIT',
      unitPrice: 2500,
      subtotal: 7500,
    },
  ],
};

describe('Plantillas de correo (SWR-MAIL-002)', () => {
  it('escapa todo dato de usuario: no hay HTML inyectable', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;',
    );
    const { html } = invoiceMail('INVOICE', sale, company);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Doña &lt;Rosa&gt; &amp; Cía');
  });

  it('la factura trae empresa, NIT, número, vendedor, líneas y total; asunto con número y empresa', () => {
    const { subject, text, html } = invoiceMail('INVOICE', sale, company);
    expect(subject).toBe('Factura DR-100 de Doña <Rosa> & Cía');
    expect(text).toContain('NIT 900123456-8');
    expect(text).toContain('Vendedor: Carlos');
    expect(text).toMatch(/Total: \$\s?7\.500/);
    expect(html).toContain('ventas@donarosa.test');
  });

  it('el aviso de anulación muestra el motivo y la reemisión indica a cuál reemplaza', () => {
    const v = invoiceMail(
      'VOID_NOTICE',
      { ...sale, voidReason: 'Cobro duplicado' },
      company,
    );
    expect(v.subject).toMatch(/^Anulación de la factura DR-100/);
    expect(v.text).toContain('ANULADA: Cobro duplicado');
    const r = invoiceMail(
      'REISSUE',
      { ...sale, invoiceNumber: 'DR-102', correctsInvoice: 'DR-100' },
      company,
    );
    expect(r.subject).toMatch(/^Factura corregida DR-102/);
    expect(r.text).toContain('Reemplaza a la DR-100');
  });

  it('el correo de verificación lleva el código y la vigencia', () => {
    const m = verificationMail('Doña Rosa', '012345');
    expect(m.text).toContain('012345');
    expect(m.text).toContain('15 minutos');
  });
});

describe('MailService', () => {
  it('sin SMTP_HOST no está configurado y no intenta enviar', async () => {
    const svc = new MailService({});
    expect(svc.configured).toBe(false);
    await expect(
      svc.send({
        fromName: 'x',
        to: 'a@b.test',
        subject: 's',
        html: 'h',
        text: 't',
      }),
    ).rejects.toBeInstanceOf(MailNotConfiguredError);
  });
});
