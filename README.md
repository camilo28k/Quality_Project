# TiendApp — MVP

Proyecto final de Calidad de Software (CORHUILA, 2026). Plataforma web de inventario y ventas para un solo establecimiento.

- Requisitos: [docs/srs/SRS_TiendApp_Definitivo_ES.pdf](docs/srs/SRS_TiendApp_Definitivo_ES.pdf)
- Guía del docente: [docs/srs/ProyectoFinalCalidad2026.docx](docs/srs/ProyectoFinalCalidad2026.docx)
- Decisiones técnicas: [docs/DECISIONES.md](docs/DECISIONES.md)
- Dossier de calidad: [docs/calidad/](docs/calidad/)

## Estructura

```
frontend/   Next.js + React + TypeScript (dashboard)
backend/    NestJS + Prisma + PostgreSQL
docs/       SRS, marca, dossier de calidad
```

## Alcance aprobado (15 SWR)

Flujo principal: autenticarse → registrar categoría y producto → registrar venta → descontar inventario.

| Módulo | SWR |
|---|---|
| Usuarios/Auth | SWR-AUTH-001, SWR-AUTH-002, SWR-AUTH-004, SWR-AUTH-005 |
| Productos/Categorías | SWR-PROD-001, SWR-PROD-005, SWR-CAT-001 |
| Ventas | SWR-SALE-003, SWR-SALE-004, SWR-SALE-005, SWR-SALE-007, SWR-SALE-008, SWR-SALE-010, SWR-MED-002, SWR-PAY-001 |
