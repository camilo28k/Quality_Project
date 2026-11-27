// Correo de la empresa y facturas (SWR-MAIL-001/002) contra la API real y el buzón de Mailpit.
// Requiere la API con SMTP_HOST apuntando a Mailpit (SMTP 1025, API http://localhost:8025).
// Uso (desde backend/): node scripts/correo-facturas.mjs .env
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(process.argv[2], 'utf8');
const get = (k) => env.match(new RegExp('^' + k + '="?([^"\\r\\n]*)', 'm'))[1];
const B = 'http://localhost:4000';
const MP = 'http://localhost:8025/api/v1';
const call = async (method, path, token, body) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json().catch(() => null)];
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password }))[1]?.accessToken;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Espera a que llegue a Mailpit un correo para `to` cuyo asunto cumpla `match`. */
async function inbox(to, match) {
  for (let i = 0; i < 40; i++) {
    const res = await (await fetch(`${MP}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    const m = res.messages?.find((x) => match.test(x.Subject));
    if (m) return { ...m, ...(await (await fetch(`${MP}/message/${m.ID}`)).json()) };
    await sleep(250);
  }
  return null;
}
const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (obtenido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)})`);
};
const tmp = () => 'Tmp-' + randomUUID().slice(0, 12) + '9';
const tag = Date.now().toString(36);
const companyMail = `ventas.${tag}@tiendapp.test`;
const customer = `cliente.${tag}@correo.test`;

const sa = await login(get('SEED_SUPERADMIN_EMAIL'), get('SEED_SUPERADMIN_PASSWORD'));
const [, co] = await call('POST', '/platform/companies', sa, { tradeName: `Correo ${tag}` });
const ap = tmp(); const ae = `admin.mail.${tag}@tiendapp.test`;
await call('POST', `/platform/companies/${co.id}/admin`, sa, { name: 'Admin Mail', email: ae, temporaryPassword: ap });
const admin = await login(ae, ap);
await call('POST', '/auth/change-password', admin, { currentPassword: ap, newPassword: tmp() });
await call('POST', '/company/onboarding', admin, { tradeName: `Tienda Correo ${tag}`, taxId: '900123456-8', email: companyMail, invoicePrefix: 'M-', firstInvoiceNumber: 1 });
const sp = tmp(); const se = `vend.mail.${tag}@tiendapp.test`;
await call('POST', '/users', admin, { name: 'Vendedora Ana', email: se, temporaryPassword: sp });
const seller = await login(se, sp);
await call('POST', '/auth/change-password', seller, { currentPassword: sp, newPassword: tmp() });
const [, cat] = await call('POST', '/categories', admin, { name: 'General' });
const [, prod] = await call('POST', '/products', admin, { name: 'Arroz <b>premium</b>', categoryId: cat.id, unit: 'UNIT', cost: 1000, price: 2500, initialStock: 50, minStock: 0 });
const sell = (extra = {}) => call('POST', '/sales', seller, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: prod.id, quantity: 2 }], ...extra });

// --- SWR-MAIL-001: sin verificar no se envía a nombre de la empresa (y la venta no se revierte)
const [s0, pre] = await sell({ customerEmail: customer });
check('Venta con correo del cliente se confirma aunque el correo de la empresa no esté verificado', s0, 201);
await sleep(1500);
const preHist = (await call('GET', `/sales/${pre.sale.id}/emails`, admin))[1];
check('El intento queda FAILED por correo no verificado', preHist.map((h) => `${h.status}:${h.error}`), ['FAILED:El correo de la empresa no está verificado']);

// --- verificación con código
check('Vendedor no puede pedir el código → 403', (await call('POST', '/company/email/send-code', seller))[0], 403);
const [cs] = await call('POST', '/company/email/send-code', admin);
check('ADMIN pide el código → 200', cs, 200);
const codeMail = await inbox(companyMail, /Código para verificar/);
check('El código llega al correo de la empresa', !!codeMail, true);
const code = /(\d{6})/.exec(codeMail?.Text ?? '')?.[1];
check('Otro código antes de 1 minuto → 429', (await call('POST', '/company/email/send-code', admin))[0], 429);
const wrong = code === '000000' ? '111111' : '000000';
const [ws, wb] = await call('POST', '/company/email/verify', admin, { code: wrong });
check('Código incorrecto → 400 con intentos restantes', `${ws}/${/quedan 4/.test(JSON.stringify(wb))}`, '400/true');
const [vs, vb] = await call('POST', '/company/email/verify', admin, { code });
check('Código correcto → verificado', `${vs}/${vb?.verified}`, '200/true');
check('La empresa queda con el correo verificado', !!(await call('GET', '/company', admin))[1].emailVerifiedAt, true);

