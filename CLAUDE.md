@AGENTS.md
Antes de terminar, actualiza CLAUDE.md con:

- qué implementamos hoy
- qué queda pendiente
- decisiones técnicas tomadas
- errores conocidos
- próximo paso recomendado

No modifiques código funcional.

---

# Estado del proyecto

Reglas del proyecto: `../# Reglas del proyecto.txt` (flujo obligatorio
Analizar → Diseñar → Implementar → Probar → Revisar → Corregir → Aprobar,
un componente a la vez, aprobación explícita antes de continuar).

## Sesión 2026-09-22 — Autenticación del personal

### Implementado (componentes 1–5 aprobados y con commit)

1. **Datos de sesión** (`2473472`): tabla `UserSession` + migración con RLS;
   capa de datos `src/server/data/user-sessions.ts`.
2. **Servicio de autenticación** (`4602d42`): `loginStaff`, `getStaffSession`
   (renovación deslizante), `logoutStaff`; límite de intentos por cuenta (5)
   e IP (20) en 15 min usando `auth_audit_logs`.
3. **Login y logout** (`9ee7a8e`): `/[empresa]/login`, panel provisional
   `/[empresa]`, `src/proxy.ts`, cookie `staff_session` limitada a la ruta de
   la empresa, paleta del diseño en variables de shadcn.
4. **Recuperación de contraseña** (`38d7f87`): `/[empresa]/recuperar`,
   `/[empresa]/restablecer?token=`, `MessageSender` + `/dev/outbox` (solo
   desarrollo), restablecimiento transaccional que revoca sesiones y
   desbloquea la cuenta.
5. **Pruebas, seed y revisión** (`336e15b`): Vitest (16 unitarias, 18 de
   integración contra `su-arepa-test`), `prisma/seed.ts`, README.

Fase inicial pendiente de **aprobación final** (punto 13 de las reglas §9).

### Decisiones técnicas

Detalle en `docs/decisiones/0001-autenticacion-y-sesiones.md`. Resumen:

- Solo login del personal en esta fase; clientes (`Customer`) en otra fase.
- Empresa por slug en la URL (`/su-arepa/...`); slugs reservados: `dev`,
  `api`, `_next`.
- Sesiones propias en BD (sin Auth.js): token aleatorio en cookie httpOnly,
  hash SHA-256 en BD. 12 h deslizantes; "recordar" = cookie de 30 días.
- Contraseñas argon2id, mínimo 8 caracteres.
- Recuperación solo por correo, token de un solo uso (20 min); enlaces con
  `APP_URL`, nunca con la cabecera `Host`.
- Formularios: el slug viaja en un campo oculto, no con `action.bind()`
  (con `bind` + `useActionState` el formulario sin JS se colgaba).
- Entornos de BD: `su-arepa-dev` (`.env`) y `su-arepa-test` (`.env.test`),
  ambos Supabase sa-east-1. Las pruebas se niegan a correr contra dev.

### Cómo trabajar

- **Migraciones:** `prisma migrate dev` NO funciona (la migración de RLS en
  `_prisma_migrations` falla en la shadow DB). Usar `prisma migrate diff
  --from-schema-datasource ... --script`, guardar el SQL con
  `ENABLE ROW LEVEL SECURITY` para tablas nuevas y aplicar con
  `npm run db:migrate:deploy` (dev) y `npm run test:db:migrate` (pruebas).
- Scripts con código `server-only` fuera de Next: `node
  --conditions=react-server --import tsx <archivo>`.
- Verificar siempre: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`.

### Errores y riesgos conocidos

- Cada consulta a Supabase tarda ~0,8 s desde fuera de sa-east-1: el login
  local tarda varios segundos y la suite de integración ~4 min. En producción
  la app debe desplegarse en la misma región que la BD.
- Sin proveedor de correo real, la recuperación falla (igual para todos)
  fuera de desarrollo. **Requisito antes de producción.**
- IP tomada de `x-forwarded-for` (falseable si el hosting no la reescribe).
- Token de restablecimiento en la URL puede quedar en logs del hosting.
- Un tercero puede bloquear 15 min una cuenta conociendo su correo.
- La recuperación responde algo más lento si la cuenta existe.
- La cookie con "recordar" vence a los 30 días del login aunque haya uso.
- `.env` define `NODE_ENV=development` (heredado); Next lo ignora en build.
- npm bloquea los scripts de instalación (`argon2`, `esbuild`); funcionan con
  sus binarios precompilados.

### Próximo paso recomendado

1. Revisión y aprobación final de la fase inicial (probar en el navegador
   `/su-arepa/login` con el OWNER del seed y el flujo de recuperación).
2. Hacer `git push` de los commits de la sesión (no se ha hecho).
3. Antes de la siguiente fase: definir el modelo de roles/permisos, la
   gestión de usuarios (alta de personal) y el proveedor de correo.
