# Análisis de caja blanca — TiendApp

Tres bloques con decisiones relevantes del flujo principal (guía §10). Las pruebas están en el código del backend y se ejecutan con `npm test`.

---

## Bloque 1 — `validateQuantity(unit, quantity)`

**Archivo:** `backend/src/sales/sale-rules.ts` · **Pruebas:** `sale-rules.spec.ts` · **SWR:** SWR-MED-002, límite SWR-MED-004

```ts
if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return 'NOT_A_NUMBER';
if (quantity <= 0) return 'NOT_POSITIVE';
if (unit === 'UNIT') return Number.isInteger(quantity) ? null : 'UNIT_REQUIRES_INTEGER';
if (Math.abs(quantity * QTY_SCALE - toMilli(quantity)) > 1e-6) return 'TOO_MANY_DECIMALS';
return null;
```

| Pregunta | Respuesta |
|---|---|
| Decisión | ¿Es número finito? ¿Es > 0? ¿La unidad es UNIT? ¿Tiene más de 3 decimales? |
| Caminos | 1 no numérico · 2 no positivo · 3 UNIT entero · 4 UNIT decimal · 5 KG/LB con > 3 decimales · 6 KG/LB válido |
| Datos por camino | 1 `NaN` · 2 `0`, `-0,5` · 3 `3` · 4 `1,5` · 5 `0,7501` · 6 `0,75 kg`, `1,5 lb` |
| Frontera | `0` (rechazado) y `0,001` (mínimo aceptado); 3 decimales aceptado, 4 rechazado |
| Prueba por rama | «camino 1» … «camino 6» y «frontera: acepta la mínima cantidad positiva 0,001 kg» |
| Camino no cubierto | `Infinity` (entra por el camino 1, pero no tiene prueba propia) |
| Defecto oculto si solo se prueba el caso correcto | Vender 1,5 unidades de un producto por unidad, o aceptar 0,0001 kg y que al convertir a milésimas se descuente 0 |

## Bloque 2 — `SalesService.confirm(dto, userId)`

**Archivo:** `backend/src/sales/sales.service.ts` · **Pruebas:** `sales.service.spec.ts` · **SWR:** SWR-SALE-007, SWR-SALE-008, SWR-SALE-010

| Pregunta | Respuesta |
|---|---|
| Decisión | ¿Ya existe una venta con la misma clave? ¿Pertenece al mismo usuario? ¿Hay faltantes de stock? ¿El descuento condicional afectó 0 filas? ¿La creación falló por clave duplicada (P2002)? |
| Caminos | **A** repetición (mismo usuario → devuelve venta; otro usuario → 409) · **B** stock insuficiente (validación previa o carrera en el descuento) · **C** clave duplicada concurrente → devuelve la primera venta · **D** venta confirmada |
| Datos por camino | A: venta previa con la clave · B: stock 2, pedir 3; o `updateMany` con `count 0` · C: `$transaction` lanza P2002 · D: stock 10, pedir 3 |
| Frontera | Pedir exactamente el stock disponible: debe confirmarse (cubierto en `findShortages`) |
| Prueba por rama | «camino A…» (2 pruebas) · «camino B…» (2) · «camino C…» · «camino D…» |
| Camino no cubierto | P2002 cuando `findByKey` aún no encuentra la venta ganadora (se relanza el error); error de BD no controlado |
| Defecto oculto si solo se prueba el caso correcto | Doble clic que duplica la venta y el descuento; dos vendedores vendiendo las últimas unidades al mismo tiempo y stock negativo |

## Bloque 3 — `canAccess(requiredRoles, userRole)`

**Archivo:** `backend/src/auth/roles.guard.ts` · **Pruebas:** `roles.guard.spec.ts` · **SWR:** SWR-AUTH-004

```ts
if (!requiredRoles || requiredRoles.length === 0) return true;
if (!userRole) return false;
return requiredRoles.includes(userRole);
```

| Pregunta | Respuesta |
|---|---|
| Decisión | ¿La ruta exige roles? ¿Hay usuario autenticado? ¿Su rol está en la lista? |
| Caminos | 1 sin restricción (`undefined` o `[]`) · 2 sin usuario · 3 rol permitido · 4 rol no permitido |
| Datos por camino | 1 `(undefined, SELLER)`, `([], SELLER)` · 2 `([ADMIN], undefined)` · 3 `([ADMIN], ADMIN)` · 4 `([ADMIN], SELLER)` |
| Frontera | Lista vacía `[]`: se trata igual que sin restricción |
| Prueba por rama | «camino 1a», «1b», «2», «3», «4 (TC-SEC-001)» |
| Camino no cubierto | Ninguno dentro de la función. El guard que la usa (lectura de metadatos, ruta `@Public`) no tiene prueba unitaria; se verificó contra la API real (escenario C3) |
| Defecto oculto si solo se prueba el caso correcto | Que un vendedor ejecute funciones de administrador porque la interfaz solo oculta el botón |

---

## Cobertura medida (2026-11-10, `npm test -- --coverage`)

| Archivo | Líneas | Ramas |
|---|---|---|
| `sale-rules.ts` | 100 % | 100 % |
| `sales.service.ts` | 93,4 % | 81,6 % |
| `password.util.ts` | 100 % | 100 % |
| `auth.service.ts` | 95 % | 87 % |

Las líneas sin cubrir de `sales.service.ts` son `findOne` y `list` (consultas sin lógica de decisión).
