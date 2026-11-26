# Multiempresa — Parte 3: catálogo, stock y auditoría

Rama: `feature/multiempresa-parte3`. Requisitos: SWR-ROLE-003, SWR-CAT-D01, SWR-STK-001, SWR-AUD-001.
Decisión (a) aplicada: **el vendedor solo sugiere precios**.

## Qué cambió
- **Migración** `20261127120000_multiempresa_parte3`:
  - Tablas `AuditLog` y `PriceChangeRequest`.
  - Nuevas columnas `Product.approved`, `description`, `createdById` y `updatedById`, e `InventoryMovement.reason`.
  - Nuevos tipos de movimiento `ADJUSTMENT_OUT` y `VOID_RETURN`.
  - Un **trigger que impide `UPDATE` y `DELETE` en `AuditLog`**.
  - Asigna `createdById` a los productos existentes según su movimiento INITIAL.
- **Auditoría (`/audit`):**
  - Registra quién, rol, empresa, acción, entidad, antes/después y motivo, en la misma transacción que el cambio.
  - Nunca guarda contraseñas.
  - El ADMIN ve la de su empresa; el SUPER_ADMIN, todas o filtradas por empresa.
- **Categorías:** solo el ADMIN las crea, renombra, desactiva o reactiva, y las elimina. Eliminar solo se permite si la categoría no tiene productos.
- **Productos:**
  - El vendedor los crea **pendientes de aprobación**: no se venden hasta que el ADMIN los aprueba y fija el precio.
  - El vendedor solo edita nombre y descripción. El precio lo propone con una solicitud.
  - El ADMIN edita todo, desactiva, reactiva y elimina. Eliminar solo se permite si el producto nunca se vendió; de lo contrario responde 409 y sugiere desactivar.
- **Stock:**
  - Entradas con motivo (ADMIN y vendedor).
  - Bajas con motivo solo para el ADMIN. Son atómicas: no se puede dejar el stock negativo.
  - Historial de movimientos.
- **Revisión (`/review`):** productos por aprobar, solicitudes de precio (aprobar o rechazar, con resolución única aunque dos ADMIN actúen a la vez) y cambios de precio de los últimos 30 días.
- **Venta:** la sentencia atómica ya no vende productos sin aprobar.
- **Pantallas:**
  - Productos, con acciones según el rol (Editar, Stock, Proponer precio, Desactivar o Activar, Eliminar).
  - Categorías (Renombrar, Desactivar o Activar, Eliminar).
  - `/dashboard/revision` y `/dashboard/auditoria`.

## Defecto encontrado y corregido durante la parte
**DEF-MT-01: el vendedor no podía editar la descripción (403).**
- **Causa:** el `ValidationPipe` entrega el DTO con los campos no enviados en `undefined`, y la validación de permisos los contaba como enviados.
- **Corrección:** solo cuentan los campos con valor.
- **Prueba de regresión:** en `catalog-parte3.spec.ts`. Lo detectó `scripts/catalogo-auditoria.mjs` contra la API real.

## Evidencia (BD PostgreSQL local)
| Prueba | Resultado |
|---|---|
| Migración sobre la copia local | Aplicada; `migrate diff` sin diferencias; el trigger rechaza `DELETE` en `AuditLog` |
| Jest (backend) | 131/131 PASS (18 suites) |
| Vitest + RTL (frontend) | 31/31 PASS (RTL-MT-11 a RTL-MT-17 nuevos) |
| Lint y typecheck (backend y frontend) | OK |
| `scripts/catalogo-auditoria.mjs` | 43/43 PASS |
| `scripts/aislamiento-empresas.mjs` | 32/32 PASS |
| Carrera de stock (5 compradores) | PASS |
| Postman | 31/31 aserciones |

### Flujo en el navegador (Docker + BD local)
1. El vendedor Carlos ve el formulario con el aviso de aprobación pendiente.
2. Crea «Café molido 250 g», que queda pendiente, y propone subir la gaseosa de $2.500 a $2.800.
3. La ADMIN Rosa ve las dos cosas en Revisión. Aprueba el café con un precio final de $8.500 y aprueba el nuevo precio.
4. La Auditoría muestra cada acción con quién, rol, antes → después y motivo.

## Pendiente
- Aplicar esta migración en Supabase antes de pasar a qa (requiere autorización).
