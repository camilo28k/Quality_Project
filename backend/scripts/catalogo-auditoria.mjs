// Catálogo, stock y auditoría (SWR-ROLE-003, SWR-CAT-D01, SWR-STK-001, SWR-AUD-001) contra la API real.
// Crea una empresa nueva con su ADMIN y un vendedor, y recorre los permisos y la trazabilidad.
// Uso (desde backend/, con la API arriba): node scripts/catalogo-auditoria.mjs .env
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

// --- preparación: empresa, ADMIN y vendedor listos para operar
const sa = await login(get('SEED_SUPERADMIN_EMAIL'), get('SEED_SUPERADMIN_PASSWORD'));
const [, co] = await call('POST', '/platform/companies', sa, { tradeName: `Catálogo ${tag}` });
const ap = tmp(); const ae = `admin.cat.${tag}@tiendapp.test`;
await call('POST', `/platform/companies/${co.id}/admin`, sa, { name: 'Admin Cat', email: ae, temporaryPassword: ap });
let admin = await login(ae, ap);
await call('POST', '/auth/change-password', admin, { currentPassword: ap, newPassword: tmp() });
await call('POST', '/company/onboarding', admin, { tradeName: `Catálogo ${tag}`, taxId: '900123456-8', email: `v.${tag}@tiendapp.test`, invoicePrefix: 'CAT-', firstInvoiceNumber: 1 });
const sp = tmp(); const se = `vend.cat.${tag}@tiendapp.test`;
await call('POST', '/users', admin, { name: 'Vendedor Cat', email: se, temporaryPassword: sp });
const seller = await login(se, sp);
await call('POST', '/auth/change-password', seller, { currentPassword: sp, newPassword: tmp() });

// --- categorías: solo ADMIN
const [, cat] = await call('POST', '/categories', admin, { name: 'Abarrotes' });
check('Vendedor no crea categorías → 403', (await call('POST', '/categories', seller, { name: 'X' }))[0], 403);
check('ADMIN renombra la categoría', (await call('PATCH', `/categories/${cat.id}`, admin, { name: 'Abarrotes y granos' }))[1]?.name, 'Abarrotes y granos');

// --- producto creado por el vendedor: pendiente de aprobación
const [s1, pend] = await call('POST', '/products', seller, { name: 'Café', categoryId: cat.id, unit: 'UNIT', cost: 5000, price: 9000, initialStock: 10, minStock: 1 });
check('Vendedor crea producto → 201 pendiente', `${s1}/${pend?.approved}`, '201/false');
const [saleSt] = await call('POST', '/sales', seller, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: pend.id, quantity: 1 }] });
check('Producto pendiente no se puede vender → 400', saleSt, 400);
check('Vendedor no cambia el precio directamente → 403', (await call('PATCH', `/products/${pend.id}`, seller, { price: 1 }))[0], 403);
check('Vendedor edita la descripción → 200', (await call('PATCH', `/products/${pend.id}`, seller, { description: 'Molido 500 g' }))[0], 200);
const review = (await call('GET', '/review', admin))[1];
check('ADMIN ve el producto pendiente en Revisión', review.pendingProducts.map((p) => p.id), [pend.id]);
check('ADMIN aprueba con precio final 8500', (await call('POST', `/products/${pend.id}/approve`, admin, { price: 8500 }))[1]?.price, 8500);
const [saleOk, sale] = await call('POST', '/sales', seller, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: pend.id, quantity: 1 }] });
check('Aprobado, ya se vende a 8500', `${saleOk}/${sale?.sale?.total}`, '201/8500');

// --- solicitud de precio del vendedor
const [rqSt, rq] = await call('POST', `/products/${pend.id}/price-requests`, seller, { proposedPrice: 9500, reason: 'Subió el proveedor' });
check('Vendedor solicita nuevo precio → 201', rqSt, 201);
check('Segunda solicitud pendiente → 409', (await call('POST', `/products/${pend.id}/price-requests`, seller, { proposedPrice: 9900 }))[0], 409);
check('ADMIN aprueba la solicitud', (await call('POST', `/price-requests/${rq.id}/approve`, admin, {}))[1]?.status, 'APPROVED');
check('Aprobarla de nuevo → 409', (await call('POST', `/price-requests/${rq.id}/approve`, admin, {}))[0], 409);
const priceNow = (await call('GET', '/products', admin))[1].find((p) => p.id === pend.id).price;
check('El precio quedó en 9500', priceNow, 9500);

