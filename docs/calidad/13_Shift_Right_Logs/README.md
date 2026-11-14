# Shift Right — observación del sistema en ejecución (guía §18)

## Logs implementados (§18.1)

Formato: una línea JSON por evento con `timestamp` (-05:00), `level`, `context`, `event`, `message` y `metadata`. Implementación: `backend/src/common/logger/app-logger.service.ts`. Las claves `password`, `passwordHash`, `token`, `accessToken`, `authorization` y `secret` se reemplazan por `[REDACTED]`.

| Exigido por la guía | Evento | Nivel |
|---|---|---|
| Inicio de la aplicación | `APP_STARTED` / `APP_START_FAILED` | INFO / ERROR |
| Inicio de sesión correcto y fallido (sin contraseñas) | `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILED` (con `reason`) | INFO / WARN |
| Operación crítica del flujo principal | `SALE_CONFIRMED`, `SALE_REPLAYED`, `PRODUCT_CREATED`, `CATEGORY_CREATED`, `PRODUCT_DEACTIVATED` | INFO |
| Validación rechazada | `VALIDATION_REJECTED`, `SALE_REJECTED_STOCK`, `AUTHZ_DENIED` | WARN |
| Excepción / error | `UNHANDLED_EXCEPTION` (filtro global), `APP_START_FAILED` | ERROR |
| Duración de una operación relevante | `durationMs` en login y en confirmación de venta | — |

## Escenarios (§18.2) — ejecución 2026-11-14

**Ambiente:** API NestJS recién compilada y levantada en el puerto 4100, conectada a Supabase. Escenarios automatizados con `backend/scripts/shift-right.mjs`, que lee las cuentas de prueba de `.env` sin imprimirlas.
**Logs depurados:** `2026-11-14_shift_right_api.jsonl` y `2026-11-14_arranque_sin_bd.jsonl`. Se excluyeron las líneas internas de Nest (`FRAMEWORK`) y se verificó por script que no contienen contraseñas, el `JWT_SECRET` ni la cadena de conexión.

| # | Escenario | Respuesta | Qué se observó en los logs |
|---|---|---|---|
| 1 | **Flujo principal correcto:** login → categoría → producto → venta | 200 → 201 → 201 → 201 | Secuencia INFO completa: `AUTH_LOGIN_SUCCESS` → `CATEGORY_CREATED` → `PRODUCT_CREATED` → `SALE_CONFIRMED` (total 6400, CASH, `durationMs` 4106) |
| 2 | **Credencial incorrecta** | 401 | `WARN AUTH_LOGIN_FAILED`, `reason: BAD_PASSWORD`, solo `userId`; no aparece la contraseña intentada |
| 3 | **Dato inválido:** cantidad 0 y 99 unidades con stock 3 | 400 / 409 | `WARN VALIDATION_REJECTED` con el mensaje por línea; `WARN SALE_REJECTED_STOCK` con `available: 3, requested: 99` |
| 4 | **Error provocado/controlado:** (a) JSON malformado; (b) token alterado; (c) arranque con la BD inalcanzable | 400 / 401 / proceso termina con código 1 | (a) `WARN VALIDATION_REJECTED` «Unexpected end of JSON input»; (b) **sin log** (ver H-SR-02); (c) `ERROR APP_START_FAILED` con `PrismaClientInitializationError` (después de la corrección H-SR-01) |
| 5 | **Operación relevante:** venta, misma solicitud repetida, historial | 201 / 201 / 200 | `SALE_CONFIRMED` (`durationMs` 4216) y luego `SALE_REPLAYED` con el mismo `saleId`: la repetición no descontó stock |

Tiempos observados por el cliente: login 1,2–1,4 s; crear categoría o producto ~3–3,4 s; confirmar venta 4,9–5,1 s; historial 2,6 s; JSON malformado y token alterado 17 ms (no llegan a la BD).

## Hallazgos y lo que aprendimos

| ID | Hallazgo | ISO 25010 | Estado |
|---|---|---|---|
| H-SR-01 | Con la BD inalcanzable, el backend terminaba con un stack de Prisma sin formato, sin evento estructurado: imposible de filtrar en un monitor. | Fiabilidad, mantenibilidad (analizabilidad) | **Corregido:** `main.ts` registra `ERROR APP_START_FAILED` con tipo y motivo del error, sin credenciales. Re-test PASS (`2026-11-14_arranque_sin_bd.jsonl`) |
| H-SR-02 | Un token inválido o vencido se rechaza (401) pero no queda registrado: un intento de acceso con tokens manipulados pasaría inadvertido. | Seguridad (responsabilidad) | Abierto. Mejora: registrar `AUTH_TOKEN_INVALID` (WARN) en `JwtAuthGuard` |
| H-SR-03 | `durationMs` de la venta subió a 4,1–4,2 s (en la etapa 3 eran 2,6–2,8 s). Las operaciones que no tocan la BD responden en 17 ms. La latencia está en las consultas a Supabase y varía según el momento. | Eficiencia de desempeño | Abierto; confirma H-FE-02 y H-API-02 frente a SWR-PERF-001 (2 s) |

**Conclusiones**
- **Los logs permiten reconstruir el flujo completo de una venta** con identificadores no sensibles (`userId`, `saleId`, `productId`), sin datos personales ni contraseñas.
- **El evento `SALE_REPLAYED` es la evidencia en ejecución de que la idempotencia funciona** (SWR-SALE-010).
- **El registro de `durationMs` permitió detectar que el rendimiento varía** entre días; sin él, el problema solo se habría percibido como «a veces está lenta».
- **Probar el arranque sin BD mostró un vacío que ninguna prueba funcional detectaba** (H-SR-01). Es el tipo de hallazgo que justifica Shift Right.

## Ejecuciones anteriores

- `2026-11-10_etapa2_autenticacion.md`
- `2026-11-10_etapa3_catalogo_ventas.md`
- `2026-11-10_etapa4_frontend_navegador.md`
