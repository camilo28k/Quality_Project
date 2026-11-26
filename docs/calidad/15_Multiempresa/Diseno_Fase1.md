# Extensión post-MVP: TiendApp multiempresa — Diseño (Fase 1)

Estado: **propuesta, pendiente de aprobación**. No hay código escrito.
Base analizada: `main` @ caddec8 (`backend/prisma/schema.prisma`, `src/auth/*`, `src/catalog/*`, `src/sales/sales.service.ts`).

## 1. Punto de partida (lo que hay hoy)

| Aspecto | Hoy | Impacto |
|---|---|---|
| Roles | `enum Role { ADMIN, SELLER }` | Agregar `SUPER_ADMIN` |
| Empresa | No existe | Nueva entidad `Company` + `companyId` en todo |
| Unicidad | `User.email`, `Category.name`, `Sale.idempotencyKey` son `@unique` globales | Pasar a únicos por empresa (email sigue global: se inicia sesión con él) |
| JWT | `{ sub, role }`, revalidado con caché de 30 s | Agregar `companyId`; revalidar también que la empresa siga activa |
| Venta | SQL directo con CTE atómica (`sales.service.ts:132-205`) | Filtrar productos por `companyId`, insertar `companyId` y consecutivo |
| Catálogo | Consultas sin filtro de empresa | Todas las consultas filtradas por `companyId` |
| Movimientos | `INITIAL, ENTRY, SALE` | Agregar `ADJUSTMENT_OUT`, `VOID_RETURN` y `reason` |

## 2. Modelo de datos propuesto (Prisma)

```prisma
enum Role { SUPER_ADMIN ADMIN SELLER }
enum SaleStatus { CONFIRMED VOIDED }
enum MovementType { INITIAL ENTRY SALE ADJUSTMENT_OUT VOID_RETURN }
enum CorrectionStatus { PENDING RESOLVED REJECTED }

model Company {
  id                 String   @id @default(uuid())
  tradeName          String                 // nombre comercial
  legalName          String?
  taxId              String?                // NIT; obligatorio al completar onboarding
  description        String?
  logoUrl            String?
  email              String?                // correo de la empresa (facturas)
  emailVerifiedAt    DateTime?
  phone              String?
  address            String?
  city               String?
  invoicePrefix      String   @default("FAC-")
  nextInvoiceNumber  Int      @default(1)
  invoiceFooter      String?
  currency           String   @default("COP")
  timezone           String   @default("America/Bogota")
  onboardingCompleted Boolean @default(false)
  active             Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  users User[]  categories Category[]  products Product[]  sales Sale[]
}

model User {
  ...igual...
  companyId           String?   // null solo para SUPER_ADMIN (CHECK en SQL)
  mustChangePassword  Boolean  @default(false)
}

model Category {
  ...igual...
  companyId String
  @@unique([companyId, name])        // reemplaza name @unique
}

model Product {
  ...igual...
  companyId   String
  description String?
  createdById String
  updatedById String?
  @@index([companyId, active])
}

model InventoryMovement {
  ...igual...
  companyId String
  reason    String?             // obligatorio en ENTRY y ADJUSTMENT_OUT
}

model Sale {
  ...igual (userId = vendedor)...
  companyId       String
  invoiceNumber   String          // prefijo + consecutivo, asignado en la misma sentencia
  status          SaleStatus @default(CONFIRMED)
  customerEmail   String?
  voidedAt        DateTime?
  voidedById      String?
  voidReason      String?
  correctsSaleId  String? @unique  // reemisión → venta original
  @@unique([companyId, idempotencyKey])   // reemplaza idempotencyKey @unique
  @@unique([companyId, invoiceNumber])
}

model SaleCorrectionRequest {   // el vendedor solicita, el admin resuelve
  id String @id  saleId String  companyId String  requestedById String
  reason String  status CorrectionStatus @default(PENDING)
  resolvedById String?  resolvedAt DateTime?  createdAt DateTime @default(now())
}

model EmailVerification {       // código para verificar el correo de la empresa
  id String @id  companyId String  email String
  codeHash String  expiresAt DateTime  attempts Int @default(0)  usedAt DateTime?
}

model InvoiceEmail {            // envío y reintentos de facturas
  id String @id  saleId String  companyId String  to String
  kind String  // INVOICE | VOID_NOTICE | REISSUE
  status String // SENT | FAILED
  error String?  createdAt DateTime @default(now())
}

model AuditLog {
  id String @id @default(uuid())
  companyId String?      // null = acción de plataforma
  userId String  role Role
  action String          // p. ej. PRODUCT_PRICE_CHANGED, SALE_VOIDED
  entity String  entityId String
  before Json?  after Json?  reason String?
  createdAt DateTime @default(now())
  @@index([companyId, createdAt])
}
```

