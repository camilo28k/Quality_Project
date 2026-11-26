// Factura, anulación y reemisión (SWR-INV-001/002, SWR-SALE-V01/V02/V03) contra la API real.
// Uso (desde backend/, con la API arriba): node scripts/anulacion-factura.mjs .env
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(process.argv[2], 'utf8');
const get = (k) => env.match(new RegExp('^' + k + '="?([^"\\r\\n]*)', 'm'))[1];
const B = 'http://localhost:4000';
const call = async (method, path, token, body) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json().catch(() => null)];
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password }))[1]?.accessToken;
const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (obtenido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)})`);
};
const tmp = () => 'Tmp-' + randomUUID().slice(0, 12) + '9';
const tag = Date.now().toString(36);

// Preparación: empresa con prefijo F- desde el 500, ADMIN y vendedor operativos.
const sa = await login(get('SEED_SUPERADMIN_EMAIL'), get('SEED_SUPERADMIN_PASSWORD'));
const [, co] = await call('POST', '/platform/companies', sa, { tradeName: `Factura ${tag}` });
const ap = tmp(); const ae = `admin.fac.${tag}@tiendapp.test`;
await call('POST', `/platform/companies/${co.id}/admin`, sa, { name: 'Admin Fac', email: ae, temporaryPassword: ap });
const admin = await login(ae, ap);
await call('POST', '/auth/change-password', admin, { currentPassword: ap, newPassword: tmp() });
await call('POST', '/company/onboarding', admin, { tradeName: `Factura ${tag}`, taxId: '900123456-8', email: `f.${tag}@tiendapp.test`, invoicePrefix: 'F-', firstInvoiceNumber: 500 });
const sp = tmp(); const se = `vend.fac.${tag}@tiendapp.test`;
const [, sellerUser] = await call('POST', '/users', admin, { name: 'Vendedor Fac', email: se, temporaryPassword: sp });
const seller = await login(se, sp);
await call('POST', '/auth/change-password', seller, { currentPassword: sp, newPassword: tmp() });
const [, cat] = await call('POST', '/categories', admin, { name: 'General' });
const mk = async (name, stock) => (await call('POST', '/products', admin, { name, categoryId: cat.id, unit: 'UNIT', cost: 500, price: 1000, initialStock: stock, minStock: 0 }))[1];
const arroz = await mk('Arroz', 100);
const ultima = await mk('Última unidad', 1);
const sell = (token, items, extra = {}) =>
  call('POST', '/sales', token, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items, ...extra });

// --- SWR-INV-001: consecutivo sin huecos ni duplicados, incluso en paralelo
const [s1, first] = await sell(seller, [{ productId: arroz.id, quantity: 1 }], { customerEmail: 'Cliente@Correo.test' });
check('Primera factura es F-500', `${s1}/${first.sale.invoiceNumber}`, '201/F-500');
check('Correo del cliente normalizado', first.sale.customerEmail, 'cliente@correo.test');
const key = randomUUID();
await call('POST', '/sales', seller, { idempotencyKey: key, paymentMethod: 'CASH', items: [{ productId: arroz.id, quantity: 1 }] });
const [rp, replay] = await call('POST', '/sales', seller, { idempotencyKey: key, paymentMethod: 'CASH', items: [{ productId: arroz.id, quantity: 1 }] });
check('Repetición devuelve la misma factura F-501 (no consume número)', `${rp}/${replay.replayed}/${replay.sale.invoiceNumber}`, '201/true/F-501');
const race = await Promise.all(Array.from({ length: 5 }, () => sell(seller, [{ productId: ultima.id, quantity: 1 }])));
check('Carrera por la última unidad: 1 venta y 4 rechazos', race.map(([s]) => s).sort().join(','), '201,409,409,409,409');
const par = await Promise.all(Array.from({ length: 10 }, () => sell(seller, [{ productId: arroz.id, quantity: 1 }])));
check('10 ventas en paralelo confirmadas', par.every(([s]) => s === 201), true);
const nums = (await call('GET', '/sales', admin))[1].map((s) => Number(s.invoiceNumber.slice(2))).sort((a, b) => a - b);
check('13 facturas F-500..F-512, contiguas y sin repetir', `${nums.length}/${nums[0]}/${nums.at(-1)}/${new Set(nums).size}`, '13/500/512/13');

// --- SWR-INV-002: factura con datos de empresa y vendedor
const [, inv] = await call('GET', `/sales/${first.sale.id}/invoice`, seller);
check('Factura con empresa, NIT y vendedor', `${inv.company.tradeName}/${inv.company.taxId}/${inv.sale.user.name}`, `Factura ${tag}/900123456-8/Vendedor Fac`);

// --- SWR-SALE-V03 y V01: corrección pedida por el vendedor, anulación por el ADMIN
const [, big] = await sell(seller, [{ productId: arroz.id, quantity: 5 }]);
check('Vendedor no puede anular → 403', (await call('POST', `/sales/${big.sale.id}/void`, seller, { reason: 'x' }))[0], 403);
check('Vendedor pide corrección → 201', (await call('POST', `/sales/${big.sale.id}/correction-requests`, seller, { reason: 'Eran 3, no 5' }))[0], 201);
check('Segunda solicitud pendiente → 409', (await call('POST', `/sales/${big.sale.id}/correction-requests`, seller, { reason: 'x' }))[0], 409);
check('ADMIN ve la solicitud pendiente', (await call('GET', '/correction-requests', admin))[1].map((r) => r.reason), ['Eran 3, no 5']);
const stockBefore = (await call('GET', '/products', admin))[1].find((p) => p.id === arroz.id).stock;
check('Anular sin motivo → 400', (await call('POST', `/sales/${big.sale.id}/void`, admin, {}))[0], 400);

// --- SWR-SALE-V02: reemitir (anula la original y crea la corregida)
const [rs, re] = await call('POST', `/sales/${big.sale.id}/reissue`, admin, {
  reason: 'Eran 3, no 5', idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: arroz.id, quantity: 3 }],
});
check('Reemisión → 201 con factura nueva F-514 a nombre del vendedor', `${rs}/${re?.sale?.invoiceNumber}/${re?.sale?.userId === sellerUser.id}`, '201/F-514/true');
const stockAfter = (await call('GET', '/products', admin))[1].find((p) => p.id === arroz.id).stock;
check('Stock: devuelve 5 y descuenta 3 (neto +2)', stockAfter - stockBefore, 2);
const [, orig] = await call('GET', `/sales/${big.sale.id}`, admin);
check('La original queda ANULADA, con motivo y enlazada a la nueva', `${orig.status}/${orig.voidReason}/${orig.reissuedAs?.invoiceNumber}`, 'VOIDED/Eran 3, no 5/F-514');
check('La solicitud de corrección quedó resuelta', (await call('GET', '/correction-requests', admin))[1].length, 0);
check('Reemitir de nuevo la anulada → 409', (await call('POST', `/sales/${big.sale.id}/reissue`, admin, { reason: 'x', idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: arroz.id, quantity: 1 }] }))[0], 409);

// Reemisión que no alcanza stock: no anula la original
const [, small] = await sell(seller, [{ productId: arroz.id, quantity: 1 }]);
const [bad] = await call('POST', `/sales/${small.sale.id}/reissue`, admin, { reason: 'x', idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: arroz.id, quantity: 9999 }] });
check('Reemisión sin stock → 409', bad, 409);
check('…y la original sigue CONFIRMADA (todo o nada)', (await call('GET', `/sales/${small.sale.id}`, admin))[1].status, 'CONFIRMED');

// --- Anulación simple y doble
const [vs, voided] = await call('POST', `/sales/${small.sale.id}/void`, admin, { reason: 'Cliente devolvió' });
check('Anular → 200 ANULADA', `${vs}/${voided.status}`, '200/VOIDED');
check('Anular dos veces → 409', (await call('POST', `/sales/${small.sale.id}/void`, admin, { reason: 'x' }))[0], 409);
const movs = (await call('GET', `/products/${arroz.id}/movements`, admin))[1].filter((m) => m.type === 'VOID_RETURN').length;
check('Movimientos VOID_RETURN registrados (reemisión + anulación)', movs, 2);
const before = (await call('GET', '/sales', admin))[1].length;
check('Las ventas nunca se borran: siguen en el historial', before, 16);

// --- Auditoría
const audit = new Set((await call('GET', '/audit?entity=Sale', admin))[1].items.map((a) => a.action));
for (const a of ['SALE_CORRECTION_REQUESTED', 'SALE_VOIDED', 'SALE_REISSUED']) check(`Auditoría registra ${a}`, audit.has(a), true);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
