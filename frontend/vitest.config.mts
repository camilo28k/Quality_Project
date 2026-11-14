import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      include: ['src/features/**', 'src/lib/**'],
      exclude: ['**/*.test.*', 'src/lib/session*.ts', 'src/lib/theme-transition.ts'],
      // Quality Gate (D-08): piso global y umbral para la lógica del flujo de venta.
      thresholds: {
        lines: 65,
        branches: 55,
        'src/features/sales/sale-math.ts': { lines: 95, branches: 75 },
        'src/features/sales/new-sale.tsx': { lines: 80, branches: 75 },
        'src/features/auth/login-form.tsx': { lines: 80, branches: 75 }
      }
    }
  }
});
