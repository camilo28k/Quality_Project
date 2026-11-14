# TiendApp — Informe final de calidad

**Proyecto final de Calidad de Software: del SRS al Release con Evidencia**
CORHUILA · Ingeniería de Sistemas · 2026
Integrantes: Melanie Liset Sánchez Polanía; Harold Camilo Barrera Giraldo
Repositorio: https://github.com/camilo28k/Quality_Project
Fecha de corte de la evidencia: 14 de noviembre de 2026

> **Borrador.** Las secciones marcadas como *pendiente del equipo* deben completarse antes de entregar: ejecución de caja negra, validación con el stakeholder y docente o fecha de entrega.

---

## 1. Resumen ejecutivo

TiendApp es una plataforma web de inventario y ventas para un solo establecimiento. Se construyó un MVP con **3 módulos** (Usuarios/Autenticación, Productos/Categorías y Ventas) que cubre el flujo principal **autenticarse → registrar categoría y producto → registrar venta → descontar inventario**. El MVP implementa **15 requisitos de software** de la SRS, todos trazados hasta su requisito de negocio.

**Resultado de la verificación automatizada (14/11/2026):** 90 pruebas automatizadas, **90 en PASS**.

| Suite | Pruebas |
|---|---|
| Unitarias (Jest), incluye 3 bloques de caja blanca | 51 |
| Frontend (Vitest + React Testing Library) | 13 |
| API (Postman/Newman, 31 assertions) | 19 |
| E2E (Playwright) | 7 |

Además, el CI en GitHub Actions corre lint, tipos, build, pruebas y umbrales de cobertura en cada push.

**Decisión de liberación (sección 8): no liberar todavía.** El flujo funciona y es consistente, pero hay dos hallazgos abiertos de severidad alta:
- **FAL-01:** confirmar una venta tarda de 2,6 a 5,1 s, frente al objetivo de 2 s (SWR-PERF-001).
- **INC-03:** la contraseña de la base de datos quedó expuesta fuera del equipo.

Faltan, además, la ejecución de caja negra y la validación con el stakeholder.

## 2. Alcance y trazabilidad (ISO/IEC/IEEE 29148)

Se seleccionaron 15 SWR (la guía pide entre 8 y 15). Cada uno se trazó SWR → SYS → STK → BR en `docs/calidad/01_Alcance_y_Trazabilidad.xlsx`. Los otros 38 SWR funcionales de la SRS quedaron marcados «fuera del MVP» con su justificación.

| Módulo | SWR |
|---|---|
| Usuarios/Autenticación | SWR-AUTH-001, -002, -004, -005 |
| Productos/Categorías | SWR-PROD-001, -005, SWR-CAT-001 |
| Ventas | SWR-SALE-003, -004, -005, -007, -008, -010, SWR-MED-002, SWR-PAY-001 |

**Ajustes a la SRS** (`02_Verificacion_Requisitos.xlsx`, hoja *Ajustes_SRS*):
- Moneda en COP enteros.
- Hasta 3 decimales en kg y lb.
- Stock inicial registrado como movimiento.
- Validación de stock sobre la suma de líneas del mismo producto.
- Clave de idempotencia para definir «misma solicitud».
- Nombre de categoría único.
- Reemplazo del Anexo A de la SRS, que tenía filas desalineadas.
- Medios de pago: la interfaz ofrece efectivo, tarjeta y transferencia; solo se traza SWR-PAY-001.

La **matriz maestra** (`docs/calidad/Matriz_Maestra_Trazabilidad.xlsx`) relaciona cada SWR con su implementación, sus pruebas y su resultado. Permite también ir desde un hallazgo al requisito afectado.

## 3. Solución construida

| Capa | Tecnología | Decisión |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript, plantilla *next-shadcn-dashboard-starter* (MIT) | Marca TiendApp (`#0F766E`, `#F59E0B`, `#1E293B`, Inter). Sesión en cookie httpOnly. El navegador solo habla con Next, que reenvía a la API |
| Backend | NestJS 11, Prisma 6 | Guards de sesión y de rol validados en el servidor. Reglas de venta en funciones puras. Logs JSON |
| Datos | PostgreSQL en Supabase | Venta y descuento en una transacción. Descuento condicional (`stock >= cantidad`). Clave de idempotencia única |
| Calidad | Jest, Vitest + RTL, Postman/Newman, Playwright, GitHub Actions | Quality Gate propio con umbrales de cobertura por archivo |

Las decisiones están registradas en `docs/DECISIONES.md` (D-01 a D-14). La identidad visual, la plantilla original y las capturas de la adaptación están en `docs/marca/`.

## 4. Proceso: QA, QC, Shift Left y Shift Right

