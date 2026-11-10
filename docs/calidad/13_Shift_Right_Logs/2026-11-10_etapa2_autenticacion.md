# Ejecución 2026-11-10 — Etapa 2: autenticación contra Supabase

**Ambiente:** API NestJS local (`node dist/main`, puerto 4000) conectada a PostgreSQL en Supabase (región us-east-2, pooler).
**Preparación:** `prisma migrate dev --name init` (migración inicial aplicada) y `prisma db seed` (cuenta administrador y cuenta vendedor).
**Herramienta:** script `fetch` de Node contra la API. No es prueba de caja negra en navegador ni Postman; es una verificación técnica del backend.

## Escenarios ejecutados

| # | Escenario | SWR | Esperado | Obtenido | Estado |
|---|---|---|---|---|---|
| 1 | Login administrador con credenciales válidas | SWR-AUTH-001 | 200, token, rol ADMIN | 200, token, ADMIN | PASS |
| 2 | Login con contraseña incorrecta | SWR-AUTH-002 | 401 con mensaje general | 401 «Correo o contraseña incorrectos» | PASS |
| 3 | Login con correo mal formado y contraseña vacía | — (validación) | 400 identificando los campos | 400 con dos mensajes de campo | PASS |
| 4 | `GET /auth/me` sin token | Ruta protegida (guía §5) | 401 | 401 | PASS |
| 5 | `GET /auth/me` con token válido | Ruta protegida (guía §5) | 200 con datos del usuario | 200, ADMIN | PASS |
| 6 | Login vendedor con credenciales válidas | SWR-AUTH-001 | 200, rol SELLER | 200, SELLER | PASS |

## Extracto de logs (eventos de aplicación)

```json
{"timestamp":"2026-11-10T09:46:35.644-05:00","level":"INFO","context":"Bootstrap","event":"APP_STARTED","message":"Aplicación iniciada","metadata":{"port":4000,"env":"development"}}
{"timestamp":"2026-11-10T09:46:39.483-05:00","level":"INFO","context":"AuthService","event":"AUTH_LOGIN_SUCCESS","message":"Inicio de sesión correcto","metadata":{"userId":"e93f7a4c-1781-4a7e-99fb-1eb341816658","role":"ADMIN","durationMs":780}}
{"timestamp":"2026-11-10T09:46:40.302-05:00","level":"WARN","context":"AuthService","event":"AUTH_LOGIN_FAILED","message":"Inicio de sesión rechazado","metadata":{"reason":"BAD_PASSWORD","userId":"e93f7a4c-1781-4a7e-99fb-1eb341816658","durationMs":809}}
{"timestamp":"2026-11-10T09:46:40.313-05:00","level":"WARN","context":"HttpExceptionFilter","event":"VALIDATION_REJECTED","message":"Solicitud rechazada por validación","metadata":{"method":"POST","path":"/auth/login","status":400,"errors":["El correo no tiene un formato válido","La contraseña es obligatoria"]}}
{"timestamp":"2026-11-10T09:46:42.118-05:00","level":"INFO","context":"AuthService","event":"AUTH_LOGIN_SUCCESS","message":"Inicio de sesión correcto","metadata":{"userId":"c80d6d0a-9e0c-43fc-9dd9-c23a5ec76b82","role":"SELLER","durationMs":745}}
```

Se revisó el log completo: no contiene contraseñas, tokens ni la cadena de conexión.

## Observaciones

- El login tarda entre 745 y 809 ms. La mayor parte corresponde a bcrypt con costo 12 (SWR-AUTH-005) más la latencia a Supabase. Queda dentro de los 2 s de SWR-PERF-001, pero solo para una solicitud aislada; no es una prueba de carga.
- La ruta sin token (escenario 4) no genera log de aplicación: el rechazo lo hace Passport antes del filtro. Posible mejora: registrar `AUTH_TOKEN_MISSING` para Shift Right.

## Hallazgo durante la ejecución

- **Defecto de configuración:** `npm run build` generaba `dist/src/main.js` en lugar de `dist/main.js` porque `prisma/seed.ts` entraba en la compilación. La API no arrancaba con `node dist/main`. **Corrección:** se excluyó `prisma` en `tsconfig.build.json`. **Re-test:** la API arrancó y los 6 escenarios pasaron. Registrar en `11_Errores_Defectos_Fallas_Incidentes.xlsx`.
