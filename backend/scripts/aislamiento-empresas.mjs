// Aislamiento entre empresas (SWR-TEN-001/002/003, SWR-ROLE-001/002, SWR-ONB-001) contra la API real.
// Cada cuenta nueva cambia su contraseña temporal y el ADMIN completa la configuración inicial.
// El SUPER_ADMIN crea dos empresas con su ADMIN; cada ADMIN crea catálogo y un vendedor.
// Luego se intenta leer y modificar datos de la otra empresa: todo debe responder 404/403.
// Uso (desde backend/, con la API arriba): node scripts/aislamiento-empresas.mjs .env
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(process.argv[2], 'utf8');
const get = (k) => env.match(new RegExp('^' + k + '="?([^"\\r\\n]*)', 'm'))[1];
const B = 'http://localhost:4000';
const call = async (method, path, token, body, headers = {}) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json().catch(() => null)];
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password }))[1]?.accessToken;

const results = [];
const check = (name, actual, expected) => {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (obtenido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)})`);
};

const tag = Date.now().toString(36);
// Contraseñas temporales generadas para la prueba; no se imprimen.
const tmp = () => 'Tmp-' + randomUUID().slice(0, 12) + '9';
const sa = await login(get('SEED_SUPERADMIN_EMAIL'), get('SEED_SUPERADMIN_PASSWORD'));
check('SUPER_ADMIN inicia sesión', !!sa, true);

async function setupCompany(letter) {
  const [, co] = await call('POST', '/platform/companies', sa, { tradeName: `Empresa ${letter} ${tag}` });
  const adminPass = tmp();
  const adminEmail = `admin.${letter.toLowerCase()}.${tag}@tiendapp.test`;
  await call('POST', `/platform/companies/${co.id}/admin`, sa, { name: `Admin ${letter}`, email: adminEmail, temporaryPassword: adminPass });
  const admin = await login(adminEmail, adminPass);
  // SWR-ONB-001: con contraseña temporal el backend bloquea todo con 428.
  check(`Empresa ${letter}: ADMIN con contraseña temporal bloqueado → 428`, (await call('GET', '/products', admin))[0], 428);
  await call('POST', '/auth/change-password', admin, { currentPassword: adminPass, newPassword: tmp() });
  check(`Empresa ${letter}: ADMIN sin configuración inicial bloqueado → 428`, (await call('GET', '/products', admin))[0], 428);
  const [onbStatus] = await call('POST', '/company/onboarding', admin, {
    tradeName: `Empresa ${letter} ${tag}`, taxId: '900123456-8', email: `ventas.${letter.toLowerCase()}.${tag}@tiendapp.test`,
    invoicePrefix: `${letter}-`, firstInvoiceNumber: 1,
  });
  check(`Empresa ${letter}: configuración inicial completada`, onbStatus, 201);
  const sellerPass = tmp();
  const sellerEmail = `vendedor.${letter.toLowerCase()}.${tag}@tiendapp.test`;
  const [, seller] = await call('POST', '/users', admin, { name: `Vendedor ${letter}`, email: sellerEmail, temporaryPassword: sellerPass });
  const sellerToken = await login(sellerEmail, sellerPass);
  await call('POST', '/auth/change-password', sellerToken, { currentPassword: sellerPass, newPassword: tmp() });
  // Mismo nombre de categoría en ambas empresas: la unicidad es por empresa.
  const [catStatus, cat] = await call('POST', '/categories', admin, { name: 'Bebidas' });
  const [, prod] = await call('POST', '/products', admin, { name: `Gaseosa ${letter}`, categoryId: cat.id, unit: 'UNIT', cost: 1000, price: 2000, initialStock: 10, minStock: 1 });
  const key = randomUUID();
  const [, sale] = await call('POST', '/sales', sellerToken, { idempotencyKey: key, paymentMethod: 'CASH', items: [{ productId: prod.id, quantity: 1 }] });
  return { co, admin, seller, sellerToken, cat, catStatus, prod, sale: sale?.sale, key };
}

const A = await setupCompany('A');
const C = await setupCompany('B');
check('Empresa A: categoría «Bebidas» creada', A.catStatus, 201);
check('Empresa B: también puede crear «Bebidas» (unicidad por empresa)', C.catStatus, 201);
check('Empresa A: el vendedor vende', !!A.sale?.id, true);

// --- Lecturas cruzadas ---
const productsA = (await call('GET', '/products', A.admin))[1];
check('A no ve productos de B en el listado', productsA.some((p) => p.id === C.prod.id), false);
const salesA = (await call('GET', '/sales', A.admin))[1];
check('A no ve ventas de B en el listado', salesA.some((s) => s.id === C.sale.id), false);
check('A lee la venta de B por id → 404', (await call('GET', `/sales/${C.sale.id}`, A.admin))[0], 404);
check('Vendedor de A lee la venta de B por id → 404', (await call('GET', `/sales/${C.sale.id}`, A.sellerToken))[0], 404);
const usersA = (await call('GET', '/users', A.admin))[1];
check('A no ve usuarios de B', usersA.some((u) => u.id === C.seller.id), false);

// --- Escrituras cruzadas ---
check('A edita el producto de B → 404', (await call('PATCH', `/products/${C.prod.id}`, A.admin, { price: 1 }))[0], 404);
check('A desactiva el producto de B → 404', (await call('PATCH', `/products/${C.prod.id}/deactivate`, A.admin))[0], 404);
check('A crea producto en la categoría de B → 400', (await call('POST', '/products', A.admin, { name: 'X', categoryId: C.cat.id, unit: 'UNIT', cost: 1, price: 1, initialStock: 0, minStock: 0 }))[0], 400);
const [crossSaleStatus] = await call('POST', '/sales', A.sellerToken, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: C.prod.id, quantity: 1 }] });
check('Vendedor de A vende un producto de B → 400', crossSaleStatus, 400);
check('A desactiva al vendedor de B → 404', (await call('PATCH', `/users/${C.seller.id}/deactivate`, A.admin))[0], 404);
check('A intenta cambiar de empresa con X-Company-Id (se ignora) → no ve a B', (await call('GET', '/products', A.admin, null, { 'x-company-id': C.co.id }))[1].some((p) => p.id === C.prod.id), false);
const stockB = (await call('GET', '/products', C.admin))[1].find((p) => p.id === C.prod.id);
check('El producto de B sigue intacto (precio y stock)', `${stockB.price}/${stockB.stock}`, '2000/9');

// --- Idempotencia por empresa ---
const [replayStatus, replay] = await call('POST', '/sales', C.sellerToken, { idempotencyKey: A.key, paymentMethod: 'CASH', items: [{ productId: C.prod.id, quantity: 1 }] });
check('B puede usar la misma clave de idempotencia que A (es por empresa) → venta nueva', `${replayStatus}/${replay?.replayed}`, '201/false');

// --- Roles ---
check('Vendedor no puede crear vendedores → 403', (await call('POST', '/users', A.sellerToken, { name: 'X', email: `x.${tag}@t.test`, temporaryPassword: tmp() }))[0], 403);
check('ADMIN no accede a la plataforma → 403', (await call('GET', '/platform/companies', A.admin))[0], 403);
check('SUPER_ADMIN sin X-Company-Id en rutas de empresa → 400', (await call('GET', '/products', sa))[0], 400);
const saProducts = (await call('GET', '/products', sa, null, { 'x-company-id': C.co.id }))[1];
check('SUPER_ADMIN con X-Company-Id ve el catálogo de B', saProducts.some((p) => p.id === C.prod.id), true);
check('SUPER_ADMIN no vende → 403', (await call('POST', '/sales', sa, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: C.prod.id, quantity: 1 }] }, { 'x-company-id': C.co.id }))[0], 403);
check('Vendedor de A solo ve sus ventas', (await call('GET', '/sales', A.sellerToken))[1].every((s) => s.userId === A.seller.id), true);

// --- Empresa desactivada (SWR-TEN-003) ---
await call('PATCH', `/platform/companies/${C.co.id}/deactivate`, sa);
check('Sesión abierta de B deja de valer al desactivar la empresa → 401', (await call('GET', '/products', C.admin))[0], 401);
check('Usuarios de B no pueden iniciar sesión', await login(`vendedor.b.${tag}@tiendapp.test`, 'cualquiera-123'), undefined);
check('A sigue operando normalmente', (await call('GET', '/products', A.admin))[0], 200);
await call('PATCH', `/platform/companies/${C.co.id}/activate`, sa);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