// --- SWR-MAIL-002: factura por correo
const [s1, sale1] = await sell({ customerEmail: customer });
const inv = await inbox(customer, new RegExp(`^Factura ${sale1.sale.invoiceNumber} `));
check('La factura llega al cliente', !!inv, true);
check('Remitente: nombre de la empresa con la dirección de la plataforma', `${inv?.From?.Name} <${inv?.From?.Address}>`, `Tienda Correo ${tag} <${get('MAIL_FROM_ADDRESS')}>`);
check('Reply-To: correo verificado de la empresa', inv?.ReplyTo?.map((r) => r.Address), [companyMail]);
check('Contenido: número, vendedor y total', /Vendedor: Vendedora Ana/.test(inv?.Text) && /5\.000/.test(inv?.Text) && inv?.Text.includes(sale1.sale.invoiceNumber), true);
check('El nombre del producto llega escapado en el HTML', inv?.HTML?.includes('Arroz &lt;b&gt;premium&lt;/b&gt;') && !inv?.HTML?.includes('<b>premium'), true);
check('Venta sin correo del cliente: no se envía nada', (await (async () => { const [, s] = await sell(); await sleep(800); return (await call('GET', `/sales/${s.sale.id}/emails`, admin))[1].length; })()), 0);

// --- reintento manual de la que falló al principio
const [rs, rb] = await call('POST', `/sales/${pre.sale.id}/send-invoice`, seller, {});
check('Reintento manual de la factura que falló → SENT', `${rs}/${rb?.status}`, '200/SENT');
check('Reintento a otro correo', (await call('POST', `/sales/${pre.sale.id}/send-invoice`, admin, { to: 'Contador@Correo.test' }))[1]?.to, 'contador@correo.test');
check('Correo inválido → 400', (await call('POST', `/sales/${pre.sale.id}/send-invoice`, admin, { to: 'no-es-correo' }))[0], 400);

// --- anulación y reemisión notifican al cliente
await call('POST', `/sales/${sale1.sale.id}/void`, admin, { reason: 'Cobro duplicado' });
const voidMail = await inbox(customer, new RegExp(`^Anulación de la factura ${sale1.sale.invoiceNumber} `));
check('Al anular, el cliente recibe el aviso con el motivo', !!voidMail && /ANULADA: Cobro duplicado/.test(voidMail.Text), true);
const [, sale2] = await sell({ customerEmail: customer });
const [, re] = await call('POST', `/sales/${sale2.sale.id}/reissue`, admin, { reason: 'Eran 1', idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: prod.id, quantity: 1 }], customerEmail: customer });
const reMail = await inbox(customer, new RegExp(`^Factura corregida ${re.sale.invoiceNumber} `));
check('Al reemitir, el cliente recibe la factura corregida que indica a cuál reemplaza', !!reMail && reMail.Text.includes(`Reemplaza a la ${sale2.sale.invoiceNumber}`), true);
const hist = (await call('GET', `/sales/${sale1.sale.id}/emails`, admin))[1].map((h) => `${h.kind}:${h.status}`).sort();
check('Historial de envíos de la venta', hist, ['INVOICE:SENT', 'VOID_NOTICE:SENT']);
check('Otra empresa no ve el historial → 404', (await call('GET', `/sales/${sale1.sale.id}/emails`, (await login(get('SEED_ADMIN_EMAIL'), get('SEED_ADMIN_PASSWORD')))))[0], 404);

const audit = new Set((await call('GET', '/audit?entity=Company', admin))[1].items.map((a) => a.action));
check('Auditoría registra COMPANY_EMAIL_VERIFIED', audit.has('COMPANY_EMAIL_VERIFIED'), true);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
