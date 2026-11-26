# Multiempresa — Parte 1: empresas, aislamiento y roles

Rama: `feature/multiempresa-parte1` (desde `develop`). Fecha: 2026-11-26.
Requisitos: SWR-TEN-001, SWR-TEN-002, SWR-TEN-003, SWR-ROLE-001, SWR-ROLE-002 (extensión post-MVP, ver `Diseno_Fase1.md` §7).

## Qué cambió
- **Modelo:** `Company`, rol `SUPER_ADMIN`, `companyId` en `User`, `Category`, `Product`, `InventoryMovement` y `Sale`.
  Unicidad por empresa: `Category(companyId, name)` y `Sale(companyId, idempotencyKey)`.
  `CHECK`: solo el SUPER_ADMIN no tiene empresa.
- **Migración** `20261126120000_multiempresa_parte1`: crea la empresa inicial (`00000000-0000-4000-8000-000000000001`) y le asigna todos los datos existentes.
- **Sesión:** el token y la validación llevan la empresa. Una empresa desactivada impide iniciar sesión y sus sesiones abiertas se invalidan al momento.
- **Aislamiento:** catálogo, ventas y usuarios filtran por la empresa de la sesión.
  - Un recurso de otra empresa responde 404 y registra `AUTHZ_DENIED` con `reason: CROSS_TENANT`.
  - La sentencia atómica de venta solo bloquea y descuenta productos de la empresa.
- **Vendedor:** ve solo sus ventas. Si pide una venta de otro vendedor, recibe 404 y queda el log `NOT_OWNER`.
- **SUPER_ADMIN:** `/platform/companies` (crear, editar, activar/desactivar, crear ADMIN con contraseña temporal).
  Actúa dentro de una empresa con `X-Company-Id` y queda el log `SUPERADMIN_TENANT_ACCESS`.
  No vende.
- **ADMIN:** `/users` para crear, editar, activar y desactivar vendedores de su empresa. No puede tocar otros ADMIN.
- **Seed:** crea el SUPER_ADMIN (`SEED_SUPERADMIN_EMAIL/PASSWORD`).

## Evidencia (base de datos PostgreSQL 17 local en Docker, no Supabase)
| Prueba | Resultado |
|---|---|
| Migración sobre una copia con datos (2 usuarios, 2 categorías, 3 productos, 6 ventas, 8 líneas, 11 movimientos) | Mismos conteos después; 0 filas sin `companyId`; `prisma migrate diff` sin diferencias |
| Jest (backend) | 97/97 PASS, 13 suites (antes 67) |
| `npm run lint:ci` y umbrales de cobertura del Quality Gate | OK |
| `scripts/aislamiento-empresas.mjs` (dos empresas reales vía API) | 26/26 PASS |
| `scripts/carrera-stock.mjs` 3, 5 y 10 compradores | PASS: siempre 1 venta, stock final 0 |
| `scripts/medir-venta.mjs` 40 secuenciales | 40/40 ≤ 2 s (p95 21 ms, BD local) |
| `scripts/medir-venta.mjs` 20 concurrentes | 20/20 ≤ 2 s (p95 82 ms, BD local) |
| Postman (Newman) | 19 solicitudes, 31 aserciones, 0 fallas |
| Logs | `AUTHZ_DENIED` (5 con `CROSS_TENANT`), `COMPANY_*`, `USER_CREATED`, `SUPERADMIN_TENANT_ACCESS`; 0 contraseñas en el log |

## Pendiente
- **Aplicar la migración en Supabase** (requiere autorización): sin ella, el código nuevo no funciona contra la BD actual.
- **Repetir los tiempos en Supabase.** Los tiempos medidos aquí son con BD local y no reemplazan la medición de FAL-01 contra Supabase (~580 ms por ida y vuelta).
- **Frontend sin cambios en esta parte.** No hay pantallas de empresas ni de vendedores (Fase 3). Playwright no se volvió a ejecutar.
- **Auditoría persistente (`AuditLog`):** llega en la parte 3. Por ahora las acciones quedan en los logs estructurados.
