// Ejecuta la colección de Postman con Newman contra la API local.
// Las contraseñas de prueba se leen de backend/.env y no se guardan en el environment exportado.
// Uso (desde backend/): npm run test:api
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const newman = require('newman');

const env = readFileSync('.env', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}="?([^"\\r\\n]*)`, 'm'))?.[1] ?? '';
const dir = '../docs/calidad/09_Postman';
mkdirSync(`${dir}/resultados`, { recursive: true });

newman.run(
  {
    collection: `${dir}/TiendApp.postman_collection.json`,
    environment: `${dir}/TiendApp.local.postman_environment.json`,
    envVar: [
      { key: 'adminPassword', value: get('SEED_ADMIN_PASSWORD') },
      { key: 'sellerPassword', value: get('SEED_SELLER_PASSWORD') },
    ],
    reporters: ['cli', 'json'],
    reporter: { json: { export: `${dir}/resultados/newman-${new Date().toISOString().slice(0, 10)}.json` } },
  },
  (err, summary) => {
    if (err) throw err;
    process.exitCode = summary.run.failures.length > 0 ? 1 : 0;
  },
);