- **Shift Left / QA:**
  - Verificación de los 15 SWR con 7 criterios de calidad del requisito, antes de programar.
  - Plan de calidad y diseño de casos a partir de los TC de la SRS.
  - Ramas `feature/*` con PR revisables.
  - CI con Quality Gate.
- **QC:** ejecución de las suites, registro de hallazgos con re-test (`11_Errores_Defectos_Fallas_Incidentes.xlsx`) y comprobación de que las pruebas detectan errores:
  - Una mutación del cálculo de subtotal hizo fallar RTL-10.
  - Un umbral de cobertura imposible hizo fallar el CI.
- **Shift Right:** 5 escenarios observados con logs estructurados (`13_Shift_Right_Logs/`):
  - Flujo correcto.
  - Credencial incorrecta.
  - Dato inválido.
  - Error provocado: JSON malformado, token alterado y arranque sin base de datos.
  - Operación relevante con su duración.

## 5. Resultados de las pruebas

| Tipo (guía) | Mínimo | Realizado | Resultado | Evidencia |
|---|---|---|---|---|
| Caja negra en navegador | 10 | 12 casos diseñados | **Pendiente de ejecución del equipo** | `05_Caja_Negra_Navegador/Casos_Caja_Negra.xlsx` |
| Unitarias | 8 | 51 | 51 PASS | `04_Matriz_Pruebas.xlsx` |
| Caja blanca | 3 bloques | 3 bloques (`validateQuantity`, `SalesService.confirm`, `canAccess`) | PASS | `07_Caja_Blanca/ANALISIS_CAJA_BLANCA.md` |
| Frontend RTL | 12 | 13 | 13 PASS | `frontend/src/features/**/*.test.tsx` |
| API Postman | 8 (½ de dominio) | 19 (11 de dominio), 31 assertions | 19 PASS | `09_Postman/` |
| E2E Playwright | 5 (2 de flujo completo) | 7 (2 de flujo completo) | 7 PASS | `10_Playwright/` |

**Casos de aceptación de la SRS verificados:**
- **TC-SALE-001:** con stock 10 y venta de 3, el stock queda en 7.
- **TC-SALE-002:** con stock 2, una venta de 3 se rechaza y el stock no cambia.
- **TC-MED-001:** se puede vender 0,75 kg.
- **TC-SEC-001:** un vendedor que llama a una función administrativa recibe 403.
- **TC-DATA-001:** la venta conserva el precio original aunque el producto cambie de precio.
- **TC-REL-001:** repetir la misma solicitud no duplica la venta; tres envíos simultáneos producen una sola venta.

**Cobertura de la lógica de negocio** (umbral SWR-MNT-001: 80 %):

| Archivo | Líneas | Ramas |
|---|---|---|
| `sale-rules.ts` | 100 % | 100 % |
| `sales.service.ts` | 93,4 % | 81,6 % |
| `catalog.service.ts` | 97,6 % | 86,4 % |
| `auth.service.ts` | 95 % | 87 % |

## 6. Hallazgos

12 hallazgos reales registrados: **8 cerrados con re-test y 4 abiertos**.

| ID | Clasificación | Hallazgo | Severidad | Estado |
|---|---|---|---|---|
| FAL-01 | Falla | Confirmar venta tarda 2,6–5,1 s (objetivo 2 s, SWR-PERF-001) | Alta | **Abierto** |
| INC-03 | Error → Incidente | La contraseña de la BD se compartió fuera del equipo | Alta | **Abierto** |
| MEJ-01 | Defecto menor | El rechazo de un token alterado no queda en los logs | Baja | Abierto |
| DEF-04 | Error → Defecto | El reporte HTML de Playwright y los resultados de Newman contenían la contraseña de prueba | Alta | Cerrado |
| DEF-01 | Error → Defecto → Falla | El build no generaba `dist/main`; la API no arrancaba | Alta | Cerrado |
| DEF-05 | Defecto | Sin log estructurado cuando la BD no está disponible al arrancar | Media | Cerrado |
| DEF-06 | Error de proceso | `CatalogService` sin pruebas unitarias (0 %) | Media | Cerrado |
| DEF-03 | Falla | Tabla de productos desbordada a 1280 px | Baja | Cerrado |
| INC-01, INC-02 | Incidente | Procesos huérfanos en desarrollo; `ECONNRESET` intermitente | Media | Cerrados |
| DEF-02, DEF-07 | Defecto en pruebas | Importación faltante; locators ambiguos en E2E | Baja | Cerrados |

## 7. Evaluación ISO/IEC 25010:2023

