# Consulta técnica: Lint y Sonar aplicados a TiendApp

> Borrador en Markdown; la entrega es `14_Consulta_Lint_Sonar.pdf` (máximo 1 página).

## Lint

**Qué es.** Un análisis estático que revisa el código fuente sin ejecutarlo, contra un conjunto de reglas.

**Qué detecta.**
- Errores probables: variables sin usar, promesas sin `await`, comparaciones entre tipos distintos.
- Riesgos de tipos: valores `any` sin control.
- Convenciones de estilo.
- Reglas propias del framework, como los hooks de React y la navegación de Next.

**Dónde lo usamos.**
- **Backend:** ESLint con `typescript-eslint` en modo *type-checked* y Prettier.
- **Frontend:** ESLint con `eslint-config-next` (core-web-vitals + TypeScript).
- Se ejecuta en el editor, con `npm run lint` y en el CI con `npm run lint:ci --max-warnings=0`.

**Si falla en el CI.** El job termina en rojo y, con la protección de ramas, el PR no se puede fusionar.

**Casos reales que detectó en TiendApp:**
- `no-unsafe-return` en el DTO de login.
- `no-unsafe-enum-comparison` en el filtro de excepciones.
- `react-hooks/set-state-in-effect` en `use-api-data.ts`: un `setState` sincrónico dentro de un efecto, que causaba renders en cascada. Se corrigió.
- `no-location-assign-relative-destination` en la navegación del cierre de sesión.

## Sonar (SonarQube / SonarCloud)

**Qué analiza.** La calidad del código en todo el repositorio y su evolución en el tiempo, no solo archivo por archivo. SonarQube se instala en un servidor propio; SonarCloud es el servicio en la nube.

| Concepto | Significado |
|---|---|
| **Bug** | Código que probablemente produce un comportamiento incorrecto |
| **Vulnerabilidad** | Punto explotable, como una inyección o un secreto en el código. Los *security hotspots* se revisan a mano |
| **Code smell** | Problema de mantenibilidad: duplicación, funciones largas o muy complejas |
| **Cobertura** | Porcentaje del código ejecutado por las pruebas. Sonar no corre pruebas: importa el reporte LCOV que generan Jest y Vitest |
| **Quality Gate** | Condiciones que el código nuevo debe cumplir para aprobar, por ejemplo «0 bugs nuevos y cobertura ≥ 80 % en código nuevo» |

## Aplicación a TiendApp

No ejecutamos Sonar (la guía no lo exige). Implementamos un Quality Gate equivalente en GitHub Actions (`CI_Quality_Gate.md`): lint sin advertencias, tipos, build y umbrales de cobertura por archivo.

**Métricas que vigilaríamos y por qué:**

| Métrica | Umbral propuesto | Motivo en TiendApp |
|---|---|---|
| Cobertura de `sale-rules.ts`, `sales.service.ts`, `catalog.service.ts` | ≥ 80 % líneas, ≥ 75 % ramas | SWR-MNT-001; ahí están las reglas de dinero y stock (subtotales, stock insuficiente, idempotencia) |
| Bugs y vulnerabilidades nuevas | 0 | Un error en el descuento de inventario o en la autorización es un defecto crítico (SRS §13.3) |
| Secretos en el código | 0 | Tuvimos un incidente real: credenciales en reportes de pruebas (DEF-04) y en el chat (INC-03) |
| Complejidad cognitiva | ≤ 15 por función | `SalesService.confirm` concentra varias ramas; si crece, la caja blanca se vuelve inmanejable |
| Duplicación | ≤ 3 % | Las reglas de cantidad existen en el backend y una copia para mostrar en el frontend (`sale-math.ts`); hay que vigilar que no diverjan |

**Cómo lo incorporaríamos:**
1. Proyecto en SonarCloud enlazado al repositorio de GitHub.
2. Paso `sonarcloud-github-action` en `ci.yml` después de las pruebas, leyendo `backend/coverage/lcov.info` y `frontend/coverage/lcov.info`.
3. Token `SONAR_TOKEN` como secreto del repositorio.
4. Exigir el check de Sonar en la protección de `qa` y `main`.
