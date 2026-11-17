// Mide, desde el cliente, cuánto tarda confirmar una venta (SWR-PERF-001: ≤ 2 s para el 95 %).
// Uso (desde backend/): node scripts/medir-venta.mjs .env [ventas]
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(process.argv[2], 'utf8');
const get = (k) => env.match(new RegExp('^' + k + '="?([^"\\r\\n]*)', 'm'))[1];
const N = Number(process.argv[3] ?? 20);
const B = 'http://localhost:4000';
const call = async (method, path, token, body) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json().catch(() => null)];
};

const admin = (await call('POST', '/auth/login', null, { email: get('SEED_ADMIN_EMAIL'), password: get('SEED_ADMIN_PASSWORD') }))[1].accessToken;
const tag = Date.now().toString(36);
const cat = (await call('POST', '/categories', admin, { name: `Medicion ${tag}` }))[1];
const mk = async (unit, stock) =>
  (await call('POST', '/products', admin, { name: `Medicion ${unit} ${tag}`, categoryId: cat.id, unit, cost: 700, price: 1000, initialStock: stock, minStock: 0 }))[1].id;
const a = await mk('UNIT', 1000);
const b = await mk('KG', 1000);
// Modo «distintos»: cada venta usa su propio producto (usuarios vendiendo cosas diferentes).
const distinct = process.argv[5] === 'distintos';
const own = distinct ? await Promise.all(Array.from({ length: N }, () => mk('UNIT', 100))) : [];

// Modo concurrente: `node scripts/medir-venta.mjs .env 20 concurrente` lanza las N ventas a la vez.
const concurrent = process.argv[4] === 'concurrente';
const sell = async (i) => {
  const items = distinct
    ? [{ productId: own[i], quantity: 1 }]
    : i % 2 ? [{ productId: a, quantity: 1 }, { productId: b, quantity: 0.25 }] : [{ productId: a, quantity: 2 }];
  const t0 = performance.now();
  const [status] = await call('POST', '/sales', admin, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items });
  if (status !== 201) throw new Error(`venta ${i} respondió ${status}`);
  return Math.round(performance.now() - t0);
};
const times = [];
if (concurrent) {
  times.push(...(await Promise.all(Array.from({ length: N }, (_, i) => sell(i)))));
} else {
  for (let i = 0; i < N; i++) times.push(await sell(i));
}
console.log(concurrent ? `modo: ${N} ventas simultáneas${distinct ? ' de productos distintos' : ' sobre los mismos 2 productos'}` : 'modo: secuencial');
const sorted = [...times].sort((x, y) => x - y);
const p = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
console.log(`ventas: ${N} · mín ${sorted[0]} ms · mediana ${p(0.5)} ms · p95 ${p(0.95)} ms · máx ${sorted.at(-1)} ms`);
console.log(`≤ 2000 ms: ${times.filter((t) => t <= 2000).length}/${N}`);
