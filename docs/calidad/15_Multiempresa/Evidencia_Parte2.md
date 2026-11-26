# Multiempresa — Parte 2: cambio de contraseña, configuración inicial y vendedores

Rama: `feature/multiempresa-parte2`. Requisitos: SWR-ONB-001, SWR-ONB-002, SWR-ROLE-002 (pantalla).

## Qué cambió
### Backend
- `POST /auth/change-password` (`currentPassword`, `newPassword`):
  - Exige la contraseña actual, la política de 10 a 72 caracteres con letras y números, y que la nueva sea distinta.
  - Quita la marca de contraseña temporal.
- `PendingStepsGuard`: el backend responde **428** mientras haya un paso obligatorio pendiente.
  - Si la contraseña es temporal, solo permite `/auth/me` y `/auth/change-password`.
  - Si el ADMIN tiene la configuración inicial pendiente, solo permite `/company/*`.
  - El vendedor de una empresa sin configurar recibe 428 con `COMPANY_SETUP`.
- `GET /company`, `POST /company/onboarding`, `PATCH /company`:
  - NIT con dígito de verificación (DIAN, módulo 11).
  - Prefijo y consecutivo inicial de factura.
  - Al cambiar el correo hay que volver a verificarlo.
  - El asistente no se puede completar dos veces.

### Frontend
- **Rutas nuevas:**
  - `/cambiar-contrasena`: obligatoria con contraseña temporal; disponible siempre desde el menú de usuario.
  - `/configuracion-inicial`: asistente de 4 pasos.
  - `/empresa-pendiente`.
  - `/dashboard/vendedores` y `/dashboard/configuracion`.
- **Panel:** redirige al paso pendiente.
- **Menú:** muestra la empresa del usuario.

## Evidencia
| Prueba | Resultado |
|---|---|
| Jest (backend) | 114/114 PASS (16 suites) |
| Vitest + RTL (frontend) | 23/23 PASS (RTL-MT-01 a RTL-MT-10) |
| Lint y typecheck (backend y frontend) | OK |
| Flujo en el navegador (Docker + BD local) | Ver abajo |

### Flujo en el navegador
1. El SUPER_ADMIN crea por API la empresa «Tienda Doña Rosa» y su ADMIN con contraseña temporal.
2. La ADMIN inicia sesión y la aplicación la lleva sola a `/cambiar-contrasena`.
3. Cambia la contraseña y pasa a `/configuracion-inicial`.
4. Completa el NIT 900123456-8, el correo, el teléfono y la ciudad. El prefijo DR- con consecutivo 100 muestra la vista previa «DR-100».
5. Confirma y entra al panel, con Vendedores y Configuración en el menú.
6. Crea al vendedor Carlos, que aparece con el estado «Contraseña temporal».
7. Carlos inicia sesión, es obligado a cambiar la contraseña y entra al panel con el menú de vendedor y su empresa.

## Pendiente
- Panel del SUPER_ADMIN en la interfaz. Por ahora sus funciones solo existen en la API.
- Verificación del correo de la empresa (parte 5).
