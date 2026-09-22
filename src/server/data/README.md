# Acceso a datos

Única capa que usa `src/lib/db.ts` (Prisma) directamente. Todo filtro por `tenantId` para el aislamiento multiempresa se aplica aquí, nunca en los servicios ni en la interfaz.
