# CI/CD y Quality Gate — TiendApp

**Workflow:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) · **Decisión:** D-08 (Quality Gate propio, sin Sonar; guía §14 y §26)

## Cuándo se ejecuta

- Cada PR hacia `develop`, `qa` o `main`.
- Cada push a esas ramas y a las ramas `feature/**`, para tener resultado antes de abrir el PR.
- Manualmente (*Run workflow*).

## Qué verifica

| Job | Paso | Falla si… |
|---|---|---|
| Backend (NestJS) | `npm ci` + `prisma generate` | El lockfile no coincide con `package.json` |
| | `npm run lint:ci` | Hay cualquier error **o advertencia** de ESLint |
| | `npm run build` | No compila (TypeScript) |
| | `jest --coverage` | Falla una prueba o la cobertura baja de los umbrales |
| Frontend (Next.js) | `npm ci` | El lockfile no coincide |
| | `npm run lint:ci` | Hay errores o advertencias (incluye `e2e/`) |
| | `npm run typecheck` | Hay errores de tipos (incluidos los archivos de prueba) |
| | `vitest --coverage` | Falla una prueba RTL o la cobertura baja de los umbrales |
| | `npm run build` | `next build` falla |

Los reportes de cobertura quedan como artefactos del workflow (`cobertura-backend`, `cobertura-frontend`, 14 días).

## Umbrales del Quality Gate

SWR-MNT-001 propone **80 %** de cobertura para la lógica de negocio de inventario, ventas y vencimientos. Los umbrales se fijaron sobre los archivos que contienen esa lógica en el MVP (vencimientos está fuera del alcance).

**Backend** (`backend/package.json` → `jest.coverageThreshold`)

| Archivo | Umbral líneas / ramas | Medido 2026-11-11 |
|---|---|---|
| `src/sales/sale-rules.ts` | 95 % / 95 % | 100 % / 100 % |
| `src/sales/sale-plan.ts` | 95 % / 95 % | 100 % / 100 % (16/11) |
| `src/sales/sales.service.ts` | 80 % / 75 % | 93,7 % / 78,6 % (16/11; versión de FAL-01) |
| `src/catalog/catalog.service.ts` | 80 % / 75 % | 97,6 % / 86,4 % |
| `src/auth/auth.service.ts` | 80 % / 75 % | 95 % / 87 % |
| `src/auth/password.util.ts` | 80 % / 75 % | 100 % / 100 % |

**Frontend** (`frontend/vitest.config.mts` → `coverage.thresholds`)

| Alcance | Umbral líneas / ramas | Medido 2026-11-11 |
|---|---|---|
| Global (`src/features`, `src/lib`) | 65 % / 55 % | 78,4 % / 65,6 % |
| `src/features/sales/sale-math.ts` | 95 % / 75 % | 100 % / 80 % |
| `src/features/sales/new-sale.tsx` | 80 % / 75 % | 90,9 % / 82,4 % |
| `src/features/auth/login-form.tsx` | 80 % / 75 % | 100 % / 93,8 % |

Las ramas se fijaron en 75 % porque quedan caminos de errores de red y de carga que se cubren con E2E y no con pruebas unitarias.

**Comprobación de que el gate bloquea:** subiendo temporalmente el umbral de `sales.service.ts` a 99 %, Jest terminó con código 1 y el mensaje `Coverage for lines (93.42%) does not meet "./src/sales/sales.service.ts" threshold (99%)`. Después se restauró.

**Pruebas agregadas en esta etapa:** `catalog.service.spec.ts` (11 pruebas). Antes `catalog.service.ts` tenía 0 % de cobertura unitaria; solo lo cubrían Postman y Playwright.

## Lo que el CI no ejecuta

Postman (Newman) y Playwright necesitan la API conectada a Supabase y las cuentas de prueba. Se ejecutan en el ambiente de prueba antes de pasar de `qa` a `main` (ver `09_Postman/` y `10_Playwright/`). Para llevarlos al CI haría falta una BD de prueba (por ejemplo, PostgreSQL como *service* de GitHub Actions) y secretos del repositorio.

## Verificación local (2026-11-11)

Los pasos se ejecutaron en el equipo de desarrollo antes de subir el workflow:

- **Backend:** lint, build y Jest (51 pruebas) en verde, con el gate cumplido.
- **Frontend:** lint, tipos, Vitest (13 pruebas) con el gate cumplido y `next build`, todo en verde.

**No verificado localmente:** `npm ci` y `prisma generate`. Un proceso de Node huérfano (H-FE-03) mantenía bloqueados archivos de `node_modules` (`EPERM`). La primera ejecución en GitHub Actions es la evidencia de esos pasos.

## Protección de ramas (configurar en GitHub)

En **Settings → Branches → Add branch ruleset** (o *Branch protection rules*), para `main` y `qa`:

1. *Require a pull request before merging*, con al menos 1 aprobación.
2. *Require status checks to pass*: seleccionar **Backend (NestJS)** y **Frontend (Next.js)**. Los checks aparecen en la lista después de la primera ejecución del workflow.
3. *Require branches to be up to date before merging*.
4. *Block force pushes*.

Para `develop` basta con exigir los dos checks.
