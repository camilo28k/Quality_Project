# Ejecución 2026-11-10 — Etapa 4: flujo principal en el navegador

**Ambiente:** frontend Next.js (`next start`, puerto 3001) + API NestJS (puerto 4000) + Supabase. Navegador integrado de Claude, sesión iniciada por el equipo con la cuenta administrador.
**Tipo:** recorrido manual del flujo principal y revisión visual. No reemplaza los 10 casos de caja negra (guía §8), que el equipo ejecutará y documentará.

## Recorrido

| # | Paso | Resultado observado | Estado |
|---|---|---|---|
| 1 | `/dashboard` sin sesión | Redirige a `/login?next=/dashboard` | PASS |
| 2 | Login con contraseña incorrecta | Alerta «Correo o contraseña incorrectos» | PASS |
| 3 | Crear categoría «Lácteos» | `POST /api/backend/categories` 201; aparece en la lista | PASS |
| 4 | Crear producto «Queso campesino», kg, costo 9000, precio 12000, stock 5, mínimo 1 | `POST /api/backend/products` 201; aviso de éxito; aparece con 5 kg | PASS |
| 5 | Nueva venta: 0,75 kg de Queso campesino, transferencia | Subtotal y total $ 9.000; `POST /api/backend/sales` 201; «Venta confirmada»; stock 5 → 4,25 | PASS |
| 6 | Historial de ventas | La venta aparece con vendedor, detalle y medio de pago; una venta anterior de Arroz conserva el precio $ 2.500 aunque el precio actual es $ 3.000 (TC-DATA-001) | PASS |
| 7 | Etiquetas de los `select` | Cada `select` tiene su `label` asociado (`labels.length = 1`) | PASS |

Capturas en `docs/marca/`: `tiendapp_login_error.jpg`, `tiendapp_dashboard_adaptado.jpg`, `tiendapp_venta_confirmada.jpg`, `tiendapp_historial_ventas.jpg`, `tiendapp_productos_antes_fix.jpg`.

## Hallazgos

| ID propuesto | Hallazgo | Severidad | Estado |
|---|---|---|---|
| H-FE-01 | En Productos, con ventana de 1280 px, la tabla desborda horizontalmente y el botón «Desactivar» queda cortado (`tiendapp_productos_antes_fix.jpg`). Característica ISO 25010: capacidad de interacción / compatibilidad. | Baja | Corregido en código (el formulario se apila sobre la tabla por debajo de 1536 px). **Re-test pendiente** con el servidor reiniciado. |
| H-FE-02 | Confirmar la venta tardó más de 5 s en la interfaz (spinner visible), además de los ~2,7 s medidos en el backend. Confirma el riesgo de rendimiento de la etapa 3 (SWR-PERF-001). | Media | Abierto |
| H-FE-03 | Los procesos de Node quedaron huérfanos al detener las tareas de desarrollo; el `next dev` huérfano respondía 500 en `/api/backend/*` («Jest worker encountered 2 child process exceptions»). Es un incidente del ambiente de desarrollo, no del producto. | Incidente | Mitigado: se levantó un servidor nuevo en el puerto 3001 |
| H-FE-04 | `next build` falló en verificación de tipos: `vi` usado sin importar en `products-view.test.tsx`. Vitest lo aceptaba por `globals: true`. | Baja | Corregido; re-test: `tsc` y `next build` sin errores |
