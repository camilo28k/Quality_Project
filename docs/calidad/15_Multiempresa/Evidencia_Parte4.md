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

## Pendiente
- Aplicar la migración en Supabase y **medir FAL-01 allí**. El consecutivo bloquea brevemente la fila de la empresa dentro de la misma sentencia, y hay que comprobar que no empeora los tiempos.
- Enviar la factura por correo (parte 5).
