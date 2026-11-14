// Verificación técnica del backend contra la API local (etapa 3).
// Uso: node scripts/verificacion-api.mjs .env   (lee las cuentas SEED_* sin imprimirlas)
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(process.argv[2], 'utf8');
const g = (k) => env.match(new RegExp('^' + k + '="([^"]*)', 'm'))[1];
const B = 'http://localhost:4000';
const tag = Date.now().toString(36);

async function call(method, path, token, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json().catch(() => null)];
}
const rows = [];
const check = (id, desc, cond, got) => rows.push(`| ${id} | ${desc} | ${got} | ${cond ? 'PASS' : 'FAIL'} |`);
const stockOf = async (tok, id) => (await call('GET', '/products', tok))[1].find((p) => p.id === id)?.stock;

for (let i = 0; i < 30; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

const admin = (await call('POST', '/auth/login', null, { email: g('SEED_ADMIN_EMAIL'), password: g('SEED_ADMIN_PASSWORD') }))[1].accessToken;
const seller = (await call('POST', '/auth/login', null, { email: g('SEED_SELLER_EMAIL'), password: g('SEED_SELLER_PASSWORD') }))[1].accessToken;

let [s, b] = await call('POST', '/categories', admin, { name: `Granos ${tag}` });
check('C1', 'SWR-CAT-001 crear categoría', s === 201, s);
const cat = b.id;
[s] = await call('POST', '/categories', admin, { name: `GRANOS ${tag}` });
check('C2', 'AJ-06 nombre duplicado sin distinguir mayúsculas', s === 409, s);
[s] = await call('POST', '/categories', seller, { name: `X ${tag}` });
check('C3', 'TC-SEC-001 vendedor invoca función administrativa', s === 403, s);

const mk = async (name, unit, price, initialStock) =>
  call('POST', '/products', admin, { name: `${name} ${tag}`, categoryId: cat, unit, cost: Math.round(price * 0.7), price, initialStock, minStock: 1 });
[s, b] = await mk('Arroz', 'UNIT', 2500, 10);
check('P1', 'SWR-PROD-001 registrar producto completo', s === 201 && b.stock === 10, `${s}, stock ${b.stock}`);
const arroz = b.id;
[s, b] = await call('POST', '/products', admin, { name: '', categoryId: cat, unit: 'UNIT', price: 100 });
check('P2', 'SWR-PROD-001 campos obligatorios faltantes', s === 400, `${s} (${b.message.length} mensajes)`);
const aceite = (await mk('Aceite', 'UNIT', 9000, 2))[1].id;
const queso = (await mk('Queso', 'KG', 12000, 2))[1].id;

const sale = (items, pm = 'CASH', key = randomUUID(), tok = seller) => call('POST', '/sales', tok, { idempotencyKey: key, paymentMethod: pm, items });

const key1 = randomUUID();
[s, b] = await sale([{ productId: arroz, quantity: 3 }], 'CASH', key1);
const sale1 = b.sale;
check('S1', 'TC-SALE-001 stock 10, vender 3 → stock 7', s === 201 && (await stockOf(admin, arroz)) === 7, `${s}, total ${sale1.total}, stock ${await stockOf(admin, arroz)}`);
check('S2', 'SWR-SALE-003/004 subtotal y total (3 × 2500)', sale1.items[0].subtotal === 7500 && sale1.total === 7500, `subtotal ${sale1.items[0].subtotal}, total ${sale1.total}`);

[s, b] = await sale([{ productId: aceite, quantity: 3 }]);
check('S3', 'TC-SALE-002 stock 2, vender 3 → rechazo', s === 409 && (await stockOf(admin, aceite)) === 2, `${s} «${b.message[0]}», stock ${await stockOf(admin, aceite)}`);

[s, b] = await sale([{ productId: queso, quantity: 0.75 }], 'TRANSFER');
check('S4', 'TC-MED-001 vender 0,75 kg', s === 201 && b.sale.items[0].quantity === 0.75 && b.sale.items[0].unit === 'KG', `${s}, ${b.sale.items[0].quantity} ${b.sale.items[0].unit}, subtotal ${b.sale.items[0].subtotal}, stock ${await stockOf(admin, queso)}`);

[s, b] = await sale([{ productId: arroz, quantity: 0 }]);
check('S5', 'SWR-MED-004 cantidad 0 rechazada', s === 400, `${s} «${b.message[0]}»`);

[s, b] = await sale([{ productId: arroz, quantity: 1 }, { productId: arroz, quantity: 1 }], 'CARD');
check('S6', 'Venta con varias líneas y medio tarjeta', s === 201 && b.sale.paymentMethod === 'CARD' && (await stockOf(admin, arroz)) === 5, `${s}, ${b.sale.paymentMethod}, stock ${await stockOf(admin, arroz)}`);

[s, b] = await sale([{ productId: arroz, quantity: 3 }], 'CASH', key1);
check('S7', 'TC-REL-001 repetir la misma solicitud', b.replayed === true && b.sale.id === sale1.id && (await stockOf(admin, arroz)) === 5, `${s}, replayed ${b.replayed}, misma venta ${b.sale.id === sale1.id}, stock ${await stockOf(admin, arroz)}`);

const parallelKey = randomUUID();
const par = await Promise.all([1, 2, 3].map(() => sale([{ productId: arroz, quantity: 1 }], 'CASH', parallelKey)));
const ids = new Set(par.map(([, x]) => x?.sale?.id));
check('S8', 'SWR-SALE-010 tres envíos simultáneos con la misma clave', ids.size === 1 && (await stockOf(admin, arroz)) === 4, `${par.map(([st]) => st).join('/')}, ventas distintas ${ids.size}, stock ${await stockOf(admin, arroz)}`);

[s] = await call('PATCH', `/products/${arroz}`, admin, { price: 3000 });
[, b] = await call('GET', `/sales/${sale1.id}`, admin);
check('D1', 'TC-DATA-001 cambiar precio no altera venta histórica', s === 200 && b.items[0].unitPrice === 2500 && b.total === 7500, `precio nuevo 3000; venta conserva ${b.items[0].unitPrice}`);

[s] = await call('PATCH', `/products/${arroz}/deactivate`, admin);
const visible = (await call('GET', '/products', seller))[1].some((p) => p.id === arroz);
const [hs] = await call('GET', `/sales/${sale1.id}`, admin);
check('D2', 'SWR-PROD-005 desactivar sin borrar historial', s === 200 && !visible && hs === 200, `${s}, visible para vendedor ${visible}, venta histórica ${hs}`);
[s] = await sale([{ productId: arroz, quantity: 1 }]);
check('D3', 'Producto inactivo no se puede vender', s === 400, s);

console.log(rows.join('\n'));
