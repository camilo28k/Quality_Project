# Pruebas E2E con Playwright — TiendApp

**Código:** `frontend/e2e/` · **Configuración:** `frontend/playwright.config.ts` · **Reporte:** `reporte-html-2026-11-11/index.html`

**Cómo ejecutar** (desde `frontend/`, con el backend en el puerto 4000 y `npm run build` hecho):

```bash
npm run test:e2e
```

Playwright levanta `next start` en el puerto 3002 y lee las cuentas de prueba de `backend/.env`.

## Casos

| ID | Prueba | SWR / TC | Flujo completo |
|---|---|---|---|
| E2E-01 | Ruta protegida sin sesión redirige al login | Guía §5 | |
| E2E-02 | Credenciales incorrectas muestran mensaje general | SWR-AUTH-002 | |
| E2E-03 | Vendedor no ve ni abre Categorías | SWR-AUTH-004 | |
| E2E-04 | Admin: login → categoría → producto → venta de 3 → stock 7 | SWR-CAT-001, SWR-PROD-001, SWR-SALE-003/004/008, TC-SALE-001 | **Sí** |
| E2E-05 | Vendedor: login → venta de 0,75 kg por transferencia → historial | SWR-MED-002, SWR-PAY-001, SWR-SALE-008 | **Sí** |
| E2E-06 | Stock insuficiente: rechazo y stock sin cambios | SWR-SALE-007, TC-SALE-002 | |
| E2E-07 | Re-test H-FE-01: a 1280 px la tabla de productos no se desborda | Hallazgo H-FE-01 | |

## Resultado final (2026-11-11)

**7 de 7 PASS en 1,6 min** (Chromium, 1280×800, un worker).

## Historial de la ejecución (fallos reales y correcciones)

| Intento | Resultado | Causa | Clasificación | Corrección |
|---|---|---|---|---|
| 1 | 2 PASS / 5 FAIL | Locators ambiguos: «Productos» coincidía con el menú y con las tarjetas del panel; `role="alert"` coincidía con el anunciador de rutas de Next | Defecto en las pruebas | Menú con `sidebar()`, alertas con `appAlert()` |
| 2 | 4 PASS / 3 FAIL | E2E-04 escribía el nombre en el formulario de Categorías antes de terminar la navegación; E2E-05 no encontraba la fila del historial en 15 s; E2E-07 buscaba el botón fuera de pantalla | Defecto en las pruebas + lentitud real (H-API-02) | `goTo()` espera el encabezado; espera de 30 s para el historial; `scrollIntoViewIfNeeded` |
| 3 | 6 PASS / 1 FAIL | E2E-07 superó el límite de 60 s por la lentitud de la BD. La captura del fallo ya mostraba la tabla sin desborde | Lentitud real (H-API-02) | Límite por prueba de 120 s |
| 4 | 7 PASS | — | — | — |
| 5 | 7 PASS | Se verificó que el reporte HTML **contenía la contraseña de prueba** (los pasos de `fill()` guardan el texto escrito) | Defecto de seguridad en la evidencia (H-SEC-01) | La contraseña se asigna sin registrarla y la preparación por API usa un contexto propio. Se borró el reporte anterior; el nuevo reporte no la contiene (verificado) |

**Re-test H-FE-01:** PASS (E2E-07). Con 1280 px el formulario se apila sobre la tabla y el botón «Desactivar» queda completo.

**Limitación:** en `login()` la contraseña se asigna al campo con `evaluate` en lugar de escribirla tecla por tecla, para que no quede en el reporte. Escribir en el campo de contraseña se cubre en E2E-02 (contraseña incorrecta) y en la prueba RTL-03.

---

## Explicación de dos pruebas (sustentación)

### E2E-04 — flujo principal del administrador

| Pregunta | Respuesta |
|---|---|
| `page.goto` | `login()` abre `/login`, la puerta de entrada del flujo. Las demás pantallas se abren con clics en el menú, como lo haría el usuario |
| Locators | `getByLabel('Nombre')`, `getByLabel('Precio de venta (COP)')`, `getByRole('button', { name: 'Guardar producto' })`, `getByRole('row').filter(...)`. Buscan lo que el usuario ve (etiquetas, roles, textos) y no clases CSS, así que resisten cambios de estilo y comprueban la accesibilidad |
| Acciones | Llena formularios, elige opciones en los `select`, agrega la línea de venta y confirma |
| `expect` | `sale-total` muestra $ 7.500 antes de confirmar (SALE-003/004); aparece «Venta confirmada»; en Productos la fila muestra «7 unidad» (TC-SALE-001: 10 − 3) |
| Auto-waiting | Playwright espera que cada elemento sea visible y esté habilitado antes de hacer clic o llenar, y repite los `expect` hasta su tiempo límite. No se usa `waitForTimeout` |
| Datos | `unique()` agrega un sufijo a la categoría y al producto, así que la prueba no depende de datos de otra ejecución |

### E2E-05 — venta por peso del vendedor

| Pregunta | Respuesta |
|---|---|
| `page.goto` | Solo en `login()`. La preparación (crear un producto de 2 kg) se hace por API con `seedProduct()`, porque no es lo que se prueba y un vendedor no puede crear productos |
| Locators | `getByLabel('Producto', { exact: true })` evita confundirlo con otras etiquetas; `getByRole('status').filter({ hasText: 'Venta confirmada' })` toma el aviso accesible de la venta |
| Acciones | Escribe «0,75» con coma decimal, como lo haría un usuario en Colombia, elige Transferencia y confirma |
| `expect` | El aviso indica Transferencia; la opción del producto muestra «disp. 1,25» (2 − 0,75); en Ventas la fila contiene «0,75 kg», «Transferencia» y «Vendedor» |
| Auto-waiting | `toContainText` espera hasta 30 s a que la lista de ventas cargue (la BD remota es lenta, H-API-02) |
| Datos | El producto se crea con nombre único en cada ejecución; la prueba no depende de E2E-04 |
