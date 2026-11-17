# Pruebas de frontend con Vitest + React Testing Library

**Código:** `frontend/src/features/**/*.test.tsx` · **Ejecución:** desde `frontend/`, `npm test` (13 pruebas). Con cobertura: `npm run test:cov`.

| ID | Prueba | SWR / criterio |
|---|---|---|
| RTL-01 | Campos obligatorios del login | SWR-AUTH-001, SWR-USE-002 |
| RTL-02 | Credenciales incorrectas → mensaje general | SWR-AUTH-002 |
| RTL-03 | Login correcto → entra al panel | SWR-AUTH-001 |
| RTL-04 | Producto: identifica cada campo faltante | SWR-PROD-001 |
| RTL-05 | Producto por unidad no admite stock decimal | SWR-PROD-001, SWR-MED-002 |
| RTL-06 | Alta de producto por kg | SWR-PROD-001 |
| RTL-07 | Estado de carga y luego la lista | SWR-PROD-001 |
| RTL-08 | Lista vacía | SWR-PROD-001 |
| RTL-09 | Desactivar exige confirmación | SWR-PROD-005 |
| RTL-10 | Subtotales y total (unidades y kg) | SWR-SALE-003, SWR-SALE-004, SWR-MED-002 |
| RTL-11 | Cantidad decimal en unidad y cantidad cero | SWR-MED-002 |
| RTL-12 | Mensaje de stock insuficiente | SWR-SALE-007 |
| RTL-13 | Doble clic envía una sola venta | SWR-SALE-010 |

Las pruebas no usan el backend ni la base de datos: `mockFetch` (`src/test/mock-fetch.ts`) reemplaza `fetch` y responde según el método y la ruta. Así se prueba el comportamiento visible del componente, de forma rápida y repetible.

---

## Explicación línea por línea de 3 pruebas (guía §11)

### RTL-02 — credenciales incorrectas (`features/auth/login-form.test.tsx`)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { LoginForm } from './login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() })
}));

