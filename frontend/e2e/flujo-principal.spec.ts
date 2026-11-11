import { expect, test } from '@playwright/test';
import { appAlert, goTo, login, seedProduct, unique } from './helpers';

test.describe('Flujo principal', () => {
  test('E2E-04: administrador registra categoría y producto, vende 3 unidades y el stock queda en 7', async ({ page }) => {
    const id = unique();
    const category = `Granos ${id}`;
    const product = `Arroz ${id}`;

    // 1. Autenticarse
    await login(page, 'ADMIN');

    // 2. Registrar categoría (SWR-CAT-001)
    await goTo(page, 'Categorías');
    await page.getByLabel('Nombre').fill(category);
    await page.getByRole('button', { name: 'Guardar categoría' }).click();
    await expect(page.getByRole('cell', { name: category })).toBeVisible();

    // 3. Registrar producto (SWR-PROD-001)
    await goTo(page, 'Productos');
    await page.getByLabel('Nombre').fill(product);
    await page.getByLabel('Categoría').selectOption({ label: category });
    await page.getByLabel('Unidad de medida').selectOption('UNIT');
    await page.getByLabel('Costo de adquisición (COP)').fill('1800');
    await page.getByLabel('Precio de venta (COP)').fill('2500');
    await page.getByLabel('Stock inicial').fill('10');
    await page.getByLabel('Stock mínimo').fill('2');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByText(`Producto «${product}» registrado`)).toBeVisible();

    // 4. Realizar venta (SWR-SALE-003/004/008)
    await goTo(page, 'Nueva venta');
    const option = page.getByRole('option', { name: new RegExp(`^${product} —`) });
    await page.getByLabel('Producto', { exact: true }).selectOption((await option.getAttribute('value'))!);
    await page.getByLabel(/^Cantidad/).fill('3');
    await page.getByRole('button', { name: 'Agregar a la venta' }).click();
    await expect(page.getByTestId('sale-total')).toHaveText(/\$\s7\.500/);
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByText('Venta confirmada', { exact: true })).toBeVisible();

    // 5. Resultado final: el inventario se descontó (TC-SALE-001)
    await goTo(page, 'Productos');
    const row = page.getByRole('row').filter({ hasText: product });
    await expect(row.getByRole('cell', { name: '7 unidad' })).toBeVisible();
  });

  test('E2E-05: vendedor vende 0,75 kg por transferencia y la venta aparece en el historial', async ({ page, request }) => {
    const queso = await seedProduct(request, { name: `Queso ${unique()}`, unit: 'KG', price: 12000, initialStock: 2 });

    await login(page, 'SELLER');
    await goTo(page, 'Nueva venta');
    await page.getByLabel('Producto', { exact: true }).selectOption(queso.id);
    await page.getByLabel(/^Cantidad/).fill('0,75');
    await page.getByRole('button', { name: 'Agregar a la venta' }).click();
    await page.getByLabel('Medio de pago').selectOption('TRANSFER');
    await page.getByRole('button', { name: 'Confirmar venta' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Venta confirmada' })).toContainText('Transferencia');
    await expect(page.getByRole('option', { name: new RegExp(`^${queso.name}.*disp\\. 1,25`) })).toBeAttached();

    await goTo(page, 'Ventas');
    // El historial puede tardar en cargar con la BD remota (hallazgo H-FE-02); se espera la fila hasta 30 s.
    const row = page.getByRole('row').filter({ hasText: queso.name });
    await expect(row).toContainText('0,75 kg', { timeout: 30_000 });
    await expect(row).toContainText('Transferencia');
    await expect(row).toContainText('Vendedor');
  });

  test('E2E-06: con stock insuficiente la venta se rechaza y el stock no cambia (TC-SALE-002)', async ({ page, request }) => {
    const aceite = await seedProduct(request, { name: `Aceite ${unique()}`, unit: 'UNIT', price: 9000, initialStock: 2 });

    await login(page, 'SELLER');
    await goTo(page, 'Nueva venta');
    await page.getByLabel('Producto', { exact: true }).selectOption(aceite.id);
    await page.getByLabel(/^Cantidad/).fill('3');
    await page.getByRole('button', { name: 'Agregar a la venta' }).click();
    await page.getByRole('button', { name: 'Confirmar venta' }).click();

    const alert = appAlert(page);
    await expect(alert).toContainText('No se pudo confirmar la venta');
    await expect(alert).toContainText('disponible 2, solicitado 3');
    await goTo(page, 'Productos');
    await expect(page.getByRole('row').filter({ hasText: aceite.name }).getByRole('cell', { name: '2 unidad' })).toBeVisible();
  });

  test('E2E-07 (re-test H-FE-01): a 1280 px la tabla de productos no se desborda', async ({ page, request }) => {
    const p = await seedProduct(request, { name: `Producto con nombre largo ${unique()}`, unit: 'UNIT', price: 1000, initialStock: 1 });

    await login(page, 'ADMIN');
    await goTo(page, 'Productos');
    const button = page.getByRole('row').filter({ hasText: p.name }).getByRole('button', { name: 'Desactivar' });
    await button.scrollIntoViewIfNeeded(); // la tabla puede quedar debajo del formulario; lo que se verifica es el ancho
    await expect(button).toBeInViewport({ ratio: 1 });
    const overflow = await page.locator('[data-slot="table-container"]').first().evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
