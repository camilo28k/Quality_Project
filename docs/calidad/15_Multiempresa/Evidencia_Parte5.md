# Multiempresa — Parte 5: correo de la empresa y envío de facturas

Rama: `feature/multiempresa-parte5`. Requisitos: SWR-MAIL-001, SWR-MAIL-002.
Decisión (b) aplicada: **opción (a)**. El correo sale desde la dirección de la plataforma (`MAIL_FROM_ADDRESS`) con el **nombre de la empresa** como remitente y **Reply-To al correo verificado de la empresa**. Así no se suplanta un dominio ajeno y las respuestas del cliente le llegan a la empresa.

## Qué cambió
- **Migración** `20261129120000_multiempresa_parte5`:
  - Tabla `EmailVerification`: guarda solo el **hash** del código, la vigencia, los intentos y la fecha de uso.
  - Tabla `InvoiceEmail`: un registro por cada envío o intento fallido, con su tipo (factura, corregida o anulación) y el error.
- **Envío de correo** con `nodemailer` 10.5.0, fijado en una versión de más de dos semanas.
  - La configuración se toma de `SMTP_*` y `MAIL_FROM_ADDRESS` en `.env`.
  - Desarrollo y pruebas usan **Mailpit** (SMTP local, sin salida a Internet), agregado a `docker-compose.yml`.
  - Todo dato de usuario se **escapa** en el HTML del correo.
- **Verificación del correo de la empresa (SWR-MAIL-001):** `POST /company/email/send-code` y `/company/email/verify`, solo para el ADMIN.
  - El código tiene 6 dígitos, vence en 15 minutos y admite 5 intentos. Hay que esperar 60 s entre envíos.
  - El código solo vale para el correo al que se envió.
  - Cambiar el correo de la empresa obliga a verificarlo de nuevo (parte 2).
  - Queda auditado como `COMPANY_EMAIL_VERIFIED`. El código nunca aparece en los logs.
- **Factura por correo (SWR-MAIL-002):**
  - Al confirmar una venta con correo del cliente, la factura se envía **después** de confirmar, en segundo plano. **Un fallo no revierte la venta**: queda registrado y se puede reintentar.
  - No se envía a nombre de una empresa con el correo sin verificar; ese intento se registra como fallido con el motivo.
  - Al **anular** una venta cuya factura ya se había enviado, el cliente recibe el aviso de anulación con el motivo.
  - Al **reemitir**, el cliente recibe la factura corregida, que indica a cuál reemplaza.
  - `POST /sales/:id/send-invoice` permite reintentar o enviar a otro correo. `GET /sales/:id/emails` muestra el historial. Ambos respetan el acceso a la venta: otra empresa recibe 404.
  - Logs `INVOICE_SENT` e `INVOICE_SEND_FAILED`.
- **Pantallas:**
  - Configuración: verificación del correo con el código.
  - Factura: «Enviar por correo» con el historial de envíos (enviado o falló, con el motivo).

## Evidencia (BD PostgreSQL local + Mailpit)
| Prueba | Resultado |
|---|---|
| Migración sobre la copia local | Aplicada; `migrate diff` sin diferencias |
| Jest (backend) | **179/179 PASS**; Quality Gate de cobertura OK |
| Vitest + RTL (frontend) | **40/40 PASS** (RTL-MT-23 a RTL-MT-26 nuevos) |
| Lint y typecheck | OK |
| `scripts/correo-facturas.mjs` (API real + buzón de Mailpit) | **23/23 PASS** |
| Regresiones: anulación y factura, catálogo, aislamiento, carrera, Postman | 26/26 · 43/43 · 32/32 · PASS · 31/31 |
| Tiempos con BD local (40 secuenciales) | 40/40 ≤ 2 s; el envío no está en el camino de la venta |

### Qué verifica `correo-facturas.mjs`
- Una venta con correo del cliente se confirma aunque la empresa no esté verificada. El envío queda en `FAILED` con el motivo «no verificado».
- El vendedor no puede pedir el código (403).
- El código llega al correo de la empresa. Otro pedido antes de un minuto responde 429.
- Un código incorrecto responde 400 e indica cuántos intentos quedan. El correcto deja la empresa verificada.
- La factura llega al cliente, y Mailpit confirma:
  - **Remitente** = nombre de la empresa con la dirección de la plataforma.
  - **Reply-To** = correo verificado de la empresa.
  - **Contenido** con el número, el vendedor y el total.
  - **Nombre del producto con `<b>` escapado** en el HTML.
- Una venta sin correo del cliente no envía nada.
- El reintento manual de la factura que había fallado queda en `SENT`. También funciona enviar a otro correo; un correo inválido responde 400.
- Al anular, llega el aviso con el motivo. Al reemitir, llega la factura corregida, que dice a cuál reemplaza.
- El historial de envíos de la venta queda así: `INVOICE:SENT` y `VOID_NOTICE:SENT`. Otra empresa recibe 404 al consultarlo.
- La auditoría registra `COMPANY_EMAIL_VERIFIED`.

Logs de la corrida: `COMPANY_EMAIL_CODE_SENT` 1, `COMPANY_EMAIL_CODE_REJECTED` 1, `COMPANY_EMAIL_VERIFIED` 1, `INVOICE_SENT` 6, `INVOICE_SEND_FAILED` 1. **El código no aparece en los logs.**

### Flujo en el navegador (Docker + BD local + Mailpit)
1. Rosa abre Configuración y pide el código.
2. El código llega a la bandeja de Mailpit del correo de la empresa, con remitente «Tienda Doña Rosa».
3. Rosa lo escribe y el correo queda verificado.
4. En la factura DR-102 pulsa «Enviar». Aparece el historial «Enviado · Factura corregida».
5. En Mailpit, el correo muestra:
   - **From** «Tienda Doña Rosa <facturas@tiendapp.test>».
   - **Reply-To** ventas@donarosa.test.
   - **Asunto** «Factura corregida DR-102 de Tienda Doña Rosa».
   - El NIT, el texto «reemplaza a la DR-100», el detalle y el total $16.900.

## Observaciones
- **`npm audit`:** reporta 4 vulnerabilidades altas que **ya existían**, en dependencias de `prisma` (`deepmerge-ts`, `effect`), no en el correo. Se registran como observación y no se aplica `npm audit fix --force` porque cambia versiones mayores.
- **Producción:** falta configurar un SMTP real y un dominio de la plataforma con SPF/DKIM. Es configuración de despliegue, no de código.
