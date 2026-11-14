# Registro de decisiones técnicas

| ID | Decisión | Origen | Estado |
|---|---|---|---|
| D-01 | Stack: Next.js + React + TypeScript (frontend), NestJS + Prisma (backend), PostgreSQL. El frontend no accede directamente a la BD. Resuelve SWR-CON-006. | Guía docente §6 | Aprobada |
| D-02 | Alcance MVP: 15 SWR (ver README). El resto de la SRS queda fuera del MVP. | Guía §1–2, aprobación del equipo | Aprobada |
| D-03 | Autenticación con correo + contraseña (SWR-AUTH-001); contraseñas con hash adaptativo (SWR-AUTH-005). Resuelve C-01 para el MVP. | SRS + guía §5 | Propuesta |
| D-04 | Moneda COP en enteros, sin decimales; subtotal de líneas en kg/lb redondeado al peso más cercano. Resuelve C-06. | SRS C-06 | Propuesta |
| D-05 | El stock inicial se registra como movimiento de inventario. | Vacío en SRS | Propuesta |
| D-06 | El primer administrador se crea con un script de seed; credenciales en `.env`, no en el repositorio. | Vacío en SRS | Propuesta |
| D-07 | Lotes y vencimientos (SWR-EXP-*) fuera del MVP. C-04 queda abierta. | Selección de alcance | Aprobada |
| D-08 | Quality Gate propio en GitHub Actions: lint + pruebas + umbral de cobertura, sin Sonar (guía §14 no lo exige). | Guía §14 y §26 | Propuesta |
| D-09 | Trazabilidad SWR→SYS tomada de la columna «Fuente» de cada SWR; el Anexo A de la SRS presenta filas desalineadas y se documentará el ajuste. | Revisión de la SRS | Propuesta |
| D-10 | Plantilla de dashboard: next-shadcn-dashboard-starter (Kiranism, GitHub). Falta guardar URL exacta y captura original en `docs/marca/`. | Guía §4 | Aprobada |
| D-11 | Base de datos: PostgreSQL en Supabase, accedida solo desde el backend vía Prisma. | Guía §6 | Aprobada |
| D-12 | Repositorio GitHub creado por el equipo; push solo con autorización. | Equipo | Aprobada |
| D-14 | Medios de pago: la venta ofrece efectivo, tarjeta y transferencia (SRS §2.2); solo SWR-PAY-001 se traza como SWR del MVP (AJ-09). | Verificación de requisitos | Aprobada |
| D-13 | Identidad visual: propuesta en `docs/marca/FICHA_MARCA.md`. | Guía §4 | Propuesta |
