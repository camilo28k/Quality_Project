# Multiempresa — Parte 4: factura, anulación y reemisión

Rama: `feature/multiempresa-parte4`. Requisitos: SWR-INV-001, SWR-INV-002, SWR-SALE-V01, SWR-SALE-V02, SWR-SALE-V03.

## Qué cambió
- **Migración** `20261128120000_multiempresa_parte4`:
  - Nuevas columnas en `Sale`: `invoiceNumber` (único por empresa), `status` (`CONFIRMED` o `VOIDED`), `customerEmail`, `voidedAt`, `voidedById`, `voidReason` y `correctsSaleId` (único).
  - Tabla `SaleCorrectionRequest`.
  - Numera las ventas existentes de cada empresa en orden de creación y deja el contador después de la última.
- **Consecutivo de factura (SWR-INV-001):**
  - Se asigna **dentro de la misma sentencia atómica de la venta**, después de la guardia de stock.
  - Si la venta se aborta por stock o por clave repetida, el contador también se deshace: no quedan huecos ni duplicados.
  - El orden de bloqueo es productos → empresa, así que no hay ciclos de espera.
  - La venta sigue haciendo 2 idas y vueltas a la BD.
- **Factura (SWR-INV-002):** `GET /sales/:id/invoice` y la pantalla `/dashboard/ventas/[id]`, imprimible. Muestra:
  - Empresa: nombre, NIT, dirección, teléfono, correo, logo y nota al pie.
  - Consecutivo, vendedor, medio de pago, cliente, detalle y total.
  - Un sello si la factura está anulada.
- **Anular (SWR-SALE-V01, solo ADMIN):**
  - Exige motivo.
  - La venta **no se borra ni se edita**: queda en `VOIDED`.
  - En la misma transacción se devuelve el stock (movimientos `VOID_RETURN`), se resuelven las solicitudes pendientes y se registra en la auditoría.
  - Si dos ADMIN anulan a la vez, solo uno gana.
- **Reemitir (SWR-SALE-V02, solo ADMIN):**
  - En una sola transacción se anula la original y se registra una venta nueva **a nombre del mismo vendedor**, con un consecutivo nuevo y vinculada por `correctsSaleId`.
  - Si la nueva no se puede registrar (por ejemplo, por stock), **no se anula nada**.
- **Solicitar corrección (SWR-SALE-V03):**
  - El vendedor solo puede pedirla sobre sus ventas confirmadas, con motivo y sin otra solicitud pendiente.
  - El ADMIN las ve en Revisión y las resuelve anulando o reemitiendo, o las rechaza.
- **Correo del cliente:** opcional (decisión c) en la venta. Se usa en la parte 5.

## Evidencia (BD PostgreSQL local)
| Prueba | Resultado |
|---|---|
| Migración sobre la copia local con 104 ventas | Numeradas FAC-1..FAC-83 (empresa inicial), contador en 84, sin diferencias de esquema |
| Jest (backend) | 162/162 PASS; Quality Gate de cobertura OK |
| Vitest + RTL (frontend) | 36/36 PASS (RTL-MT-18 a RTL-MT-22 nuevos) |
| Lint y typecheck | OK |
| `scripts/anulacion-factura.mjs` | **26/26 PASS** (ver abajo) |
| Catálogo y auditoría / aislamiento / carrera 3 y 10 / Postman | 43/43 · 32/32 · PASS · 31/31 |
| Tiempos con BD local: 40 secuenciales / 20 concurrentes distintos | 40/40 · 20/20 ≤ 2 s |

