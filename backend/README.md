# TiendApp — Backend

NestJS 11 + Prisma 6 + PostgreSQL (Supabase). El frontend solo accede a la BD a través de esta API.

## Puesta en marcha

```bash
cp .env.example .env      # completar DATABASE_URL, DIRECT_URL, JWT_SECRET y SEED_*
npm install
npm run prisma:migrate    # crea las tablas en la BD
npm run prisma:seed       # crea administrador y vendedor
npm run start:dev         # http://localhost:4000
```

## Endpoints (etapa 2)

| Método | Ruta | Acceso | SWR |
|---|---|---|---|
| GET | /health | Público | — |
| POST | /auth/login | Público | SWR-AUTH-001, SWR-AUTH-002 |
| GET | /auth/me | Sesión | Ruta protegida (guía §5) |

Todas las rutas son protegidas por defecto (JWT); `@Public()` las abre y `@Roles('ADMIN')` restringe por rol (SWR-AUTH-004).

## Pruebas

```bash
npm test          # unitarias (Jest)
npm run test:cov  # con cobertura
npm run lint
```

## Logs

JSON por línea con `timestamp` (-05:00), `level`, `context`, `event`, `message`, `metadata`. Eventos: `APP_STARTED`, `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTHZ_DENIED`, `VALIDATION_REJECTED`, `UNHANDLED_EXCEPTION`. Las claves sensibles (password, token, etc.) se ocultan.