// --- stock
check('Vendedor registra entrada de 5 con motivo', (await call('POST', `/products/${pend.id}/stock-entries`, seller, { quantity: 5, reason: 'Compra proveedor' }))[1]?.stock, 14);
check('Vendedor no hace bajas → 403', (await call('POST', `/products/${pend.id}/stock-adjustments`, seller, { quantity: 1, reason: 'x' }))[0], 403);
check('Entrada sin motivo → 400', (await call('POST', `/products/${pend.id}/stock-entries`, admin, { quantity: 1 }))[0], 400);
check('Baja mayor al stock → 409', (await call('POST', `/products/${pend.id}/stock-adjustments`, admin, { quantity: 100, reason: 'Daño' }))[0], 409);
check('ADMIN da de baja 2 por daño', (await call('POST', `/products/${pend.id}/stock-adjustments`, admin, { quantity: 2, reason: 'Empaque roto' }))[1]?.stock, 12);
const movs = (await call('GET', `/products/${pend.id}/movements`, admin))[1].map((m) => m.type);
check('Historial: INITIAL, SALE, ENTRY, ADJUSTMENT_OUT', [...movs].sort(), ['ADJUSTMENT_OUT', 'ENTRY', 'INITIAL', 'SALE']);

// --- desactivar / eliminar
check('Producto con ventas no se elimina → 409', (await call('DELETE', `/products/${pend.id}`, admin))[0], 409);
check('Se desactiva → 200', (await call('PATCH', `/products/${pend.id}/deactivate`, admin))[0], 200);
check('Vendedor no lo ve desactivado', (await call('GET', '/products', seller))[1].some((p) => p.id === pend.id), false);
check('Se reactiva → 200', (await call('PATCH', `/products/${pend.id}/activate`, admin))[0], 200);
const [, sinVenta] = await call('POST', '/products', admin, { name: 'Borrable', categoryId: cat.id, unit: 'UNIT', cost: 1, price: 2, initialStock: 1, minStock: 0 });
check('Producto sin ventas se elimina → 200', (await call('DELETE', `/products/${sinVenta.id}`, admin))[0], 200);
check('Categoría con productos no se elimina → 409', (await call('DELETE', `/categories/${cat.id}`, admin))[0], 409);
const [, vacia] = await call('POST', '/categories', admin, { name: 'Vacía' });
check('Categoría vacía se elimina → 200', (await call('DELETE', `/categories/${vacia.id}`, admin))[0], 200);

// --- auditoría
const audit = (await call('GET', '/audit', admin))[1].items;
const actions = new Set(audit.map((a) => a.action));
for (const a of ['COMPANY_ONBOARDING_COMPLETED', 'USER_CREATED', 'CATEGORY_UPDATED', 'PRODUCT_CREATED', 'PRODUCT_APPROVED', 'PRICE_CHANGE_REQUESTED', 'PRODUCT_PRICE_CHANGED', 'STOCK_ENTRY', 'STOCK_ADJUSTMENT_OUT', 'PRODUCT_DELETED', 'CATEGORY_DELETED'])
  check(`Auditoría registra ${a}`, actions.has(a), true);
const priceChange = audit.find((a) => a.action === 'PRODUCT_PRICE_CHANGED' && a.after?.requestId);
check('Cambio de precio con antes y después', `${priceChange?.before?.price}->${priceChange?.after?.price}`, '8500->9500');
check('Auditoría sin contraseñas', JSON.stringify(audit).includes('Tmp-') || JSON.stringify(audit).includes('passwordHash'), false);
check('Todas las entradas son de esta empresa', audit.every((a) => a.companyId === co.id), true);
check('Vendedor no ve la auditoría → 403', (await call('GET', '/audit', seller))[0], 403);
const saAudit = (await call('GET', `/audit?companyId=${co.id}`, sa))[1].items;
check('SUPER_ADMIN filtra la auditoría por empresa', saAudit.length > 0 && saAudit.every((a) => a.companyId === co.id), true);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