**Auditoría inmutable:** además de no exponer endpoints de edición, la migración crea un trigger que rechaza `UPDATE`/`DELETE` sobre `AuditLog`.

**Consecutivo de factura:** se obtiene con `UPDATE "Company" SET "nextInvoiceNumber" = "nextInvoiceNumber" + 1 ... RETURNING` dentro de la misma sentencia atómica de la venta, de modo que no hay huecos ni duplicados y no se agrega una ida y vuelta extra (FAL-01).

## 3. Migración de los datos actuales

1. Crear la empresa inicial con `tradeName` = "TiendApp (empresa inicial)", `onboardingCompleted = true` para no bloquear a los usuarios existentes. Se puede completar después.
2. Asignar su `companyId` a todos los `User` (ADMIN y SELLER), `Category`, `Product`, `InventoryMovement` y `Sale` existentes.
3. Generar `invoiceNumber` de las ventas existentes en orden de `createdAt` y dejar `nextInvoiceNumber` en el siguiente.
4. `Product.createdById` = el ADMIN actual (es quien los creó; se verifica con los movimientos `INITIAL`).
5. Crear el usuario `SUPER_ADMIN` por el seed, con credenciales en `.env` (`SEED_SUPERADMIN_EMAIL/PASSWORD`).
6. Recién después se cambian las restricciones `@unique` a compuestas.

Se prueba primero sobre una copia de la base de datos, contando las filas antes y después.

## 4. Matriz de permisos

| Acción | SUPER_ADMIN | ADMIN | SELLER |
|---|---|---|---|
| Crear / editar / desactivar empresas | ✅ | ❌ | ❌ |
| Crear ADMIN de una empresa | ✅ | ❌ | ❌ |
| Editar datos y correo de la empresa | ✅ (cualquiera) | ✅ (la suya) | ❌ |
| Completar configuración inicial | — | ✅ | ❌ |
| Crear / editar / desactivar vendedores | ✅ | ✅ (los suyos) | ❌ |
| Categorías: crear, editar, desactivar, eliminar | ✅ | ✅ | ❌ (solo listar) |
| Producto: crear, editar nombre/descripción | ✅ | ✅ | ✅ |
| Producto: cambiar precio | ✅ | ✅ | **Decisión (a)** |
| Producto: desactivar / reactivar / eliminar | ✅ | ✅ | ❌ |
| Stock: entrada con motivo | ✅ | ✅ | ✅ |
| Stock: ajuste a la baja | ✅ | ✅ | ❌ |
| Vender | ❌ (no pertenece a una empresa) | ✅ | ✅ |
| Ver ventas | todas | de su empresa | solo las suyas |
| Anular / anular y reemitir | ✅ | ✅ | ❌ |
| Solicitar corrección | ❌ | — | ✅ |
| Ver auditoría | todas | de su empresa | ❌ |
| Reenviar factura por correo | ✅ | ✅ | ✅ (sus ventas) |

Para el SUPER_ADMIN, las acciones dentro de una empresa se hacen con la cabecera `X-Company-Id`. Es la **única** excepción a "el companyId sale del token", solo se acepta si el rol es SUPER_ADMIN, y cada uso queda en la auditoría.

## 5. Endpoints

**Nuevos**

