// Carrera de stock (FAL-01 / SWR-SALE-007): varias ventas simultáneas con claves distintas
// compiten por la última unidad. Debe ganar exactamente una y el stock no puede quedar negativo.
// Uso (desde backend/): node scripts/carrera-stock.mjs .env [competidores]
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(process.argv[2], 'utf8');
const get = (k) => env.match(new RegExp('^' + k + '="?([^"\\r\\n]*)', 'm'))[1];
const B = 'http://localhost:4000';
const N = Number(process.argv[3] ?? 3);
const call = async (method, path, token, body) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json().catch(() => null)];
};

const admin = (await call('POST', '/auth/login', null, { email: get('SEED_ADMIN_EMAIL'), password: get('SEED_ADMIN_PASSWORD') }))[1].accessToken;
const seller = (await call('POST', '/auth/login', null, { email: get('SEED_SELLER_EMAIL'), password: get('SEED_SELLER_PASSWORD') }))[1].accessToken;
const tag = Date.now().toString(36);
const cat = (await call('POST', '/categories', admin, { name: `Carrera ${tag}` }))[1];
const prod = (await call('POST', '/products', admin, { name: `Ultima unidad ${tag}`, categoryId: cat.id, unit: 'UNIT', cost: 700, price: 1000, initialStock: 1, minStock: 0 }))[1];

const results = await Promise.all(
  Array.from({ length: N }, () =>
    call('POST', '/sales', seller, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: prod.id, quantity: 1 }] }),
  ),
);
const stock = (await call('GET', '/products', admin))[1].find((p) => p.id === prod.id).stock;
const ok = results.filter(([s]) => s === 201).length;
const conflict = results.filter(([s]) => s === 409).length;
console.log(`respuestas: ${results.map(([s]) => s).join('/')} · ventas creadas ${ok} · rechazadas ${conflict} · stock final ${stock}`);
console.log(ok === 1 && conflict === N - 1 && stock === 0 ? 'PASS' : 'FAIL');
