# Plan de Calidad — TiendApp MVP

Calidad de Software · CORHUILA · 2026
Versión 0.1 (borrador) · Base: SRS TiendApp v1.0 y guía «Del SRS al Release con Evidencia»

> Borrador en Markdown. La versión de entrega será `01_Plan_Calidad.pdf`.

## 1. Objetivo

Demostrar, con pruebas reproducibles y trazabilidad, qué requisitos de la SRS se implementaron en el MVP y con qué nivel de calidad, para decidir con evidencia si la versión puede liberarse.

## 2. Alcance

- **Producto:** MVP web de TiendApp para un solo establecimiento.
- **Flujo principal:** autenticarse → registrar categoría y producto → registrar venta → descontar inventario.
- **Módulos:** Usuarios/Auth, Productos/Categorías, Ventas.
- **Requisitos:** los 15 SWR de `01_Alcance_y_Trazabilidad.xlsx`. Lo que no esté allí queda fuera del MVP.

## 3. Referencias

| Referencia | Uso |
|---|---|
| ISO/IEC/IEEE 29148:2018 | Calidad del requisito y trazabilidad BR → STK → SYS → SWR |
| ISO/IEC 25010:2023 | Evaluación de las nueve características de calidad del producto |
| SRS TiendApp v1.0 | Requisitos, criterios de aceptación y casos TC-xxx |
| Guía del docente | Actividades, mínimos de pruebas y entregables |

## 4. Roles

| Rol | Responsable | Tareas |
|---|---|---|
| Líder de requisitos y trazabilidad | _por definir_ | Matrices 01–03 y matriz maestra |
| Desarrollo | Equipo (con apoyo de IA) | Implementación, revisión de código generado |
| QA (aseguramiento) | _por definir_ | Revisión de PR, diseño de pruebas, estándares |
| QC (control) | _por definir_ | Ejecución de pruebas, defectos, re-test |

Ambos integrantes deben poder explicar requisitos, código y pruebas (guía §23).

## 5. Estrategia de pruebas

| Nivel / tipo | Herramienta | Mínimo | Foco | Carpeta |
|---|---|---|---|---|
| Caja negra manual | Navegador | 10 | Flujo principal, validaciones, autenticación, fronteras | `05_Caja_Negra_Navegador/` |
| Unitarias | Jest (backend) | 8 | Subtotal, total, stock, decimales, idempotencia | `06_Pruebas_Unitarias/` |
| Caja blanca | Jest + análisis de caminos | 3 bloques | Validación de venta, descuento de stock, autorización | `07_Caja_Blanca/` |
| Frontend | Vitest + React Testing Library | 12 (3 explicadas) | Login, formularios, listas, errores, mensajes | `08_RTL/` |
| API | Postman | 8 (≥ 4 de dominio) | Venta con stock insuficiente, descuento, idempotencia, rol | `09_Postman/` |
| E2E | Playwright | 5 (2 de flujo completo, 2 explicadas) | Login → producto → venta → stock | `10_Playwright/` |
| Exploratoria | Navegador | 1 sesión | Toda la aplicación | `11_…xlsx` |
| Shift Right | Logs del backend | 5 escenarios | Observación en ejecución | `13_Shift_Right_Logs/` |

**Diseño de casos.** Partición de equivalencia y valores límite (cantidad 0, decimal en kg, stock exacto, stock + 1), análisis de caminos en caja blanca y los TC de la SRS §13.2 cuando apliquen (TC-SALE-001, TC-SALE-002, TC-MED-001, TC-SEC-001, TC-DATA-001, TC-REL-001).

**Datos de prueba.** Cada suite crea sus propios datos o usa un seed; ninguna prueba depende del orden de ejecución de otra.

## 6. Criterios de entrada y salida

**Entrada a desarrollo de un SWR:** verificado en `02_Verificacion_Requisitos.xlsx` y con al menos un caso de prueba diseñado.

**Integración a `develop`:** PR revisado por otro integrante y CI en verde.

**Paso de `qa` a `main` (liberación):**

- Todos los SWR seleccionados con al menos una prueba ejecutada.
- Sin defectos críticos abiertos que permitan acceso no autorizado, pérdida de consistencia de inventario o duplicación de ventas (SRS §13.3).
- Mínimos de la guía cumplidos.
- Evaluación ISO 25010 completa.

## 7. Gestión de defectos

Registro en `11_Errores_Defectos_Fallas_Incidentes.xlsx`. Clasificación:

| Término | Uso |
|---|---|
| Error | Equivocación humana (requisito mal entendido, dato mal digitado) |
| Defecto | Imperfección en el código o artefacto |
| Falla | Comportamiento observado distinto al esperado al ejecutar |
| Incidente | Evento observado en ejecución que requiere análisis |

| Severidad | Criterio |
|---|---|
| Crítica | Acceso no autorizado, inventario inconsistente, venta duplicada |
| Alta | El flujo principal no se completa |
| Media | Funciona con un rodeo o con mensaje incorrecto |
| Baja | Cosmético |

Los defectos no se borran: cambian de estado (Abierto → Corregido → Re-test PASS/FAIL → Cerrado).

## 8. Gestión de configuración

- **Ramas:** `feature/*` → `develop` → `qa` → `main`, siempre mediante PR.
- **Commits:** mensajes descriptivos que citan el SWR cuando aplica.
- **Secretos:** solo en `.env` (excluido por `.gitignore`); se versiona `.env.example`.

## 9. Integración continua y Quality Gate

GitHub Actions en cada PR: lint, pruebas unitarias, pruebas RTL y umbral de cobertura sobre la lógica de ventas. El umbral se fijará cuando exista código (SWR-MNT-001 propone 80 %; se validará su viabilidad, SRS C-08). No se ejecuta Sonar (guía §14).

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Código generado por IA sin revisar | Revisión obligatoria en PR y pruebas antes de integrar |
| Doble confirmación de venta | SWR-SALE-010 con clave de idempotencia y prueba TC-REL-001 |
| Decisiones abiertas de la SRS (C-01, C-06) | Registradas en `docs/DECISIONES.md` y `Ajustes_SRS` |
| Dependencia de Supabase para la demo | Variables de entorno y seed reproducible |
| Tiempo limitado | Flujo principal completo antes de ampliar alcance |

## 11. Entregables de calidad

Estructura `/docs/calidad/` definida en la guía §22: plan, verificación, validación, matriz de pruebas, suites 05–10, defectos, ISO 25010, Shift Right y consulta Lint/Sonar.