| Método y ruta | Rol | Notas |
|---|---|---|
| `POST /auth/change-password` | todos | Obligatorio si `mustChangePassword` |
| `GET/POST /platform/companies`, `PATCH /platform/companies/:id`, `PATCH .../:id/deactivate` | SUPER_ADMIN | |
| `POST /platform/companies/:id/admin` | SUPER_ADMIN | Contraseña temporal |
| `GET/PATCH /company` | ADMIN | Datos de su empresa |
| `POST /company/onboarding` | ADMIN | Valida NIT con DV, correo, etc. |
| `POST /company/email/send-code`, `POST /company/email/verify` | ADMIN | Código de 6 dígitos, 15 min, 5 intentos |
| `GET/POST /users`, `PATCH /users/:id`, `PATCH /users/:id/deactivate` | ADMIN | Solo SELLER de su empresa |
| `PATCH /categories/:id`, `PATCH .../deactivate`, `.../activate`, `DELETE /categories/:id` | ADMIN | Eliminar solo sin productos |
| `PATCH /products/:id/activate`, `DELETE /products/:id` | ADMIN | Eliminar solo sin ventas |
| `POST /products/:id/stock-entries` | ADMIN, SELLER | Motivo obligatorio |
| `POST /products/:id/stock-adjustments` | ADMIN | Baja con motivo |
| `POST /sales/:id/void`, `POST /sales/:id/reissue` | ADMIN | Motivo obligatorio, atómico |
| `POST /sales/:id/correction-requests`, `GET /correction-requests` | SELLER / ADMIN | |
| `POST /sales/:id/send-invoice` | ADMIN, SELLER | Reintento |
| `GET /audit` | ADMIN, SUPER_ADMIN | Paginado, filtros |
| `GET /review/price-changes`, `GET /review/seller-products` | ADMIN | Panel de revisión |

**Cambios en los existentes:** todos filtran por `companyId`. `POST /products` pasa a permitir SELLER. `PATCH /products/:id` restringe campos según el rol. `GET /sales` aplica "solo las suyas" para SELLER. `POST /sales` acepta `customerEmail`, devuelve `invoiceNumber` y dispara el correo **después** de confirmar, fuera de la transacción.

**Guards, en orden:** `JwtAuthGuard` → `CompanyActiveGuard` (empresa activa) → `OnboardingGuard` (ADMIN con onboarding pendiente solo accede a `/company/onboarding`, `/company/email/*`, `/auth/*`; vendedores de esa empresa reciben 423) → `PasswordChangeGuard` → `RolesGuard`. Un recurso de otra empresa responde **404** (no se revela que existe) y registra `AUTHZ_DENIED` con `reason: CROSS_TENANT`.

## 6. Pantallas nuevas

- **Cambiar contraseña** (primer inicio de sesión).
- **Asistente de configuración inicial** (ADMIN), en 4 pasos con barra de progreso: 1 Datos de la empresa → 2 Contacto + verificación del correo → 3 Facturación con vista previa de la factura → 4 Resumen y confirmar.
- **SUPER_ADMIN:** lista de empresas (estado, onboarding, correo verificado), crear empresa + admin, detalle/edición y auditoría global.
- **ADMIN:** Vendedores · Categorías (editar/desactivar/eliminar) · Revisión (precios y productos de vendedores) · Solicitudes de corrección · Auditoría · Configuración de la empresa.
- **Ventas:** columna Vendedor, estado (Confirmada/Anulada), detalle con factura, botones Anular / Anular y reemitir (ADMIN), Solicitar corrección (SELLER) y Reenviar correo.
- **Menú según el rol.**

## 7. Requisitos nuevos (extensión post-MVP)

