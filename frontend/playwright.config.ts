import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * E2E de TiendApp (guía §13). Requiere el backend en http://localhost:4000.
 * Las credenciales de prueba se leen de backend/.env al ejecutar; no se versionan.
 */
try {
  const env = readFileSync('../backend/.env', 'utf8');
  for (const key of ['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_SELLER_EMAIL', 'SEED_SELLER_PASSWORD']) {
    const value = env.match(new RegExp(`^${key}="?([^"\\r\\n]*)`, 'm'))?.[1];
    if (value && !process.env[key]) process.env[key] = value;
  }
} catch {
  // En CI las variables llegan como secretos del entorno.
}

const PORT = 3002;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // la BD remota hace lentas las operaciones (H-FE-02, ver evidencia)
  expect: { timeout: 15_000 }, // confirmar una venta tarda varios segundos (hallazgo H-FE-02)
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-CO',
    timezoneId: 'America/Bogota'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