| Característica | Estado | Principal evidencia o riesgo |
|---|---|---|
| Adecuación funcional | PARCIAL | 15 SWR con pruebas en PASS; falta caja negra y validación |
| Eficiencia de desempeño | **FALLA** | FAL-01; capacidad de 20 usuarios sin prueba de carga |
| Compatibilidad | PARCIAL | Solo Chromium; DEF-03 corregido |
| Capacidad de interacción | PARCIAL | Mensajes por campo, labels, estados; prueba de usabilidad SWR-USE-001 no evaluada |
| Fiabilidad | PARCIAL | Transacción, idempotencia, `APP_START_FAILED`; disponibilidad del 99 % no medible sin despliegue |
| Seguridad | PARCIAL | bcrypt, cookie httpOnly, roles en servidor; INC-03 y MEJ-01 abiertos; HTTPS sin desplegar |
| Mantenibilidad | **CUMPLE** | Módulos y reglas puras, 64 pruebas unitarias/RTL, CI con Quality Gate |
| Flexibilidad | PARCIAL | Configuración por variables de entorno; sin ambiente desplegado |
| Seguridad operacional | PARCIAL | Confirmación al desactivar, sin borrado, sin stock negativo; no existe anulación de ventas (C-05) |

El detalle con acciones y mejoras está en `docs/calidad/12_ISO25010.xlsx`.

## 8. Decisión de liberación

**Recomendación: NO liberar a `main` todavía.**

**Lo que respalda la calidad del MVP:**
- El flujo principal funciona de punta a punta en el navegador y en las 4 suites automatizadas.
- No hay defectos abiertos de los que la SRS §13.3 declara bloqueantes: no hay acceso no autorizado (TC-SEC-001, E2E-03, API-07), pérdida de consistencia de inventario (transacción y descuento condicional, TC-SALE-001/002) ni duplicación de ventas (TC-REL-001, prueba con tres envíos simultáneos).

**Lo que impide liberar:**
1. **FAL-01:** el requisito de desempeño SWR-PERF-001 no se cumple en ninguna medición.
2. **INC-03:** con la contraseña de la BD expuesta no puede publicarse un ambiente.
3. **Condiciones de aceptación de la SRS §13.3 incompletas:** faltan la caja negra y la revisión de los flujos por el administrador y un vendedor (archivos 05 y 03).

**Condiciones para liberar:**
- Rotar la contraseña de la BD.
- Ejecutar y aprobar los 12 casos de caja negra.
- Validar con el stakeholder.
- Reducir FAL-01 por debajo de 2 s (agrupar escrituras de la transacción, API y BD en la misma región) o aprobar formalmente una excepción documentada para el MVP.

## 9. Lecciones aprendidas

- **Revisar la evidencia también es QA.** Los reportes de prueba pueden filtrar secretos (DEF-04). Ahora se verifica con un script antes de cada commit.
- **Los logs con `durationMs` mostraron que el rendimiento cambia entre días** (de 2,6 a 4,2 s). Sin ellos el problema se habría percibido solo como «a veces está lenta».
- **Medir la cobertura reveló lógica sin pruebas unitarias** (DEF-06), aunque las pruebas de API la ejercitaban.
- **Varias fallas de E2E eran defectos de las propias pruebas** (DEF-07). Los locators semánticos y esperar el estado de la página las hicieron estables.
- **Shift Right encontró lo que ninguna prueba funcional detectaba:** el arranque sin BD (DEF-05).

## 10. Pendientes del equipo antes de la entrega

- [ ] Ejecutar los 12 casos de caja negra y registrar resultados y evidencia (`05_Caja_Negra_Navegador/`).
- [ ] Validar los SWR con el administrador y un vendedor (`03_Validacion_Requisitos.xlsx`).
- [ ] Rotar la contraseña de la BD en Supabase (INC-03).
- [ ] Revisar y fusionar los PR #1 a #8 en `develop`; promover a `qa`; proteger `qa` y `main`.
- [ ] Completar el docente y la fecha de entrega en la portada (SRS C-10).
- [ ] Preparar la sustentación: todos los integrantes deben poder explicar la trazabilidad, una prueba unitaria, un análisis de caja blanca, 3 pruebas RTL, una API de Postman, 2 pruebas E2E, un hallazgo con su característica ISO 25010 y los logs.

## Anexo: ubicación de los entregables

| # | Entregable | Ubicación |
|---|---|---|
| 1 | SRS + alcance + trazabilidad 29148 | `docs/srs/`, `docs/calidad/01_Alcance_y_Trazabilidad.xlsx` |
| 2 | MVP + identidad visual | `frontend/`, `backend/`, `docs/marca/FICHA_MARCA.md` |
| 3 | Repositorio y control de cambios | GitHub, ramas `feature/etapa-*`, PR #1–#8, `.github/workflows/ci.yml` |
| 4 | Dossier de calidad | `docs/calidad/` (01–14, `CI_Quality_Gate.md`) |
| 5 | Matriz maestra | `docs/calidad/Matriz_Maestra_Trazabilidad.xlsx` |
| 7 | Informe final | este documento (`docs/Informe_Final.pdf`) |
