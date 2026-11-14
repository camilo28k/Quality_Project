// Escenarios Shift Right (guía §18.2) contra una API en ejecución.
// Uso: node scripts/shift-right.mjs http://localhost:4100   (lee cuentas SEED_* de .env sin imprimirlas)
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = process.argv[2] ?? 'http://localhost:4000';
const env = readFileSync('.env', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}="?([^"\\r\\n]*)`, 'm'))[1];

async function call(method, path, token, body) {
  const started = Date.now();
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null), ms: Date.now() - started };
}
const log = (n, name, r) => console.log(`${n} | ${name} | HTTP ${r.status} | ${r.ms} ms`);

for (let i = 0; i < 30; i++) {
  try { await fetch(`${BASE}/health`); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
const tag = Date.now().toString(36);

// 1. Flujo principal correcto
const admin = await call('POST', '/auth/login', null, { email: get('SEED_ADMIN_EMAIL'), password: get('SEED_ADMIN_PASSWORD') });
log('1a', 'login administrador', admin);
const A = admin.body.accessToken;
const cat = await call('POST', '/categories', A, { name: `ShiftRight ${tag}` });
log('1b', 'crear categoría', cat);
const prod = await call('POST', '/products', A, { name: `Panela ${tag}`, categoryId: cat.body.id, unit: 'UNIT', cost: 2000, price: 3200, initialStock: 5, minStock: 1 });
log('1c', 'crear producto', prod);
const sale = await call('POST', '/sales', A, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: prod.body.id, quantity: 2 }] });
log('1d', 'confirmar venta', sale);

// 2. Credencial incorrecta
log('2', 'login con contraseña incorrecta', await call('POST', '/auth/login', null, { email: get('SEED_ADMIN_EMAIL'), password: 'no-es-la-clave' }));

// 3. Dato inválido
log('3a', 'venta con cantidad 0', await call('POST', '/sales', A, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: prod.body.id, quantity: 0 }] }));
log('3b', 'venta con stock insuficiente', await call('POST', '/sales', A, { idempotencyKey: randomUUID(), paymentMethod: 'CASH', items: [{ productId: prod.body.id, quantity: 99 }] }));

// 4. Error provocado: JSON malformado y token alterado
log('4a', 'cuerpo JSON malformado', await call('POST', '/sales', A, '{"idempotencyKey": '));
log('4b', 'token alterado', await call('GET', '/auth/me', `${A}x`));

// 5. Operación relevante: repetición de la venta y lectura del historial
const key = randomUUID();
const first = await call('POST', '/sales', A, { idempotencyKey: key, paymentMethod: 'CARD', items: [{ productId: prod.body.id, quantity: 1 }] });
log('5a', 'venta con clave nueva', first);
log('5b', 'misma solicitud repetida', await call('POST', '/sales', A, { idempotencyKey: key, paymentMethod: 'CARD', items: [{ productId: prod.body.id, quantity: 1 }] }));
log('5c', 'historial de ventas', await call('GET', '/sales', A));
