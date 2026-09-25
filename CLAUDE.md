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

**Fase inicial aprobada** (2026-09-22). Documentación de cierre en
`dc38046` y `1e66517`. Todo subido a GitHub (`terutechnologies-ops/teru-pos`,
rama `master`); local y remoto sincronizados, sin cambios pendientes.

Datos existentes:
- `su-arepa-dev`: empresa `su-arepa` con su OWNER (creado con el seed).
- `su-arepa-test`: esquema al día; las pruebas limpian sus propios datos.

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

### Próximo paso recomendado (cerrado)

Resuelto en la sesión 2026-09-23: ver fase 2 abajo. El proveedor de correo
sigue pendiente.

## Sesión 2026-09-23 — Fase 2: Empresa, sucursal y equipo

Referencia visual: `../Diseño_configuracion_empresa.txt` (asistente de 4
pasos). **Es solo guía visual**: se puede mejorar y no se modela todo lo que
muestra; los datos se agregan cuando el módulo que los usa se construye.

### Alcance aprobado (opción A)

Pasos 1 (datos de empresa, moneda y formatos) y "Equipo" del asistente, más
sucursal principal. Los pasos de insumos y producto/receta se sumarán al
asistente cuando existan los módulos de inventario y productos. Fuera de
alcance por ahora: impuestos, redondeo de efectivo, logo, rubro, invitación
por celular, POS/caja, roles nuevos.

Decisiones del usuario:
- Alta de personal por **invitación con enlace** (token de un solo uso,
  72 h, se envía por `MessageSender`; outbox en dev).
- Empresas nuevas **por script** (`npm run company:create`), sin registro
  público ni superadmin.
- **Roles fijos + permisos en código** (OWNER, ADMIN, STAFF; se agregan
  roles como CASHIER cuando exista el módulo que los necesite).

Componentes:
1. Modelo de datos — **aprobado** (2026-09-24, ver abajo).
2. Autorización — **aprobado** (2026-09-24, ver abajo).
3. Asistente paso 1 "Negocio" — **aprobado** (2026-09-24, ver abajo).
4. Paso Equipo: invitar/listar/reenviar/revocar, desactivar miembros, página
   `/[empresa]/invitacion?token=` para crear contraseña.
5. Confirmación y cierre: resumen, marcar configuración completa, pruebas,
   revisión, ADR 0002 y README.

### Componente 1 — Modelo de datos (aprobado)

- `Company` + `taxId`, `phone`, `email`, `address` (opcionales, texto libre)
  y `setupCompletedAt`. `currency`/`dateFormat` ya existían; la moneda se
  validará contra lista ISO 4217 en código y el formato sale de `Intl`.
- `Branch` (sin vincular usuarios aún). Índice único parcial
  `branches_one_main_per_company` (solo en SQL).
- `StaffInvitation` (hash del token, `invitedById` null = script, `userId`
  al aceptar). Tabla aparte en lugar de `User` inactivo para no tocar el
  login aprobado.
- Migración `20260923120000_add_company_setup_branches_invitations`: RLS en
  tablas nuevas y backfill de "Sede principal" para empresas existentes.
  **Ya aplicada en `su-arepa-test` y `su-arepa-dev`.**
- Datos: `src/server/data/companies.ts` (config, marcar completado, alta con
  invitación OWNER), `branches.ts`, `staff-invitations.ts` (reemplazar,
  buscar válida, listar pendientes, revocar, aceptar transaccional con
  resultados `ACCEPTED | INVALID | EMAIL_TAKEN`).
- Servicio `createCompany` en `src/server/services/companies.ts`; script
  `scripts/create-company.ts`; `STAFF_INVITATION_TTL_MS` y `STAFF_EVENTS`
  en `services/auth/config.ts` (auditoría en `auth_audit_logs`).
- Seed crea también la sucursal principal. `emailSchema` ahora exportado.
- Pruebas: `tests/integration/company-setup-data.test.ts` (8). Verificado:
  typecheck, lint, build y suite completa (42/42).

### Componente 2 — Autorización (aprobado)

- `src/server/services/auth/permissions.ts`: permisos `company.setup` y
  `team.manage`, ambos solo OWNER (decisión del usuario; dar `team.manage`
  a ADMIN es una línea). `hasPermission`, `assertPermission` (lanza
  `ForbiddenError`, para servicios).
- `requirePermission(slug, permiso)` en `http/staff-session.ts`: sin permiso
  redirige al panel. No se usa `forbidden()` (experimental en Next 16).
- La sesión trae `company.setupCompletedAt` (DTO y `findActiveCompanyBySlug`).
- `(panel)/layout.tsx`: con configuración incompleta, quien tiene
  `company.setup` va a `/[empresa]/configuracion`; el resto ve el panel con
  un aviso (sin bucle de redirecciones).
- `/[empresa]/configuracion`: esqueleto protegido; si ya está completa,
  redirige al panel. El contenido llega en el componente 3.
- **Corrección del componente 1** hallada al probar: `acceptStaffInvitation`
  leía la invitación sin bloquearla y, en una carrera, la segunda aceptación
  podía responder `EMAIL_TAKEN` en vez de `INVALID` (prueba intermitente).
  Ahora reclama primero con `updateManyAndReturn` (bloquea la fila) y crea el
  usuario conectado a la invitación; un P2002 deshace el reclamo y da
  `EMAIL_TAKEN`.
