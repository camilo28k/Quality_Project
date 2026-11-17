# 2026-11-16 — Corrección de FAL-01: rendimiento de la confirmación de venta

**Requisito:** SWR-PERF-001: el 95 % de las operaciones de venta debe completarse en 2 s o menos, con hasta 20 usuarios concurrentes. Relacionado: SWR-CAP-001.
**Ambiente:** API NestJS local conectada a Supabase (us-east-2). Mediciones desde el cliente con `backend/scripts/medir-venta.mjs`.

## Diagnóstico

| Medición | Resultado |
|---|---|
| Latencia de una consulta mínima (`SELECT 1`, 8 muestras) | 568–606 ms, mediana **583 ms** |
| Consultas por venta (versión anterior) | ~10: clave de idempotencia, lectura de productos, un `UPDATE` por producto, inserción de venta y líneas con relectura, movimientos, `BEGIN`/`COMMIT` |
| Consulta adicional por solicitud | Validación de sesión: lectura del usuario en cada petición (`JwtStrategy.validate`) |

Con ~580 ms por ida y vuelta, el presupuesto de 2 s admite como máximo 3 consultas.

## Cambios

1. **Lectura conjunta (1 ida y vuelta):** clave de idempotencia y productos en una sola consulta.
2. **Reglas en TypeScript sin BD:** `planSale()` (`src/sales/sale-plan.ts`) valida cantidades, calcula subtotales y total, y detecta faltantes con las mismas reglas probadas de `sale-rules.ts`. Si falta stock, se responde 409 sin escribir.
3. **Escritura atómica (1 ida y vuelta):** una sola sentencia SQL con CTE:
   - bloquea los productos en orden fijo;
   - descuenta stock solo si alcanza;
   - una guardia aborta toda la sentencia si algún producto no se pudo descontar;
   - registra venta, líneas (con precio aplicado) y movimientos.

   Errores de PostgreSQL manejados:
   - `22012` (guardia) → 409 con el stock actual.
   - `23505` (clave repetida) → devuelve la venta existente.
4. **Caché de 30 s del estado de la cuenta** en la validación de sesión (`src/auth/user-status-cache.ts`).
   - **Compromiso:** una desactivación o un cambio de rol tarda hasta 30 s en aplicarse a sesiones abiertas.
   - Las cuentas inactivas o inexistentes no se guardan en caché.

## Defectos encontrados al probar (antes de integrar)

| ID | Hallazgo | Corrección | Re-test |
|---|---|---|---|
| DEF-08 | La guardia `1/0` no se evaluaba porque PostgreSQL omitió una columna que nadie leía. Con stock 1, **3 de 3 ventas simultáneas se registraron** (solo una descontó). | `guard AS MATERIALIZED` + `WHERE guard.ok = 1` | Carreras de 3, 5 y 10 competidores: **1 venta, stock 0**, el resto 409 |
| DEF-09 | 20 ventas simultáneas sobre los mismos productos: 3 respuestas 500 `deadlock detected` (40P01) por bloqueo en distinto orden. | Bloqueo previo en orden fijo por id (`ORDER BY id FOR UPDATE`) | 3 corridas de 20 simultáneas, 0 errores |

Las ventas de DEF-08 quedaron como datos inconsistentes en los productos de prueba «Ultima unidad …» de la BD de desarrollo (4 ventas sin descuento). El defecto nunca llegó a `develop`.

## Resultados (cliente → API → Supabase)

| Escenario | Antes | Después |
|---|---|---|
| Secuencial | 2,6–5,1 s (logs y caja negra) | **40/40 ≤ 2 s** · mediana 1279 ms · p95 1707 ms · máx 1941 ms |
| 20 ventas simultáneas, productos distintos (3 corridas) | — | **60/60 ≤ 2 s** · p95 1815 / 1982 / 1919 ms |
| 20 ventas simultáneas sobre los **mismos** 2 productos | — | 6–7 de 20 ≤ 2 s · mediana 2,3–3,1 s (cola por el bloqueo) |
| `durationMs` en el servidor | 2610–4216 ms | 1162–1661 ms |
| Newman (19 solicitudes) | promedio 1543–3673 ms | promedio **1163 ms** |

**Regresión:**
- `verificacion-api.mjs` 16/16.
- Newman 19/19 (31 assertions).
- Playwright 7/7.
- Jest 67/67 con umbrales de cobertura.
- 0 líneas ERROR en el log.

## Conclusión

FAL-01 queda **cerrado**: SWR-PERF-001 se cumple en el uso secuencial y con 20 usuarios simultáneos vendiendo productos distintos.

**Riesgo residual:** si muchas cajas venden *el mismo* producto en el mismo instante, las ventas se atienden de a una por el bloqueo que evita la sobreventa. Es el comportamiento correcto para la integridad del inventario. Para mejorarlo habría que reducir la latencia de red (API y BD en la misma región).
