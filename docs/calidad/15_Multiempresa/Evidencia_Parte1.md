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

## Migración aplicada en Supabase (2026-11-26)
| Dato | Antes | Después |
|---|---|---|
| Usuarios / categorías / productos | 6 / 74 / 182 | 6 / 74 / 182 |
| Ventas / líneas / movimientos | 323 / 416 / 593 | 323 / 416 / 593 |
| Stock total / total vendido | 29844,250 / $812.600 | 29844,250 / $812.600 |
| Filas sin `companyId` | — | 0 en todas las tablas |
| Empresas | — | 1 (empresa inicial) |

`prisma migrate status`: al día. `migrate diff` contra el esquema: sin diferencias.

### Re-medición de FAL-01 contra Supabase
| Prueba | Resultado |
|---|---|
| Carrera 3 y 10 compradores | PASS (1 venta, stock final 0) |
| 40 ventas secuenciales | **32/40 ≤ 2 s** (mediana 1748 ms, p95 2724 ms) |
| 20 ventas concurrentes | **7/20 ≤ 2 s** (mediana 2321 ms, p95 3669 ms) |
| Ida y vuelta `SELECT 1` medida el mismo día | mín 567 ms · **mediana 801 ms** · máx 1032 ms |

**Análisis.**
- La venta sigue haciendo 2 idas y vueltas a la BD; la prueba de caja blanca del camino D lo verifica.
- La mediana de la venta (1748 ms) equivale a unas 2,2 veces la ida y vuelta medida hoy (801 ms), frente a los ~580 ms medidos cuando se cerró FAL-01.
- La degradación es consistente con una red o un pooler más lentos ese día, no con consultas adicionales. Aun así, **no se puede afirmar que FAL-01 se cumpla hoy contra Supabase**: queda como observación abierta (OBS-MT-01) hasta repetir la medición en otro momento o con la BD en una región más cercana.

### Segunda medición, con el código de `main` (2026-11-26, tarde)
La primera re-medición programada no fue válida: compiló código de la parte 3 sin su migración en Supabase y las ventas respondieron 400. Se repitió con un checkout limpio de `main`.

**Corrección de criterio.** Las corridas «concurrentes» anteriores usaban los mismos 2 productos en las 20 ventas. Ese es el riesgo residual que ya estaba documentado al cerrar FAL-01: las ventas del mismo producto esperan en cola. El cierre de FAL-01 (60/60) se midió en modo «distintos», con un producto por venta, así que solo ese modo es comparable.

| Prueba (Supabase, código de `main`) | Resultado | Al cerrar FAL-01 |
|---|---|---|
| Ida y vuelta `SELECT 1` | mediana 579 ms y luego 679 ms | ~580 ms |
| 40 ventas secuenciales | 36/40 y 39/40 ≤ 2 s (p95 2126 / 1681 ms) | 40/40 |
| 20 concurrentes, productos distintos, 3 corridas | 20/20 · 20/20 · 10/20 | 20/20 · 20/20 · 20/20 |
| 20 concurrentes, mismos 2 productos | 7/20 y 1/20 | (riesgo residual documentado) |

**Conclusión honesta.**
- El comportamiento es el mismo que cuando se cerró FAL-01 en 2 de 3 corridas concurrentes y en la mayoría de las secuenciales.
- La tercera corrida concurrente fue unos 700 ms más lenta en todas sus ventas, lo que apunta a la red o al pooler.
- **OBS-MT-01 queda abierta**: no se puede afirmar un cumplimiento estable del 95 % contra Supabase. La mitigación de fondo es fuera del código: una región de BD más cercana o un despliegue en la misma región.
