# Pruebas de API con Postman — TiendApp

**Archivos**
- `TiendApp.postman_collection.json`: colección organizada por módulo (Autenticación, Catálogo, Ventas).
- `TiendApp.local.postman_environment.json`: environment **sin secretos**; `adminPassword` y `sellerPassword` están vacíos.
- `resultados/`: salidas JSON de Newman (contraseñas reemplazadas por `[REDACTED]`).

**Cómo ejecutar**
- **En Postman:** importar ambos archivos, completar las contraseñas en el environment *solo de forma local* y ejecutar la colección en orden (Runner).
- **Por consola:** desde `backend/`, `npm run test:api`. El script `scripts/run-postman.mjs` toma las contraseñas de `backend/.env` sin escribirlas en el environment.

Requisito: API en `http://localhost:4000` con las cuentas del seed.

## Casos (19 solicitudes, 29 assertions)

Las assertions están en la pestaña *Post-response* (`pm.test`). Cada ejecución crea sus propios datos con un sufijo único.

| ID | Módulo | Qué verifica | SWR / TC | Tipo |
|---|---|---|---|---|
| API-01 | Auth | Login admin: 200, JWT, rol, sin `passwordHash` | SWR-AUTH-001 | + |
| API-02 | Auth | Contraseña incorrecta: 401, mensaje general, sin token | SWR-AUTH-002 | − |
| API-03 | Auth | Login vendedor: rol SELLER | SWR-AUTH-001 | + |
| API-04 | Auth | `/auth/me` sin token: 401 | Guía §5 | − |
| API-05 | Catálogo | Crear categoría: 201 | SWR-CAT-001 | + |
| API-06 | Catálogo | Nombre duplicado sin distinguir mayúsculas: 409 | AJ-06 | − **dominio** |
| API-07 | Catálogo | Vendedor crea categoría: 403 | SWR-AUTH-004 / TC-SEC-001 | − **dominio** |
| API-08 | Catálogo | Producto por unidad con stock 10 | SWR-PROD-001 | + |
| API-09 | Catálogo | Producto por kg con stock 2 | SWR-PROD-001 | + |
| API-10 | Catálogo | Campos obligatorios faltantes: 400 y campos identificados | SWR-PROD-001 | − |
| API-11 | Ventas | Venta de 3: subtotal y total 7500, precio aplicado, medio de pago | SWR-SALE-003/004/005, SWR-PAY-001 | + **dominio** |
| API-12 | Ventas | Stock final 7 | TC-SALE-001 / SWR-SALE-008 | + **dominio** |
| API-13 | Ventas | Repetir misma solicitud: misma venta, `replayed: true` | TC-REL-001 / SWR-SALE-010 | − **dominio** |
| API-14 | Ventas | Stock sigue en 7 (sin doble descuento) | SWR-SALE-010 | **dominio** |
| API-15 | Ventas | Stock insuficiente: 409 con disponible y solicitado | TC-SALE-002 / SWR-SALE-007 | − **dominio** |
| API-16 | Ventas | Venta de 0,75 kg: cantidad, unidad y subtotal 9000 | TC-MED-001 / SWR-MED-002 | + **dominio** |
| API-17 | Ventas | 1,5 unidades en producto por unidad: 400 | Regla de SWR-MED-002 | − **dominio** |
| API-18 | Ventas | Cambiar precio a 3000 | Preparación TC-DATA-001 | + |
| API-19 | Ventas | Venta histórica conserva 2500 y el vendedor | TC-DATA-001 / SWR-SALE-005 | + **dominio** |

11 de 19 solicitudes verifican reglas propias del dominio (la guía pide al menos la mitad).

## Resultados (2026-11-11, Newman 6.2.3)

| Ejecución | Solicitudes | Assertions | Tiempo medio | Máximo | Archivo |
|---|---|---|---|---|---|
| 1 | 19, **2 fallidas** | 29, **1 fallida** | 3673 ms | 8577 ms | `resultados/newman-2026-11-11-ejecucion1.json` |
| 2 | 19, 0 fallidas | 29, 0 fallidas | 3184 ms | 7913 ms | `resultados/newman-2026-11-11-ejecucion2.json` |

**Hallazgo H-API-01 (incidente):** en la ejecución 1, dos solicitudes (API-16 y API-18) terminaron con `read ECONNRESET`: la conexión se cerró sin respuesta. No se reprodujo en la ejecución 2. El backend que atendía era un proceso huérfano de una sesión anterior (ver H-FE-03); queda pendiente repetirlo con un backend recién iniciado.

**Hallazgo H-API-02 (rendimiento):** tiempo medio de 3,2–3,7 s y máximo de ~8 s por solicitud, mientras `/health` responde en ~3 ms. El tiempo está en las consultas a Supabase. Refuerza el riesgo sobre SWR-PERF-001 (2 s).
