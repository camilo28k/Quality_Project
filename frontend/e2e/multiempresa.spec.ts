import { expect, test, type Page } from '@playwright/test';
import { credentials, goTo, unique } from './helpers';

/**
 * E2E-08 (extensión post-MVP, multiempresa): recorre en el navegador el ciclo completo
 * SUPER_ADMIN → ADMIN (primer ingreso) → vendedor → ADMIN anula la factura.
 * Necesita SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD y un backend con la
 * migración multiempresa; se ejecuta contra la BD local de pruebas, nunca contra producción.
 */
const SUPER_EMAIL = process.env.SEED_SUPERADMIN_EMAIL;
const SUPER_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD;

/** Escribe la contraseña sin que quede en el reporte HTML (igual que helpers.login). */
async function typeSecret(page: Page, label: string | RegExp, value: string) {
  await page.getByLabel(label, { exact: typeof label === 'string' }).evaluate((el, v) => {
    (el as HTMLInputElement).value = v;
  }, value);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await typeSecret(page, 'Contraseña', password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Primer ingreso con contraseña temporal: la app obliga a cambiarla (SWR-ONB-001). */
async function changeTemporaryPassword(page: Page, temporary: string, next: string) {
  await expect(page).toHaveURL(/\/cambiar-contrasena/);
  await typeSecret(page, 'Contraseña temporal', temporary);
  await typeSecret(page, 'Nueva contraseña', next);
  await typeSecret(page, 'Confirmar nueva contraseña', next);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
}

test.describe('Multiempresa', () => {
  test.skip(!SUPER_EMAIL || !SUPER_PASSWORD, 'Faltan SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD');

  test('E2E-08: empresa nueva, configuración inicial, venta del vendedor y anulación con stock devuelto', async ({ page }) => {
    const id = unique();
    const company = `Tienda E2E ${id}`;
    const admin = { email: `admin.${id}@e2e.test`, temp: `Temporal${id}1`, pass: `Definitiva${id}1` };
    const seller = { email: `vende.${id}@e2e.test`, temp: `Temporal${id}2`, pass: `Definitiva${id}2` };
    const category = `Granos ${id}`;
    const product = `Lenteja ${id}`;

    // 1. SUPER_ADMIN crea la empresa con su ADMIN (SWR-PLAT-001)
    await loginAs(page, SUPER_EMAIL!, SUPER_PASSWORD!);
    await expect(page).toHaveURL(/\/dashboard/);
    await goTo(page, 'Empresas');
    await page.getByLabel('Nombre de la empresa').fill(company);
    await page.getByLabel('Nombre del administrador').fill(`Admin ${id}`);
    await page.getByLabel('Correo del administrador').fill(admin.email);
    await typeSecret(page, 'Contraseña temporal', admin.temp);
    await page.getByRole('button', { name: 'Crear empresa' }).click();
    await expect(page.getByText(`Empresa «${company}» creada`)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: company })).toContainText('Configurando');

    // 2. ADMIN: cambio de contraseña y asistente de configuración (SWR-ONB-001/002)
    await loginAs(page, admin.email, admin.temp);
    await changeTemporaryPassword(page, admin.temp, admin.pass);
    await expect(page).toHaveURL(/\/configuracion-inicial/);
    await expect(page.getByLabel(/^Nombre comercial/)).toHaveValue(company);
    await page.getByLabel(/^NIT/).fill('900123456-8');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByLabel(/^Correo de la empresa/).fill(`facturas.${id}@e2e.test`);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByLabel(/^Prefijo de factura/).fill('E2E-');
    await expect(page.getByText('Tu primera factura será la')).toContainText('E2E-1');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Confirmar y empezar' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // 3. ADMIN crea la categoría y el vendedor (SWR-CAT-001, SWR-USR-001)
    await goTo(page, 'Categorías');
    await page.getByLabel('Nombre').fill(category);
    await page.getByRole('button', { name: 'Guardar categoría' }).click();
    await expect(page.getByRole('cell', { name: category })).toBeVisible();
    await goTo(page, 'Vendedores');
    await page.getByLabel('Nombre', { exact: true }).fill(`Vendedor ${id}`);
    await page.getByLabel('Correo', { exact: true }).fill(seller.email);
    await typeSecret(page, 'Contraseña temporal', seller.temp);
    await page.getByRole('button', { name: 'Crear vendedor' }).click();
    await expect(page.getByRole('cell', { name: seller.email })).toBeVisible();

    // 4. Vendedor: primer ingreso y producto propuesto (queda por aprobar, SWR-PROD-008)
    await loginAs(page, seller.email, seller.temp);
    await changeTemporaryPassword(page, seller.temp, seller.pass);
    await expect(page).toHaveURL(/\/dashboard$/);
    await goTo(page, 'Productos');
    await page.getByLabel('Nombre', { exact: true }).fill(product);
    await page.getByLabel('Categoría').selectOption({ label: category });
    await page.getByLabel('Unidad de medida').selectOption('UNIT');
    await page.getByLabel('Costo de adquisición (COP)').fill('3000');
    await page.getByLabel('Precio de venta (COP)').fill('4500');
    await page.getByLabel('Stock inicial').fill('10');
    await page.getByLabel('Stock mínimo').fill('2');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByText(`Producto «${product}» registrado`)).toBeVisible();

    // 5. ADMIN aprueba el producto en Revisión
    await loginAs(page, admin.email, admin.pass);
    await goTo(page, 'Revisión');
    await page.getByRole('row').filter({ hasText: product }).getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('row').filter({ hasText: product })).toHaveCount(0);

    // 6. Vendedor vende 4 unidades: la factura toma el consecutivo de su empresa
    await loginAs(page, seller.email, seller.pass);
    await goTo(page, 'Nueva venta');
    const option = page.getByRole('option', { name: new RegExp(`^${product} —`) });
    await page.getByLabel('Producto', { exact: true }).selectOption((await option.getAttribute('value'))!);
    await page.getByLabel(/^Cantidad/).fill('4');
    await page.getByRole('button', { name: 'Agregar a la venta' }).click();
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByText('Venta confirmada · Factura E2E-1', { exact: true })).toBeVisible();

    // 7. ADMIN anula la factura E2E-1 con motivo y el stock vuelve a 10 (SWR-SALE-010)
    await loginAs(page, admin.email, admin.pass);
    await goTo(page, 'Ventas');
    const saleRow = page.getByRole('row').filter({ hasText: 'E2E-1' });
    await expect(saleRow).toContainText(`Vendedor ${id}`, { timeout: 30_000 });
    await saleRow.getByRole('button', { name: 'Anular' }).click();
    await page.getByLabel('Motivo').fill('Prueba E2E: el cliente devolvió el producto');
    await page.getByRole('button', { name: 'Anular venta' }).click();
    await expect(page.getByText('Factura E2E-1 anulada')).toBeVisible();
    await goTo(page, 'Productos');
    await expect(page.getByRole('row').filter({ hasText: product }).getByRole('cell', { name: '10 unidad' })).toBeVisible();

    // 8. Aislamiento: el ADMIN de la empresa inicial no ve el producto de la empresa nueva
    const other = credentials('ADMIN');
    await loginAs(page, other.email, other.password);
    await goTo(page, 'Productos');
    await expect(page.getByRole('heading', { level: 1, name: 'Productos' })).toBeVisible();
    await expect(page.getByText(product)).toHaveCount(0);

    // 9. El SUPER_ADMIN ve la empresa ya configurada
    await loginAs(page, SUPER_EMAIL!, SUPER_PASSWORD!);
    await goTo(page, 'Empresas');
    await expect(page.getByRole('row').filter({ hasText: company })).toContainText('Activa');
  });
});
