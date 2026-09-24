# Teru POS

Sistema de gestión multiempresa (ventas, inventario, caja, etc.). La
arepería **Su Arepa** es el primer caso de uso real, no el modelo del sistema.

**Estado:** fase inicial (base del proyecto y autenticación del personal).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript estricto
- PostgreSQL (Supabase) + Prisma 6
- Tailwind CSS 4 + shadcn/ui
- Vitest para pruebas
- Docker (imagen de la app y Postgres local opcional)

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completar DATABASE_URL, DIRECT_URL y APP_URL
npm run db:migrate:deploy # aplica las migraciones
npm run db:seed           # crea la empresa su-arepa y su OWNER (ver abajo)
npm run dev
```

Login del personal: `http://localhost:3000/<slug-empresa>/login`
(ej. `/su-arepa/login`). En desarrollo, los correos (recuperación de
contraseña) se ven en `http://localhost:3000/dev/outbox`.

### Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión de la app (Supabase: transaction pooler, puerto 6543) |
| `DIRECT_URL` | Conexión para migraciones (session pooler, puerto 5432) |
| `APP_URL` | URL pública, para armar enlaces de recuperación |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_PASSWORD` | Solo para `npm run db:seed` |

Los archivos `.env*` no se versionan (salvo `.env.example`).

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (`output: standalone`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera tipos de rutas y ejecuta `tsc` |
| `npm test` | Pruebas unitarias e integración |
| `npm run test:db:migrate` | Aplica migraciones a la BD de pruebas (`.env.test`) |
| `npm run db:migrate:deploy` | Aplica migraciones pendientes |
| `npm run db:seed` | Datos iniciales (idempotente) |
| `npm run company:create -- --name ... --slug ... --owner-name ... --owner-email ...` | Alta de empresa: sucursal principal + enlace de invitación del propietario (72 h) |

## Pruebas

- **Unitarias** (`tests/unit`): no requieren BD.
- **Integración** (`tests/integration`): corren contra el proyecto Supabase
  `su-arepa-test`, configurado en `.env.test` (mismas variables que `.env`).
  Se niegan a correr si `.env.test` apunta a la BD de desarrollo.

```bash
npm run test:db:migrate   # una vez, y tras cada migración nueva
npm test
```

## Migraciones

`prisma migrate dev` **no** funciona en este proyecto: la migración que
habilita RLS sobre `_prisma_migrations` falla al reaplicarse en la shadow
database. Flujo para crear una migración:

1. Editar `prisma/schema.prisma`.
2. Generar el SQL contra la BD real:
   ```bash
   npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma --script
   ```
3. Guardarlo en `prisma/migrations/<AAAAMMDDHHMMSS>_<nombre>/migration.sql`
   y agregar `ENABLE ROW LEVEL SECURITY` a cada tabla nueva.
4. `npm run db:migrate:deploy` y `npx prisma generate`.

Nunca editar una migración ya aplicada: crear una nueva.

## Estructura

```
src/
  app/                  Rutas (App Router)
    [empresa]/          Rutas por empresa: login, recuperar, restablecer, panel
    dev/outbox/         Bandeja de correos (solo desarrollo)
  components/
    ui/                 Componentes shadcn/ui
    shared/             Componentes propios reutilizables
  lib/                  Cliente Prisma y utilidades
  proxy.ts              Redirección optimista a login (no es autorización)
  server/
    data/               Único acceso a Prisma; filtra siempre por empresa
    services/           Lógica de negocio (auth, empresas, mensajería)
    http/               Adaptador Next: cookies, cabeceras, sesión actual
    validations/        Esquemas Zod
    dto/                Tipos expuestos fuera de los servicios
prisma/                 Esquema, migraciones y seed
tests/                  Pruebas unitarias e integración
docs/decisiones/        Decisiones de arquitectura (ADR)
```

## Decisiones

- [ADR 0001 — Autenticación y sesiones](docs/decisiones/0001-autenticacion-y-sesiones.md)
