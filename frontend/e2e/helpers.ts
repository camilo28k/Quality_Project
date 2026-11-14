import { expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';

export const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:4000';

export function credentials(role: 'ADMIN' | 'SELLER') {
  const prefix = role === 'ADMIN' ? 'SEED_ADMIN' : 'SEED_SELLER';
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`Faltan ${prefix}_EMAIL / ${prefix}_PASSWORD`);
  return { email, password };
}

/** Sufijo único: cada prueba crea sus propios datos y no depende de otra ejecución. */
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function login(page: Page, role: 'ADMIN' | 'SELLER') {
  const { email, password } = credentials(role);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  // fill() guarda el texto escrito en el reporte HTML; la contraseña se asigna sin registrarla.
  // El formulario lee los campos con FormData, así que basta con el valor del input.
  await page.getByLabel('Contraseña').evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
  }, password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Crea categoría y producto directamente en la API (preparación de datos, no es lo que se prueba). */
export async function seedProduct(
  _fixture: unknown,
  product: { name: string; unit: 'UNIT' | 'KG' | 'LB'; price: number; initialStock: number }
) {
  // Contexto propio, fuera del fixture de la prueba: así el reporte no guarda el cuerpo con la contraseña.
  const request: APIRequestContext = await playwrightRequest.newContext();
  const login = await request.post(`${BACKEND}/auth/login`, { data: credentials('ADMIN') });
  const { accessToken } = await login.json();
  const headers = { authorization: `Bearer ${accessToken}` };
  const category = await (
    await request.post(`${BACKEND}/categories`, { headers, data: { name: `E2E ${unique()}` } })
  ).json();
  const res = await request.post(`${BACKEND}/products`, {
    headers,
    data: { ...product, categoryId: category.id, cost: Math.round(product.price * 0.7), minStock: 1 }
  });
  expect(res.status()).toBe(201);
  const created = (await res.json()) as { id: string; name: string };
  await request.dispose();
  return created;
}

/** Menú lateral: evita confundir sus enlaces con las tarjetas de acceso rápido del panel. */
export const sidebar = (page: Page) => page.locator('[data-sidebar="sidebar"]').first();

/** Alerta de la aplicación (Next también usa role="alert" para su anunciador de rutas). */
export const appAlert = (page: Page) => page.locator('[data-slot="alert"][role="alert"]');

/** Navega por el menú y espera el encabezado de la página destino (evita escribir en la página anterior). */
export async function goTo(page: Page, link: string, heading = link) {
  await sidebar(page).getByRole('link', { name: link, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}