test('RTL-02: con credenciales incorrectas muestra el mensaje general y no navega', async () => {
  mockFetch({
    'POST /api/auth/login': () => ({ status: 401, body: { message: 'Correo o contraseña incorrectos' } })
  });
  render(<LoginForm />);

  await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'admin@tiendapp.test');
  await userEvent.type(screen.getByLabelText(/contraseña/i), 'incorrecta');
  await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  expect(replace).not.toHaveBeenCalled();
});
```

| Elemento | Explicación |
|---|---|
| **Imports** | `render` monta el componente en un DOM simulado (jsdom). `screen` busca elementos en ese DOM. `userEvent` simula acciones reales del usuario: teclear, hacer clic. De `vitest` vienen `test`, `expect` y `vi` (mocks). `mockFetch` es nuestro reemplazo de `fetch`. `LoginForm` es el componente bajo prueba |
| **Mock de `next/navigation`** | `useRouter` solo existe dentro de Next. Se reemplaza por un objeto con `replace = vi.fn()`, una función espía que registra si se llamó. Así podemos comprobar si el formulario intentó navegar al panel |
| `mockFetch({...})` | Cuando el formulario haga `POST /api/auth/login`, la respuesta será 401 con el mensaje del backend. Simula el caso de credenciales incorrectas sin servidor real |
| `render(<LoginForm />)` | Monta el formulario de inicio de sesión |
| `screen.getByLabelText(/correo electrónico/i)` | Busca el campo por su **etiqueta visible**, como lo haría una persona (o un lector de pantalla). Si la etiqueta no estuviera asociada al input, la prueba fallaría: también verifica accesibilidad |
| `userEvent.type(...)` | Escribe el correo y una contraseña incorrecta tecla por tecla, disparando los mismos eventos que el navegador |
| `userEvent.click(screen.getByRole('button', { name: /ingresar/i }))` | Busca el botón por su rol y su nombre accesible y hace clic: envía el formulario |
| `await screen.findByRole('alert')` | `findBy` **espera** (hasta el tiempo límite) a que aparezca un elemento con rol `alert`, porque la respuesta llega de forma asíncrona |
| `expect(...).toHaveTextContent('Correo o contraseña incorrectos')` | Verifica SWR-AUTH-002: el usuario ve un mensaje **general** que no revela si el correo existe |
| `expect(replace).not.toHaveBeenCalled()` | Verifica que **no** se navegó al panel: con credenciales incorrectas no hay sesión |

### RTL-09 — desactivar exige confirmación (`features/products/products-view.test.tsx`)

```tsx
test('RTL-09: desactivar exige confirmación antes de llamar a la API (SWR-PROD-005)', async () => {
  const fetchMock = mockFetch({
    'GET /api/backend/products?includeInactive=true': () => ({ body: [arroz] }),
    'GET /api/backend/categories': () => ({ body: [] }),
    'PATCH /api/backend/products/p1/deactivate': () => ({ body: { ...arroz, active: false } })
  });
  render(<ProductsView isAdmin />);

  await userEvent.click(await screen.findByRole('button', { name: /desactivar/i }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/¿desactivar «arroz»\?/i)).toBeVisible();
  const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
  expect(patchCalls()).toHaveLength(0);

  await userEvent.click(within(dialog).getByRole('button', { name: /desactivar/i }));

  await vi.waitFor(() => expect(patchCalls()).toHaveLength(1));
});
```

| Elemento | Explicación |
|---|---|
| **Imports** | Además de los anteriores, `within` limita la búsqueda a una parte de la pantalla, aquí el diálogo |
| `mockFetch` con 3 rutas | El administrador carga productos (incluidos inactivos) y categorías; la tercera ruta es la desactivación. `fetchMock` se guarda para inspeccionar qué llamadas se hicieron |
| `render(<ProductsView isAdmin />)` | Monta la pantalla de productos con permisos de administrador (así aparece el botón «Desactivar») |
| `await screen.findByRole('button', { name: /desactivar/i })` | Espera a que cargue la tabla y encuentra el botón de la fila de Arroz |
| `userEvent.click(...)` | El usuario pide desactivar |
| `await screen.findByRole('alertdialog')` | Espera el diálogo de confirmación. `alertdialog` es el rol accesible de un diálogo que exige una decisión |
| `within(dialog).getByText(/¿desactivar «arroz»\?/i)` + `toBeVisible()` | El diálogo nombra el producto: el usuario sabe qué va a desactivar |
| `patchCalls()` + `toHaveLength(0)` | **Hasta aquí no se llamó a la API.** Es lo central de la prueba: abrir el diálogo no desactiva nada (seguridad operacional, ISO 25010) |
| `userEvent.click(within(dialog).getByRole('button', { name: /desactivar/i }))` | El usuario confirma con el botón **del diálogo** (`within` evita confundirlo con el botón de la tabla) |
| `await vi.waitFor(() => expect(patchCalls()).toHaveLength(1))` | Reintenta hasta que se haga **exactamente una** llamada `PATCH` de desactivación |
| **Mock** | `fetch` se reemplaza para no depender del backend y para poder **contar** las llamadas: la diferencia entre 0 y 1 es justo lo que se verifica |

### RTL-13 — doble clic envía una sola venta (`features/sales/new-sale.test.tsx`)

```tsx
test('RTL-13: doble clic en confirmar envía una sola solicitud con clave de idempotencia (SWR-SALE-010)', async () => {
  let resolveSale: (v: { status?: number; body: unknown }) => void = () => {};
  const fetchMock = mockFetch({
    'GET /api/backend/products': () => ({ body: products }),
    'POST /api/backend/sales': () => new Promise((r) => (resolveSale = r))
  });
  render(<NewSale />);
  await screen.findByLabelText(/^producto$/i);
  await addLine('Arroz', '2');

  const confirm = screen.getByRole('button', { name: /confirmar venta/i });
  await userEvent.dblClick(confirm);

  expect(confirm).toBeDisabled();
  const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1);
  const body = jsonBody(posts[0][1]);
  expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(body).toMatchObject({ paymentMethod: 'CASH', items: [{ productId: 'p1', quantity: 2 }] });

  resolveSale({ status: 201, body: { replayed: false, sale: { id: 's1', total: 5000, paymentMethod: 'CASH', items: [{}] } } });
  expect(await screen.findByText(/venta confirmada/i, { selector: '[data-slot="alert-title"]' })).toBeVisible();
  await vi.waitFor(() => expect(screen.queryByRole('cell', { name: 'Arroz' })).not.toBeInTheDocument());
});
```

| Elemento | Explicación |
|---|---|
| **Imports** | Los mismos, más `jsonBody`, que lee el cuerpo JSON enviado en una llamada a `fetch` |
| `let resolveSale` | Guardará la función que «responde» la venta. Permite dejar la solicitud **pendiente** el tiempo que la prueba necesite |
| Ruta `POST /api/backend/sales` | Devuelve una promesa que no se resuelve sola: simula un servidor lento, el caso real en que el usuario hace doble clic (FAL-01) |
| `render(<NewSale />)` + `findByLabelText(/^producto$/i)` | Monta la pantalla de venta y espera a que carguen los productos |
| `addLine('Arroz', '2')` | Función auxiliar del archivo: elige el producto, escribe la cantidad y pulsa «Agregar a la venta» |
| `userEvent.dblClick(confirm)` | Simula el **doble clic** sobre «Confirmar venta» |
| `expect(confirm).toBeDisabled()` | Mientras la venta está en curso, el botón queda deshabilitado |
| `posts` + `toHaveLength(1)` | Se envió **una sola** solicitud aunque hubo dos clics |
| `body.idempotencyKey` con formato UUID | La solicitud lleva la clave con la que el backend reconoce una repetición y no descuenta dos veces (SWR-SALE-010, TC-REL-001) |
| `toMatchObject({ paymentMethod: 'CASH', items: [...] })` | Se envían el medio de pago por defecto y la línea agregada (2 unidades de p1) |
| `resolveSale({...})` | Ahora el «servidor» responde 201 |
| `findByText(/venta confirmada/i, { selector: ... })` | Aparece el aviso de éxito. El `selector` toma el título del aviso y no el botón, que también contiene la palabra |
| `vi.waitFor(... queryByRole('cell', { name: 'Arroz' }) ... not.toBeInTheDocument())` | Después de confirmar, el carrito se vacía. `queryBy` devuelve `null` en vez de fallar cuando el elemento no existe |
| **Mock** | Controlar *cuándo* responde el servidor es lo que permite probar el doble clic; con un backend real la respuesta podría llegar antes del segundo clic y la prueba no demostraría nada |

---

**Comprobación de que las pruebas detectan errores:** al reemplazar a propósito el cálculo del subtotal por `return unitPrice`, RTL-10 falló. Se restauró el código y volvió a pasar (ver `13_Shift_Right_Logs/2026-11-10_etapa4_frontend_navegador.md`).