### Qué verifica `anulacion-factura.mjs`
- La primera factura es F-500, según el consecutivo inicial del asistente.
- Una repetición con la misma clave devuelve la misma factura y no consume número.
- En la carrera por la última unidad, la venta rechazada no consume número.
- **10 ventas en paralelo dejan las facturas F-500 a F-512 contiguas y sin repetir.**
- El vendedor no puede anular (403) y sí puede pedir una corrección; una segunda solicitud responde 409.
- La reemisión crea F-514 a nombre del vendedor. El stock queda neto en +2 (devuelve 5 y descuenta 3).
- La original queda ANULADA con su motivo y enlazada a la nueva, y la solicitud queda resuelta.
- Una reemisión sin stock responde 409 **y la original sigue CONFIRMADA**: todo o nada.
- Anular dos veces responde 409. Las ventas nunca se borran.
- La auditoría registra `SALE_CORRECTION_REQUESTED`, `SALE_VOIDED` y `SALE_REISSUED`.

### Flujo en el navegador (Docker + BD local)
1. Carlos vende DR-100 (con correo del cliente) y DR-101, y pide corregir DR-100.
2. Rosa ve «Corrección pedida» en Ventas, abre Reemitir, cambia 5 gaseosas por 3 y ve el total pasar de $22.500 a $16.900.
3. Confirma y aparece **DR-102 «Corrige DR-100»** a nombre de Carlos. DR-100 queda «Anulada · Reemitida como DR-102».
4. La factura DR-100 muestra el sello «FACTURA ANULADA · Eran 3 gaseosas, no 5 · Reemplazada por DR-102», con los datos de la empresa, el NIT, el vendedor y el cliente.

## Migración aplicada en Supabase (2026-11-26)
| Dato | Antes | Después |
|---|---|---|
| Usuarios / categorías / productos | 6 / 84 / 260 | 6 / 84 / 260 |
| Ventas / líneas / movimientos | 545 / 718 / 973 | 545 / 718 / 973 |
| Stock total / total vendido | 51524,250 / $1.134.600 | 51524,250 / $1.134.600 |
| Numeración | — | 545 ventas FAC-1..FAC-545, 545 números distintos, 0 sin número, siguiente FAC-546 |

`prisma migrate status`: al día. `migrate diff`: sin diferencias.

## Medición de FAL-01 contra Supabase con el código de la parte 4
Ida y vuelta `SELECT 1` el mismo día: mín 513 ms · mediana 551 ms · máx 674 ms.

| Ventas simultáneas en **la misma empresa** (productos distintos) | ≤ 2 s | Detalle |
|---|---|---|
| 1 (40 secuenciales) | **40/40** | mediana 1191 ms · p95 1286 ms |
| 3 (3 corridas) | **3/3 · 3/3 · 3/3** | máx 1419 ms |
| 5 (3 corridas) | **5/5 · 5/5 · 5/5** | máx 1576 ms |
| 20 (3 corridas) | **3/20 · 6/20 · 1/20** | mediana 2,4–3,0 s |
| Carrera por la última unidad | PASS | — |

Antes de la parte 4 (código de `main`), las 20 simultáneas dieron 20/20 · 20/20 · 10/20.

### DEF-MT-02 / DEC-MT-01: el consecutivo sin huecos serializa las ventas de una empresa
- **Hallazgo:** para garantizar facturas sin huecos ni duplicados, cada venta toma la fila del contador de su empresa hasta confirmar. Con la latencia de confirmación de Supabase, cada venta simultánea de la **misma** empresa agrega unos 120 ms a las demás. El límite práctico ronda las **7 ventas exactamente simultáneas por empresa**. Las ventas de empresas distintas no se afectan entre sí.
- **Alternativa evaluada:** un contador no transaccional (secuencia) recupera el paralelismo, pero deja **huecos** en la numeración cuando una venta se rechaza o se repite.
- **Decisión del usuario (2026-11-26): mantener el consecutivo sin huecos.**
  - **Motivos:** orden contable y facilidad de auditoría de la numeración (DIAN).
  - **Contexto:** el escenario objetivo es una tienda pequeña de 1 a 3 cajas, donde se cumple con margen (3/3 y 5/5).
  - **Clasificación:** limitación conocida y aceptada, no defecto abierto.
  - **Mitigación futura** si una empresa necesitara más de unas 7 cajas simultáneas: numeración por punto de venta (un contador por caja, con prefijo propio), que reparte la espera.

## Pendiente
- Enviar la factura por correo (parte 5).
