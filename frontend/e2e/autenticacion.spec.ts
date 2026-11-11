import { expect, test } from '@playwright/test';
import { appAlert, credentials, login } from './helpers';

test.describe('Autenticación', () => {
  test('E2E-01: una ruta protegida sin sesión redirige al login', async ({ page }) => {
    await page.goto('/dashboard/ventas/nueva');

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fventas%2Fnueva$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('E2E-02: credenciales incorrectas muestran un mensaje general (SWR-AUTH-002)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(credentials('ADMIN').email);
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(appAlert(page)).toHaveText('Correo o contraseña incorrectos');
    await expect(page).toHaveURL(/\/login/);
  });

  test('E2E-03: el vendedor no ve ni puede abrir Categorías (SWR-AUTH-004)', async ({ page }) => {
    await login(page, 'SELLER');

    const nav = page.locator('[data-sidebar="sidebar"]').first();
    await expect(nav.getByRole('link', { name: 'Nueva venta' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Categorías' })).toHaveCount(0);

    await page.goto('/dashboard/categorias');
    await expect(page.getByText('No tiene permisos para ver esta página.')).toBeVisible();
  });
});
