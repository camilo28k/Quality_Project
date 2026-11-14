# Ejecución 2026-11-10 — Etapa 3: catálogo y ventas contra Supabase

**Ambiente:** API NestJS local (`node dist/main`, puerto 4000) conectada a PostgreSQL en Supabase (us-east-2, pooler).
**Herramienta:** script `fetch` de Node con cuentas del seed. Es una verificación técnica del backend; no reemplaza las pruebas de caja negra en navegador ni las de Postman.
**Datos:** cada ejecución crea su propia categoría y productos con un sufijo único, para no depender de ejecuciones anteriores.

## Escenarios

| ID | Escenario | Obtenido | Estado |
|---|---|---|---|
| C1 | SWR-CAT-001 crear categoría | 201 | PASS |
| C2 | AJ-06 nombre duplicado sin distinguir mayúsculas | 409 | PASS |
| C3 | TC-SEC-001 vendedor invoca función administrativa | 403 | PASS |
| P1 | SWR-PROD-001 registrar producto completo | 201, stock 10 | PASS |
| P2 | SWR-PROD-001 campos obligatorios faltantes | 400 (7 mensajes) | PASS |
| S1 | TC-SALE-001 stock 10, vender 3 → stock 7 | 201, total 7500, stock 7 | PASS |
| S2 | SWR-SALE-003/004 subtotal y total (3 × 2500) | subtotal 7500, total 7500 | PASS |
| S3 | TC-SALE-002 stock 2, vender 3 → rechazo | 409 «Stock insuficiente … disponible 2, solicitado 3», stock 2 | PASS |
| S4 | TC-MED-001 vender 0,75 kg | 201, 0.75 KG, subtotal 9000, stock 1.25 | PASS |
| S5 | SWR-MED-004 cantidad 0 rechazada | 400 «La cantidad debe ser mayor que cero» | PASS |
| S6 | Venta con dos líneas del mismo producto, medio tarjeta | 201, CARD, stock 5 | PASS |
| S7 | TC-REL-001 repetir la misma solicitud | replayed true, misma venta, stock 5 | PASS |
| S8 | SWR-SALE-010 tres envíos simultáneos con la misma clave | 201/201/201, una sola venta, stock 4 | PASS |
| D1 | TC-DATA-001 cambiar precio no altera la venta histórica | precio nuevo 3000; la venta conserva 2500 | PASS |
| D2 | SWR-PROD-005 desactivar sin borrar historial | no visible para vendedor; venta histórica consultable | PASS |
| D3 | Producto inactivo no se puede vender | 400 | PASS |

## Extracto de logs

```json
{"timestamp":"2026-11-10T09:53:18.888-05:00","level":"WARN","context":"RolesGuard","event":"AUTHZ_DENIED","message":"Acceso denegado por rol","metadata":{"userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82","role":"SELLER","required":["ADMIN"],"method":"POST","path":"/categories"}}
{"timestamp":"2026-11-10T09:53:29.611-05:00","level":"INFO","context":"SalesService","event":"SALE_CONFIRMED","message":"Venta confirmada","metadata":{"saleId":"502c58a5-628b-4736-9bcd-1d08176495e6","userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82","lines":1,"total":7500,"paymentMethod":"CASH","durationMs":2633}}
{"timestamp":"2026-11-10T09:53:34.010-05:00","level":"WARN","context":"SalesService","event":"SALE_REJECTED_STOCK","message":"Venta rechazada por stock insuficiente","metadata":{"userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82","shortages":[{"productId":"1d3bf9ad-a6dd-4abe-9418-cd2b3536a277","available":2,"requested":3}]}}
{"timestamp":"2026-11-10T09:53:50.833-05:00","level":"INFO","context":"SalesService","event":"SALE_REPLAYED","message":"Solicitud repetida; se devuelve la venta existente sin descontar inventario","metadata":{"saleId":"502c58a5-628b-4736-9bcd-1d08176495e6","userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82"}}
{"timestamp":"2026-11-10T09:53:56.722-05:00","level":"INFO","context":"SalesService","event":"SALE_CONFIRMED","message":"Venta confirmada","metadata":{"saleId":"e4cfa371-b4f1-4747-944f-46079235fbf9","userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82","lines":1,"total":2500,"paymentMethod":"CASH","durationMs":2610}}
{"timestamp":"2026-11-10T09:53:58.035-05:00","level":"INFO","context":"SalesService","event":"SALE_REPLAYED","message":"Solicitud repetida; se devuelve la venta existente sin descontar inventario","metadata":{"saleId":"e4cfa371-b4f1-4747-944f-46079235fbf9","userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82"}}
{"timestamp":"2026-11-10T09:53:58.396-05:00","level":"INFO","context":"SalesService","event":"SALE_REPLAYED","message":"Solicitud repetida; se devuelve la venta existente sin descontar inventario","metadata":{"saleId":"e4cfa371-b4f1-4747-944f-46079235fbf9","userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82"}}
```

Las tres últimas líneas corresponden al escenario S8: tres envíos simultáneos producen un `SALE_CONFIRMED` y dos `SALE_REPLAYED`.
Se revisó el log completo: no contiene contraseñas, tokens ni la cadena de conexión.

## Hallazgo

- **Rendimiento de confirmación de venta (riesgo, característica ISO 25010: eficiencia de desempeño).** Las 4 ventas confirmadas tardaron entre **2610 y 2838 ms** según `durationMs`. SWR-PERF-001 propone que el 95 % de las operaciones de venta respondan en 2 s o menos. Es una medición aislada (1 usuario, red local → us-east-2), no una prueba de carga, pero ya supera el objetivo.
  - **Causa probable:** la transacción hace unas 6 a 8 idas y vueltas secuenciales a la BD remota (lectura de productos, descuento por producto, creación de venta, movimientos), cada una con la latencia de red a Supabase.
  - **Mejoras posibles:** agrupar escrituras, usar una región de Supabase más cercana o desplegar el backend en la misma región de la BD. Registrar en `11_Errores_Defectos_Fallas_Incidentes.xlsx` y en `12_ISO25010.xlsx`.
