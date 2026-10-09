# Acceso a datos

Única capa que usa `src/lib/db.ts` (Prisma) directamente. Todo filtro por `tenantId` para el aislamiento multiempresa se aplica aquí, nunca en los servicios ni en la interfaz.

Excepción: el panel del equipo Teru (`platform.ts`, `platform-companies.ts`)
trabaja por encima de las empresas. Sus cuentas y sesiones no llevan empresa,
y las consultas de empresas devuelven solo datos de la empresa y cifras
agregadas de uso (nunca ventas, productos ni personal en detalle). Sus
servicios (`services/platform/`) exigen la sesión Teru.