| ID | Requisito |
|---|---|
| SWR-TEN-001 | Todo dato de negocio pertenece a una empresa y solo es visible y modificable por usuarios de esa empresa. |
| SWR-TEN-002 | El `companyId` se deriva del token; un acceso a recursos de otra empresa responde 404 y se registra. |
| SWR-TEN-003 | Una empresa desactivada impide el inicio de sesión de sus usuarios y conserva sus datos. |
| SWR-ROLE-001 | Existen los roles SUPER_ADMIN, ADMIN y SELLER con los permisos de la matriz §4. |
| SWR-ROLE-002 | El ADMIN gestiona los vendedores de su empresa. |
| SWR-ROLE-003 | Las categorías solo las gestiona el ADMIN; el SELLER puede crear productos. |
| SWR-ONB-001 | El ADMIN debe cambiar la contraseña temporal y completar la configuración inicial antes de operar; el backend lo exige. |
| SWR-ONB-002 | El NIT se valida con dígito de verificación y el correo con un formato válido. |
| SWR-MAIL-001 | El correo de la empresa se verifica con un código antes de usarse en facturas. |
| SWR-MAIL-002 | Al confirmar una venta con correo del cliente se envía la factura; un fallo de envío no revierte la venta y permite reintentar. |
| SWR-INV-001 | Cada venta tiene un consecutivo de factura único por empresa, sin huecos ni duplicados. |
| SWR-INV-002 | La factura muestra los datos de la empresa y el nombre del vendedor. |
| SWR-SALE-V01 | Una venta confirmada no se modifica; el ADMIN la anula con motivo y el stock se devuelve atómicamente. |
| SWR-SALE-V02 | La reemisión crea una venta nueva vinculada a la original. |
| SWR-SALE-V03 | El SELLER puede solicitar la corrección de sus ventas. |
| SWR-STK-001 | Todo movimiento de stock registra tipo, cantidad, motivo, usuario y fecha; las bajas solo las hace el ADMIN. |
| SWR-CAT-D01 | Categorías y productos se desactivan y reactivan; solo se eliminan si no tienen dependencias. |
| SWR-AUD-001 | Las acciones de la §8 del prompt quedan en un registro de auditoría inmutable con antes/después. |

Se trazan en `Matriz_Maestra_Trazabilidad.xlsx` como "extensión post-MVP", sin modificar los 15 SWR originales. Los SWR originales afectados (SWR-SALE-010 idempotencia, SWR-AUTH-005 roles, SWR-CAT-001 unicidad) se re-prueban y se anota que su alcance pasa a ser por empresa.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Fuga entre empresas** por una consulta sin filtro | Repositorios que exigen `companyId`; prueba automática que recorre todos los endpoints con el usuario de otra empresa; revisión en caja blanca. |
| **Regresión de FAL-01 / DEF-08 / DEF-09** al tocar el SQL de la venta | El consecutivo va dentro de la misma sentencia; se re-ejecutan `carrera-stock.mjs` (3, 5, 10 compradores) y `medir-venta.mjs` (40 secuenciales y 20 concurrentes). |
| **Bloqueo por consecutivo:** toda venta de la misma empresa toca la fila `Company` | Ventas de una misma empresa se serializan en ese punto. Se mide; si p95 > 2 s, se pasa a una secuencia por empresa. |
| **Migración** de restricciones únicas con datos existentes | Probar en una copia, contar filas y tener un plan de reversa. |
| **Correo** marcado como spam o con suplantación | Opción (a): remitente de la plataforma + Reply-To. |
| **Alcance grande** para el tiempo disponible | Entrega por partes: (1) empresas + aislamiento + roles, (2) onboarding, (3) catálogo/stock/auditoría, (4) anulación, (5) correo. Cada parte pasa por develop → qa → main. |
| SUPER_ADMIN con acceso total | Auditoría obligatoria de cada acción en una empresa. |

## 9. Decisiones pendientes (del usuario)

- **a) Precio del producto por el SELLER.** Recomendación: **solo sugerir**. El SELLER propone el precio al crear el producto y queda "pendiente de revisión"; para cambiar el precio de un producto existente crea una solicitud que el ADMIN aprueba. Evita ventas a precio rebajado sin control.
- **b) Envío de correo.** Recomendación: **(a)** remitente de la plataforma (por ejemplo `facturas@<dominio de la plataforma>`), nombre visible = nombre de la empresa, Reply-To = correo verificado de la empresa.
  - (a) Funciona desde el primer día y no exige configuración técnica a la empresa. El cliente ve el nombre de la empresa y sus respuestas llegan a la empresa. Requiere que la plataforma tenga un dominio verificado.
  - (b) El correo sale exactamente desde el dominio de la empresa, pero cada empresa debe tener su propio dominio y configurar registros DNS. No sirve con Gmail/Hotmail.
  - (c) Funciona con cualquier proveedor, pero hay que guardar contraseñas SMTP de terceros (riesgo de seguridad) y Gmail exige contraseñas de aplicación.
  - En desarrollo se usa Ethereal/Mailtrap con credenciales solo en `.env`.
- **c) Correo del cliente en la venta.** Recomendación: **opcional**. En una tienda de barrio muchos clientes no dan correo y hacerlo obligatorio frena la venta. Si se ingresa, se valida el formato y se envía.