- Pruebas: `tests/unit/permissions.test.ts` (2) y `setupCompletedAt` en
  `staff-auth.test.ts`. Verificado: typecheck, lint, build, suite 44/44 y el
  archivo de invitaciones 3 veces seguidas.
- No probado a mano en el navegador. Nota: `su-arepa` en dev tiene
  `setupCompletedAt` null, así que su OWNER ahora cae en `/configuracion`.

### Componente 3 — Paso "Negocio" (aprobado)

- Stepper de 3 pasos en esta fase: Negocio → Equipo → Confirmar (insumos y
  producto se insertan con sus módulos). `configuracion/layout.tsx` (permiso,
  redirige al panel si ya está completa, encabezado y stepper con
  `useSelectedLayoutSegment`); `/configuracion` redirige a `/negocio`.
- `src/lib/company-formats.ts` (cliente y servidor): monedas ISO desde
  `Intl.supportedValuesOf`, `formatMoney` con separadores `es-CO` fijos
  (**decisión**: el formato de números por empresa se agrega con productos y
  precios), `formatDate` con componentes UTC (sin desajustes de zona).
- `companyProfileSchema` (vacíos → null, correo opcional, moneda ISO,
  3 formatos de fecha); servicios `getCompanyProfile` y `saveCompanyProfile`
  con `assertPermission`. Sin migración.
- Formulario: moneda con 4 tarjetas + "Otra" (radio `OTRA` + selector con la
  lista completa; funciona sin JS), fecha en tarjetas, vista previa en vivo.
  Sin botón de borrador: cada guardado queda en BD y se retoma al volver.
  Guardar llama a `refresh()` (el nombre sale en el encabezado). Hasta el
  componente 4 muestra "Datos guardados" en la misma página.
- Pruebas: `tests/unit/company-profile.test.ts`,
  `tests/integration/company-profile.test.ts`. Verificado: typecheck, lint,
  build, suite 58/58. Probado por HTTP contra dev (sin navegador): cadena de
  redirecciones, render, envío sin JS con errores y guardado.
- Scripts ad hoc contra dev: `node --env-file=.env --conditions=react-server
  --import tsx <archivo>` y sin `await` de nivel superior (tsx compila a CJS).

### Paleta TERU, esquema híbrido (aprobada)

Su Arepa es marca de TERU: los colores salen de `../Paleta@1x.png` (se
reemplazó una primera versión Oro/Papiro el mismo día). Paleta: Morado
intenso `#6C2BFF`, Verde lima `#B8FF3D`, Negro `#111114`, Blanco `#F7F7F5`,
Morado oscuro `#24104F`. Esquema híbrido aprobado por el usuario:
- Contenido claro: fondo Blanco, texto Negro, tarjetas `#FFFFFF`; `primary`
  Morado con texto blanco (5.7:1); texto morado de apoyo `accent-foreground`
  `#4A1DB8`; enlaces `link` = Morado.
- Estructura oscura: tokens nuevos `brand` (Morado oscuro) y `highlight`
  (Lima, texto Negro). Fondo de las pantallas de acceso (`AuthShell`) y
  encabezado del asistente. `sidebar-*` ya apunta a lo mismo para el futuro.
- Reglas: un solo color de acción por zona (morado en claro, lima en
  oscuro); lima nunca como texto sobre claro (1.12:1); morado sobre negro
  solo en formas grandes (3.08:1).
- Grises fríos derivados del negro; `destructive` `#C4231A` y `success`
  `#1E7B34` propios para no confundirlos con el CTA. Advertencia (ámbar) se
  agrega cuando algo la use.
- Pantallas oscuras completas (POS, cocina) cuando existan esos módulos.
  `.dark` sigue con valores por defecto de shadcn (no se activa).
- Verificado: lint y build; revisada y aprobada por el usuario frente a las
  otras dos paletas (crema/naranja del diseño y TERU v1 Oro/Papiro).

### Errores y riesgos conocidos (fase 2)

- El enlace de `company:create` apunta a `/[empresa]/invitacion`, que aún no
  existe (componente 4): hasta entonces da 404.
- Aceptar una invitación con correo ya registrado devuelve `EMAIL_TAKEN`
  sin consumirla; el servicio del componente 4 debe evitar invitar correos
  con cuenta activa.

### Sesión 2026-09-24 — resumen

- Componentes 1, 2 y 3 aprobados, con commit y subidos (`ffb7eca`,
  `1e7e39d`, `5dddf7b`) + corrección de desborde en la tarjeta de moneda
  (`8567a70`: los `fieldset` tienen `min-width: min-content`; usar `min-w-0`
  en fieldsets y elementos de grilla con selects de opciones largas).
- Corregida una carrera en `acceptStaffInvitation` (ver componente 2).
- Paleta TERU híbrida aprobada (ver arriba). Referencia: `../Paleta@1x.png`.
- Local y remoto sincronizados, sin cambios pendientes.

### Próximo paso recomendado

Analizar/Diseñar el componente 4 (paso Equipo): invitar, listar, reenviar y
revocar invitaciones, desactivar miembros, página `/[empresa]/invitacion`
para crear la contraseña (hoy da 404 el enlace de `company:create`), y hacer
que "Guardar y continuar" del paso Negocio redirija a `/equipo`. Tener en
cuenta: no invitar correos con cuenta activa (`EMAIL_TAKEN`), aplicar la
paleta híbrida y el patrón de formularios del paso Negocio (slug en campo
oculto, `useActionState`, funciona sin JS). Después, componente 5.
