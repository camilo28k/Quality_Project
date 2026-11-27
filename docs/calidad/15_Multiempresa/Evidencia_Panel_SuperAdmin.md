# Multiempresa — Panel del SUPER_ADMIN

Rama: `feature/panel-superadmin`. Cubre en la interfaz lo que la parte 1 dejó solo en la API (SWR-ROLE-001, SWR-TEN-003, SWR-AUD-001).

## Qué cambió
### Backend
- `GET /platform/companies/:id`: ahora incluye **ventas confirmadas (cantidad y total)**.
- **Restablecer contraseña** (soporte cuando alguien la olvida). Se asigna una contraseña temporal: el usuario deberá cambiarla al entrar, su sesión abierta se cierra y queda auditado como `USER_PASSWORD_RESET`, sin la clave.
  - `POST /platform/companies/users/:userId/reset-password`: el SUPER_ADMIN, para cualquier usuario de una empresa. No aplica a otro SUPER_ADMIN.
  - `POST /users/:id/reset-password`: el ADMIN, solo para vendedores de su empresa.

### Frontend
- **Menú «Plataforma»** del SUPER_ADMIN: Panel, Empresas y Auditoría.
- **Empresas (`/dashboard/empresas`):**
  - Lista con estado (Activa, Configurando, Desactivada, Correo sin verificar), usuarios, productos y ventas.
  - **Alta de empresa con su ADMIN** en un solo formulario. Si la empresa se crea pero el ADMIN falla, se dice claramente para completarlo desde el detalle.
- **Detalle de empresa (`/dashboard/empresas/[id]`):**
  - Ventas confirmadas y total, NIT y próxima factura.
  - Edición del nombre y el correo. Un correo nuevo debe volver a verificarse.
  - **Desactivar o activar** con confirmación que explica el efecto.
  - Usuarios, con «Restablecer contraseña» y «Agregar administrador».
  - Auditoría de la empresa.
- **Auditoría global:** columna Empresa y filtro por empresa.
- **Vendedores (ADMIN):** botón «Restablecer contraseña».

## Defecto de interfaz encontrado y corregido
**DEF-MT-03: la página tenía scroll horizontal** con el menú lateral abierto (46 px de más en el detalle de empresa; en Ventas los botones quedaban fuera de la ventana).
- **Causa:** el contenedor principal, que es un elemento flex, no podía encogerse por debajo del ancho de su contenido.
- **Corrección:** `min-w-0` en el contenedor del panel, así que las tablas anchas hacen scroll dentro de su caja. Además, la grilla del detalle usa 2 columnas en pantallas medianas.
- **Verificado:** `scrollWidth` 1070 → 1014 px con ventana de 1024 px; el resto es la barra vertical.

## Evidencia
| Prueba | Resultado |
|---|---|
| Jest (backend) | **183/183 PASS**; Quality Gate OK |
| Vitest + RTL (frontend) | **46/46 PASS** (RTL-MT-27 a RTL-MT-32 nuevos) |
| Lint y typecheck | OK |
| Navegador (Docker + BD local) | Ver abajo |

### Flujo en el navegador
1. El SUPER_ADMIN entra y ve el menú «Plataforma» (Panel, Empresas, Auditoría).
2. Crea «Panadería El Trigo» con su ADMIN Luis Torres desde el formulario y aparece en la lista.
3. En el detalle ve el estado «Configurando», el ADMIN con su correo, la próxima factura FAC-1 y la auditoría de la empresa con `USER_CREATED` y `COMPANY_CREATED`.
4. En la auditoría global, las acciones de todas las empresas aparecen con la columna Empresa y el filtro.
