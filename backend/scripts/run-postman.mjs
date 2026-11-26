// Ejecuta la colección de Postman con Newman contra la API local.
// Las contraseñas de prueba se leen de backend/.env y no se guardan en el environment exportado.
// Uso (desde backend/): npm run test:api
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const newman = require('newman');

// Opcional: otro archivo de entorno (p. ej. una BD local de prueba). En ese caso el reporte
// se escribe en la carpeta temporal para no mezclarlo con la evidencia versionada.
const envFile = process.argv[2] ?? '.env';
const env = readFileSync(envFile, 'utf8');
const get = (k) => env.match(new RegExp(`^${k}="?([^"\\r\\n]*)`, 'm'))?.[1] ?? '';
const dir = '../docs/calidad/09_Postman';
mkdirSync(`${dir}/resultados`, { recursive: true });

newman.run(
  {
    collection: `${dir}/TiendApp.postman_collection.json`,
    environment: `${dir}/TiendApp.local.postman_environment.json`,
    envVar: [
      { key: 'adminEmail', value: get('SEED_ADMIN_EMAIL') },
      { key: 'sellerEmail', value: get('SEED_SELLER_EMAIL') },
      { key: 'adminPassword', value: get('SEED_ADMIN_PASSWORD') },
      { key: 'sellerPassword', value: get('SEED_SELLER_PASSWORD') },
    ],
    reporters: ['cli', 'json'],
    reporter: {
      json: {
        export:
          envFile === '.env'
            ? `${dir}/resultados/newman-${new Date().toISOString().slice(0, 10)}.json`
            : join(tmpdir(), 'newman-local.json'),
      },
    },
  },
  (err, summary) => {
    if (err) throw err;
    process.exitCode = summary.run.failures.length > 0 ? 1 : 0;
  },
);
