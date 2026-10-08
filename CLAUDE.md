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
4. Paso Equipo — **aprobado** (2026-09-26, ver abajo).
5. Confirmación y cierre — **aprobado** (2026-09-27, `fe9033c`). Revisión,
   ADR 0002 y README hechos. **Fase 2 aprobada** (2026-09-27).

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
  Guardar llama a `refresh()` (el nombre sale en el encabezado) y, desde el
  componente 4, redirige a `/configuracion/equipo`.
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

### Componente 4 — Paso "Equipo" (aprobado)

Diseño aprobado por el usuario el 2026-09-26 con estas decisiones: se
invitan ADMIN ("Administrador") y STAFF ("Personal"), el OWNER no; se
incluye reactivar; tras aceptar la invitación se va al login (sin inicio
de sesión automático); la gestión del equipo vive solo en el asistente
hasta que exista la navegación del panel.

- `src/lib/staff-roles.ts`: etiquetas de roles, `INVITABLE_ROLES` y sus
  descripciones (cliente y servidor).
- Datos: `users.ts` + `userExistsWithEmail`, `listCompanyMembers` y
  `setMemberActive` (nunca OWNER; al desactivar revoca sesiones en la misma
  transacción). `staff-invitations.ts` + `findPendingStaffInvitation`
  (incluye vencidas, para reenviar).
- Servicio `src/server/services/team.ts` (todo con `team.manage`): `getTeam`,
  `inviteStaffMember` (rechaza correos con cuenta, así se evita
  `EMAIL_TAKEN`), `resendStaffInvitation` (token nuevo; el anterior deja de
  servir), `revokeInvitation`, `setStaffMemberActive` (ni a uno mismo ni al
  OWNER). Pública: `getInvitationPreview` y `acceptInvitation`, que reutiliza
  `passwordResetSchema`. Auditoría: `STAFF_EVENTS` + `INVITATION_RESENT`,
  `MEMBER_DEACTIVATED` y `MEMBER_REACTIVATED`. Validación en
  `validations/team.ts`.
- UI `/[empresa]/configuracion/equipo`: formulario de invitación (rol en
  tarjetas con `has-[:checked]`, sin estado en el cliente) y lista de
  miembros e invitaciones (enviada/vencida y tiempo restante). Un formulario
  por botón de fila (`row-action.tsx`, `useActionState`), por lo que funciona
  sin JS. Pie con "Atrás" y "Continuar" (este último lleva a `/confirmar`,
  que llega en el componente 5 y hasta entonces da 404).
- `/[empresa]/invitacion?token=` (pública; se agregó a `PUBLIC_COMPANY_PATHS`
  del proxy): muestra nombre, correo y rol, y al aceptar redirige a
  `login?cuenta=creada`, que muestra un aviso.
- Refactor: `components/shared/new-password-form.tsx` (`NewPasswordForm`)
  reemplaza a `restablecer/reset-form.tsx` y se usa en restablecer y en la
  invitación.
- Error hallado por las pruebas y corregido: al reenviar se propagaba el
  `id` de la invitación anterior al crear la nueva (violaba la clave única).
  Ahora `sendInvitation` pasa los campos explícitos.
- Pruebas: `tests/integration/team.test.ts` (9). Verificado: suite 67/67, typecheck,
  lint y build. Prueba manual por HTTP contra dev con `next dev` y
  formularios enviados sin JS: invitar (con errores y sin ellos), outbox,
  invitación válida y falsa, contraseña corta, cuenta creada, login del
  invitado, invitado sin acceso al asistente, desactivar (cierra su sesión)
  y Negocio → Equipo. Los datos de esa prueba se borraron de dev.
- Para enviar formularios de Server Actions sin navegador hay que usar
  `multipart/form-data` con los campos ocultos `$ACTION_*` del HTML; con
  urlencoded Next responde 200 y no ejecuta la acción.

### Errores y riesgos conocidos (fase 2)

- "Continuar" del paso Equipo da 404 hasta que exista `/confirmar`
  (componente 5).
- Desactivar no se confirma con un diálogo; se puede revertir con
  Reactivar.
- ADMIN aún no tiene ningún permiso: invitarlo solo le da acceso al panel.
- Navegador compartido: si al aceptar una invitación ya hay otra sesión de
  la empresa abierta (p. ej. la del propietario), el login redirige con esa
  sesión y el invitado no entra con su cuenta. En incógnito funciona bien
  (probado por el usuario el 2026-09-26). **Decisión del usuario: se deja
  así**, porque el invitado abre el enlace desde su propio equipo. Mitigado
  después: el login ahora muestra la sesión abierta y permite cerrarla.

### Sesión 2026-09-24 — resumen

- Componentes 1, 2 y 3 aprobados, con commit y subidos (`ffb7eca`,
  `1e7e39d`, `5dddf7b`) + corrección de desborde en la tarjeta de moneda
  (`8567a70`: los `fieldset` tienen `min-width: min-content`; usar `min-w-0`
  en fieldsets y elementos de grilla con selects de opciones largas).
- Corregida una carrera en `acceptStaffInvitation` (ver componente 2).
- Paleta TERU híbrida aprobada (ver arriba). Referencia: `../Paleta@1x.png`.
- Local y remoto sincronizados, sin cambios pendientes.

### Sesión 2026-09-26 — resumen

- Componente 4 (paso Equipo) implementado, verificado y **aprobado** por el
  usuario (probado en el navegador, en incógnito para el invitado).

### Componente 5 — Confirmar y cierre (diseño aprobado, sin implementar)

Aprobado por el usuario el 2026-09-26:
- `/configuracion/confirmar`: resumen en tarjetas (Negocio con ejemplo de
  moneda y fecha y enlace "Editar"; Sede principal con la dirección de
  Negocio; Equipo con miembros activos e invitaciones pendientes y enlace
  "Editar"), bloque "Todo listo" con "Finalizar configuración" y "Atrás".
- `completeCompanySetup(session)`: `company.setup`, `markCompanySetupCompleted`,
  evento `COMPANY_SETUP_COMPLETED` en auditoría y redirección al panel;
  idempotente.
- Las invitaciones pendientes no bloquean el cierre.
- Tras finalizar, el asistente se cierra y no hay dónde editar negocio ni
  equipo hasta que exista la navegación del panel: **lo primero de la
  siguiente fase** será el esqueleto del panel con su sección de
  configuración.
- Pruebas de integración + prueba manual por HTTP; revisión de la fase 2,
  ADR 0002 y README.

### Ajustes previos al componente 5 (aprobados 2026-09-26)

1. **Plataforma vs. empresa cliente.** Teru POS es la plataforma; Su Arepa es
   una empresa cliente (tenant), no la compañía del sistema. El usuario había
   cambiado a mano en `su-arepa-dev` el slug de Su Arepa a `teru-pos`; se
   devolvió a `su-arepa` con un script de un solo uso (no queda en el repo).
   El slug se considera fijo: va en enlaces enviados por correo. Si algún
   día hay que cambiarlo, será con un script de soporte con auditoría, no
   editando la BD.
2. **Marca Teru POS visible:** `src/lib/brand.ts` (`PLATFORM_NAME`),
   `components/shared/platform-mark.tsx` ("Con la tecnología de Teru POS")
   en el pie de `AuthShell` y bajo el nombre de la empresa en el encabezado
   del asistente. Títulos de pestaña "Página · Empresa · Teru POS": plantilla
   en `app/layout.tsx` y en el nuevo `[empresa]/layout.tsx`
   (`generateMetadata`), con `getRequestCompany` (`server/http/company.ts`,
   `cache()` para no repetir la consulta en la página).
3. **Página raíz `/`:** reemplaza la plantilla de Next; presenta Teru POS con
   un formulario "Ingresa a tu empresa" (`company-finder.tsx` + Server
   Action `findCompanyAction` en `app/actions.ts`; POST para que al recargar
   no se repita la búsqueda ni quede lo escrito en la URL): `toCompanySlug` (`validations/auth.ts`) normaliza lo escrito ("Su
   Arepa", "/su-arepa/login", tildes) y redirige a `/[slug]/login`; si no
   existe, avisa en la misma página. No lista empresas (saber si una existe
   ya era posible probando la URL). Idea para después: recordar la última
   empresa usada.
   Diseño de la raíz (referencia del usuario, colores de la paleta): marco
   translúcido, tarjeta clara con el logo de Teru POS, título y subtítulo, y
   tarjeta interna con el formulario (ícono de tienda dentro del campo,
   botón morado con sombra). El sufijo ".teru.app" de la referencia no se
   usó porque las URL son por ruta (`/empresa`), no por subdominio. El
   degradado morado→verde del botón y el brillo verde tampoco: con esta
   paleta el lima sobre morado oscuro se ve gris oliva, así que ambos
   brillos son morados.
   Logo: `src/assets/brand/logo-teru.png` (256 px), sacado de
   `../logo-teru.png`, que trae el cuadriculado de "transparencia" pintado;
   se recortó con máscara y alfa real. Importación estática para que el
   nombre cambie con el contenido (el optimizador de imágenes de `next dev`
   guardaba la versión vieja de `public/`). **Solo se usa en `/`**: dentro de
   cada empresa sigue el ícono de tienda.
4. **Pantallas de acceso con la misma estructura** (`AuthShell`): login,
   recuperar, restablecer e invitación. Marco translúcido, tarjeta clara
   con la identidad de la empresa (ícono de tienda lima sobre morado
   oscuro, nombre y "eyebrow") y tarjeta interna con ícono de la página,
   título, descripción y formulario. Sin encabezado superior; firma "Con la
   tecnología de Teru POS" al pie. Campos (`auth-fields`) y botones de acceso
   con el estilo del formulario de la raíz: borde de 2 px, `rounded-xl`,
   anillo de foco morado y sombra morada en el botón. La API de `AuthShell`
   no cambió.
5. **Login con sesión abierta** (error reportado por el usuario: desde
   recuperar, "Volver a iniciar sesión" terminaba en el asistente). El login
   ya no redirige en silencio al panel si hay sesión: muestra "Ya iniciaste
   sesión" con el usuario, "Continuar" y "Cerrar sesión y usar otra cuenta"
   (`login/active-session.tsx`, reutiliza `logoutAction`). Probado por HTTP:
   login → recuperar → login muestra la sesión → cerrar → formulario.

Verificado: typecheck, lint, build, pruebas unitarias (35) y consultas HTTP
(títulos, firma, formulario de `/` y `/teru-pos/login` → 404).

### Sesión 2026-09-26 — cierre

- Componente 4 aprobado y subido (`b1bcc81`).
- Diseño del componente 5 aprobado (ver arriba), sin implementar.
- Ajustes previos al componente 5 (puntos 1–5) aprobados por el usuario y
  subidos. Verificado: typecheck, lint, build, pruebas unitarias y pruebas
  por HTTP. La suite de integración no se volvió a correr después de estos
  ajustes (no tocaron servicios ni datos, salvo `toCompanySlug`, que tiene
  pruebas unitarias).
- El usuario tiene más novedades de su prueba completa que aún no reportó.

### Sesión 2026-09-27 — novedades de la prueba del usuario

1. **Encabezado del asistente sin eslogan:** solo el nombre de la empresa
   (se quitó `PlatformMark` de `configuracion/layout.tsx`). La firma "Con la
   tecnología de Teru POS" sigue al pie de `AuthShell` (el usuario no pidió
   quitarla allí).
2. **Solo 4 monedas:** `SUPPORTED_CURRENCIES` (COP, USD, MXN, EUR) en
   `lib/company-formats.ts` reemplaza a la lista ISO completa y a la opción
   "Otra" con selector. La validación del servidor usa la misma lista
   (`isSupportedCurrency`). Para habilitar otra moneda basta con agregarla a
   esa constante.

Verificado: typecheck, lint, build, unitarias (36) e integración del
perfil (3). Aprobados por el usuario.

Decisión del usuario: el **logo de la empresa** se deja para después de la
configuración inicial (tras el esqueleto del panel). Será un campo opcional
de "Identidad comercial" con Supabase Storage (bucket público: se muestra en
el login), usado en pantallas de acceso y encabezado; sin logo, el ícono de
tienda.

### Componente 5 — Confirmar (aprobado 2026-09-27)

Commit previo con los ajustes de eslogan y monedas: `9668329`.

- Servicio (`services/companies.ts`, ambos con `company.setup`):
  `getSetupSummary` (empresa, sede principal, miembros activos e
  invitaciones pendientes con `expired`) y `completeCompanySetup`
  (`markCompanySetupCompleted` + evento `COMPANY_EVENTS.SETUP_COMPLETED` en
  `auth_audit_logs` solo la primera vez; idempotente, devuelve `{ marked }`).
- UI `/[empresa]/configuracion/confirmar`: tarjetas Negocio (datos, moneda y
  fecha con ejemplo), Sede principal (nombre de la sucursal + dirección de
  Negocio) y Equipo, cada una con "Editar"; bloque oscuro "Todo listo";
  pie con "Atrás" y "Finalizar configuración" (`finish-form.tsx`,
  `useActionState`, funciona sin JS). Al finalizar redirige al panel.
- Refactor: `configuracion/section-title.tsx` (antes duplicado en Negocio y
  Equipo; ahora acepta `action`).
- Pruebas: `tests/integration/company-setup-completion.test.ts` (4).
  Verificado: typecheck, lint, build y suite completa 78/78. No probado en
  el navegador ni por HTTP contra dev (finalizar marcaría a `su-arepa` como
  configurada).
- Riesgo conocido: la dirección se guarda en `Company.address`; la
  `Branch.address` de la sede principal sigue vacía. Decidir cuál es la
  fuente cuando exista el módulo de sucursales.

### Cierre de la fase 2 (aprobado 2026-09-27)

- Revisión de toda la fase (permisos, sesión, invitaciones, equipo,
  asistente): sin errores de seguridad ni de lógica. Corrección menor: el
  panel usaba sus propias etiquetas de roles; ahora `STAFF_ROLE_LABELS`.
- Hallazgos que quedan como riesgos (en el ADR): la auditoría no guarda sobre
  qué invitación o miembro se actuó; si el envío del correo falla, la
  invitación queda pendiente sin entregar (se puede reenviar).
- `docs/decisiones/0002-empresa-sucursal-y-equipo.md` y README actualizado
  (estado, rutas, asistente, outbox de invitaciones, estructura, ADR).
- Verificado: typecheck, lint y build. Suite completa 78/78 antes de la
  corrección menor (solo de interfaz).

## Sesión 2026-09-27 — Fase 3: panel y configuración

Decisiones del usuario (2026-09-27):
- **Áreas y permisos:** habrá un área operativa (POS: menú, pedidos, cobro,
  su turno de caja) y una administrativa (ventas, compras, inventario, menú,
  cierres, configuración, equipo). **Opción 1: roles fijos con permisos por
  acción definidos en código**, sin permisos por persona ni roles
  personalizados (se podrían agregar después sin rehacer módulos).
- El menú muestra **solo los módulos que existen** (sin "Próximamente").
- **ADMIN gestiona el equipo** (`team.manage`); los datos del negocio, solo
  el OWNER.
- El **logo** es el componente 4 de esta fase.

Análisis aprobado. Componentes:
1. Estructura del panel: menú lateral por permisos (shadcn Sidebar), inicio
   según rol, asistente movido a `/configuracion-inicial`,
   `company.setup` → `company.manage`.
2. Configuración > Negocio (reutiliza el formulario del asistente).
3. Configuración > Equipo (reutiliza la gestión; ADMIN recibe `team.manage`).
4. Logo de la empresa (Supabase Storage, bucket público).
5. Cierre: pruebas, revisión, ADR 0003, README.
Fuera de alcance: módulos de negocio, perfil/contraseña propia, sucursales,
tablero con cifras, rol CASHIER.

### Componente 1 — Estructura del panel (aprobado 2026-09-27)

- Asistente movido a `src/app/[empresa]/configuracion-inicial/` (rutas,
  enlaces y redirecciones). `/configuracion` queda libre para la
  configuración del panel (componentes 2 y 3).
- Permiso `company.setup` → `company.manage` (código y pruebas). El ADR 0002
  aún dice `company.setup`: se actualiza en el cierre de la fase.
- shadcn Sidebar instalado (sheet, sidebar, skeleton, tooltip,
  `hooks/use-mobile.ts`), **sin sobrescribir** button/input/separator
  (tienen ajustes propios: usar `yes n | npx shadcn add ...`).
  `use-mobile.ts` reescrito con `useSyncExternalStore` (el original falla
  la regla `react-hooks/set-state-in-effect`).
- `(panel)/navigation.ts`: `NAV_ITEMS` (id, etiqueta, descripción, ruta,
  ícono, grupo, permiso) + `navigationFor(role)` + `navHref`. El layout
  filtra en el servidor y pasa solo los ids al menú (`app-sidebar.tsx`,
  cliente: lo dibuja y marca el activo con `usePathname`). Por ahora solo
  "Inicio".
- `(panel)/layout.tsx`: `SidebarProvider` (estado inicial desde la cookie
  `sidebar_state`), menú oscuro (cabecera con ícono lima y empresa; pie con
  persona, rol y "Cerrar sesión"), barra superior con `SidebarTrigger`.
  Sección activa en lima con texto negro.
- `(panel)/page.tsx` (Inicio): saludo, aviso de configuración pendiente y
  tarjetas de acceso a las secciones del rol; sin secciones, estado vacío
  "Tus herramientas aparecerán aquí".
- **Error de la fase inicial corregido:** el `matcher` de `src/proxy.ts`
  tenía `\.` dentro de un string JS (queda `.`, no `\\.`) y excluía
  casi todas las rutas: el proxy nunca corría en rutas de empresa. Sin
  riesgo de seguridad (el servidor siempre valida), pero la redirección
  optimista no funcionaba. Ahora sí; rutas privadas inexistentes sin sesión
  también van al login.
- Pruebas: `tests/unit/navigation.test.ts` (4) y permisos actualizados.
  Verificado: typecheck, lint, build, suite 82/82. Por HTTP contra dev
  (empresa temporal `t-panel-http`, ya borrada): OWNER con configuración
  pendiente → asistente nuevo; STAFF → panel con aviso, estado vacío y sin
  acceso al asistente; OWNER de `su-arepa` (ya configurada) → panel con
  menú; asistente completo → panel; `/configuracion` → 404 por ahora.
- No probado en el navegador (aspecto visual, menú en tablet/celular).

### Componente 2 — Configuración > Negocio (aprobado 2026-09-27)

- `/[empresa]/configuracion/negocio` dentro del panel (`company.manage`,
  solo OWNER). Entrada "Negocio" en el grupo "Configuración" del menú y
  tarjeta en el Inicio. `/configuracion` redirige a la primera sección de
  configuración del rol, o al Inicio si no tiene ninguna.
- Formulario compartido: `components/company/company-profile-form.tsx`
  (`CompanyProfileForm`, `mode` "setup" | "settings", recibe la acción).
  `company-profile-fields.ts`: tipos, `readProfileForm`,
  `toProfileFormValues`, `initialProfileState`, `profileErrorState`.
  Acciones: `saveSetupProfileAction` (asistente, redirige a Equipo) y
  `saveCompanySettingsAction` (se queda y muestra "Cambios guardados.").
  Ambas hacen `refresh()` (nombre en menú y pestaña).
- Movidos a compartidos: `components/shared/section-title.tsx` y nuevo
  `components/shared/page-header.tsx` (Inicio y Negocio del panel; el
  asistente conserva su encabezado propio).
- **Auditoría:** `saveCompanyProfile(session, input, ctx)` compara con lo
  guardado y, si algo cambió, registra `COMPANY_PROFILE_UPDATED` (sin los
  valores). También aplica al asistente.
- Riesgo anotado para el módulo de ventas: cambiar la moneda con ventas o
  precios existentes deja datos inconsistentes; habrá que bloquearlo o
  advertir.
- Pruebas: integración de auditoría (sin cambios no audita) y menú por rol.
  Verificado: typecheck, lint, build, suite 84/84. Por HTTP contra dev con
  empresas temporales (ya borradas): OWNER entra, `/configuracion` redirige,
  menú activo, tarjeta en Inicio, guardar válido (aviso y nombre nuevo en
  el menú), inválido (errores), ADMIN y STAFF redirigidos sin ver la
  sección, asistente guarda y pasa a Equipo; un evento por guardado válido.
  Cliente de prueba reutilizable en el scratchpad de la sesión (no en repo).
- No probado en el navegador.

### Componente 3 — Configuración > Equipo (aprobado 2026-09-27)

- `/[empresa]/configuracion/equipo` dentro del panel (`team.manage`).
  **ADMIN recibe `team.manage`.** Entrada "Equipo" en el menú; para ADMIN,
  `/configuracion` lleva a Equipo.
- Jerarquía (diseño aprobado): `lib/staff-roles.ts` → `manageableRoles` y
  `canManageRole` (OWNER gestiona ADMIN y STAFF; ADMIN solo STAFF; nadie al
  OWNER). En `services/team.ts`: invitar valida el rol (error en el campo
  `role`), reenviar y revocar leen la invitación y validan su rol,
  `setMemberActive` (data) recibe `roles` y filtra en la misma consulta.
  `getTeam` devuelve `invitableRoles` y `canManage` por miembro e
  invitación (la UI oculta botones; el servicio decide).
- Interfaz movida a `components/team/` (`invite-form` con prop `roles`,
  `row-action`, `team-fields`, `actions` compartidas, `team-list`,
  `team-manager` con las dos tarjetas). El paso Equipo del asistente usa
  `TeamManager` con su pie; el panel, `PageHeader` + `TeamManager`.
- ADMIN puede gestionar al Personal aunque la configuración inicial esté
  pendiente (decisión de diseño aprobada).
- Pruebas: integración ADMIN (ve el equipo, solo invita STAFF, no
  reenvía/revoca invitaciones ADMIN, no desactiva ADMIN, sí STAFF; OWNER sí
  gestiona ADMIN), unitarias de jerarquía, permisos y menú. Verificado:
  typecheck, lint, build, suite 91/91. Por HTTP contra dev (empresas
  temporales, ya borradas): ADMIN solo ve el rol Personal y botones en el
  Personal, invitaciones y desactivaciones forzadas rechazadas, sin menú
  Negocio; OWNER ve ambos roles y botones en administradores; el
  desactivado no entra; asistente Equipo igual. Solo las acciones reales
  quedaron en auditoría.
- No probado en el navegador.

### Componente 4 — Logo de la empresa (aprobado 2026-09-27)

Decisión del usuario: **opción A, Supabase Storage** con adaptador (sobre
guardarlo en la BD), para reutilizarlo con las fotos de productos.

- Migración `20260927150000_add_company_logo`: `Company.logoPath` (ruta en
  el almacenamiento, no URL). **Aplicada en `su-arepa-test` y
  `su-arepa-dev`.** `logoPath` viaja en `findActiveCompanyBySlug`, así llega
  a la sesión (`StaffSessionDto.company.logoPath`) y a `getRequestCompany`.
- `services/storage/`: interfaz `FileStorage` (`upload`, `remove`,
  `publicUrl`), `createSupabaseStorage` (REST sin SDK; clave secreta en el
  encabezado `apikey`), `createMemoryStorage` (pruebas) y `getFileStorage()`
  (null sin configuración) + `setFileStorageForTesting`.
  `env.ts`: `getStorageConfig()` con `SUPABASE_URL` y `SUPABASE_SECRET_KEY`
  (opcionales), bucket `company-assets` (público).
- `lib/company-logo.ts`: 1 MB, PNG/JPEG/WebP (sin SVG), `detectLogoType` por
  los primeros bytes.
- Servicio (`company.manage`): `updateCompanyLogo` (valida, sube con ruta
  única `companies/{id}/logo-{uuid}.{ext}`, cambia la ruta en BD, borra el
  anterior sin hacer fallar la operación, audita `COMPANY_LOGO_UPDATED`),
  `removeCompanyLogo` (`COMPANY_LOGO_REMOVED` solo si había logo) y
  `companyLogoUrl(path)`.
- UI: `components/shared/company-mark.tsx` (logo sobre fondo blanco o ícono
  de tienda; `next/image` con `unoptimized`) en `AuthShell` (prop `logoUrl`
  en login, recuperar, restablecer e invitación), menú lateral y encabezado
  del asistente. `components/company/company-logo-card.tsx` +
  `logo-actions.ts` (subir/cambiar y quitar; sin JS) en ambas páginas de
  Negocio. `next.config.ts`: `serverActions.bodySizeLimit` 2 MB.
- `scripts/setup-storage.ts` (`npm run storage:setup`): crea el bucket con
  límite de 1 MB y tipos permitidos; idempotente.
- `.env.example` y `.env`: `SUPABASE_URL` (dev) y `SUPABASE_SECRET_KEY`
  vacía — **la debe pegar el usuario** en `.env` (no en el chat).
- Pruebas: unitarias de `detectLogoType` (2) e integración del servicio con
  almacenamiento en memoria (4). Verificado: typecheck, lint, build, suite
  97/97. Clave de dev puesta por el usuario en `.env`; bucket creado con
  `npm run storage:setup`. Prueba por HTTP contra Supabase Storage real
  (empresa temporal, ya borrada): subir JPEG (se sirve público con caché de
  1 año), logo en login sin sesión y en el menú, cambiar a PNG (el anterior
  se borra del bucket, verificado en `storage.objects`), SVG disfrazado de
  PNG rechazado, quitar (bucket vacío), auditoría 2 subidas + 1 quitado.
- Conocido: tras borrar un archivo, el CDN de Supabase puede seguir
  sirviendo la copia en caché hasta que venza. Sin impacto: la ruta es única
  y ya no se usa. `su-arepa-test` no tiene clave: las pruebas usan memoria.

### Componente 5 — Cierre de la fase 3 (aprobado 2026-09-27)

**Fase 3 aprobada** (2026-09-27).

- Revisión de la fase (62 archivos: permisos, jerarquía del equipo, menú,
  formularios compartidos, proxy, almacenamiento y logo): sin errores de
  seguridad ni de lógica nuevos. Riesgos registrados en el ADR 0003.
- `docs/decisiones/0003-panel-permisos-y-archivos.md`; nota en el ADR 0002
  sobre lo que cambió; README actualizado (estado, rutas, variables
  `SUPABASE_*`, `storage:setup`, estructura, pruebas, ADR).
- Verificado en el componente 4: typecheck, lint, build y suite 97/97; este
  componente solo cambia documentación.

## Sesión 2026-09-27 — Fase 4: catálogo de venta

Sin diseño nuevo; referencia: pasos de insumos y producto/receta de
`../Diseño_configuracion_empresa.txt` (solo intención). Orden acordado por
capas: catálogo (fase 4) → inventario (insumos, unidades, bodegas,
movimientos) → recetas y costos → ventas/POS.

Decisiones del usuario (2026-09-27):
- **Alcance:** catálogo de venta (categorías y productos con precio y
  foto). Sin insumos, recetas, costos, stock, impuestos, precios por
  sucursal ni combos.
- **Un precio por producto** (precio final al público); listas de precios
  cuando haya un caso real.
- **Opciones/adiciones** (tamaño, extras) se diseñan con el POS.
- **`catalog.manage`:** OWNER y ADMIN.

Componentes aprobados: 1) modelo de datos y permiso; 2) categorías;
3) productos; 4) foto del producto; 5) cierre (ADR 0004, README). Menú:
grupo "Catálogo" con Productos y Categorías.

### Componente 1 — Modelo de datos del catálogo (aprobado 2026-09-27)

- Migración `20260927200000_add_catalog` (**aplicada en test y dev**):
  `product_categories` (nombre, `position`, `isActive`) y `products`
  (categoría obligatoria, nombre, descripción, `price Decimal(12,2)`,
  `imagePath`, `isArchived`, `isAvailable` = agotado). Solo en SQL: índices
  únicos por empresa sobre `lower(name)` en ambas tablas y
  `CHECK (price >= 0)`. RLS habilitado. El diff de Prisma queda vacío (no
  toca índices de expresión).
- Aislamiento en la BD: FK compuesta `products(companyId, categoryId)` →
  `product_categories(companyId, id)` (`@@unique([companyId, id])`).
  `onDelete: Restrict`: una categoría con productos (aun archivados) no se
  borra.
- `catalog.manage` para OWNER y ADMIN.
- `src/server/data/catalog.ts`: categorías (listar con conteo, crear al
  final, renombrar, activar, mover arriba/abajo renumerando, borrar solo si
  nunca tuvo productos) y productos (listar por orden de categoría y nombre
  con búsqueda/filtro/archivados, buscar, crear, editar, archivar, agotado).
  Escrituras devuelven `OK | NOT_FOUND | NAME_TAKEN | CATEGORY_NOT_FOUND`
  (P2002/P2003). El precio entra como texto decimal ya validado (la
  validación por decimales de la moneda va en el servicio, componente 3).
- `tests/helpers.ts` limpia productos y categorías.
- Pruebas: `tests/integration/catalog-data.test.ts` (6) + permiso.
  Verificado: typecheck, lint, build, suite 104/104.

### Componente 2 — Categorías (aprobado 2026-09-27)

- `/[empresa]/catalogo/categorias` (`catalog.manage`). Menú: grupo
  "Catálogo" (entre General y Configuración; los grupos siguen el orden de
  su primera sección en `NAV_ITEMS`) con "Categorías"; tarjeta en Inicio.
- `validations/catalog.ts`: `categoryNameSchema` (recorta, une espacios,
  2–60). `services/catalog.ts`: `getCategories` (con `productCount` y
  `canDelete`), `createCategory`, `renameCategory`, `setCategoryActive`,
  `moveCategory`, `deleteCategory`; resultado `{ ok } | { ok: false, error }`.
  Sin auditoría (decisión aprobada).
- UI en `components/catalog/`: `category-fields.ts` (tipos e intents; un
  archivo "use server" solo puede exportar funciones async),
  `category-actions.ts`, `new-category-form`, `rename-category-form` (dentro
  de un `<details>` con `key` = nombre para que se cierre tras renombrar),
  `category-row-button` (↑ ↓, activar/desactivar, eliminar; un formulario
  por botón) y `category-list` (estado vacío). Todo sin JS.
- Pruebas: unitarias (`catalog.test.ts`, menú) e integración
  (`catalog-categories.test.ts`: ADMIN gestiona, duplicados, otra empresa,
  borrar solo vacías, STAFF rechazado). Por HTTP contra dev (empresa
  temporal, ya borrada): crear, duplicado, subir, renombrar, desactivar,
  eliminar, menú y permisos por rol. Verificado: typecheck, lint, build y
  suite 114/114.
- Cliente HTTP de prueba del scratchpad: `submit_form(op, path, predicate,
  overrides)` para elegir el formulario exacto de una fila.

### Componente 3 — Productos (aprobado 2026-09-27)

Decisiones aprobadas: precio con campo numérico + vista previa formateada
y decimales según la moneda; auditoría con el elemento afectado.

- Migración `20260927230000_add_audit_target` (**aplicada en test y
  dev**): `auth_audit_logs.targetType` y `targetId` (nullable) + índice.
  `recordAuthEvent` acepta `target: { type, id }`.
- `lib/company-formats.ts`: `currencyDecimals`. `validations/catalog.ts`:
  `priceSchema(currency)` (texto con punto; COP sin centavos, USD/MXN/EUR 2;
  tope de Decimal(12,2); normaliza a texto sin pasar por float; "16.500"
  con COP se rechaza) y `productSchema(currency)`.
- Datos: `findProductCategory`; `createProduct` devuelve `{ status, id }`.
- Servicio (`catalog.manage`): `getProductCatalog` (búsqueda, categoría,
  archivados; precio como texto), `getProductForm` (categorías activas + la
  actual si está inactiva), `createCatalogProduct`, `updateCatalogProduct`
  (no audita si nada cambió; `PRODUCT_PRICE_CHANGED` aparte), archivar /
  restaurar y agotado / disponible (no repiten eventos). No se asigna una
  categoría inactiva, salvo que el producto ya esté en ella.
  `PRODUCT_EVENTS` en `auth/config.ts`, target `PRODUCT`.
- UI `components/catalog/`: `product-fields`, `product-actions` (crear y
  editar redirigen a la lista con `?aviso=creado|guardado`),
  `product-form` (precio controlado para la vista previa), `product-list`
  (agrupado por categoría), `product-row-button`. Páginas
  `catalogo/productos` (filtros por GET `q`, `categoria`, pestañas
  Activos/Archivados `archivados=1`, estados vacíos), `/nuevo`
  (`?categoria=` preselecciona) y `/[id]`. Menú: "Productos" antes de
  "Categorías".
- Pruebas: unitarias de precio y producto, integración
  `catalog-products.test.ts` (6). Por HTTP contra dev (empresa temporal,
  ya borrada): lista vacía, crear, precio con centavos rechazado
  conservando lo escrito, agrupado, búsqueda, filtro, editar precio,
  agotado, archivar/archivados, STAFF sin acceso, id inexistente 404;
  auditoría con el producto afectado. Verificado: typecheck, lint, build y
  suite 135/135.
- Nota del cliente HTTP de prueba: solo lee `<input>`; los `<select>` y
  `<textarea>` hay que enviarlos a mano.

### Componente 4 — Foto del producto (aprobado 2026-09-27)

Decisión del usuario: **opción A, reducir en el navegador** (1200 px,
WebP → PNG → JPEG, elimina EXIF/GPS), sin librerías nuevas.

- Refactor compartido: `lib/images.ts` (`IMAGE_MAX_BYTES`, `IMAGE_TYPES`,
  `IMAGE_ACCEPT`, `detectImageType`; reemplaza a `lib/company-logo.ts`) y
  `server/services/images.ts` (`publicFileUrl`, `removeFileQuietly`,
  `replaceImage({ file, pathPrefix, savePath })`). El logo usa ambos; su
  mensaje de tamaño ahora es "La imagen no puede superar 1 MB".
- `lib/prepare-image.ts` (solo navegador): `prepareImageForUpload`; si no
  puede leer la imagen (p. ej. HEIC) devuelve el original.
- `components/shared/image-upload-card.tsx` + `image-upload-fields.ts`:
  tarjeta de subir/cambiar/quitar con vista previa; al elegir archivo lo
  reduce y lo reemplaza en el campo (`DataTransfer`). El campo se llama
  `image` (antes `logo`). `CompanyLogoCard` pasó a usarla.
- Datos: `replaceProductImagePath`. Servicio: `updateProductImage`,
  `removeProductImage` (verifican que el producto sea de la empresa antes
  de subir; eventos `PRODUCT_IMAGE_UPDATED/REMOVED` con target). El DTO
  del producto trae `imageUrl` en vez de `imagePath`. Ruta:
  `companies/{companyId}/products/{productId}-{uuid}.{ext}`.
- UI: `product-image-card`, `product-image-actions`, `product-thumb`
  (miniatura en la lista, grande en la página). Al crear un producto se
  abre su página con "Producto creado. Puedes agregarle una foto."
- Pruebas: `tests/unit/images.test.ts` (renombrada),
  `tests/integration/product-image.test.ts` (4). Por HTTP contra Supabase
  Storage real (empresa temporal, ya borrada; bucket vacío verificado):
  crear → página del producto, rechazo de más de 1 MB, subir, miniatura en
  la lista, cambiar, quitar, y logo con el campo renombrado. Verificado:
  typecheck, lint, build y suite 139/139.
- **No probado:** la reducción en el navegador (requiere navegador real).

**Ajuste pedido por el usuario (foto al crear):** la foto también se
puede subir desde "Nuevo producto", en el mismo formulario.
- `components/shared/image-picker.tsx`: selector con vista previa y
  reducción, extraído de la tarjeta; se limpia con el evento `reset` del
  formulario. Lo usan `ImageUploadCard` y `ProductForm` (solo al crear).
- `services/images.ts` + `validateImage` (valida sin subir).
  `createCatalogProduct(session, input, ctx, image?)`: valida la foto antes
  de crear (errores junto a los del resto, campo `image`); crea; sube con
  `updateProductImage`. Si solo falla la subida → `imageFailed: true` y la
  acción abre el producto con `?aviso=sin-foto`. Si no, vuelve a la lista
  con "Producto creado.".
- Con otro error en el formulario, el navegador descarta el archivo: el
  estado trae `imageDropped` y se pide volver a elegir la foto.
- Pruebas: 4 más en `product-image.test.ts` (con foto, campo vacío, foto
  inválida no crea nada, falla de subida). HTTP contra Storage real
  (empresa temporal y su foto borradas; bucket verificado vacío).
  Verificado: typecheck, lint, build y suite 143/143.

### Componente 5 — Cierre de la fase 4 (aprobado 2026-09-27)

**Fase 4 aprobada** (2026-09-27).

- Revisión de la fase (39 archivos: modelo, categorías, productos, precio,
  auditoría con target, fotos). Corrección: con todas las categorías
  inactivas la lista mostraba "Nuevo producto" y `/nuevo` devolvía a la
  lista sin explicar; ahora el botón se oculta y un aviso enlaza a
  Categorías. Sin errores de seguridad ni de aislamiento.
- `docs/decisiones/0004-catalogo-de-venta.md` (capas, modelo, precio,
  permiso, auditoría, fotos y riesgos) y README (estado, rutas, variables,
  estructura, ADR).

### Próximo paso recomendado

Fase 4 cerrada y subida. Siguiente fase por definir con el usuario
(Analizar primero). Según el orden acordado: inventario (insumos,
unidades de medida, bodegas y movimientos). Pendiente antes de producción:
proveedor de correo, clave de Storage y bucket por entorno.

## Sesión 2026-09-28 — Fase 5: inventario

Alcance aprobado (2026-09-28), con las recomendaciones aceptadas:
- **Unidades fijas en código** (g, kg, ml, l, und) con conversión exacta
  dentro de la familia (`lib/units.ts`); sin unidades por empresa.
- **Bodegas por sucursal**; una principal por sucursal, creada con ella.
- **Insumos** (nombre, unidad, stock mínimo, archivado). El enlace
  producto ↔ insumo (reventa, p. ej. gaseosa) va en la fase de recetas.
- **Movimientos:** solo carga inicial y ajustes (con motivo); inmutables,
  saldo por insumo y bodega en la misma transacción, kardex por insumo.
- **Sin costos** en esta fase (fase de costos). **Stock negativo
  bloqueado** en ajustes; para ventas se decide en su fase.
- `inventory.manage`: OWNER y ADMIN.
- Fuera de alcance: costos, recetas, compras, traslados, lotes,
  vencimientos, alertas.

Componentes: 1) modelo de datos y permiso; 2) bodegas; 3) insumos;
4) movimientos y kardex; 5) cierre (ADR 0005, README).

### Componente 1 — Modelo de datos del inventario (aprobado 2026-09-28)

- Migración `20260928120000_add_inventory` (**aplicada en test y dev**):
  enums `StockUnit` y `StockMovementType` (`INITIAL`, `ADJUSTMENT`);
  tablas `warehouses`, `supplies`, `stock_levels` (PK bodega+insumo) y
  `stock_movements` (cantidad con signo, `balanceAfter`, motivo, usuario;
  sin `updatedAt`). FK compuestas `(companyId, …)` a sucursal, bodega e
  insumo (`Branch` ganó `@@unique([companyId, id])`). Solo en SQL: nombres
  únicos por empresa sobre `lower(name)` (bodegas e insumos), una bodega
  principal por sucursal (índice parcial), CHECK de mínimo ≥ 0, saldo ≥ 0,
  cantidad ≠ 0, inicial > 0, `balanceAfter` ≥ 0. RLS habilitado. Crea la
  "Bodega principal" de las sucursales principales existentes (dev: la de
  `su-arepa`). Diff de Prisma vacío.
- El alta de empresa (`createCompanyWithOwnerInvitation`) y el seed crean
  la bodega principal (`createMainWarehouse`, `MAIN_WAREHOUSE_NAME`).
- `src/server/data/inventory.ts`: bodegas (listar agrupables por sucursal,
  buscar, crear, renombrar, activar), insumos (listar con saldos, búsqueda,
  archivados; buscar con conteo de movimientos; crear; editar — la unidad
  solo cambia sin movimientos, `UNIT_LOCKED`; archivar) y
  `recordStockMovement` (transacción: bloquea el insumo con
  `SELECT … FOR UPDATE`, valida bodega activa e insumo no archivado, una
  sola carga inicial por bodega, rechaza saldo negativo, actualiza saldo y
  crea el movimiento) + `listStockMovements` (kardex). Transacciones con
  `timeout` 20 s por la latencia a Supabase.
- Inmutabilidad: la capa de datos no expone edición ni borrado de
  movimientos (sin trigger en la BD: la limpieza de pruebas borra).
- Pruebas: `tests/unit/units.test.ts` (3), permiso, e
  `tests/integration/inventory-data.test.ts` (10, incluye dos salidas
  simultáneas: solo una pasa). `tests/helpers.ts` limpia el inventario.
  Verificado: typecheck, lint, build y suite 157/157 (~15 min).

### Componente 2 — Bodegas (aprobado 2026-09-28)

- `/[empresa]/inventario/bodegas` (`inventory.manage`). Menú: grupo
  "Inventario" (entre Catálogo y Configuración) con "Bodegas"; tarjeta en
  Inicio.
- Reglas: la bodega principal no se desactiva, ni una con existencias
  (`setWarehouseActive` devuelve `IS_MAIN` / `HAS_STOCK`); no se borran;
  sin auditoría (como las categorías). Crear solo en sucursales activas
  (`data/branches.ts` → `listActiveBranches`).
- `validations/common.ts`: `displayNameSchema(max)`, ahora también usado
  por categorías y productos (mismo comportamiento).
  `validations/inventory.ts`: `warehouseNameSchema`.
- `services/inventory.ts`: `getWarehouses` (grupos por sucursal con
  `stockedSupplies` y `canDeactivate`, y sucursales activas),
  `createInventoryWarehouse`, `renameInventoryWarehouse`,
  `setInventoryWarehouseActive`.
- Compartidos nuevos: `components/shared/rename-form.tsx` (`RenameForm`,
  `<details>` sin JS; usarlo con `key` = nombre) y
  `components/shared/row-action-button.tsx` (`RowActionButton`). Los usa
  inventario; categorías, productos y equipo siguen con sus versiones
  propias (se pueden migrar después).
- UI `components/inventory/`: `warehouse-actions`, `new-warehouse-form`
  (sin selector de sucursal si hay una sola), `warehouse-row-button`,
  `warehouse-list` (agrupada por sucursal; el nombre de la sucursal solo
  si hay más de una).
- Pruebas: `tests/helpers.ts` → `createMainBranch`; integración
  `inventory-warehouses.test.ts` (4) y menú. Por HTTP contra dev (empresa
  temporal `t-http-inv` creada con el alta real, ya borrada): bodega
  principal creada con la empresa, crear, duplicado conservando lo
  escrito, renombrar, desactivar/activar, principal forzada rechazada,
  sucursal inválida rechazada, tarjeta en Inicio, ADMIN entra, STAFF
  redirigido y su acción forzada no crea nada, sin sesión → login.
- Cliente HTTP de prueba (scratchpad de la sesión, no en repo):
  `http_client.py` (`Client.login`, `Client.submit(path, predicate,
  overrides)`; lee input, select y textarea) y `_fixture.ts`
  (setup/state/teardown de la empresa temporal; copiar a `scripts/` para
  correrlo).
- Verificado: typecheck, lint, build y suite 162/162.
- No probado en el navegador.
- Al cerrar una tarea en segundo plano con `next dev`, en Windows el
  proceso de node sigue vivo en el puerto 3000: terminarlo con
  `taskkill /PID <pid de "next dev"> /T /F`.

### Componente 3 — Insumos (aprobado 2026-09-28)

- Páginas `/[empresa]/inventario/insumos` (búsqueda GET `q`, pestañas
  Activos/Archivados `archivados=1`, avisos `?aviso=creado|guardado`,
  estados vacíos), `/nuevo` y `/[id]` (404 si no es de la empresa). Menú:
  "Insumos" antes de "Bodegas"; tarjeta en Inicio.
- Lista: existencia total (suma de todas las bodegas) y mínimo en la
  unidad del insumo; "Bajo mínimo" si total < mínimo; Editar y
  Archivar/Restaurar.
- Formulario: nombre (2–80), unidad (select con `unitLabel`), stock mínimo
  opcional (≥ 0, 3 decimales, etiqueta con el símbolo de la unidad). Con
  movimientos, la unidad se muestra deshabilitada y viaja en un campo
  oculto; el servicio igual rechaza el cambio (`UNIT_LOCKED`). Crear y
  guardar vuelven a la lista con aviso.
- **No se archiva un insumo con existencias** (como las bodegas):
  `setSupplyArchived` bloquea el insumo (`FOR UPDATE`) y devuelve
  `HAS_STOCK`. Sin auditoría (los movimientos serán su propio registro).
- `validations/inventory.ts`: `quantitySchema` (texto normalizado sin
  float, máx. 3 decimales, tope de Decimal(14,3)), `supplySchema`,
  `SupplyInput` (todo texto). `lib/units.ts`: `unitLabel`,
  `formatQuantity` (es-CO: "10,5 kg").
- Servicio: `getSupplyList`, `getSupply` (`unitLocked`),
  `createInventorySupply`, `updateInventorySupply`,
  `setInventorySupplyArchived`. DTO con cantidades como texto.
- Compartidos nuevos: `components/shared/empty-state.tsx`,
  `status-tabs.tsx` y `form-field.tsx` (los usa inventario; productos
  conserva sus copias locales `Empty`, `Tab` y `Field`, a migrar en el
  cierre junto con los botones de fila y el renombrar).
- UI `components/inventory/`: `supply-fields`, `supply-actions`,
  `supply-form`, `supply-list`, `supply-row-button`.
- Pruebas: unitarias `tests/unit/inventory.test.ts` (5), menú;
  integración `inventory-supplies.test.ts` (5) y archivar en
  `inventory-data.test.ts`. `_fixture.ts` del scratchpad ganó el modo
  `stock <insumo> <cantidad> [INITIAL|ADJUSTMENT]`.
- Por HTTP contra dev (empresa temporal `t-http-inv`, ya borrada): lista
  vacía, crear con aviso y "Bajo mínimo", duplicado, errores de campo
  conservando lo escrito, 3 decimales, búsqueda, editar (unidad libre sin
  movimientos), unidad bloqueada con movimientos (también forzada),
  existencia y mínimo formateados ("12,5 kg"), archivar con existencias
  rechazado y en cero sí, archivados, restaurar, id inexistente 404,
  tarjeta en Inicio, ADMIN entra, STAFF redirigido y su acción forzada no
  crea nada.
- Verificado: typecheck, lint, build y suite 172/172.
- No probado en el navegador.

### Cambio de infraestructura — pruebas en PostgreSQL local (2026-09-28)

Pedido del usuario: liberar el proyecto Supabase `su-arepa-test` para
otro proyecto. Se eligió PostgreSQL 17 nativo en Windows (más simple que
Docker Desktop para un solo desarrollador; `docker-compose.yml` sigue
disponible para cuando haya equipo o CI).

- PostgreSQL 17.11 local (servicio `postgresql-x64-17`, puerto 5432,
  misma versión principal que Supabase 17.6). Base `teru_pos_test` creada y
  con las 9 migraciones aplicadas (las de RLS no dependen de roles de
  Supabase).
- `.env.test` apunta a `localhost:5432/teru_pos_test` (la contraseña la
  puso el usuario). La configuración anterior quedó en
  `.env.test.supabase` (ignorado por git) hasta borrar el proyecto.
- **Suite completa: 172/172 en ~13 s** (antes ~15–18 min por la latencia a
  Supabase). La nota de riesgo de la fase inicial sobre la suite de ~4 min
  ya no aplica a las pruebas (sí a la app en dev).
- `tests/setup.ts` (comentario) y README actualizados.
- `su-arepa-test` **borrado** en Supabase por el usuario, y también
  `.env.test.supabase`.
- Renombrado a Teru POS lo que es de la plataforma: paquete `teru-pos`
  (`package.json` y lock), valores por defecto de `docker-compose.yml`
  (`teru_pos` / `teru_pos_dev`), comentarios de `.env.example` y `.env`,
  encabezado de `schema.prisma`. Se conserva lo que es de Su Arepa como
  empresa cliente (seed, slugs de ejemplo, ADR históricos). El proyecto
  Supabase `su-arepa-dev` se renombra a `teru-pos-dev` desde su panel
  (Project Settings → General); el ref y las URLs no cambian.

### Cierre de la sesión 2026-09-28

**Implementado hoy (con commit y subido a GitHub):**
- Fase 5, componentes 1–3 aprobados: modelo de datos del inventario
  (`c4e0ae2`), bodegas (`a8f441b`) e insumos (`15f36e2`).
- Pruebas de integración pasadas a PostgreSQL 17 local (`eeb4826`):
  suite 172/172 en ~13 s. `su-arepa-test` borrado en Supabase.
- Referencias de plataforma renombradas a Teru POS (`8b5bacc`).

**Pendiente:**
- Fase 5, componente 4 — **movimientos y kardex** (siguiente): en la
  página del insumo, existencias por bodega, carga inicial y ajustes
  (entrada/salida con motivo, cantidad en la unidad del insumo, sin
  saldo negativo) usando `recordStockMovement`, y el historial con
  `listStockMovements`. Analizar y diseñar antes de implementar.
- Fase 5, componente 5 — cierre: revisión, ADR 0005, README, y migrar a
  los compartidos (`RowActionButton`, `RenameForm`, `EmptyState`,
  `StatusTabs`, `FormField`) las copias locales de categorías, productos
  y equipo (propuesto al usuario, sin respuesta explícita todavía).
- Usuario: renombrar el proyecto Supabase `su-arepa-dev` → `teru-pos-dev`
  en su panel.
- Antes de producción (sin cambios): proveedor de correo, clave de Storage
  y bucket por entorno.

**Renombrado de carpetas (lo hace el usuario al cerrar esta sesión):**
- La carpeta interna `su-arepa-sistema` se puede renombrar (p. ej. a
  `teru-pos`) sin afectar la memoria de Claude.
- La carpeta padre `02. SU AREPA` define la ruta de la memoria y del
  historial (`~/.claude/projects/C--Users-ASUS-Desktop-BRAND-PROYECTO-TERU-PROYECTOS-02--SU-AREPA`).
  Si se renombra, hay que renombrar también esa carpeta siguiendo la
  regla: todo lo que no es letra ni número pasa a `-`.
- Al volver: borrar `.next`, correr `npx prisma generate`, y actualizar
  las memorias que mencionan los nombres viejos de las carpetas
  (`paleta-teru`, `plataforma-vs-empresa-cliente`).

**Decisiones técnicas de hoy:** ver los componentes 1–3 de la fase 5 y
el cambio de infraestructura de pruebas (arriba). Resumen: unidades fijas
con conversión exacta, bodega principal por sucursal, saldo nunca
negativo (CHECK + bloqueo `FOR UPDATE` del insumo), movimientos
inmutables, no se desactiva una bodega ni se archiva un insumo con
existencias, sin auditoría de bodegas e insumos, componentes compartidos
nuevos para el código nuevo.

**Errores conocidos:**
- En Windows, detener una tarea en segundo plano con `next dev` deja vivo
  el proceso de node en el puerto 3000: terminarlo con `taskkill /T /F`.
- Los heredoc largos en la herramienta Bash a veces fallan con
  "unexpected EOF"; para archivos largos usar la herramienta Write.
- Nada probado en el navegador en esta fase (solo por HTTP sin JS).

**Próximo paso recomendado:** componente 4 de la fase 5 (movimientos y
kardex), empezando por el análisis y el diseño de la pantalla del insumo.

## Sesión 2026-09-28 (noche) — Fase 5, componente 4

Al retomar: carpetas ya renombradas (`02. TERU POS/teru-post`; la memoria
vive en `...-02--TERU-POS`). Hecho: `.next` borrado, `prisma generate`,
memorias actualizadas. `Paleta@1x.png` ya no está en la carpeta del
proyecto.

### Componente 4 — Movimientos y kardex (aprobado 2026-09-29)

Diseño aprobado con: hora en `America/Bogota` fija por ahora (constante
`BUSINESS_TIME_ZONE` en `lib/company-formats.ts`; la zona por empresa
llega con caja/ventas, que cortan por día; en BD todo sigue en UTC),
motivo de ajuste en texto libre obligatorio (3–200), conteo físico fuera.

- Rutas: `/inventario/insumos/[id]` es ahora la **ficha** del insumo; la
  edición pasó a `/[id]/editar` (Cancelar vuelve a la ficha). En la lista,
  el nombre abre la ficha y "Editar" va a `/editar`.
- Ficha: encabezado (unidad, Archivado/Bajo mínimo, Editar), existencia
  total y mínimo, **existencias por bodega activa** (agrupadas por
  sucursal si hay más de una) con formulario desplegable por fila
  (`<details>`, sin JS): "Carga inicial" si la bodega no tiene saldo,
  "Ajustar" (Entrada/Salida + cantidad + motivo) si ya lo tiene. Kardex:
  últimos 100 (`KARDEX_LIMIT`), filtro GET `?bodega=`, columnas fecha y
  hora, bodega, tipo, cantidad con signo, saldo en bodega, motivo,
  usuario. Archivado: solo lectura con aviso.
- "Carga inicial pendiente" = no existe `stock_levels` para esa bodega (el
  saldo nace con el primer movimiento). La capa de datos sigue siendo la
  garantía (`ALREADY_INITIALIZED`).
- Datos: `recordStockMovement` devuelve en `INSUFFICIENT_STOCK` el saldo
  disponible y la unidad (mensaje "hay 10,5 kg").
- Validación: `stockMovementSchema` (`kind` INITIAL/IN/OUT, cantidad > 0,
  motivo). Servicio: `getSupplyDetail`, `registerStockMovement` (usuario
  de la sesión; OUT = cantidad negativa), `groupByBranch` compartido con
  `getWarehouses`. `formatDateTime` en `lib/company-formats.ts`.
- UI `components/inventory/`: `movement-fields`, `movement-actions`
  (redirige a la ficha con `?aviso=movimiento`, conserva el filtro),
  `movement-form`, `supply-stock`, `supply-kardex`. El formulario de cada
  fila lleva `key` = saldo: tras guardar vuelve a montarse cerrado.
- Pruebas: unitarias (validación, `formatDateTime`), integración
  `inventory-movements.test.ts` (6). Suite 181/181, typecheck, lint y
  build. Por HTTP sin JS contra dev (empresa temporal `t-http-inv`, ya
  borrada; script `t_movimientos.py` del scratchpad): 34/34.
- Limitación conocida: sin JS y desde una pestaña vieja (formulario que ya
  no existe en la página, p. ej. segunda carga inicial o insumo recién
  archivado), el servidor rechaza el movimiento pero el mensaje no se ve.
  Con JS sí se ve.
- No probado en el navegador.
- Aprobado por el usuario en el navegador el 2026-09-29.

### Cierre de la sesión 2026-09-28 (noche)

**Implementado hoy (sin commit, en el árbol de trabajo):**
- Fase 5, componente 4 — movimientos y kardex (detalle arriba): ficha del
  insumo, carga inicial y ajustes por bodega, kardex con filtro, edición
  movida a `/[id]/editar`.
- Pasos posteriores al renombrado de carpetas (`.next`, `prisma
  generate`, memorias).

**Pendiente:**
- **Mañana (usuario):** revisar el componente 4 en el navegador. Si lo
  aprueba: commit (p. ej. "Agrega los movimientos y el kardex del
  inventario") y push a `origin/master`. Si hay ajustes, corregir antes.
  Puntos a mirar en el navegador (nunca probados con JS): desplegables
  por fila, radios Entrada/Salida (`has-checked:`), que tras guardar el
  formulario se cierre, error visible en el formulario con JS, tabla del
  kardex en tablet (se desplaza solo la tabla), hora mostrada.
- Fase 5, componente 5 — cierre: revisión, ADR 0005 (incluir la zona
  horaria fija `America/Bogota` y la ficha del insumo), README, y migrar a
  los compartidos (`RowActionButton`, `RenameForm`, `EmptyState`,
  `StatusTabs`, `FormField`) las copias locales de categorías, productos
  y equipo (propuesto, sin respuesta explícita todavía).
- Usuario: renombrar el proyecto Supabase `su-arepa-dev` → `teru-pos-dev`.
- Antes de producción (sin cambios): proveedor de correo, clave de Storage
  y bucket por entorno.
- Futuro (caja/ventas): zona horaria por empresa en lugar de la constante.

**Decisiones técnicas de hoy:**
- Fechas guardadas en UTC; se muestran en `BUSINESS_TIME_ZONE`
  (`America/Bogota`), igual para todas las empresas por ahora. Cambiar a
  zona por empresa solo toca el formateo, no los datos.
- Motivo de ajuste: texto libre obligatorio (3–200); carga inicial con
  nota opcional. Sin lista de motivos ni conteo físico por ahora.
- "Sin carga inicial" = la bodega no tiene fila en `stock_levels`.
- La acción de movimiento redirige a la ficha (`?aviso=movimiento`,
  conserva `?bodega=`); el formulario de cada fila usa `key` = saldo.

**Errores conocidos:**
- Sin JS, desde una pestaña vieja, el rechazo de un movimiento no muestra
  mensaje (el servidor sí lo rechaza).
- En Windows, detener `next dev` en segundo plano deja node en el puerto
  3000: `taskkill /PID <pid> /T /F`.
- Cliente HTTP de prueba en Python: correr con `PYTHONIOENCODING=utf-8`
  (la consola cp1252 falla con "−" y tildes). Scripts en el scratchpad de
  la sesión: `http_client.py`, `_fixture.ts` (copiar a `scripts/` para
  usarlo y borrarlo después), `t_movimientos.py`.

**Próximo paso recomendado:** revisión del componente 4 en el navegador
→ corregir si hace falta → commit y push → componente 5 (cierre de la
fase 5).

## Sesión 2026-09-29 — Despliegue en Vercel (en pausa)

- Componente 4 de la fase 5 aprobado en el navegador; commit `c8f0335`
  subido a `origin/master`.
- El usuario quiere desplegar en Vercel (el repositorio ya está en GitHub,
  `terutechnologies-ops/teru-pos`). **Se pausa hasta que el proyecto esté
  listo**; no se tocó código ni configuración para el despliegue.

### Análisis hecho (sin cambios aplicados)

1. **Prisma**: `src/generated/prisma` está en `.gitignore` y ningún
   script corre `prisma generate`, así que el build en Vercel fallaría.
   Arreglo: `"postinstall": "prisma generate"` en `package.json`.
2. **Región**: Vercel usa `iad1` (Washington) por defecto y la base está
   en `sa-east-1` (São Paulo); cada consulta cruzaría el continente.
   Arreglo: funciones en `gru1` (`vercel.json` con `"regions": ["gru1"]`
   o desde Project Settings → Functions).
3. **Correo**: `getMessageSender()` lanza error fuera de `development`;
   en Vercel `NODE_ENV=production`, así que **recuperar contraseña** e
   **invitar miembros** darían error 500. Lo demás funciona.
- Ya compatible: argon2 (Next lo trata como paquete externo; trae binarios
  para Linux), pooler de Supabase en el puerto 6543 con `pgbouncer=true`
  (adecuado para serverless; evaluar `connection_limit=1`),
  `output: "standalone"` (Vercel lo acepta; lo usa el Dockerfile).
- Variables de entorno a cargar en Vercel: `DATABASE_URL`, `DIRECT_URL`,
  `APP_URL` (la URL pública de Vercel, p. ej. `https://<proyecto>.vercel.app`),
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. `NODE_ENV` no (Vercel la fija).
- Migraciones: aplicarlas a mano con `npm run db:migrate:deploy`, no
  dentro del build.
- Conexión sugerida: importar el repositorio desde el panel de Vercel
  (despliegue automático en cada push a `master`).

### Preguntas pendientes para el usuario (retomar antes de desplegar)

1. **¿Qué base usa el despliegue?**
   - Base dev actual `teru-pos-dev` (recomendado para un ambiente de
     pruebas en línea; ya tiene migraciones y datos de Su Arepa), o
   - base nueva de producción (proyecto Supabase aparte en São Paulo,
     migraciones y seed; para cuando haya clientes reales).
2. **¿Qué hacer con el correo?**
   - Desplegar ya y dejar el correo para después (recomendado; esas dos
     acciones fallan hasta integrar un proveedor), o
   - integrar antes un proveedor (p. ej. Resend) como componente propio,
     con el flujo analizar → diseñar → aprobar.

**Próximo paso recomendado:** cuando el usuario retome, responder las dos
preguntas, aplicar los arreglos 1 y 2, cargar las variables y desplegar.
Mientras tanto, el siguiente trabajo del plan sigue siendo el componente 5
de la fase 5 (cierre).

## Sesión 2026-09-29 (tarde) — Fase 5, componente 5: cierre

Al iniciar: `prisma generate`, typecheck, suite 181/181 y `next dev`
levantado. Árbol limpio y sincronizado con `origin/master` (`52b11e5`).

### Componente 5 — Cierre de la fase 5 (aprobado 2026-09-29)

**Fase 5 aprobada** (2026-09-29).

Decisión del usuario: **migrar todas las copias locales** a los
compartidos, con variante `destructive` en `RowActionButton`.

- **Migración a compartidos** (sin cambios visibles):
  - `RowActionButton` + variante `destructive`. `CategoryRowButton`,
    `ProductRowButton` y `team/RowAction` quedan como envoltorios con su
    tabla de intents (patrón de `WarehouseRowButton`). Único cambio: el
    `aria-label` de productos pasa de "Archivar: X" a "Archivar X".
  - `RenameForm` reemplaza a `catalog/rename-category-form.tsx` (borrado).
  - `EmptyState` y `StatusTabs` en la página de productos (se quitaron
    `Empty` y `Tab`) y `EmptyState` en la lista vacía de categorías.
  - `FormField` reemplaza a `Field` en `product-form.tsx`.
  - Tipos de estado locales eliminados (`CategoryFormState`,
    `CategoryRowState`, `ProductRowState`, `TeamActionState`): las
    acciones usan `NameFormState` y `RowActionState`.
- **Revisión de la fase** (datos, servicio, acciones, validaciones y
  páginas de inventario). Hallazgo corregido: desactivar una bodega leía
  sus existencias sin bloqueo; una carga simultánea podía dejarla
  **inactiva con existencias**. Ahora `setWarehouseActive` (desactivar)
  bloquea la bodega `FOR UPDATE` en una transacción y
  `recordStockMovement` la toma `FOR SHARE` (`lockWarehouse`). Prueba de
  concurrencia nueva en `inventory-data.test.ts`: con el código anterior
  fallaba 3/3; con la corrección pasa 5/5. Dev revisado: ninguna bodega
  inactiva con existencias. Sin otros hallazgos de seguridad ni de
  aislamiento.
- `docs/decisiones/0005-inventario.md` y README (estado, rutas, ficha del
  insumo, estructura, ADR).
- Verificado: typecheck, lint, build, suite 182/182. Por HTTP sin JS
  contra dev (empresa temporal `t-http-inv`, ya borrada; script
  `t_migracion.py` del scratchpad): 29/29 en categorías, productos y
  equipo (estados vacíos, pestañas, renombrar, ↑↓, activar, errores de
  campo, agotado/archivar/restaurar, variantes de botones del equipo,
  reenviar/revocar/desactivar/reactivar, STAFF redirigido).
- No probado en el navegador.

### Pendiente

- Siguiente fase por definir (Analizar primero). Según el orden acordado:
  recetas y costos.
- Despliegue en Vercel en pausa (ver sesión anterior: dos preguntas
  abiertas y arreglos de `postinstall` y región).
- Usuario: renombrar el proyecto Supabase `su-arepa-dev` → `teru-pos-dev`.
- Antes de producción: proveedor de correo, clave de Storage y bucket por
  entorno.

### Errores conocidos

- Los de la sesión anterior siguen (pestaña vieja sin JS, `next dev` en
  Windows, consola cp1252 en los scripts de Python).
- `_fixture.ts` del scratchpad ahora también limpia productos y
  categorías.

### Próximo paso recomendado

Fase 5 cerrada y subida (`5cfbb0f`). Fase 6 definida (ver abajo).

## Sesión 2026-09-29 (noche) — Fase 6: recetas y costos

Referencia visual (solo intención): pasos de insumos y "Producto y Receta"
de `../Diseño_configuracion_empresa.txt` (costo unitario, BOM, costo y
margen, sub-recetas, merma).

Decisiones del usuario (2026-09-29):
- **Costo de referencia** por insumo (`unitCost`, editable por OWNER/ADMIN,
  historial en auditoría). El promedio ponderado llega con Compras.
- **Receta simple:** producto → insumos con cantidad; costo del producto y
  margen sobre el precio. Sin sub-recetas ni merma.
- Fuera de alcance: promedio ponderado, sub-recetas, merma, descuento de
  inventario al vender (fase de ventas) y costos por sucursal.
- Sin permisos nuevos: receta con `catalog.manage`, costo del insumo con
  `inventory.manage` (ambos OWNER y ADMIN). STAFF no ve costos.
- Producto de reventa (gaseosa) = receta con 1 und de su insumo (resuelve
  el enlace producto ↔ insumo pendiente de la fase 5).

Componentes aprobados: 1) modelo de datos; 2) costo de insumos (campo,
lista, ficha, auditoría con target); 3) receta del producto (en su
página, sin JS); 4) costo y margen (página y lista de productos, avisos
de costo incompleto e insumo archivado); 5) cierre (ADR 0006, README).
Riesgo anotado: el costo de referencia puede quedar desactualizado.

### Componente 1 — Modelo de datos (aprobado 2026-09-29)

- Migración `20260929120000_add_recipes` (**aplicada en test y dev**; diff
  de Prisma vacío): `supplies.unitCost Decimal(14,4)` nullable con
  `CHECK >= 0` (4 decimales: un gramo en COP puede costar 3,25);
  `products` gana `@@unique([companyId, id])`; tabla
  `product_recipe_items` (producto, insumo, `quantity Decimal(14,3)` con
  `CHECK > 0`, `unit StockUnit`), única por (producto, insumo), FK
  compuestas `(companyId, …)` a producto e insumo (`Restrict`), índice
  `(companyId, supplyId)`, RLS.
- `src/server/data/recipes.ts`: `listRecipeItems` (con el insumo: nombre,
  unidad, costo, archivado), `addRecipeItem` (`PRODUCT_NOT_FOUND`,
  `SUPPLY_NOT_FOUND`, `SUPPLY_ARCHIVED`, `UNIT_MISMATCH`,
  `ALREADY_IN_RECIPE`), `updateRecipeItem` (cantidad y unidad; permitido
  con insumo archivado) y `removeRecipeItem` (borra: las líneas son
  configuración, no documentos). Agregar y cambiar bloquean el insumo con
  `lockSupply` (ahora exportado de `data/inventory.ts`).
- La línea guarda su propia unidad, de la familia del insumo. `updateSupply`
  devuelve `UNIT_IN_RECIPES` si se cambia a otra familia un insumo usado en
  recetas (dentro de la familia sí, si no tiene movimientos); el servicio
  lo muestra en el campo unidad.
- Un insumo archivado no se agrega a recetas; archivarlo no toca las
  recetas existentes (el aviso llega en el componente 4).
- Pruebas: `tests/integration/recipes-data.test.ts` (7); `tests/helpers.ts`
  limpia las líneas. Verificado: typecheck, lint, build, suite 189/189.
- Nota: `npm run typecheck` con `next dev` corriendo puede corromper
  `.next/dev/types/validator.ts` (lo escriben los dos); borrar ese archivo
  y repetir.

Commit `2623991`.

### Componente 2 — Costo de insumos (aprobado 2026-09-29)

Decisión del usuario: historial **solo en auditoría** (quién, cuándo y qué
insumo, sin valores, como el precio de productos); el historial con
valores llega con Compras.

- Validación: `decimalTextSchema` (factoría compartida) genera
  `quantitySchema` (mismos mensajes) y `unitCostSchema` (4 decimales en
  cualquier moneda, tope de Decimal(14,4)). `supplySchema` + `unitCost`
  opcional (vacío = null). `SupplyData` exige `unitCost`.
- `lib/company-formats.ts` → `formatUnitCost` (decimales de la moneda y
  hasta 4: "$ 3,25" por gramo en COP). `data/companies.ts` →
  `findCompanyCurrency` (ahora también lo usa el catálogo en lugar de su
  copia privada).
- Servicio: DTO con `unitCost`; `getSupplyList` devuelve
  `{ currency, supplies }`; `getSupply` y `getSupplyDetail` traen
  `currency`; `getInventoryCurrency` (formulario de nuevo insumo).
  `createInventorySupply` y `updateInventorySupply` reciben `ctx` y
  registran `SUPPLY_EVENTS.COST_CHANGED` (target `SUPPLY`) al crear con
  costo y cuando el costo cambia (incluye quitarlo); "3.2500" = "3.25" no
  audita.
- UI: campo "Costo por kg (COP)" con vista previa ("Se verá como $ 3.200
  por kg"); lista "costo $ 3.200/kg" o "sin costo"; ficha con tercera
  tarjeta "Costo por kg".
- Pruebas: unitarias (`unitCostSchema`, `formatUnitCost`), integración de
  insumos reescrita con ayudantes + costo (validación y auditoría). Suite
  193/193, typecheck, lint y build. Por HTTP sin JS contra dev (empresa
  temporal ya borrada; `t_costos.py`): 17/17.
- Incidente: el `next dev` que venía corriendo desde antes del componente
  1 devolvía 500 en `/insumos/nuevo` (`currencyName` con moneda inválida)
  aunque los datos y el build estaban bien; reiniciado limpio (borrando
  `.next/dev`) funcionó. El log también mostró un error de parseo viejo de
  `supply-actions.ts` (estado intermedio ya corregido) enviado por una
  pestaña abierta del navegador.
- No probado en el navegador.

Commit `55870f3`.

### Componente 3 — Receta del producto (aprobado 2026-09-29)

Decisiones del usuario: **página propia** `/catalogo/productos/[id]/receta`
con pestañas "Datos" / "Receta" (en ambas páginas). Diseño aprobado:
cantidades por unidad vendida, reventa = 1 und, auditoría de cada cambio.

- Validación `validations/recipes.ts` (`recipeLineSchema`,
  `recipeItemSchema`; cantidad > 0 con `quantitySchema`). `lib/units.ts` →
  `familyUnits`. `data/recipes.ts` → `findRecipeItem` (producto de la línea
  y unidad del insumo).
- Servicio `services/recipes.ts` (`catalog.manage`): `getProductRecipe`
  (líneas, insumos activos que aún no están, `hasSupplies`,
  `canViewSupplies` = `inventory.manage` para enlazar la ficha),
  `addProductRecipeItem`, `updateProductRecipeItem`,
  `removeProductRecipeItem`. Mensajes: "El insumo se mide en kg: usa g o
  kg.", repetido, archivado, producto o línea inexistente. Auditoría
  `PRODUCT_EVENTS.RECIPE_CHANGED` con target `PRODUCT` (`auditProduct`
  ahora exportado de `services/catalog.ts`).
- UI `components/catalog/`: `product-tabs` (usa `StatusTabs`),
  `recipe-fields`, `recipe-actions` (`refresh()`, sin redirección),
  `add-recipe-item-form` (con JS preselecciona la unidad del insumo y
  filtra por familia; sin JS muestra todas; `key` = líneas para volver a
  montarse vacío), `recipe-line-form` ("Cambiar" en `<details>`, unidades
  de la familia desde el servidor, `key` = cantidad-unidad),
  `recipe-row-button` ("Quitar"), `recipe-list` (enlace a la ficha,
  "Insumo archivado"). Estados: sin receta, sin insumos (enlace a nuevo
  insumo), todos los insumos ya usados.
- Pruebas: `tests/integration/recipes.test.ts` (5) y `familyUnits`. Suite
  199/199, typecheck, lint y build. Por HTTP sin JS contra dev (empresa
  temporal ya borrada; `t_receta.py`): 21/21.
- `_fixture.ts` del scratchpad: borra las líneas de receta antes que los
  insumos.
- Sin JS y desde una pestaña vieja, el rechazo no muestra mensaje (misma
  limitación conocida de la fase 5); el servidor sí rechaza.
- No probado en el navegador.

Commit `e1a17d2`. El usuario pidió la paleta TERU para otro proyecto
(se le entregó desde `globals.css`, sin cambios en el código).

### Componente 4 — Costo y margen (aprobado 2026-09-29)

Decisiones de diseño (dentro del alcance aprobado): costo de la línea =
cantidad convertida a la unidad del insumo × costo de referencia, en
decimal exacto; margen = precio − costo, % sobre el precio (1 decimal;
sin % si el precio es 0); **con insumos sin costo se muestra el costo
parcial y no el margen**; margen negativo en rojo.

- `services/costing.ts` (puro): `lineCost`, `recipeCosting` →
  `NO_RECIPE | INCOMPLETE (cost, missing) | COMPLETE (cost, margin,
  marginPercent)`, montos como texto. `data/recipes.ts` →
  `listRecipeCostLines` (líneas de varios productos en una consulta).
  `lib/company-formats.ts` → `formatPercent` ("70,1 %").
- `getProductRecipe` suma `currency`, `product.price`, `costing`,
  `hasArchivedSupplies` y `cost` por línea. `getProductCatalog` suma
  `costing` por producto (tipo `CatalogProduct`).
- UI: `components/catalog/product-costing.tsx` (`CostingLine` para la
  lista: "Costo $ 547 · Margen 96,7 %", "Sin receta", "Costo incompleto
  (1 insumo sin costo)"; `CostingSummary` para la receta: tarjetas
  Precio de venta / Costo / Margen con textos de ayuda). Línea de receta
  con su costo ("120 g · $ 384", con decimales si hacen falta) o "Sin
  costo". Aviso si la receta usa insumos archivados.
- Montos redondeados solo al mostrar (costo $ 546,5 → "$ 547" en COP).
- Pruebas: `tests/unit/costing.test.ts` (conversión, parcial, completo,
  negativo, precio 0, `formatPercent`) e integración en
  `recipes.test.ts` (receta y lista). Suite 208/208, typecheck, lint y
  build. Por HTTP sin JS contra dev (empresa temporal ya borrada;
  `t_margen.py`): 15/15 (una comprobación falló por espacios del
  extractor de texto; revisada a mano).
- No probado en el navegador.

Commit `898e58e`.

### Componente 5 — Cierre de la fase 6 (aprobado 2026-09-29)

**Fase 6 aprobada** (2026-09-29).

- Revisión de la fase (33 archivos: modelo, datos y servicio de recetas,
  costo de insumos, costeo, acciones y páginas): todas las páginas y
  acciones nuevas validan permiso en el servidor y los servicios lo
  vuelven a validar; escrituras filtradas por empresa y FK compuestas. Sin
  errores de seguridad ni de aislamiento; sin correcciones de código.
- Riesgo nuevo anotado en el ADR: cambiar la unidad de un insumo sin
  movimientos dentro de su familia (kg → g) sin corregir su costo deja
  mal el costo de las recetas (×/÷ 1000).
- `docs/decisiones/0006-recetas-y-costos.md` y README (estado, rutas de
  receta, estructura, ADR).
- Solo documentación: la verificación del componente 4 sigue vigente
  (typecheck, lint, build, suite 208/208).

### Pendiente

- Siguiente fase por definir (Analizar primero). Según el orden acordado:
  **ventas/POS** (con caja, zona horaria por empresa, descuento de
  inventario por receta, opciones/adiciones, decidir stock negativo y
  bloquear el cambio de moneda con ventas).
- Despliegue en Vercel en pausa (dos preguntas abiertas; arreglos de
  `postinstall` y región).
- Usuario: renombrar el proyecto Supabase `su-arepa-dev` → `teru-pos-dev`.
- Antes de producción: proveedor de correo, clave de Storage y bucket por
  entorno.

Commit `fa158b4`.

### Ajuste pedido por el usuario — "¿No es tu empresa? Cambiar" (aprobado 2026-09-29)

Referencia: captura de otro proyecto (enlace lima bajo la tarjeta del
login, sobre fondo oscuro).
- `AuthShell` acepta `footer` (debajo de la tarjeta interna, dentro de la
  tarjeta clara). El login lo usa con un enlace a `/` (buscador "Ingresa a
  tu empresa"). Se muestra también con sesión abierta.
- Color **morado** (`text-link`), no lima: nuestra tarjeta es clara y la
  regla de la paleta prohíbe el lima como texto sobre claro (1.12:1).
- Verificado: typecheck, lint, build, unitarias (90) y el HTML de
  `/su-arepa/login`. No probado en el navegador.

### Ajuste pedido por el usuario — firma "TeruTechnologies" (aprobado 2026-09-29)

- El pie de las pantallas de acceso (`PlatformMark` en `AuthShell`) dice
  "Con la tecnología de **TeruTechnologies**" (antes "... de Teru POS";
  `DEVELOPER_NAME` en `lib/brand.ts`). `PLATFORM_NAME` ("Teru POS") sigue
  en los títulos de pestaña y en la raíz.
- Verificado: typecheck, lint, build y el HTML del pie en
  `/su-arepa/login`.

### Cierre de la sesión 2026-09-29

**Implementado hoy (todo con commit y subido a `origin/master`):**
- Fase 5, componente 5 — cierre (`5cfbb0f`): migración a los compartidos,
  corrección de la carrera al desactivar bodegas, ADR 0005, README.
  **Fase 5 cerrada.**
- Fase 6 — recetas y costos, componentes 1–5: modelo (`2623991`), costo de
  insumos (`55870f3`), receta del producto (`e1a17d2`), costo y margen
  (`898e58e`), cierre con ADR 0006 y README (`fa158b4`). **Fase 6
  cerrada.**
- Ajustes del login: enlace "¿No es tu empresa? Cambiar" y firma "Con la
  tecnología de TeruTechnologies" (último commit de la sesión).
- Entregada al usuario la paleta TERU (tokens de `globals.css`) para usarla
  en otro proyecto.

**Pendiente:**
- **Fase 7 — ventas/POS: empezar por el análisis con el usuario** (mañana).
  Temas ya identificados: caja (apertura/cierre, gastos), métodos de pago,
  zona horaria por empresa (hoy `America/Bogota` fija), descuento de
  inventario por receta (convertir a la unidad del insumo como en
  `services/costing.ts`), opciones/adiciones de productos, decidir si se
  permite stock negativo al vender, bloquear o advertir el cambio de
  moneda con ventas, rol CASHIER / área operativa del POS y pantalla
  oscura del POS.
- Despliegue en Vercel en pausa (preguntas abiertas: qué base usar y qué
  hacer con el correo; arreglos `postinstall` y región `gru1`).
- Usuario: renombrar el proyecto Supabase `su-arepa-dev` → `teru-pos-dev`.
- Antes de producción: proveedor de correo, clave de Storage y bucket por
  entorno.

**Decisiones técnicas de hoy:** ver fase 6 (costo de referencia con
historial solo en auditoría, receta simple por unidad vendida en página
propia, unidad de la línea dentro de la familia del insumo, costo exacto y
sin margen si falta algún costo) y el cierre de la fase 5 (bloqueo
`FOR UPDATE`/`FOR SHARE` de la bodega).

**Errores y riesgos conocidos:**
- Riesgos del ADR 0006 (costo desactualizado, cambio de unidad dentro de
  la familia sin corregir el costo, cambio de moneda).
- Sin JS y desde una pestaña vieja, los rechazos no muestran mensaje.
- `next dev` de larga duración puede quedarse con código viejo (500 en
  `/insumos/nuevo` hoy): reiniciarlo borrando `.next/dev`. `npm run
  typecheck` con `next dev` corriendo puede corromper
  `.next/dev/types/validator.ts` (borrarlo y repetir).
- En Windows, detener `next dev` deja node en el puerto 3000:
  `taskkill /PID <pid> /T /F`.
- Scripts de prueba HTTP en el scratchpad de la sesión (`http_client.py`,
  `_fixture.ts`, `t_*.py`); `_fixture.ts` se copia a `scripts/` solo
  mientras se usa. El extractor de texto deja espacios donde React pone
  `<!-- -->`.

### Próximo paso recomendado

Análisis de la fase 7 (ventas/POS) con el usuario: alcance, flujo de venta
y caja, y las decisiones pendientes listadas arriba, antes de diseñar.

## Sesión 2026-09-30

- El usuario renombró el proyecto Supabase `su-arepa-dev` → `teru-pos-dev`
  (verificado: ref `icecyozrwddieqshjaga`, sa-east-1). El ref no cambió, así
  que `.env` y las URL siguen iguales. **Pendiente cerrado.** (Las menciones
  a `su-arepa-dev` en sesiones anteriores se refieren a esta misma base.)
- Decisión: la base se queda en **sa-east-1**. Supabase no permite cambiar
  la región de un proyecto existente (habría que migrar a uno nuevo), y la
  latencia de ~0,8 s por consulta solo afecta el desarrollo local; en
  producción la app irá en la misma región (`gru1`).

### Fase 7 — ventas/POS: análisis (alcance por aprobar)

Decisiones del usuario (2026-09-30):
- **Solo mostrador:** se arma el pedido y se cobra al momento. Mesas y
  cuentas abiertas, en otra fase.
- **Stock negativo permitido:** la venta nunca se frena por inventario; el
  saldo queda negativo en el kardex y el inventario lo muestra como alerta
  (hay que relajar el CHECK `quantity >= 0` de `stock_levels`).
- **Métodos de pago configurables por empresa** (arranque: Efectivo,
  Tarjeta, Transferencia) y **pago mixto**; cambio en efectivo.
- **Nuevo rol CASHIER:** cobra y maneja su propio turno de caja. STAFF queda
  para funciones futuras (cocina, meseros).

Alcance propuesto: turno de caja por persona y sucursal (fondo inicial,
cierre con conteo y diferencia); POS oscuro en `/[empresa]/pos`; venta con
consecutivo por empresa, pagos y descuento por receta de la bodega principal
de la sucursal en una transacción; anulación por estado (OWNER/ADMIN) que
revierte inventario y caja; lista/detalle de ventas y revisión de cierres en
el panel; zona horaria por empresa; bloquear cambio de moneda con ventas.
Fuera: mesas, domicilios, adiciones, descuentos, propinas, impuestos,
factura electrónica, cliente en la venta, gastos de caja, tiquete impreso,
reportes con gráficas.

**Alcance aprobado** (2026-09-30). Componentes: 1) modelo de datos;
2) ajustes de base (zona horaria, bloqueo de moneda, métodos de pago, rol
Cajero en invitaciones); 3) turno de caja; 4) POS y venta (más alertas de
saldo negativo, insumos sin carga inicial y productos sin receta/costo);
5) ventas en el panel; 6) cierres de caja en el panel; 7) cierre (ADR 0007).

Decisión adicional del usuario: el sistema es para **control y medir lo
gastado**. Se mantiene "permitir y avisar", pero **un producto sin receta
no se vende** (`NO_RECIPE`). Recomendado y aceptado como hoja de ruta:
fase 8 = **Compras** (entradas con costo real, causa principal de los
negativos); fase 9 = **conteo físico y consumo teórico vs. real**
(diferencias valorizadas).

### Componente 1 — Modelo de datos (aprobado 2026-09-30)

- Migración `20260930120000_add_sales` (**aplicada en test y dev**):
  `StaffRole.CASHIER`; `StockMovementType` `SALE`/`SALE_VOID`;
  `companies.timeZone` (default `America/Bogota`) y `lastSaleNumber`
  (consecutivo sin huecos: `UPDATE … RETURNING` al final de la transacción
  de la venta); `stock_movements.saleId` (FK compuesta); tablas
  `payment_methods`, `cash_sessions`, `sales`, `sale_lines`,
  `sale_payments`, todas con FK compuestas `(companyId, …)` y RLS.
  Solo en SQL: se quitan los CHECK de saldo ≥ 0 (`stock_levels` y
  `balanceAfter`); movimiento de venta ⇔ `saleId` y su signo (comparando
  `type::text`: un valor de enum nuevo no se usa en la misma transacción);
  nombre único y **un solo efectivo por empresa** en métodos de pago; **un
  turno abierto por persona** (índice parcial); cierre completo (esperado y
  contado juntos); anulación completa (fecha, quién y motivo); montos ≥ 0,
  cantidades > 0, `lineTotal = unitPrice × quantity`, `tendered ≥ amount`.
  Crea Efectivo/Tarjeta/Transferencia de las empresas existentes.
- Migración `20260930120100_widen_stock_quantities` (**aplicada en test y
  dev**): saldos y movimientos a `Decimal(17,6)`. Motivo: 0,5 g de receta
  en un insumo en kg = 0,0005 kg; con 3 decimales se redondeaba a 0. Va
  aparte porque la primera ya estaba aplicada en test (`migrate reset`
  pide consentimiento explícito).
- `data/payment-methods.ts` (`createDefaultPaymentMethods`, usado por el
  alta de empresa y el seed; `listPaymentMethods`).
- `data/cash-sessions.ts`: `findOpenCashSession`, `openCashSession`
  (`ALREADY_OPEN`, `BRANCH_NOT_FOUND`), `lockCashSession` (SHARE para
  ventas/anulaciones, UPDATE para el cierre), `closeCashSession` (solo su
  dueño; guarda esperado = fondo + efectivo de ventas no anuladas, y
  devuelve la diferencia).
- `data/sales.ts`: `createSale` (turno propio y abierto, productos
  disponibles y con receta, pagos que suman el total exacto, `tendered` solo
  en efectivo; consumo agregado por insumo, bloqueo en orden de `supplyId`,
  conversión con la unidad vigente del insumo bloqueado, descuento de la
  bodega principal de la sucursal del turno; puede dejar negativo) y
  `voidSale` (solo con el turno abierto; devuelve con `SALE_VOID`).
- `data/inventory.ts`: `stockBalance` y `writeStockMovement` extraídos de
  `recordStockMovement` y reutilizados por ventas. Ajuste manual: una
  **salida** no deja saldo negativo; una **entrada** siempre se acepta.
  Archivar insumo / desactivar bodega exige saldo **distinto de 0** (antes
  `> 0`).
- Permisos: `sales.charge` (OWNER, ADMIN, CASHIER); `sales.view`,
  `sales.void`, `cash.review`, `payments.manage` (OWNER, ADMIN). Etiqueta
  "Cajero". Kardex: "Venta" y "Anulación de venta".
- Pruebas: `tests/integration/sales-data.test.ts` (13) y 3 unitarias de
  permisos. Verificado: typecheck, lint, suite **223/223**, build; dev
  revisado por SQL (métodos de Su Arepa y RLS en las 5 tablas).
- Commit al aprobar (incluye la nota del 2026-09-30 sobre Supabase).

Notas: `prisma generate` falla con EPERM si `next dev` está corriendo
(bloquea el motor): detenerlo antes. Los scripts con `await` de nivel
superior no corren con `tsx` (formato cjs).

### Componente 2 — Ajustes de base (aprobado 2026-09-30)

- **Zona horaria por empresa:** `SUPPORTED_TIME_ZONES` en
  `lib/company-formats.ts` (10 zonas con nombre en español; para habilitar
  otra basta con agregarla), `DEFAULT_TIME_ZONE`, `formatClock` y
  `formatDateTime(date, format, timeZone)` con formateadores en caché por
  zona. Se eliminó `BUSINESS_TIME_ZONE`. Campo `timeZone` en
  `companyProfileSchema`, datos, formulario (select nativo + hora en la
  vista previa; aparece también en el asistente) y resumen "Confirmar". El
  kardex usa la zona de la empresa.
- **Moneda bloqueada con ventas:** `companyHasSales` (`data/sales.ts`);
  `getCompanyProfile` devuelve `currencyLocked`; `saveCompanyProfile`
  rechaza el cambio con `CURRENCY_LOCKED_ERROR` en el campo moneda. En el
  formulario las opciones van deshabilitadas y la moneda viaja en un campo
  oculto (un radio deshabilitado no se envía).
- **Métodos de pago** (`/configuracion/pagos`, `payments.manage`): data
  (`createPaymentMethod` devuelve id, `renamePaymentMethod`,
  `setPaymentMethodActive` — `IS_CASH` para el efectivo —,
  `movePaymentMethod`), servicio con auditoría `PAYMENT_METHOD_EVENTS`
  (target `PAYMENT_METHOD`; el orden no se audita), validación
  `paymentMethodNameSchema` (40), componentes en `components/payments/`.
  Lista única con insignias (como Categorías) en lugar de pestañas
  activos/inactivos: así se ordenan todos juntos.
- `components/shared/new-name-form.tsx`: alta por nombre compartida;
  `NewCategoryForm` ahora la usa.
- **Rol Cajero invitable:** `INVITABLE_ROLES = CASHIER, STAFF, ADMIN`
  (Cajero por defecto), ADMIN gestiona CASHIER y STAFF; nuevas
  descripciones; grilla de roles a 3 columnas en pantallas grandes.
- Pruebas: `payment-methods.test.ts` (5), perfil (zona, moneda bloqueada),
  equipo (admin invita cajero), navegación y permisos. Verificado:
  typecheck, lint, suite **234/234**, build. La revisión visual con sesión
  la hizo el usuario (crear una sesión temporal en dev lo bloquean los
  permisos de Claude Code).

### Componente 3 — Turno de caja (aprobado 2026-09-30)

Decisión del usuario: **conteo ciego** (el cajero no ve el esperado antes
de contar; la diferencia la ve al cerrar y queda para revisión).

- **Área POS** `/[empresa]/pos` (layout propio, clase `dark`, sin menú
  lateral; `requirePermission("sales.charge")`). Con la configuración
  inicial pendiente: OWNER al asistente; el resto ve un aviso (redirigir al
  panel haría bucle con el cajero). `PosHeader`: empresa, persona y rol,
  "Volver al panel" (si no es solo-POS) y "Salir".
- **Tema oscuro TERU** en `.dark` de `globals.css` (antes el gris de
  shadcn): fondo #111114, tarjeta #1c1c22, acción lima #b8ff3d con texto
  negro, accent morado oscuro; contrastes verificados (textos secundarios
  ≥ 6:1, bordes de campo ≥ 3:1).
- **Navegación:** grupo "Ventas" con "Vender" (`pos`, `sales.charge`).
  `startsInPos(role)`: quien solo tiene el POS (CASHIER) va del panel al
  POS (el login sigue llevando a `/[empresa]`; el layout del panel
  redirige).
- **Páginas:** `/pos` (sin turno: "Abre tu turno"; con turno: resumen,
  aviso si quedó abierto de otro día — `isSameCalendarDay` en la zona de
  la empresa — y espacio reservado para la venta), `/pos/cierre` (conteo
  ciego + nota), `/pos/turno/[id]` (resultado solo para su dueño:
  esperado, contado y diferencia como faltante/sobrante/cuadrada).
- `services/cash-sessions.ts`: `getPosShift`, `openShift` (sucursal vacía =
  la única activa; si hay varias, hay que elegir), `closeShift`,
  `getClosedShift`. `data/cash-sessions.ts`: `findCashSession` y conteo de
  ventas no anuladas en el select.
- `validations/cash.ts`; `moneySchema(currency, noun)` en
  `validations/common.ts` (lo usa `priceSchema`, mismos mensajes).
- Ajuste pedido por el usuario: el monto muestra separador de miles
  mientras se escribe ("200.000"). `formatAmountInput` / `parseAmountInput`
  en `lib/company-formats.ts` (punto = miles, coma = decimales, como
  `MONEY_LOCALE`); `validations/cash.ts` acepta el valor con o sin
  separadores (sin JS también funciona). El precio de productos sigue con
  campo numérico (punto decimal): se ofreció aplicarle el mismo formato y
  el usuario aprobó sin responder; queda pendiente de confirmar.
- Componentes en `components/pos/` (`MoneyField` grande y táctil,
  formularios con `useActionState` que funcionan sin JS, `ShiftSummary`).
- Pruebas: `cash-shifts.test.ts` (6), `tests/unit/cash.test.ts` (6),
  navegación. Verificado: typecheck, lint, suite **246/246**, build.
  Revisión visual: la hace el usuario.

**Componentes renumerados** (aprobado 2026-09-30): las alertas pasan a
componente propio. 4) POS y venta; 5) alertas de configuración e
inventario; 6) ventas en el panel; 7) cierres de caja en el panel;
8) cierre de la fase (ADR 0007).

### Componente 4 — POS y venta (aprobado 2026-09-30)

- **Pantalla de venta** en `/pos` con turno de hoy (con turno de otro día
  solo se ofrece cerrarlo). Barra del turno (sucursal, hora, ventas,
  "Cerrar turno") y `PosRegister` (`components/pos/sale/`): pestañas por
  categoría + buscador (`ProductGrid`), pedido (`CartPanel`: −/+, nota por
  línea, quitar, vaciar), cobro (`PaymentPanel`: pago mixto, un pago por
  método, monto propuesto = lo que falta, efectivo con "Recibido" y
  "Exacto", cambio) y resultado "Venta #N · Cambio". En pantallas
  pequeñas el pedido va en una barra inferior + `Sheet` (con clase `dark`,
  porque se monta fuera del layout).
- **Requiere JavaScript** (excepción aprobada): el pedido vive en el
  navegador; `checkoutAction(companySlug, payload)` llama al servicio, que
  revalida todo. Tras vender o si cambió el catálogo/turno, `refresh()`.
- Productos agotados y sin receta se ven deshabilitados con su motivo;
  archivados y categorías inactivas no aparecen (`listPosCatalog`).
- `services/sales.ts`: `getPosCatalog` (productos con `blocked`
  `UNAVAILABLE`/`NO_RECIPE`, métodos activos) y `checkout` (turno abierto
  propio; mensajes con el nombre del producto; `refresh` cuando la
  pantalla debe recargarse). `validations/sales.ts`: 1–100 líneas,
  cantidad entera 1–999, nota ≤ 100, pagos > 0, un pago por método.
- Montos en el navegador en centavos enteros (`components/pos/sale/money.ts`:
  `toCents`, `centsToInput`, `inputToCents`, `paymentTotals`,
  `paymentsPayload`).
- Ajuste pedido por el usuario (pago parcial en efectivo): en efectivo se
  escribe solo lo **recibido**; se aplica hasta lo que falta después de los
  demás métodos (`cashDue`). Si no alcanza, queda "Falta" para otro método
  (ej. 33.000: 10.000 efectivo + 23.000 Nequi); si sobra, es cambio. Al
  servidor va `amount` = aplicado y `tendered` = recibido solo si hubo
  cambio. Un efectivo que ya no hace falta o un pago vacío bloquean
  "Cobrar".
- Ajuste pedido por el usuario (pedido que no se pierda y sin doble
  cobro):
  - **Pedido guardado en `localStorage`** (`components/pos/sale/cart-storage.ts`):
    clave `teru-pos:pedido:<slug>:<userId>:<shiftId>`; se restaura al
    montar y cuando cambia el catálogo (`reconcileCart`: quita productos
    bloqueados o inexistentes y métodos inactivos, toma nombres y precios
    vigentes); se borra al cobrar (de inmediato, no en el efecto: el
    catálogo recargado tras vender lo restauraría) o al vaciar. Sin
    almacenamiento disponible, el POS sigue funcionando en memoria. El
    `setState` dentro del efecto lleva excepción de lint justificada.
  - **Clave por pedido (idempotencia):** migración
    `20260930130000_add_sale_client_key` (**aplicada en test y dev**):
    `sales.clientKey` única por empresa. El POS genera un UUID v4 con
    `getRandomValues` (`randomUUID` solo existe en https/localhost) y lo
    renueva tras cada venta. `createSale` devuelve `ALREADY_RECORDED` con
    la venta existente (también si dos envíos chocan en el índice, P2002);
    el POS muestra "ya estaba registrada por $X, no se cobró de nuevo".
    `saleSchema` exige la clave.
- Pruebas: `pos-sales.test.ts` (6), `pos-money.test.ts` (3). Verificado:
  typecheck, lint, suite **264/264**, build. Revisión visual: la hace el
  usuario.

### Pendiente anotado por el usuario (2026-09-30): tiquete de venta

Implementar el **tiquete de venta imprimible**, compatible con las
impresoras estándar del mercado, para imprimir el pedido. Puntos a
analizar cuando se diseñe:
- Impresoras térmicas de 58 y 80 mm (Epson TM, Bixolon, Star y genéricas
  tipo Xprinter / 3nStar), casi todas con comandos **ESC/POS**.
- Dos caminos: (a) impresión del navegador con una página de tiquete
  (CSS `@page` de 58/80 mm): funciona con cualquier impresora instalada,
  pero muestra el diálogo de impresión; (b) ESC/POS directo (WebUSB,
  Web Serial o un agente local tipo QZ Tray): impresión silenciosa y
  apertura del cajón de dinero, con más instalación por equipo.
- Contenido: datos del negocio (nombre, NIT, dirección, teléfono, logo),
  número y fecha de la venta, cajero, líneas con notas, total, pagos y
  cambio; reimpresión desde el detalle de la venta. Revisar requisitos
  locales (en Colombia el tiquete no reemplaza la factura electrónica).
- Ubicación propuesta: componente aparte dentro de la fase 7 (después de
  "ventas en el panel", para reimprimir desde el detalle) o al inicio de
  la fase siguiente; decidirlo con el usuario.

### Componente 5 — Alertas (diseño aprobado 2026-09-30, sin implementar)

- **Inicio del panel, tarjeta "Pendientes"** (OWNER/ADMIN), cada alerta
  solo si tiene casos, con su número y enlace a la lista filtrada:
  productos sin receta (no se venden), productos con costo incompleto
  (margen no medible), insumos con saldo negativo (alguna bodega < 0),
  insumos sin carga inicial (activo y sin ningún movimiento), insumos bajo
  mínimo. Sin pendientes: "Todo listo para vender y controlar".
- **Listas:** insignias "Saldo negativo" y "Sin carga inicial" en insumos;
  "Sin receta · no se vende" en productos; saldos negativos en rojo en el
  kardex; filtro `?alerta=…` en ambas listas con etiqueta removible.
- Solo no archivados. Alertas de productos con `catalog.manage`, de
  insumos con `inventory.manage`. Inicio del cajero y del personal sin
  cambios.
- Pruebas previstas: conteos sin cruzar empresas, filtros, permisos, la
  tarjeta oculta sin permisos.

### Cierre de la sesión 2026-09-30

**Implementado hoy (todo con commit y subido a `origin/master`):**
- Fase 7 — ventas/POS: análisis y alcance aprobados; componentes 1–4
  aprobados: modelo de datos (`79810d6`), ajustes de base — zona horaria,
  moneda bloqueada con ventas, métodos de pago, rol Cajero (`f398d43`),
  área POS y turno de caja con conteo ciego (`446746f`), pantalla de venta
  con pago mixto, pedido guardado y clave anti-duplicado (`36aceb9`).
- Diseño del componente 5 (alertas) aprobado.
- Proyecto Supabase renombrado a `teru-pos-dev` (usuario); se queda en
  sa-east-1.

**Pendiente:**
- Fase 7: componente 5 (alertas, implementar), 6 (ventas en el panel:
  lista, detalle, anulación), 7 (cierres de caja en el panel; ahí también
  cerrar el turno olvidado de otra persona), 8 (cierre: ADR 0007, README).
- **Tiquete de venta imprimible** (anotado por el usuario; ver sección
  arriba): ubicarlo, probablemente, después del componente 6.
- Confirmar si el precio de productos usa el mismo campo con separador de
  miles que el POS.
- Hoja de ruta acordada: fase 8 Compras; fase 9 conteo físico y consumo
  teórico vs. real.
- Siguen abiertos: despliegue en Vercel (en pausa), proveedor de correo,
  clave de Storage y bucket por entorno.

**Decisiones técnicas de hoy:** ver los componentes 1–4 (stock negativo
solo por ventas, cantidades de inventario a 6 decimales, consecutivo con
`lastSaleNumber`, conteo ciego, efectivo aplicado hasta lo que falta,
`clientKey` por pedido, tema oscuro TERU en `.dark`, POS con JS).

**Errores y riesgos conocidos:**
- La revisión visual con sesión la hace el usuario: crear una sesión
  temporal en dev (o consultar rutas tras intentarlo) lo bloquean los
  permisos de Claude Code.
- Si una respuesta de venta se pierde y el cajero cambia el pedido antes
  de reintentar con la misma clave, el servidor devuelve la venta original
  (el POS lo avisa con su total).
- La pantalla de venta requiere JavaScript (excepción aprobada).
- Siguen los de sesiones anteriores (latencia a Supabase en dev, `next
  dev` con código viejo, `prisma generate` con EPERM si `next dev` corre).

### Próximo paso recomendado

Implementar el componente 5 (alertas) según el diseño aprobado.

## Sesión 2026-10-01

### Componente 5 — Alertas (aprobado 2026-10-01)

- **Servicios:** `getSupplyAlertCounts` (`services/inventory.ts`) y
  `getProductAlertCounts` (`services/catalog.ts`), cada uno con su permiso;
  `services/alerts.ts` → `getPendingAlerts(session)` los reúne según el rol
  (`null` = sin permiso, sin tarjeta). Alertas como constantes
  (`SUPPLY_ALERTS`, `PRODUCT_ALERTS`) con `isSupplyAlert` /
  `isProductAlert` para leer `?alerta=`. Una sola fuente de verdad: las
  banderas del DTO (insumos) y `costing.status` (productos); los conteos y
  los filtros usan la misma prueba. Solo no archivados.
- **DTO de insumos:** `uninitialized` (sin ningún movimiento),
  `negativeStock` (alguna bodega < 0); `_count.stockMovements` pasa a
  `supplySelect`. **Cambio de criterio:** `belowMinimum` exige carga
  inicial (sin carga la existencia no se conoce; así un insumo nuevo no
  sale a la vez "sin carga" y "bajo mínimo"). Se ajustó
  `inventory-supplies.test.ts`.
- `getSupplyList` / `getProductCatalog` aceptan `alert` (se ignora con
  archivados). Costeo de productos extraído a `withCosting`.
- **UI:** tarjeta "Pendientes" en el inicio
  (`(panel)/pending-alerts.tsx`): solo alertas con casos, número (rojo en
  sin receta y saldo negativo), explicación y enlace a la lista filtrada;
  sin pendientes, "Todo listo para vender y controlar.". Insignias
  "Saldo negativo" y "Sin carga inicial" en insumos y
  "Sin receta · no se vende" en productos (reemplaza la línea de costo).
  Saldos negativos en rojo en el kardex, en la existencia por bodega y en
  el total de la lista. Filtro `?alerta=` con `FilterChip`
  (`components/shared/filter-chip.tsx`) que se quita conservando la
  búsqueda; la búsqueda conserva la alerta. Textos en
  `SUPPLY_ALERT_INFO` / `PRODUCT_ALERT_INFO` (archivos `*-fields.ts`).
  `withQuery` en `lib/utils.ts`; `SectionTitle` acepta `titleId`.
- Pruebas: `alerts.test.ts` (4: conteos sin cruzar empresas, permisos,
  filtros) y `tests/unit/utils.test.ts`. Verificado: typecheck, lint,
  suite **274/274**, build. Revisión visual: la hace el usuario.
- Commit al aprobar.

### Componente 6 — Ventas en el panel (aprobado 2026-10-01)

Diseño aprobado el 2026-10-01 (lista con rango de fechas, resumen y
detalle con anulación; sin auditoría aparte: la venta guarda quién,
cuándo y por qué).
- **Menú:** "Ventas" (`sales-list`, `ventas`, `sales.view`) en el grupo
  Ventas.
- **Lista `/[empresa]/ventas`:** filtros GET `desde`/`hasta` (días en la
  zona de la empresa; por defecto hoy; invertidos se ordenan; inválidos
  vuelven a hoy), `cajero` (quienes han vendido, incluso desactivados),
  `estado` (`completadas`/`anuladas`), `sucursal` (solo con varias).
  "Ir a la venta" (`?numero=`, acepta "#12"): si existe redirige al
  detalle; si no, aviso. Resumen del rango sin el filtro de estado:
  vendido (cantidad y total), por método de pago y anuladas. Hasta 200
  ventas (`SALES_LIST_LIMIT`) con aviso si hay más.
- **Detalle `/[empresa]/ventas/[id]`:** pedido (precio de la venta, nota),
  pagos con recibido y cambio, turno (abierto/cerrado), inventario
  descontado y devuelto (enlaza a la ficha del insumo con
  `inventory.manage`). Anulada: alerta con quién, cuándo y motivo.
- **Anulación** (`sales.void`): `<details>` con motivo (3–200,
  `voidSaleSchema`) y botón "Anular la venta #N" como confirmación; solo
  si está completada y su turno sigue abierto (si no, se explica).
  `voidSaleFromPanel` usa `voidSale` (ya existía). Vuelve con
  `?aviso=anulada`.
- **Fechas por zona:** `calendarDay`, `isCalendarDay`, `addCalendarDays`,
  `startOfCalendarDay` en `lib/company-formats.ts` (corrige el cambio de
  horario; probado con Bogotá, Madrid y Nueva York).
- **Datos:** `listSales` (+ conteo), `summarizeSales` (aggregate y groupBy
  de pagos), `listSaleCashiers`, `findSaleIdByNumber`, `findSaleDetail` en
  `data/sales.ts`.
- **Refactor:** `findCompanyFormats` (`data/companies.ts`) reemplaza las
  copias de `companyFormats` de turnos y la lectura del kardex; también lo
  usa ventas.
- Componentes en `components/sales/`. Pruebas: `sales-panel.test.ts` (10),
  `tests/unit/calendar-days.test.ts` (3), navegación. Verificado:
  typecheck, lint, suite **287/287**, build. Revisión visual: la hace el
  usuario.

### Componente 7 — Cierres de caja en el panel (aprobado 2026-10-01)

Diseño aprobado el 2026-10-01, con dos decisiones del usuario: **sin**
marca de "revisado" por ahora; **con** alerta en "Pendientes" para turnos
abiertos de días anteriores.
- **Migración `20261001120000_add_cash_session_closed_by`** (**aplicada en
  test y dev**): `cash_sessions.closedById` (FK a users; los ya cerrados
  quedan a nombre de su dueño), el CHECK `cash_sessions_closing_complete`
  lo incluye y `cash_sessions_other_close_reason` exige `closingNote` si
  cerró otra persona. Relaciones con nombre `CashSessionOwner` /
  `CashSessionClosedBy` en el esquema.
- **Permiso nuevo `cash.close`** (OWNER, ADMIN): cerrar el turno de otra
  persona. Ver: `cash.review`.
- **Datos:** `closeCashSession` recibe `onlyOwner` (POS: true; panel:
  false) y guarda `closedById`; `expectedCash` exportado (también sirve
  fuera de transacción para el "cómo va"); `listOpenCashSessions`,
  `countOpenCashSessionsBefore`, `listClosedCashSessions` (con faltantes y
  sobrantes del rango completo, sumados en código: una consulta SQL directa
  comparaba fechas con la zona de la sesión de PostgreSQL),
  `listCashSessionUsers`, `findCashSessionReview`.
- **Servicio** (`services/cash-sessions.ts`): `getCashOverview`,
  `getCashSessionReview` (`canClose`), `closeShiftFromPanel`
  (`closeOthersShiftSchema`: conteo + motivo 3–200), `countStaleShifts`.
  `resolveDayRange` en `lib/company-formats.ts` (lo comparten ventas y
  caja).
- **UI:** menú "Cierres de caja" (`cash-review`, `caja`). Lista: turnos
  abiertos arriba (insignia "De un día anterior"), filtros por día de
  apertura / cajero / sucursal, resumen de faltantes y sobrantes, cerrados
  con diferencia (faltante en rojo) y "Lo cerró X" si no fue su cajero.
  Detalle: cuadre (fondo + efectivo de ventas = esperado; contado;
  diferencia; nota), "Cómo va" si está abierto, métodos de pago, ventas
  del turno (enlazan al detalle con `sales.view`) y "Cerrar este turno"
  (`<details>`; el monto acepta "70.000"). Componentes en
  `components/cash/` (`close-others-shift-*` para no confundirlos con el
  cierre del POS). `FilterField` compartido (`components/shared/`), ahora
  también en los filtros de ventas. Alerta "Turnos abiertos de días
  anteriores" en el inicio.
- Pruebas: `cash-review.test.ts` (10), permisos, alertas y
  `sales-data.test.ts` ajustados. Verificado: typecheck, lint, suite
  **297/297**, build. Revisión visual: la hace el usuario.
- Pendiente menor: el campo "Efectivo contado" del panel no formatea los
  miles mientras se escribe (el `MoneyField` del POS sí). No se revisó
  reutilizarlo porque Claude Code bloqueó la lectura de los componentes
  del POS en esta sesión.

### Impresiones — análisis (2026-10-01)

Maqueta aprobada por el usuario: `../Maqueta_impresiones_Teru_POS.pdf`
(fuera del repo; generada con Chrome headless e `@page` por hoja). Se
mantiene ese diseño (abierto a cambios menores). Hojas: comanda de
cocina, soporte de venta (80 y 58 mm), cierre de turno, existencias con
columna "Contado".
- Impresión por el navegador (cualquier impresora instalada); silenciosa
  con Chrome `--kiosk-printing`; cajón por la opción del driver. ESC/POS
  directo, para después.
- **Una sola impresora, en caja** (decisión del usuario). Dos impresoras
  (caja y cocina) necesitaría un agente local tipo QZ Tray: después.
- **Todos los productos van en la comanda**, bebidas incluidas. Si un
  cliente pide separar, mejora futura (marca por categoría "Se prepara en
  cocina").
- "Soporte de venta" (no "factura"), solo si el cliente lo pide; con la
  aclaración de que no es factura electrónica.
- Orden propuesto: a) base de impresión + comanda + soporte; b) cierre de
  turno impreso; c) hoja de existencias y conteo (80 mm y carta). Después,
  cierre de la fase 7 (ADR 0007).

### Idea anotada por el usuario (2026-10-01): aviso por WhatsApp de lo que falta

El propietario quiere recibir, **preferiblemente por WhatsApp y de forma
automática** (por ejemplo al cerrar el último turno del día), un mensaje
informativo con la **lista de insumos que hacen falta y cuánto comprar**,
porque algunas compras son diarias. Puntos a analizar cuando se diseñe:
- Qué es "falta": bajo mínimo y saldo negativo ya existen; "cuánto
  comprar" pide un nivel objetivo por insumo (p. ej. "stock ideal") o usar
  el mínimo (mínimo − existencia).
- Disparador: cierre del último turno abierto del día, una hora fija por
  empresa, o un botón "Enviar ahora".
- Canal: WhatsApp Business Cloud API (Meta: verificación del negocio,
  plantillas aprobadas, costo por conversación) o un proveedor (Twilio);
  número del propietario por empresa con su consentimiento. Alternativas
  más simples para empezar: correo (también pendiente de proveedor) o un
  enlace `wa.me` con el texto armado.
- Ubicación sugerida: con o después de la fase 8 (Compras), que da el
  costo real y los proveedores.

### Componente a) de impresiones — Base, comanda y soporte (diseño aprobado 2026-10-01, sin implementar)

- Páginas `/[empresa]/imprimir/comanda/[id]` y `/[empresa]/imprimir/soporte/[id]`:
  blancas, sin menú, diseño de la maqueta, logo de la empresa si tiene;
  barra en pantalla (Imprimir, ancho 80/58 mm, Volver) oculta al
  imprimir; marca "ANULADA" si aplica.
- Acceso: OWNER/ADMIN (`sales.view`) cualquier venta, con "Imprimir
  soporte" y "Reimprimir comanda" en el detalle de la venta; el cajero
  solo ventas de su turno abierto.
- POS: al cobrar, la comanda se imprime sola sin salir de la pantalla de
  venta (iframe oculto); en "Venta #N · Cambio", botón "Imprimir soporte".
  `checkout` tendrá que devolver el id de la venta.
- Ajustes por equipo en el navegador (sin migración): ancho del papel (80
  por defecto) e "Imprimir comanda al cobrar" (activado por defecto).
- README: Chrome `--kiosk-printing` para imprimir sin diálogo y opción
  del driver para abrir el cajón.
- Fuera: dos impresoras, comanda por categoría, ESC/POS directo; el
  cierre de turno impreso y la hoja de existencias son los componentes b)
  y c).
- Pruebas: permisos (dueño/admin, cajero con su turno abierto, otro
  cajero no, otra empresa no) y contenido de cada hoja.

### Cierre de la sesión 2026-10-01

**Implementado hoy (todo con commit y subido a `origin/master`):**
- Fase 7, componente 5 — alertas (`de793b8`): tarjeta "Pendientes",
  insignias y filtro `?alerta=` en productos e insumos, saldos negativos en
  rojo.
- Componente 6 — ventas en el panel (`29e33d3`): lista con rango de fechas
  en la zona de la empresa, resumen por método de pago, detalle con
  inventario descontado y anulación con motivo.
- Componente 7 — cierres de caja en el panel (`8caae45`): turnos abiertos
  y cerrados con cuadre, faltantes/sobrantes, cierre del turno olvidado
  (`cash.close`, `closedById`), alerta de turnos de días anteriores.
- Maqueta de impresiones en PDF y diseño aprobado del componente a).

**Pendiente:**
- Impresiones: a) base + comanda + soporte (diseño aprobado, implementar);
  b) cierre de turno impreso; c) hoja de existencias y conteo.
- Fase 7, componente 8: cierre de la fase (ADR 0007, README).
- Aviso por WhatsApp de insumos que faltan (idea anotada, ver arriba).
- "Efectivo contado" del panel sin formato de miles mientras se escribe
  (revisar reutilizar `MoneyField` del POS).
- Confirmar si el precio de productos usa el campo con separador de miles.
- Hoja de ruta: fase 8 Compras; fase 9 conteo físico y consumo teórico
  vs. real.
- Siguen abiertos: despliegue en Vercel (en pausa), proveedor de correo,
  clave de Storage y bucket por entorno.

**Decisiones técnicas de hoy:** `belowMinimum` exige carga inicial;
alertas calculadas con las mismas banderas del DTO que los filtros;
fechas por día en la zona de la empresa (`resolveDayRange`,
`startOfCalendarDay`, corrige el cambio de horario); `findCompanyFormats`
única; anulación sin auditoría aparte (la venta guarda quién/cuándo/por
qué); `cash.close` como permiso por acción; `closedById` con CHECK de
motivo si cierra otra persona; sin marca de "revisado" en los cierres;
impresión por el navegador con una impresora en caja.

**Errores y riesgos conocidos:**
- Claude Code bloqueó en esta sesión la lectura de componentes del POS
  (clasificador: "Production Deploy", probablemente por la migración
  recién aplicada en dev). El componente a) toca la pantalla de venta: si
  vuelve a pasar, avisar al usuario antes de seguir.
- Las consultas SQL directas con fechas comparan con la zona de la sesión
  de PostgreSQL: preferir consultas de Prisma (pasó con los faltantes).
- Siguen los de sesiones anteriores (latencia a Supabase en dev, revisión
  visual con sesión a cargo del usuario, `prisma generate` con EPERM si
  `next dev` corre).

### Próximo paso recomendado

Implementar el componente a) de impresiones (base, comanda y soporte)
según el diseño aprobado.

## Sesión 2026-10-02

### Componente a) de impresiones — Base, comanda y soporte (aprobado 2026-10-02)

- **Rutas** `/[empresa]/imprimir/comanda/[id]` y `/soporte/[id]` (layout
  blanco con `@page { margin: 0 }` y fondo blanco al imprimir).
  `print-access.ts`: entra quien tiene `sales.view` o `sales.charge`;
  "Volver" va al detalle de la venta (panel) o al POS. `?auto=1` imprime
  al cargar y avisa a quien la abrió (`postMessage`).
- **Servicio** `getPrintableSale` (`services/sales.ts`): con `sales.view`
  cualquier venta de la empresa; solo `sales.charge`, las de su turno
  abierto; si no, `null` (404). `getSaleDetail` se separó en
  `loadSaleDetail` (sin permiso) para reutilizarlo; el detalle trae
  `cashierId` (`userId` en `findSaleDetail`). `checkout` devuelve `saleId`.
- **Componentes** `components/printing/`: `PrintFrame` (barra Volver,
  80/58 mm, Imprimir; espera logo y fuente antes de imprimir),
  `KitchenTicket`, `SaleReceipt` (en 58 mm fecha/hora en columnas y el
  valor baja a la fila del detalle; logo en gris con `loading="eager"`),
  `sheet-parts` (reglas, filas, "ANULADA", `taxIdText`: antepone "NIT"
  salvo que ya venga el tipo), `print-settings.ts` (localStorage
  `teru-pos:impresion`: ancho 80 por defecto, comanda al cobrar activada),
  `print-sheets.ts` (`printSheetHref`, `printInBackground`: iframe de
  tamaño 0 que se quita al imprimir o a los 2 min), `PaperWidthToggle`.
  Ancho útil: 72 mm / 48 mm; texto en `em` (11 pt / 8,5 pt).
- **POS:** comanda automática al cobrar (también con `alreadyRecorded`:
  la primera respuesta se perdió); en "Venta #N" botones "Soporte" y
  "Comanda" (reimprimir, agregado por si falla el papel o la comanda
  automática está apagada); botón "Impresión" (Sheet) en la barra del
  turno. **Panel:** "Imprimir soporte" y "Reimprimir comanda" en el
  detalle de la venta. `formatCalendarDate` en `lib/company-formats.ts`.
- README: sección "Impresión" (Chrome `--kiosk-printing`, cajón por el
  driver).
- Pruebas: `printing.test.ts` (5: contenido, cajero propio/otro, otra
  empresa, STAFF, anulada, turno cerrado), `print-settings.test.ts` (3),
  `pos-sales.test.ts` ajustado. Verificado: typecheck, lint, suite
  **305/305**, build. Hojas renderizadas con datos de ejemplo y Chrome
  headless (script `render-sheets.tsx` del scratchpad): 80 y 58 mm
  coinciden con la maqueta; al imprimir se ocultan barra y sombra.
- **Sin probar:** en el navegador con sesión y en una impresora real
  (comanda automática por iframe, `--kiosk-printing`, cajón).
- Aprobado por el usuario el 2026-10-02 (revisión en el navegador a su cargo).
- `npm run dev` fijo en el puerto 3000 (`next dev -p 3000`): si está ocupado
  falla en vez de saltar a otro. El 3005 lo usa otro proyecto del usuario
  (`05.TERU-RRHH`).

### Componente b) de impresiones — Cierre de turno impreso (aprobado 2026-10-02)

Diseño aprobado el 2026-10-02: hoja 4 de la maqueta; el cajero imprime
**solo su último turno cerrado** (desde el resultado del turno); los
anteriores, el administrador desde el panel. Un turno abierto no se
imprime. Sin migración.
- Ruta `/[empresa]/imprimir/cierre/[id]`. `requirePrintAccess(slug,
  permisoDeRevisión, { panel, pos })` ahora es genérico (ventas:
  `sales.view`; cierre: `cash.review`, Volver a `caja/[id]` o
  `pos/turno/[id]`). `printSheetHref` acepta `"cierre"` (parámetro `id`).
- Servicio `getPrintableShift` (`services/cash-sessions.ts`):
  `getCashSessionReview` se separó en `loadCashSessionReview` (sin
  permiso); la revisión trae `cashierId`. Calcula anuladas (cantidad y
  total), total vendido (suma de métodos) y "Cerró" (quien cerró o el
  cajero). `getClosedShift` devuelve `printable` (es su último turno).
  Datos: `findLastClosedCashSessionId`.
- UI: `components/printing/shift-closing-sheet.tsx` (FALTANTE / SOBRANTE /
  CUADRADA, nota, firmas Entrega / Recibe) y `print-sheet-button.tsx`
  (imprime en segundo plano). POS: "Imprimir cierre" en `/pos/turno/[id]`
  si es su último turno. Panel: "Imprimir cierre" en el detalle del turno
  cerrado.
- Pruebas: 5 más en `printing.test.ts` (abierto no, contenido con cierre
  desde el panel y faltante, anuladas aparte, solo el último para el
  cajero, otra empresa y STAFF). Verificado: typecheck, lint, suite
  **310/310**, build. Hoja renderizada con Chrome headless
  (`render-closing.tsx` del scratchpad): 80 y 58 mm como la maqueta.
- `next dev` en segundo plano se detiene a los 30 min, pero en Windows el
  proceso sigue vivo en el 3000; se cerró con `taskkill /PID <pid> /T /F`.
- Corrección reportada por el usuario (captura en 58 mm): "SOBRANTE
  $12.000" se salía del papel con la fuente real (más ancha que la del
  render de prueba). `SheetRow` ahora usa `flex-wrap` y el valor
  `ml-auto`: si no cabe, baja a la línea siguiente a la derecha. En 58 mm
  se reducen el resultado del cierre (1,4 em), el TOTAL del soporte
  (1,55 em) y "PEDIDO #N" de la comanda (1,9 em). Probado con montos de
  millones y la fuente del build (`app-fonts.css` del scratchpad).

### Componente c) de impresiones — Existencias y conteo (aprobado 2026-10-02)

Diseño aprobado el 2026-10-02 (hoja 5 de la maqueta). Lo contado se
escribe a mano; registrarlo en el sistema es la fase 9.
- Ruta `/[empresa]/imprimir/existencias/[id]` (`inventory.manage`;
  `?desde=insumos` cambia "Volver"). `stockSheetHref` en `print-sheets.ts`.
- Servicio `getStockSheet` (`services/inventory.ts`): insumos activos por
  nombre con el saldo en esa bodega (`null` = sin fila en `stock_levels`,
  se imprime "—"; negativo con "−") y `belowMinimum` del DTO (mínimo por
  insumo, total de todas las bodegas: con varias bodegas no es por bodega).
  Encabezado: empresa, bodega, fecha y hora, "Imprimió". Datos:
  `findMainWarehouseId` (principal de la sucursal principal);
  `getSupplyList` devuelve `mainWarehouseId`.
- **Papel Carta** solo en esta hoja: `PrintFrame` con `allowLetter` (186 mm
  y `@page { size: letter; margin: 15mm }`); no se guarda como papel del
  equipo. `PaperWidthToggle` ahora recibe `options`
  (`PAPER_WIDTH_OPTIONS`).
- UI: `components/printing/stock-count-sheet.tsx` (columnas Insumo /
  Sistema / Contado en blanco, "BAJO MÍN.", leyenda, firmas Contó /
  Revisó; filas que no se parten entre páginas). Botón "Imprimir
  existencias" en cada bodega activa (Bodegas) y en Insumos (bodega
  principal).
- Pruebas: `stock-sheet.test.ts` (4) y `inventory-supplies.test.ts`
  ajustada. Verificado: typecheck, lint, suite **314/314**, build. Hoja
  renderizada en 80, 58 y Carta con la fuente del build
  (`render-stock.tsx` del scratchpad).

### Componente 8 — Cierre de la fase 7 (aprobado 2026-10-02)

**Fase 7 aprobada** (2026-10-02).

- **Revisión de la fase** (acciones de servidor, páginas, servicios y
  datos de ventas, caja, métodos de pago, alertas e impresiones): todas
  las acciones validan sesión y permiso con la empresa enviada; todas las
  páginas nuevas exigen permiso en el servidor (el layout de `imprimir`
  solo pone estilos); escrituras y lecturas filtradas por empresa.
  Correcciones:
  - `expectedCash` (`data/cash-sessions.ts`) leía el turno solo por id;
    ahora filtra también por empresa. No era explotable (quienes lo llaman
    ya validaban el turno con la empresa), pero rompía la regla de la capa
    de datos.
  - Pendiente cerrado: "Efectivo contado" del panel ahora usa `MoneyField`
    (separador de miles mientras se escribe), con el tamaño nuevo `md`.
- `docs/decisiones/0007-ventas-pos-y-caja.md` y README (estado, POS,
  menú, impresión, estructura, ADR).
- Verificado: typecheck, lint, suite **314/314**, build.

## Fase 8 — Compras

Decisiones del usuario (2026-10-02): **terceros unificados** (proveedor
ahora, cliente después en la misma tabla), **costo promedio ponderado** al
confirmar, **sin pagos** en esta fase (cartera y gastos de caja aparte),
**borrador y confirmar**. Reglas aceptadas: la línea registra lo pagado
con impuestos; anular una compra no recalcula el costo (riesgo en el ADR).

Alcance aprobado (2026-10-02). Componentes: 1) modelo de datos y permiso;
2) proveedores; 3) compra en borrador y confirmación; 4) lista, detalle y
anulación (kardex con "Compra #N"); 5) cierre (ADR 0008, README). Fuera:
pagos y cuentas por pagar, gastos de caja, impuestos desglosados,
devoluciones parciales, órdenes de compra, clientes en terceros, aviso por
WhatsApp.

### Componente 1 — Modelo de datos y permiso (aprobado 2026-10-02)

- Migración `20261002120000_add_purchases` (**aplicada en test y dev**;
  diff vacío; RLS verificado en dev): `third_parties` (nombre, NIT,
  teléfono, correo, `isSupplier`, `isCustomer`, `isArchived`), `purchases`
  (`number` nulo en borrador, proveedor, bodega, factura del proveedor,
  `purchasedOn` DATE, estado `DRAFT/CONFIRMED/VOIDED`, `total`, quién y
  cuándo creó, confirmó y anuló), `purchase_lines` (insumo único por
  compra, cantidad `Decimal(14,3)`, unidad de la familia, `lineTotal`),
  `companies.lastPurchaseNumber`, `StockMovementType` `PURCHASE` /
  `PURCHASE_VOID` y `stock_movements.purchaseId`. Todo con FK compuestas
  por empresa. Solo en SQL: nombre único (lower) y NIT único por empresa,
  al menos un papel, enlace y signo de los movimientos de compra (por
  texto, como ventas), número solo al confirmar, confirmación y anulación
  completas, montos y cantidades válidos.
- Permiso `purchases.manage` (OWNER, ADMIN).
- `data/purchases.ts`: borrador (`createPurchaseDraft`,
  `updatePurchaseDraft`, `deletePurchaseDraft` — borra con sus líneas),
  líneas (`addPurchaseLine`, `updatePurchaseLine`, `removePurchaseLine`;
  unidad de la familia con el insumo bloqueado; total sincronizado),
  `confirmPurchase` (bloquea compra, bodega `FOR SHARE` e insumos en orden;
  **valida todo antes de escribir**; movimiento `PURCHASE`, costo
  promedio con `weightedUnitCost` y consecutivo al final) y `voidPurchase`
  (`PURCHASE_VOID`, puede dejar negativo, no toca el costo).
  `weightedUnitCost`: sin costo previo o con existencia total ≤ 0 toma el
  de la compra; 4 decimales. Existencia total = todas las bodegas.
- `data/inventory.ts`: `lockWarehouse` exportado; `writeStockMovement`
  acepta `saleId` / `purchaseId` opcionales. Kardex: "Compra" y
  "Anulación de compra" (el enlace a la compra llega en el componente 4).
- **Error hallado por las pruebas y corregido:** devolver un error dentro
  de `$transaction` **confirma** lo ya escrito. La primera versión de
  `confirmPurchase` escribía cada línea antes de validar la siguiente; con
  un insumo archivado dejaba entrar las anteriores. Ahora valida todo
  primero.
- Pruebas: `purchases-data.test.ts` (14: costo, borrador, líneas, otra
  empresa, confirmar, consecutivo sin huecos, confirmación simultánea,
  nada a medias, anular con negativo, reglas de la BD) y permisos.
  Verificado: typecheck, lint, suite **328/328**, build.
- `prisma generate` dio EPERM al reemplazar el motor (el `next dev` del
  usuario lo tenía cargado); el cliente TS sí se generó y el motor es el
  mismo (misma versión), así que no afecta. Se borraron los `.tmp`.

### Componente 2 — Proveedores (aprobado 2026-10-03)

Diseño aprobado (2026-10-02): grupo de menú "Compras" (entre Ventas y
Catálogo) con "Proveedores" (`/compras/proveedores`, `purchases.manage`);
lista con búsqueda por nombre o NIT y pestañas Activos/Archivados; crear
(`/nuevo`) y editar (`/[id]`) con nombre (2–80), NIT, teléfono y correo
opcionales; errores de nombre o NIT repetido en su campo; vuelve a la lista
con aviso; archivar siempre (no se elige en compras nuevas); sin
auditoría; sin JS.

- `validations/third-parties.ts` (`supplierSchema`: vacíos → null, correo
  en minúsculas) y `data/third-parties.ts` (`listSuppliers`,
  `findSupplier`, `createSupplier` / `updateSupplier` con `NAME_TAKEN` /
  `TAX_ID_TAKEN` según el índice del P2002 — **verificado con prueba**: el
  `meta` nombra `third_parties_companyId_taxId_key` —,
  `setSupplierArchived`). Solo filas con `isSupplier`.
- Servicio `services/third-parties.ts` (todo con `purchases.manage`):
  `getSupplierList`, `getSupplier`, `createThirdPartySupplier`,
  `updateThirdPartySupplier`, `setThirdPartySupplierArchived`. Mensajes
  "Ya existe un proveedor con ese nombre / NIT." (dicen "proveedor"
  aunque el índice es de terceros: revisarlos cuando lleguen los
  clientes).
- Menú: `NavGroup` `purchases` ("Compras") con `purchases-suppliers`
  (ícono `Truck`); tarjeta en Inicio por la navegación.
- UI `components/purchases/` (patrón de insumos): `supplier-fields`,
  `supplier-actions`, `supplier-form`, `supplier-list` (NIT, teléfono y
  correo en una línea; el nombre y "Editar" van a `/[id]`),
  `supplier-row-button`. Páginas `compras/proveedores`, `/nuevo`, `/[id]`
  (404 si no es de la empresa o no es proveedor).
- Pruebas: `tests/integration/third-parties.test.ts` (7: validación y
  null, nombre/NIT repetidos al crear y editar, nombre único frente a un
  tercero solo cliente que no se lista, búsqueda y archivados, editar,
  otra empresa, STAFF y CASHIER rechazados) y 2 de menú. Verificado:
  typecheck, lint, suite **337/337**, build; sin sesión la ruta redirige
  al login. Revisión visual con sesión: la hace el usuario.

### Componente 3 — Compra en borrador y confirmación (aprobado 2026-10-03)

Diseño aprobado (2026-10-03) con las tres recomendaciones: **sin
auditoría aparte** del cambio de costo (la compra guarda quién y cuándo, y
el kardex la enlaza), **sin fechas futuras**, y **aviso** (no bloqueo) en
las líneas de insumos sin carga inicial.

- **Menú:** `purchases-list` ("Compras", `compras`, ícono `PackagePlus`)
  antes de Proveedores. `activeNavItemId` (`navigation.ts`): el menú marca
  solo la sección de ruta más específica (en `/compras/proveedores` ya no
  se marcan las dos).
- **Validación** `validations/purchases.ts`: `purchaseHeaderSchema(today)`
  (proveedor, bodega, fecha válida y no futura comparando "AAAA-MM-DD",
  factura opcional ≤ 40), `purchaseLineSchema(currency)` /
  `purchaseItemSchema` (cantidad > 0 con `quantitySchema`, unidad, total
  pagado con `amountSchema`). Refactor: `amountSchema` (antes privado de
  `validations/cash.ts`) y `optionalText` (antes de terceros) pasan a
  `validations/common.ts`.
- **Datos** (`data/purchases.ts`): `listPurchaseDrafts`, `findPurchase`
  (encabezado, quién creó/confirmó, líneas con el insumo y su conteo de
  movimientos), `findPurchaseLineSupplyUnit`.
- **Servicio** `services/purchases.ts` (`purchases.manage`):
  `getPurchaseFormOptions` (proveedores activos, bodegas activas, principal
  propuesta, hoy en la zona de la empresa), `getPurchaseDrafts`,
  `getPurchase` (costo por unidad del insumo de cada línea a 4 decimales,
  `uninitialized`; en borrador, opciones del encabezado — incluye el
  proveedor actual aunque esté archivado — e insumos activos que faltan),
  `createPurchase`, `updatePurchaseHeader`, `deletePurchase`,
  `addPurchaseItem`, `updatePurchaseItem`, `removePurchaseItem`,
  `confirmPurchaseDraft` (mensajes con el nombre del insumo archivado o de
  unidad cambiada). Borradores compartidos por la empresa.
- **UI** `components/purchases/`: `purchase-fields`, `purchase-actions`
  (crear abre el borrador; líneas y encabezado con `refresh()`; eliminar
  vuelve a la lista con aviso; confirmar abre la compra con
  `?aviso=confirmada`), `purchase-header-form` (`NewPurchaseForm` y
  `EditPurchaseHeaderForm` en `<details>`; con una sola bodega no se
  pregunta), `add-purchase-line-form` (unidad preseleccionada con JS, como
  recetas), `purchase-line-form`, `purchase-line-row-button`,
  `purchase-lines`, `purchase-draft-actions` (confirmar y eliminar en dos
  pasos), `purchase-draft-list`. `MoneyField` acepta `id` (uno por línea);
  `amountInputValue` en `lib/company-formats.ts` ("16500.00" → "16.500").
- **Páginas:** `/compras` (borradores), `/compras/nueva` (estado vacío si
  no hay proveedores o bodegas activas), `/compras/[id]` (borrador
  editable; confirmada o anulada, solo lectura).
- Pruebas: `tests/integration/purchases.test.ts` (8) y menú (Compras,
  sección activa). Verificado: typecheck, lint, suite **346/346**, build;
  sin sesión las rutas redirigen al login. Revisión visual con sesión: la
  hace el usuario.
- Ajuste pedido por el usuario (captura): "Eliminar borrador" se partía en
  dos líneas y el recuadro de confirmar quedaba angosto a su lado. Ahora
  van en una fila `flex-row-reverse flex-wrap` (Confirmar primero, a la
  derecha); el `<details>` abierto ocupa todo el ancho
  (`open:basis-full`) con su recuadro debajo. Revisado con Chrome headless
  y el CSS del build en los tres estados.
- Para el componente 4: lista de confirmadas y anuladas con filtros,
  anulación, y enlace "Compra #N" en el kardex.

### Componente 4 — Lista, detalle y anulación (aprobado 2026-10-03)

Diseño aprobado (2026-10-03) con las recomendaciones: rango por defecto
de **los últimos 30 días**, anula quien tiene `purchases.manage` (sin
permiso nuevo), **sin límite de tiempo** para anular. El enlace "Venta #N"
en el kardex (opcional) **no** se hizo: el usuario no lo confirmó.

- `resolveDayRange(query, timeZone, now, defaultDays = 1)`: sin fechas,
  los últimos `defaultDays` días hasta hoy (ventas y caja siguen en 1 =
  hoy, mismo comportamiento). Pruebas en `calendar-days.test.ts`.
- `voidReasonSchema` y `VOID_REASON_MAX` pasan a `validations/common.ts`
  (los usan `voidSaleSchema` y el nuevo `voidPurchaseSchema`).
- **Datos** (`data/purchases.ts`): `listPurchases` (confirmadas y
  anuladas por `purchasedOn` inclusivo, proveedor, bodega, estado; orden
  fecha y número desc), `summarizePurchases` (groupBy por estado),
  `listPurchaseSuppliers` (con compras, aunque estén archivados),
  `findPurchaseIdByNumber`; `findPurchase` trae anulación (quién, cuándo,
  motivo) y sus movimientos. `listStockMovements` trae `purchase { id,
  number }`.
- **Servicio** (`services/purchases.ts`): `getPurchasesOverview`
  (`PURCHASES_DEFAULT_DAYS` 30, `PURCHASES_LIST_LIMIT` 200, filtros
  `desde`/`hasta`/`proveedor`/`bodega`/`estado` = `confirmadas`/`anuladas`;
  bodegas solo si hay más de una), `findPurchaseByNumber`,
  `voidConfirmedPurchase` (motivo 3–200; "ya estaba anulada"; un borrador
  se elimina, no se anula). `getPurchase` suma `voided` e `inventory`
  (`entered` / `removed`). `getSupplyDetail` suma `purchase` por
  movimiento y `canViewPurchases`.
- **UI** `components/purchases/`: `purchases-filters`,
  `purchases-summary` (Comprado / Anuladas), `purchase-list`,
  `purchase-inventory` (entró / salió al anular, enlaza la ficha),
  `void-purchase-form` (`<details>`, advierte que el costo no se
  recalcula). `/compras`: borradores arriba (si hay), filtros, resumen
  del rango y lista; "Ir a la compra #N". Detalle: aviso de anulada,
  sección Inventario y "Anular compra" si está confirmada. Kardex:
  "Compra #N" / "Anulación de compra #N" con enlace (`SupplyKardex`
  recibe `companySlug`).
- Pruebas: `tests/integration/purchases-panel.test.ts` (6: lista,
  filtros y resumen; número; anular con negativo y sin tocar el costo;
  borrador y otra empresa; kardex; permisos) y 2 unitarias del rango.
  Verificado: typecheck, lint, suite **354/354**, build. Revisión visual
  con sesión: la hace el usuario.

### Componente 5 — Cierre de la fase 8 (aprobado 2026-10-03)

**Fase 8 aprobada** (2026-10-03).

- **Revisión de la fase** (terceros, compras: datos, servicios, acciones,
  páginas, kardex y menú): acciones con sesión y permiso de la empresa
  enviada, páginas con permiso en el servidor, datos filtrados por empresa.
  **Hallazgo corregido:** `voidPurchase` no tomaba la bodega ni revisaba
  que estuviera activa; con la existencia de una compra en una bodega
  secundaria consumida hasta 0, la bodega se podía desactivar y la
  anulación la dejaba **inactiva con saldo negativo** (también en carrera).
  Ahora la toma `FOR SHARE` y devuelve `WAREHOUSE_INACTIVE` antes de
  escribir; el servicio pide activarla en Bodegas. Dos pruebas nuevas en
  `purchases-data.test.ts` (inactiva y carrera ×3) fallaban antes del
  arreglo y pasan 3/3 después.
- `docs/decisiones/0008-compras.md` y README (estado, menú, compras,
  estructura, ADR).
- Verificado: typecheck, lint, suite **356/356**, build.

## Cierre de la sesión 2026-10-03

**Implementado hoy (con commit y subido, salvo el componente 5):**
- Fase 8, componente 2 — proveedores (`0948504`).
- Componente 3 — compra en borrador y confirmación (`7045a7f`), con el
  ajuste visual de los botones Confirmar / Eliminar pedido por el usuario.
- Componente 4 — lista, detalle y anulación, kardex con "Compra #N"
  (`c601dbe`).
- Componente 5 — revisión, corrección de la anulación con bodega inactiva,
  ADR 0008 y README (aprobado; último commit de la sesión). **Fase 8
  cerrada.**

**Pendiente:**
- Siguiente fase según la hoja de ruta: **fase 9, conteo físico y consumo
  teórico vs. real** (analizar primero con el usuario).
- Opcional ofrecido y no confirmado: "Venta #N" con enlace en el kardex.
- Ideas anotadas: aviso por WhatsApp de insumos que faltan; mensajes de
  duplicado de terceros cuando lleguen los clientes.
- Siguen abiertos: despliegue en Vercel (en pausa), proveedor de correo,
  clave de Storage y bucket por entorno.

**Decisiones técnicas de hoy:** borradores compartidos por la empresa;
sin auditoría aparte del costo (la compra y el kardex son el registro);
fechas de compra sin futuro; aviso (no bloqueo) para insumos sin carga
inicial; `purchases.manage` también anula, sin límite de tiempo; lista por
defecto de 30 días (`resolveDayRange` con `defaultDays`); menú con la
sección más específica activa (`activeNavItemId`); `amountSchema`,
`optionalText` y `voidReasonSchema` compartidos en `validations/common.ts`;
`MoneyField` con `id`; anular exige bodega activa (`FOR SHARE`).

**Errores conocidos:**
- La revisión visual con sesión la hace el usuario (no se probó con sesión
  ninguna página de compras).
- Los heredoc largos en Bash siguen fallando ("unexpected EOF"): usar
  scripts en el scratchpad o la herramienta Write.
- Siguen los de sesiones anteriores (latencia a Supabase en dev, `next
  dev` en Windows deja el proceso en el 3000, `prisma generate` con EPERM
  si `next dev` corre).

**Próximo paso recomendado:** análisis de la fase 9 (conteo físico y
consumo teórico vs. real) con el usuario.

## Fase 9 — Conteo físico y consumo teórico vs. real

Decisiones del usuario (2026-10-03), todas las recomendadas:
- **Saldo del sistema al confirmar** (no a una hora indicada): se cuenta
  sin ventas en curso y la pantalla lo advierte.
- **Conteo parcial permitido:** se listan todos los insumos activos; los
  que quedan en blanco no se ajustan. El resultado de cada insumo se mide
  desde su último conteo en esa bodega.
- **Sin anulación:** un conteo confirmado es definitivo; se corrige con
  otro conteo o con un ajuste.
- **Saldo visible** mientras se registra (no es conteo ciego).

Alcance propuesto: conteo por bodega (borrador → confirmar, "Conteo #N");
al confirmar guarda sistema, contado, diferencia y costo unitario por
línea y genera el movimiento `COUNT` por la diferencia (no cambia el costo
promedio; sirve también de carga inicial); resultado teórico vs. real por
insumo y valorizado; "Conteo #N" en el kardex; botón "Registrar conteo"
junto a "Imprimir existencias"; permiso `inventory.manage`. Componentes:
1) modelo de datos; 2) borrador y confirmación; 3) lista, detalle con el
resultado y kardex; 4) cierre (ADR 0009, README). Fuera: traslados,
conteos por categoría o programados, gráficas, aviso por WhatsApp.

### Componente 1 — Modelo de datos (aprobado 2026-10-03)

- Migración `20261003120000_add_inventory_counts` (**aplicada en test y
  dev**; diff vacío; RLS verificado en dev): enum `InventoryCountStatus`
  (`DRAFT`/`CONFIRMED`), `inventory_counts` (`number` nulo en borrador,
  bodega, quién y cuándo creó y confirmó), `inventory_count_lines`
  (insumo único por conteo, `unit` del insumo al escribir,
  `countedQuantity` 14,3; al confirmar: `systemQuantity`, `difference`,
  `unitCost`, `periodStart`, `previousCounted`, `soldQuantity`,
  `purchasedQuantity`, `adjustedQuantity`), `companies.lastInventoryCountNumber`,
  `StockMovementType.COUNT` y `stock_movements.inventoryCountId`. FK
  compuestas por empresa. Solo en SQL: enlace `COUNT` ⇔ conteo (por texto),
  un borrador por bodega (índice parcial), número solo al confirmar,
  confirmación completa, contado ≥ 0, datos de confirmación todos o ninguno,
  `difference = contado − sistema`, `periodStart` ⇔ `previousCounted`.
- `data/inventory-counts.ts`: `createInventoryCountDraft` (`DRAFT_EXISTS`
  con el id del existente, `WAREHOUSE_NOT_FOUND`, `WAREHOUSE_INACTIVE`),
  `findWarehouseDraftCount`, `saveInventoryCountLines` (con valor:
  crea/cambia; null: quita; insumo ajeno o archivado se rechaza sin
  escribir), `deleteInventoryCountDraft`, `confirmInventoryCount` y
  `findInventoryCount`.
- **Confirmación por lotes** (decisión de implementación): bloquea todos
  los insumos en una consulta `FOR UPDATE` ordenada, lee saldos, conteo
  anterior (`DISTINCT ON`) y sumas del período en pocas consultas, y
  escribe saldos (`INSERT … ON CONFLICT`), movimientos (`createMany`) y
  líneas (`UPDATE … FROM unnest`) de una vez. Motivo: con ~0,8 s por
  consulta a Supabase, una consulta por línea agotaba la transacción con
  decenas de insumos. Por eso **no** usa `writeStockMovement` (se descartó
  agregarle `inventoryCountId`). Arreglos a SQL como `text[]` (uno con
  solo null llega como `integer[]`).
- **Período:** la confirmación y sus movimientos llevan la misma hora
  (`confirmedAt`, del servidor de la app, como el resto de `createdAt`);
  el siguiente conteo suma los movimientos con `createdAt >` esa hora.
  Vendido = −(SALE + SALE_VOID), comprado = PURCHASE + PURCHASE_VOID,
  ajustado = INITIAL + ADJUSTMENT. Riesgo (al ADR): una venta que empieza
  antes de una confirmación y termina después queda fuera del desglose.
- Contar 0 de un insumo sin carga inicial no crea saldo (diferencia 0, sin
  movimiento): sigue "sin carga inicial".
- Kardex: `COUNT_IN` / `COUNT_OUT` con la etiqueta "Conteo" (el "#N" con
  enlace llega en el componente 3).
- Pruebas: `inventory-counts-data.test.ts` (11: borrador único, bodega
  ajena o inactiva, guardar y quitar, insumo ajeno/archivado, otra
  empresa, vacío, diferencia ±/0 y carga inicial, hora de los movimientos,
  confirmado inmutable, período con ventas — incluida una anulada —,
  compra y ajuste, nada a medias con archivado o unidad cambiada, bodega
  desactivada, doble confirmación, consecutivo simultáneo, reglas de la
  BD); 3/3 seguidas. `tests/helpers.ts` limpia conteos. Verificado:
  typecheck, lint, suite **367/367**, build.

### Componente 2 — Borrador y confirmación (aprobado 2026-10-03)

- **Menú:** "Conteos" (`inventory-counts`, `inventario/conteos`, ícono
  `ClipboardCheck`) después de Bodegas.
- **`/inventario/conteos`:** "Nuevo conteo" (`StartCountForm`: con una
  bodega activa, botón "Contar <bodega>"; con varias, selector) y "En
  curso" (`CountDraftList`). "Registrar conteo" (`RegisterCountButton`)
  junto a "Imprimir existencias" en Bodegas (cada bodega activa) e Insumos
  (principal). Empezar = crear o retomar el borrador de la bodega.
- **`/inventario/conteos/[id]`:** encabezado (bodega, empezó, confirmó) e
  "Imprimir hoja" (`stockSheetHref(slug, bodega, { countId })`: "Volver"
  de la hoja regresa al conteo con `?conteo=`). Borrador: aviso de contar
  sin ventas (con el número de turnos abiertos en la sucursal,
  `countOpenCashSessionsInBranch`), aviso de bodega inactiva y
  `CountForm`: filas por insumo activo (más archivados con algo contado,
  marcados) con Sistema ("—" sin carga inicial, negativo en rojo),
  Contado (texto `inputMode="decimal"`, controlado) y Diferencia en vivo;
  buscador sin `name` (oculta filas con `hidden`, siguen enviándose);
  "Contaste N de M"; "Guardar avance" y, fuera del formulario,
  "Confirmar conteo" (`ExternalFormStep`: su botón envía el formulario
  con `form=` e `intent=confirm`) y "Eliminar borrador". Confirmado:
  `CountLines` (sistema, contado, diferencia; enlaza la ficha del insumo).
- **Compartido nuevo:** `components/shared/draft-step.tsx` (`DraftStep`,
  extraído de compras con `id` en lugar de `purchaseId`, y
  `ExternalFormStep`). `purchase-draft-actions.tsx` ya lo usa.
- **Validación** `countedQuantitySchema`: ≥ 0, 3 decimales, vacío = null,
  **acepta coma decimal** (el borrador muestra lo guardado con coma).
- **Datos:** `CountEntry.unit` = unidad mostrada; si el insumo ya tiene
  otra, `UNIT_CHANGED` sin guardar. `listInventoryCountDrafts`;
  `findInventoryCount` trae `branch.id`.
- **Servicio** `services/inventory-counts.ts` (`inventory.manage`):
  `getCountStartOptions`, `startCount`, `getCountDrafts`, `getCount`,
  `saveCount` (nada se guarda si alguna cantidad es inválida; errores por
  insumo), `confirmCount` (guarda y confirma), `deleteCount`. Mensajes con
  el nombre del insumo archivado o de unidad cambiada.
- Acciones `components/inventory/count-actions.ts` (`startCountAction`,
  `saveCountAction` con `intent`, `deleteCountAction`); campos en
  `count-fields.ts`. Funciona sin JS salvo la diferencia en vivo y el
  buscador.
- Pruebas: `inventory-counts.test.ts` (9: coma y cero, empezar/retomar,
  bodega ajena e inactiva, filas del borrador, nada guardado con error,
  unidad cambiada, confirmar guardando lo escrito, vacío, archivado,
  turnos abiertos, otra empresa, STAFF y CASHIER), datos actualizados y
  menú. Verificado: typecheck, lint, suite **376/376**, build; sin sesión
  las rutas redirigen al login. Revisión visual con sesión: la hace el
  usuario.

## Cierre de la sesión 2026-10-03 (noche)

**Implementado (con commit y subido a `origin/master`):**
- Fase 9 — análisis y decisiones (saldo al confirmar, conteo parcial, sin
  anulación, saldo visible).
- Componente 1 — modelo de datos del conteo físico (`dfcc809`).
- Componente 2 — borrador y confirmación en pantalla (último commit de la
  sesión).

**Pendiente:**
- **Componente 3 — lista, detalle con el resultado y kardex** (siguiente;
  diseñar y aprobar antes de implementar): lista de conteos confirmados
  (filtros por bodega y fechas, "Ir al conteo #N"), resultado teórico vs.
  real por insumo con lo guardado en cada línea (`previousCounted`,
  `soldQuantity`, `purchasedQuantity`, `adjustedQuantity`, `difference`,
  `unitCost`): consumo real, % de desviación sobre lo vendido y diferencia
  valorizada con total; "Conteo #N" con enlace en el kardex
  (`listStockMovements` tendrá que traer `inventoryCount { id, number }`).
- Componente 4 — cierre de la fase 9 (revisión, ADR 0009 con el riesgo del
  desglose por milisegundos y la decisión de escribir por lotes, README).
- Siguen abiertos: "Venta #N" con enlace en el kardex (opcional, sin
  confirmar), aviso por WhatsApp, mensajes de duplicado de terceros,
  despliegue en Vercel (en pausa), proveedor de correo, clave de Storage y
  bucket por entorno.

**Decisiones técnicas de hoy:** confirmación del conteo por lotes (pocas
consultas sin importar el número de líneas) en lugar de
`writeStockMovement`; la confirmación y sus movimientos comparten la hora
(`confirmedAt`), que marca el inicio del período siguiente; el guardado
recibe la unidad mostrada y rechaza si cambió; contar 0 sin carga inicial
no crea saldo; lo contado acepta coma decimal; `DraftStep` /
`ExternalFormStep` compartidos; "Volver" de la hoja de existencias puede
regresar al conteo (`?conteo=`).

**Errores conocidos:**
- No se probó con sesión ninguna página de conteos (revisión visual a
  cargo del usuario). Confirmar un conteo en dev cambia el inventario real
  de Su Arepa en esa base.
- Riesgo del desglose del período (venta que cruza la confirmación).
- Siguen los de sesiones anteriores (latencia a Supabase en dev, `next
  dev` en Windows deja el proceso en el 3000, heredoc largos en Bash).

**Próximo paso recomendado:** diseño del componente 3 de la fase 9.

## Sesión 2026-10-04

### Componente 3 — Lista, detalle con el resultado y kardex (aprobado 2026-10-04)

Diseño aprobado el 2026-10-04 con las recomendaciones: lista por defecto
de **los últimos 90 días** y **% sobre lo vendido**. Sin migración.
- **Cálculo** `services/count-results.ts` (puro, como `costing.ts`):
  `countLineResult` (inicio = conteo anterior o 0, consumo real = vendido −
  diferencia guardada — cuadra con el kardex aunque una venta cruce la
  confirmación —, % = diferencia ÷ vendido con 1 decimal y null si vendido
  ≤ 0, valor = diferencia × costo o null sin costo) y `countTotals`
  (faltante, sobrante, neto y líneas con diferencia sin costo, que no
  suman).
- **Datos** (`data/inventory-counts.ts`): `listInventoryCounts` (una
  consulta SQL con las sumas por conteo y `COUNT(*) OVER ()` para el total;
  `confirmedAt` en [inicio, fin) del rango en la zona de la empresa;
  `netValue` normalizado, la suma llega con 10 decimales) y
  `findInventoryCountIdByNumber`. `listStockMovements` trae
  `inventoryCount { id, number }`.
- **Servicio** (`services/inventory-counts.ts`, `inventory.manage`):
  `getCountsOverview` (`COUNTS_DEFAULT_DAYS` 90, `COUNTS_LIST_LIMIT` 200,
  filtros `desde`/`hasta`/`bodega`; bodegas solo si hay más de una),
  `findCountByNumber`; `getCount` suma `currency`, el resultado en cada
  línea confirmada y `totals` (null en borrador).
- **UI:** en `/inventario/conteos`, sección de confirmados con
  `CountsFilters` (fechas, bodega, "Ir al conteo #N" con aviso si no
  existe) y `CountList` (número, fecha, bodega, contados, con diferencia,
  quién confirmó, valor neto y "N sin costo"). Detalle confirmado
  (`max-w-6xl`): `CountSummary` (contados, faltante, sobrante, neto, aviso
  de insumos sin costo) y `CountLines` ampliada (Inicio · Compras · Ajustes
  · Vendido · Consumo real · Sistema · Contado · Diferencia · % s/ vendido ·
  Valor; se agregó "Consumo real", que estaba en las fórmulas del diseño).
  `CountValue` (monto con signo, faltante en rojo). Kardex: "Conteo #N"
  con enlace.
- Pruebas: `tests/unit/count-results.test.ts` (5) e
  `inventory-counts.test.ts` (+4: lista con sumas, borradores fuera,
  filtros de bodega y fechas, detalle y totales, conteo siguiente desde lo
  contado, número, kardex, otra empresa; permisos). Verificado:
  typecheck, lint, suite **385/385**, build; sin sesión las rutas
  redirigen al login. Revisión visual con sesión: la hace el usuario.
- Aprobado por el usuario el 2026-10-04 (revisión en el navegador a su cargo).

Commit `0f61932`.

### Componente 4 — Cierre de la fase 9 (aprobado 2026-10-04)

**Fase 9 aprobada** (2026-10-04).

- **Revisión de la fase** (datos, servicios, acciones, páginas, hoja de
  existencias y kardex): acciones con sesión y permiso de la empresa
  enviada, páginas con permiso en el servidor, datos filtrados por empresa.
  Dos hallazgos corregidos:
  - **Guardar el borrador** hacía un `upsert` por insumo en una
    transacción con el límite por defecto (5 s). Medido hoy: ~0,32 s por
    consulta a Supabase desde aquí, así que con más de ~12 insumos
    contados guardar (y confirmar, que guarda primero) fallaba en dev.
    Ahora `deleteMany` + `createMany` de los insumos enviados, con
    `COUNT_TX_OPTIONS`; un insumo repetido vale por su último valor.
    Prueba nueva con 41 insumos en `inventory-counts-data.test.ts`.
  - **Fechas en SQL directo:** un `Date` llega como `timestamptz` y
    PostgreSQL lo compara con la zona de su sesión (dev/Supabase: UTC;
    base local de pruebas: `America/Bogota`, verificado). La lista de
    confirmados quedaba corrida 5 h en pruebas, y el `updatedAt` del saldo
    al confirmar también. `utcTimestamp(date)` en `data/inventory-counts.ts`
    los pasa como texto ISO a `timestamp(3)`. Prueba nueva (conteo a las
    23:30 de Bogotá) que fallaba antes del arreglo y pasa después.
- `docs/decisiones/0009-conteo-fisico.md` y README (estado, menú, conteos,
  estructura, ADR).
- Verificado: typecheck, lint, suite **387/387**, build. Pruebas de
  conteos 3/3 seguidas.

## Cierre de la sesión 2026-10-04

**Implementado hoy:**
- Fase 9, componente 3 — lista, resultado y kardex (`0f61932`, subido).
- Componente 4 — revisión con dos correcciones, ADR 0009 y README
  (aprobado; último commit de la sesión). **Fase 9 cerrada.**

**Pendiente:**
- Siguiente fase por definir con el usuario (analizar primero). Ideas
  abiertas: aviso por WhatsApp de insumos que faltan, "Venta #N" con
  enlace en el kardex (opcional, sin confirmar), traslados entre bodegas,
  clientes y cartera, gastos de caja.
- Siguen abiertos: despliegue en Vercel (en pausa), proveedor de correo,
  clave de Storage y bucket por entorno.

**Decisiones técnicas de hoy:** resultado del conteo calculado con la
diferencia guardada (consumo real = vendido − diferencia); % sobre lo
vendido; lista de confirmados de 90 días con una sola consulta SQL que
suma por conteo; guardado del borrador por lotes; fechas a SQL directo
como `timestamp(3)` en UTC (`utcTimestamp`).

**Errores conocidos:**
- No se probó con sesión ninguna página de conteos (revisión visual a
  cargo del usuario). Confirmar un conteo en dev cambia el inventario real
  de Su Arepa.
- Otras consultas SQL directas con fechas deberían usar el mismo patrón
  si aparecen (hoy solo las de conteos tenían parámetros de fecha).
- Siguen los de sesiones anteriores (latencia a Supabase en dev, `next
  dev` en Windows deja el proceso en el 3000, heredoc largos en Bash).

**Próximo paso recomendado:** análisis de la siguiente fase con el
usuario.

## Hoja de ruta antes de desplegar (aprobada 2026-10-04)

Decisiones del usuario:
- **Misma base de Supabase para producción** (no se crea otra): antes de
  desplegar se reinicia por completo (migraciones de nuevo, sin datos de
  prueba, fotos y logos de prueba borrados del almacenamiento) y se crea
  Su Arepa real con `company:create` (no el seed). Desde ahí el
  **desarrollo pasa a PostgreSQL local** (ya instalado), nunca contra
  producción. Acción destructiva: confirmar con el usuario justo antes.
  Revisar el plan de Supabase (el gratuito pausa y no tiene copias
  diarias): decisión del usuario.
- "Todo aplicado" antes de desplegar; cambios del cliente después.

Orden: 1) fase 10 gastos de caja; 2) pendientes que pidió el cliente,
**todos**: "Venta #N" con enlace en el kardex, precio de productos con
separador de miles, cambiar la propia contraseña; 3) preparación para
producción (dev local, `postinstall: prisma generate`, región `gru1`,
bucket por entorno, revisión de seguridad, reinicio de la base y alta de
Su Arepa); 4) correo con Resend (lo último); 5) despliegue en Vercel.
Fuera hasta que el uso real lo pida: WhatsApp, cartera, traslados.

## Fase 10 — Movimientos de caja (gastos, retiros e ingresos)

Decisiones del usuario (2026-10-04), todas las recomendadas:
**categorías de gasto configurables** (con unas por defecto), **retiros e
ingresos** además de gastos (no cuentan como gasto), **anulan solo
OWNER/ADMIN** (con motivo y turno abierto), **foto opcional del recibo**
(bucket privado con enlaces temporales). Fuera, para más adelante (el
usuario aceptó): compras pagadas desde la caja (van con cuentas por pagar;
mientras tanto, gasto "Compras menores" con el número en la nota), cuentas
por pagar, presupuestos, gráficas y que un administrador registre en el
turno de otro.

Componentes: 1) modelo de datos y permisos; 2) categorías en
Configuración; 3) movimientos en el POS (registrar, foto, lista del turno,
esperado nuevo en el cierre); 4) panel (revisión del turno con anulación,
cierre impreso, lista de gastos con totales); 5) cierre (ADR 0010, README).

### Componente 1 — Modelo de datos y permisos (aprobado 2026-10-04)

- Migración `20261004120000_add_cash_movements` (**aplicada en test y
  dev**; diff vacío; RLS verificado en dev): `expense_categories` (nombre,
  posición, activa; único por empresa sobre `lower(name)`), enums
  `CashMovementType` (`EXPENSE`/`WITHDRAWAL`/`DEPOSIT`) y
  `CashMovementStatus` (`RECORDED`/`VOIDED`), `cash_movements` (turno, tipo,
  monto, categoría, nota ≤ 200, `receiptPath`, quién y cuándo, anulación).
  FK compuestas por empresa. Solo en SQL: monto > 0, categoría ⇔ gasto,
  foto solo en gastos, anulación completa, nota ≤ 200. Crea las 5
  categorías por defecto de las empresas existentes (Su Arepa: 5).
- Categorías por defecto (`DEFAULT_EXPENSE_CATEGORIES`): Domicilios y
  transporte, Gas y servicios, Aseo, Compras menores, Otros. Las crea el
  alta de empresa (`createDefaultExpenseCategories`) y el seed.
- Permisos nuevos `cash.void` y `expenses.manage` (OWNER, ADMIN).
  Registrar usa `sales.charge` en el propio turno abierto.
- `data/cash-movements.ts`: `recordCashMovement` (turno `FOR SHARE` como
  una venta; `SESSION_NOT_FOUND` si es de otra persona o empresa,
  `SESSION_CLOSED`, `CATEGORY_NOT_FOUND`/`CATEGORY_INACTIVE`; la categoría
  se ignora en retiros e ingresos), `voidCashMovement` (`updateMany` sobre
  `RECORDED`: dos anulaciones a la vez, solo una; `SESSION_CLOSED`),
  `listSessionCashMovements`. `expectedCash` (`data/cash-sessions.ts`) =
  fondo + efectivo de ventas + ingresos − gastos − retiros no anulados; lo
  usan el cierre del POS y el del panel.
- Pruebas: `cash-movements-data.test.ts` (7) y permisos. Verificado:
  typecheck, lint, suite **394/394**, build.

### Componente 2 — Categorías de gasto en Configuración (aprobado 2026-10-04)

Diseño aprobado el 2026-10-04 (patrón de Métodos de pago).
- **Menú:** "Categorías de gasto" (`settings-expenses`,
  `configuracion/gastos`, ícono `Tags`, `expenses.manage`) después de
  Métodos de pago; tarjeta en Inicio por la navegación.
- **Datos** `data/expense-categories.ts`: `listExpenseCategories` (con el
  número de gastos), `createExpenseCategory` (al final),
  `renameExpenseCategory`, `setExpenseCategoryActive`,
  `deleteExpenseCategory` (solo sin gastos; P2003 también da `IN_USE`),
  `moveExpenseCategory` (renumera con un solo `UPDATE … FROM unnest`: una
  consulta por fila rozaba el límite de 5 s con la latencia de dev).
  **Al menos una activa:** desactivar y eliminar bloquean todas las
  categorías de la empresa (`FOR UPDATE`) y devuelven `LAST_ACTIVE`.
- Validación `validations/expenses.ts` (`expenseCategoryNameSchema`, 2–40).
  Servicio `services/expense-categories.ts` (`expenses.manage`, sin
  auditoría): `getExpenseCategories` (`expenseCount`, `canDelete`),
  crear, renombrar, activar, eliminar, mover.
- UI `components/expenses/` (`expense-category-fields`, `-actions`,
  `-row-button`, `-list`) con `NewNameForm`, `RenameForm`,
  `RowActionButton` y `EmptyState`; página `configuracion/gastos`. Sin JS.
- Pruebas: `expense-categories.test.ts` (7: crear y repetidos, renombrar y
  ordenar, eliminar solo sin gastos, siempre una activa, desactivar dos a
  la vez, otra empresa, cajero y personal) y menú. 3/3 seguidas.
  Verificado: typecheck, lint, suite **402/402**, build; sin sesión la
  ruta redirige al login. Revisión visual con sesión: la hace el usuario.

### Componente 3 — Movimientos en el POS (aprobado 2026-10-04)

Diseño aprobado el 2026-10-04.
- **Almacenamiento privado:** `PrivateFileStorage` (`upload`, `remove`,
  `signedUrl`) en `services/storage/types.ts`;
  `createSupabasePrivateStorage` (comparte `bucketClient` con el público;
  firma con `POST /object/sign/{bucket}/{ruta}` → `signedURL` relativo),
  `getPrivateFileStorage()` / `setPrivateFileStorageForTesting`;
  `createMemoryStorage` sirve para ambos. `env.ts`:
  `PRIVATE_STORAGE_BUCKET = "company-private"` (`privateBucket`).
  `storage:setup` crea los dos buckets; **`company-private` creado en dev**
  y verificado contra Supabase (firmado 200, público 400, tras borrar 400).
- `services/images.ts`: `checkImageFile` (tamaño y tipo real, sin mirar el
  almacenamiento) y `NO_STORAGE`; `validateImage` los usa.
- **Datos** (`data/cash-movements.ts`): `setCashMovementReceipt` (solo
  gasto y sin foto previa), `findCashMovementReceipt`,
  `sumSessionCashMovements`.
- **Validación** `validations/cash-movements.ts`: `cashMovementSchema`
  (tipo, monto > 0 con `amountSchema`, categoría obligatoria en gastos y
  null en lo demás, nota ≤ 200). `CashMovementInput` = todo texto.
- **Servicio** `services/cash-movements.ts` (`sales.charge`):
  `getShiftCashMovements` (turno abierto propio, categorías activas,
  movimientos con `toCashMovement`, `cashMovementTotals`),
  `registerCashMovement` (valida la foto antes; ruta
  `companies/{empresa}/receipts/{movimiento}-{uuid}.{ext}`; si solo falla
  la subida, `receiptFailed`), `getReceiptUrl` (dueño del turno o
  `cash.review`; enlace de **60 s**, no 10 min como decía el diseño, porque
  la ruta redirige al instante y así la página no guarda enlaces).
- **Ruta** `app/[empresa]/recibos/[id]/route.ts` (primera route handler del
  proyecto): sesión de la empresa → 302 al enlace firmado (`no-store`) o
  404.
- **UI POS:** botón "Gastos y retiros" en la barra del turno (y en la
  vista del turno de otro día) → `/pos/caja`: `CashMovementForm` (tipo en
  tarjetas, `MoneyField`, categoría y foto solo en gastos con JS; vuelve a
  montarse vacío con `savedCount`; avisa "registrado sin foto") y lista
  `CashMovementList` (hora, tipo, categoría, nota, "Ver recibo", anulados
  tachados con quién y por qué) con totales (`CashMovementTotalItems`).
  Cierre del POS: totales de gastos, retiros e ingresos (sin esperado).
  Resultado del turno: `CashBreakdown` (fondo + ventas + ingresos − gastos
  − retiros = esperado); `getClosedShift` trae `cash` (las ventas en
  efectivo se derivan del esperado guardado). Ejemplo de la nota del cierre
  cambiado (el gasto ya tiene su registro).
- Pruebas: `cash-movements.test.ts` (8: sin turno, tres tipos y totales,
  validaciones, foto privada y quién la ve, foto inválida, fallo de
  subida y sin almacenamiento, cuadre del turno cerrado con anulado,
  STAFF). Verificado: typecheck, lint, suite **410/410**, build; sin sesión
  `/pos/caja` y `/recibos/[id]` redirigen al login. Revisión visual con
  sesión: la hace el usuario.

## Cierre de la sesión 2026-10-04

**Implementado hoy (todo con commit y subido a `origin/master`):**
- Fase 9, componentes 3 (`0f61932`) y 4 (`c00f095`): lista, resultado y
  kardex del conteo; revisión con dos correcciones (guardado por lotes,
  fechas en SQL directo como UTC), ADR 0009 y README. **Fase 9 cerrada.**
- Hoja de ruta antes de desplegar acordada (ver arriba).
- Fase 10, componentes 1 (`1deb7f9`), 2 (`b61ce6c`) y 3 (último commit de
  la sesión): modelo y permisos de movimientos de caja, categorías de gasto
  en Configuración, y gastos/retiros/ingresos en el POS con recibo privado.

**Pendiente:**
- **Fase 10, componente 4 — panel** (siguiente; diseñar y aprobar antes):
  revisión del turno con sus movimientos, recibo y anulación (`cash.void`,
  motivo, turno abierto), hoja impresa del cierre con los movimientos,
  sección "Gastos" con filtros (fechas, categoría, cajero, sucursal) y
  totales por categoría, retiros e ingresos aparte. El "Cómo va" del turno
  abierto en el panel ya usa `expectedCash` (incluye movimientos).
- Componente 5 — cierre de la fase 10 (revisión, ADR 0010, README: incluir
  `storage:setup` con dos buckets y la ruta `/recibos/[id]`).
- Después, la hoja de ruta: pendientes del cliente ("Venta #N" en el
  kardex, precio con separador de miles, cambiar la propia contraseña),
  preparación para producción, Resend y despliegue.

**Decisiones técnicas de hoy:** ver fases 9 y 10 arriba. Resumen: escrituras
por lotes cuando el número de filas crece (latencia ~0,3 s por consulta en
dev); fechas a SQL directo como `timestamp(3)` en UTC; esperado de caja con
movimientos en `expectedCash`; recibos en bucket privado con enlace firmado
de 60 s a través de `/recibos/[id]`; siempre al menos una categoría de
gasto activa; categorías sin auditoría.

**Errores conocidos:**
- Ninguna página nueva de hoy se probó con sesión (revisión visual a cargo
  del usuario): conteos confirmados, categorías de gasto, `/pos/caja`.
- La reducción de la foto del recibo en el navegador y "Ver recibo" con
  sesión no se han probado en un navegador real.
- Siguen los de sesiones anteriores (`next dev` en Windows deja el proceso
  en el 3000, `prisma generate` con EPERM si `next dev` corre, heredoc
  largos en Bash).

**Próximo paso recomendado:** diseño del componente 4 de la fase 10 (panel).

## Sesión 2026-10-05

### Componente 4 — Movimientos de caja en el panel (aprobado 2026-10-05)

Diseño aprobado el 2026-10-05: la hoja impresa del cierre lleva **totales y
una línea por movimiento**; la página Gastos muestra **hoy** por defecto.
Sin migración.
- **Hallazgo corregido:** desde el componente 3, el cuadre del detalle del
  turno en el panel y el de la hoja impresa del cierre decían "fondo +
  efectivo de ventas = esperado", pero el esperado ya incluía los
  movimientos: con gastos no cuadraba.
- **Compartidos movidos** a `components/cash/`: `CashBreakdown` y
  `CashMovementList` (antes en `components/pos/cash/`), y
  `cash-movement-kinds.ts` (`CASH_MOVEMENT_KINDS`, `CashMovementKind`,
  antes en `cash-movement-fields.ts` del POS). `CashMovementList` acepta
  `renderActions` (el panel agrega "Anular").
- **Datos** (`data/cash-movements.ts`): `movementSelect` compartido,
  `listCashMovements` (rango por `createdAt`, tipo, categoría, cajero y
  sucursal del turno; con el turno) y `summarizeCashMovements` (groupBy
  por tipo y categoría sin anulados; anulados aparte; sin el filtro de
  tipo ni categoría).
- **Servicio** (`services/cash-movements.ts`): `voidCashMovementFromPanel`
  (`cash.void`, `voidCashMovementSchema` = `voidReasonSchema`; mensajes
  para inexistente, ya anulado y turno cerrado) y
  `getCashMovementsOverview` (`cash.review`; filtro `ver` = `gastos`,
  `retiros`, `ingresos` o el id de una categoría de la empresa —también
  inactiva—; otro valor muestra todo; `CASH_MOVEMENTS_LIMIT` 200; gastos
  por categoría de mayor a menor). `services/cash-sessions.ts`:
  `loadCashSessionReview` trae `movements` y `cash` (ventas, ingresos,
  gastos, retiros); `getCashSessionReview` suma `canVoidMovements` (turno
  abierto y `cash.void`); `getPrintableShift` reemplaza `cashSales` por
  `cash` y suma `movements` (no anulados) y `voidedMovementsCount`.
- **UI:** detalle del turno (`/caja/[id]`) con `CashBreakdown` en "Cuadre"
  / "Cómo va" y sección "Gastos, retiros e ingresos" (recibo y "Anular"
  con `VoidCashMovementForm`: `<details>` con motivo, vuelve con
  `?aviso=movimiento-anulado`). Hoja del cierre: sección "MOVIMIENTOS DE
  CAJA" (hora, categoría o tipo, monto con signo; "Anulados (no cuentan)")
  y el cuadre con ingresos, gastos y retiros solo si los hubo. Página
  **`/gastos`** (menú "Gastos", grupo Ventas, ícono `Banknote`,
  `cash.review`): filtros GET (desde, hasta, "Mostrar", cajero, sucursal
  si hay varias), resumen (Gastos, Retiros, Ingresos; gastos por categoría
  con barra y %; anulados aparte) y lista (`CashMovementLedger`: fecha,
  tipo, categoría, nota, cajero, "Ver turno", "Ver recibo"; anulados
  tachados). La anulación solo se hace desde el turno.
- Pruebas: `cash-movements-panel.test.ts` (7: cuadre y anulación en el
  detalle, motivo, una sola vez, otra empresa, cajero, turno cerrado, hoja
  impresa; resumen por categoría sin anulados, filtros por tipo, categoría,
  cajero y fechas, valores desconocidos —incluido `constructor`—, otra
  empresa, permisos), `printing.test.ts` ajustada y menú. Verificado:
  typecheck, lint, suite **418/418**, build; sin sesión `/gastos` y
  `/caja/[id]` redirigen al login. Hoja del cierre renderizada con el CSS
  y la fuente del build en 80 y 58 mm (`render-closing.tsx` del
  scratchpad): nada se sale del papel; las líneas largas bajan.
- Prettier no está configurado en el proyecto: no correrlo (reformatea a
  80 columnas).
- Revisión visual con sesión: la hace el usuario.
- Aprobado por el usuario el 2026-10-05 (revisión en el navegador a su cargo).

Commit `1055762` (subido).

### Componente 5 — Cierre de la fase 10 (aprobado 2026-10-05)

**Fase 10 aprobada** (2026-10-05).

- **Revisión de la fase** (migración, datos, servicios, acciones, páginas
  del POS y del panel, ruta de recibos, almacenamiento privado,
  `storage:setup`): acciones con sesión y permiso de la empresa enviada,
  páginas con permiso en el servidor, datos filtrados por empresa, recibos
  solo con enlace firmado tras validar a quien los pide. Sin hallazgos de
  seguridad ni de aislamiento. Corrección menor: si el almacenamiento
  fallaba al firmar, `/recibos/[id]` daba un 500 genérico; ahora responde
  503 con mensaje y lo registra en el log.
- `docs/decisiones/0010-movimientos-de-caja.md` y README (estado, menú,
  POS "Gastos y retiros", página Gastos, recibos, `storage:setup` con dos
  buckets, variables, estructura, ADR).
- Verificado: typecheck, lint, suite **418/418**, build.
- Nota: `npm run build` con `next dev` encendido no lo afectó (dev usa
  `.next/dev`); el servidor siguió respondiendo.

Commit `6abf42f` (subido).

## Fase 11 — Pendientes del cliente

Alcance aprobado (2026-10-05): 1) "Venta #N" con enlace en el kardex;
2) precio de productos con separador de miles (como los montos del POS y
compras; el costo de insumos sigue igual, usa 4 decimales); 3) cambiar la
propia contraseña ("Mi cuenta"); 4) cierre (ADR 0011, README).
Para el componente 3 se aplican las recomendaciones (el usuario aprobó sin
responder las preguntas; confirmarlas al diseñarlo): al cambiarla se
cierran las **otras** sesiones (sigue en este equipo); "Mi cuenta" en
`/[empresa]/cuenta`, con enlace en el pie del menú del panel **y** en la
barra del POS (el cajero solo usa el POS).

### Componente 1 — "Venta #N" en el kardex (aprobado 2026-10-05)

- `listStockMovements` trae `sale { id, number }`; `getSupplyDetail` suma
  `sale` por movimiento y `canViewSales` (`sales.view`).
- `SupplyKardex`: "Venta #N" y "Anulación de venta #N" con enlace a
  `/ventas/[id]` si puede ver ventas (si no, el número sin enlace).
  `DocumentNumber` reemplaza el marcado repetido de compra y conteo.
- Prueba nueva en `sales-panel.test.ts` (venta, anulación y carga inicial
  sin venta). Verificado: typecheck, lint, suite **419/419**, build.

Commit `c609e87` (subido).

### Componente 2 — Precio con separador de miles (aprobado 2026-10-05)

- `priceSchema` = `amountSchema` (antes `moneySchema`): el precio se lee
  como los montos del POS y compras, **punto de miles y coma decimal**
  ("16.500", "1.250.000", "4,50"; también sin separadores). Cambio de
  lectura: "4.5" en USD ahora es 45 (antes 4,50); se escribe "4,5".
- Formulario de producto con `MoneyField` (tamaño nuevo `form`, h-11 como
  los demás campos; ayuda con el nombre de la moneda y "sin centavos"); se
  quitó la vista previa "Se verá como" (el campo ya muestra el formato).
  Al editar, el precio guardado llega con `amountInputValue`.
- Pruebas: `catalog.test.ts` (miles, coma decimal, "$ 16.500"),
  `catalog-products.test.ts` y `product-image.test.ts` ajustadas.
  Verificado: typecheck, lint, suite **422/422**, build.

Commit `a5faed0` (subido).

### Componente 3 — Mi cuenta: cambiar la propia contraseña (aprobado 2026-10-05)

Diseño aprobado el 2026-10-05 (se confirman las recomendaciones: cierra
las **otras** sesiones; enlaces en el panel y en el POS), con dos reglas
nuevas: la nueva debe ser **distinta de la actual** y **5 contraseñas
actuales incorrectas en 15 min bloquean** el cambio. Sin migración.
- **Validación** (`validations/auth.ts`): `newPasswordSchema` compartido
  (8–200; también lo usa `passwordResetSchema`, mismos mensajes) y
  `passwordChangeSchema` (actual, nueva, confirmación).
- **Datos** (`data/users.ts`): `findUserPasswordHash` (solo activos) y
  `changeUserPassword` (en una transacción: cambia el hash y revoca las
  sesiones de la persona menos la actual; devuelve cuántas cerró o null).
- **Servicio** `services/auth/password-change.ts` → `changeOwnPassword`
  (cualquier rol con sesión): límite con `PASSWORD_CHANGE_WINDOW_MS` y
  `MAX_FAILED_PASSWORD_CHANGES` (cuentan los fallos posteriores al último
  cambio), verifica la actual, rechaza la misma, hashea fuera de la
  transacción. Auditoría `AUTH_EVENTS.PASSWORD_CHANGED`,
  `PASSWORD_CHANGE_FAILED`, `PASSWORD_CHANGE_BLOCKED` (sin contraseñas).
- **UI** `components/account/`: `change-password-fields`,
  `change-password-actions` (`requireStaffSession`; mensaje "Cerramos tu
  sesión en N equipos más"), `change-password-form` (sin JS; las
  contraseñas nunca vuelven al navegador; se vuelve a montar vacío con
  `savedCount`) y `account-sections` ("Tus datos" de solo lectura y
  "Cambiar contraseña"). Páginas `/[empresa]/cuenta` (panel, cualquier
  rol con sesión; el cajero es redirigido al POS por el layout) y
  `/[empresa]/pos/cuenta` (`sales.charge`). Enlaces: "Mi cuenta" en el pie
  del menú (activo en `/cuenta`) y en la barra del POS.
- Pruebas: `password-change.test.ts` (5: validaciones, cambio con la
  sesión actual viva y las otras cerradas, entra con la nueva y no con la
  vieja, auditoría, bloqueo tras 5 fallos, otra empresa con el mismo
  correo no cambia, persona desactivada). Verificado: typecheck, lint,
  suite **427/427**, build; sin sesión `/cuenta` y `/pos/cuenta`
  redirigen al login.
- Conocido: con la configuración inicial pendiente, el POS muestra el
  aviso en lugar de sus páginas, así que el cajero no ve "Mi cuenta" hasta
  que el propietario termine.

Commit `4bfac17` (subido).

### Componente 4 — Cierre de la fase 11 (aprobado 2026-10-05)

**Fase 11 aprobada** (2026-10-05).

- **Revisión de la fase** (kardex, precio, Mi cuenta: datos, servicio,
  acción, páginas y enlaces): páginas con sesión de la empresa
  (`sales.charge` en el POS), acción con la empresa enviada, persona
  buscada por id y empresa y activa. Ningún script ni el seed usan el
  esquema del precio. **Corregido:** cambiar la contraseña no invalidaba
  un enlace de recuperación pedido antes (servía hasta 20 min después);
  `changeUserPassword` ahora los marca usados en la misma transacción.
  Prueba ampliada en `password-change.test.ts`.
- `docs/decisiones/0011-pendientes-del-cliente.md` y README (estado, Mi
  cuenta, kardex con números, formato de montos, estructura, ADR).
- Verificado: typecheck, lint, suite **427/427**, build.

### Ajuste pedido por el usuario — menú con grupos desplegables (aprobado 2026-10-05)

Pedido antes de subir el cierre de la fase 11 (captura del menú largo).
- `components/ui/collapsible.tsx` (envoltorio de `Collapsible` de
  `radix-ui`, ya instalado; sin dependencias nuevas).
- `app-sidebar.tsx`: "General" (Inicio) fijo; Ventas, Compras, Catálogo,
  Inventario y Configuración se despliegan con su nombre y una flecha. Al
  cargar se abre el grupo de la página actual; al navegar a otro grupo,
  ese se abre y los demás quedan como estaban (estado ajustado durante el
  render, no en un efecto). Si se cierra el grupo de la página actual, un
  punto lima lo indica. Sin guardar el estado entre cargas completas.
- Segundo ajuste del usuario (referencia: submenú con sangría): cada grupo
  es una fila con su ícono (`NAV_GROUP_ICONS`: Ventas `HandCoins`, Compras
  `ShoppingBasket`, Catálogo `BookOpen`, Inventario `Archive`,
  Configuración `Settings`), nombre en negrita y flecha; sus secciones van
  con sangría bajo una línea guía (`SidebarMenuSub`), texto e íconos un
  poco más suaves. Inicio y los grupos en una sola lista.
- Verificado: typecheck, lint, suite **427/427**, build. Revisión visual
  con sesión: la hace el usuario.

## Cierre de la sesión 2026-10-05

**Implementado hoy (con commit y subido, salvo el componente 4 de la fase
11, pendiente de aprobación):**
- Fase 10, componentes 4 (`1055762`, movimientos de caja en el panel y
  página Gastos) y 5 (`6abf42f`, revisión, ADR 0010, README). **Fase 10
  cerrada.**
- Fase 11 — pendientes del cliente: "Venta #N" en el kardex (`c609e87`),
  precio con separador de miles (`a5faed0`), Mi cuenta con cambio de
  contraseña (`4bfac17`) y cierre (ADR 0011, README).

**Pendiente:**
- (Hecho) Componente 4 de la fase 11 y menú desplegable aprobados y subidos.
- Siguiente en la hoja de ruta: **preparación para producción** (analizar
  y diseñar primero): desarrollo en PostgreSQL local, `postinstall:
  prisma generate`, región `gru1`, bucket por entorno, revisión de
  seguridad, reinicio de la base de Supabase (destructivo: confirmar justo
  antes) y alta de Su Arepa real con `company:create`; plan de Supabase
  (decisión del usuario). Después: correo con Resend y despliegue en
  Vercel.

**Decisiones técnicas de hoy:** cuadre de caja con movimientos en el
panel y en la hoja impresa (`CashBreakdown` compartido); página Gastos
con resumen independiente del filtro "Mostrar"; anulación solo desde el
turno; recibos 503 si falla el almacenamiento; precio con
`amountSchema` (punto de miles, coma decimal); cambio de contraseña con
límite de intentos, cierre de las otras sesiones e invalidación de los
enlaces de recuperación.

**Errores conocidos:**
- Revisión visual con sesión a cargo del usuario (páginas de hoy: Gastos,
  detalle del turno con anulación, formulario de producto, Mi cuenta).
- Con la configuración inicial pendiente, el cajero no ve "Mi cuenta".
- Siguen los de sesiones anteriores (`next dev` en Windows deja el
  proceso en el 3000, `prisma generate` con EPERM si `next dev` corre,
  heredoc largos en Bash: usar la herramienta Write; Prettier no
  configurado: no correrlo).
- `next dev` quedó encendido en segundo plano en el puerto 3000 al final
  de la sesión (detenerlo con `taskkill /PID <pid> /T /F` si estorba).

Commit `0a0dd2a` (subido): cierre de la fase 11 y menú desplegable.

## Hoja de ruta actualizada (2026-10-05, después del cierre de la fase 11)

Nuevo orden acordado con el usuario:
1. **Fase 12 — Lista de compras y reporte por correo al cerrar el día**
   (adelanta la integración con Resend; así también funcionan en
   producción "Recuperar contraseña" e "Invitar al equipo").
2. **Fase 13 — Cartera: clientes con crédito.**
3. Preparación para producción, despliegue en Vercel (como estaba).

### Fase 12 — Lista de compras y reporte por correo (por diseñar)

Contexto del usuario: Su Arepa compra a diario (carne y otros insumos);
al cerrar el día quiere avisar al cliente cuánto insumo le quedó para que
sepa qué comprar al otro día. El aviso por WhatsApp (idea del 2026-10-01)
**no estaba hecho**. Opciones analizadas: botón con enlace `wa.me`
(manual), WhatsApp Business Cloud API de Meta (automático, verificación
del negocio, número dedicado, plantilla aprobada, costo por mensaje; las
plantillas no admiten saltos de línea en las variables: mensaje corto con
enlace) y correo. **Decisión del usuario: por correo** (más práctico).
WhatsApp queda para después, si se pide.

Alcance propuesto (pendiente de aprobar en el diseño):
- **Existencia ideal** por insumo (lo que se quiere tener al abrir el
  día). Sugerido = ideal − existencia; insumos sin ideal muestran solo lo
  que queda.
- **Página "Lista de compras"** en Inventario: qué quedó y cuánto
  comprar, por bodega.
- **Correo automático al cerrar el último turno abierto de la sucursal**
  (desde el POS o desde el panel); se envía después del cierre (con
  `after()` de Next): si falla el correo, el cierre no se afecta.
- Integración con **Resend** (reemplaza el `MessageSender` de desarrollo
  en producción; en dev se sigue viendo en `/dev/outbox`).

**Preguntas abiertas para el usuario:**
1. ¿Tiene dominio propio? (Resend solo envía a cualquier destinatario
   desde un dominio verificado). Se le dio la guía (abajo); lo va a
   comprar y configurar.
2. Destinatarios: propuesto un campo "Correos para el reporte de cierre"
   en Configuración > Negocio (uno o varios; por defecto el del
   propietario). Sin respuesta.
3. Contenido: ¿solo la lista de compras o también un resumen corto del día
   (ventas, gastos, faltante/sobrante)? Sin respuesta.

Se puede adelantar lo que no depende del correo (existencia ideal, lista
de compras, destinatarios) mientras el usuario configura el dominio.

### Guía entregada al usuario: dominio y Resend (2026-10-05)

Recomendación: **`.com` en Cloudflare Registrar** (precio de costo, ~USD
10–11/año, sin promoción ni renovación inflada, DNS y privacidad
gratis). Nombre de la plataforma (p. ej. `terutechnologies.com` o
`terupos.com`), no de un cliente. Uso: `app.<dominio>` para el sistema
(Vercel) y `envios.<dominio>` para el correo (subdominio, cuida la
reputación del principal).

Pasos: 1) elegir el nombre; 2) cuenta en Cloudflare con el correo de TERU
y verificación en dos pasos; 3) Domain Registration → Register Domains,
`.com`, 1 año, renovación automática activada; 4) cuenta en Resend (2FA) →
Domains → Add Domain `envios.<dominio>`, región São Paulo (sa-east-1) si
está; 5) copiar en Cloudflare (DNS → Records) los registros MX y TXT
(SPF, DKIM) que muestra Resend, en "DNS only", más DMARC (`_dmarc`, TXT
`v=DMARC1; p=none;`) y pulsar Verify; 6) API key con "Sending access"
solo para ese dominio, que **el usuario pega en `.env`** (no en el chat;
el nombre de la variable se define en la fase 12); 7) en el despliegue,
`app.<dominio>` → Vercel.

Costos informados (verificar al comprar): dominio ~USD 10–11/año; DNS
gratis; Resend gratis hasta ~3.000 correos/mes (~100/día; plan pago ~USD
20/mes); **Vercel Hobby no permite uso comercial** → Pro ~USD 20/mes por
miembro; Supabase gratis (se pausa y sin copias diarias) o Pro ~USD
25/mes (recomendado con datos reales). Decidir Vercel y Supabase en el
despliegue.

### Fase 13 — Cartera (propuesta inicial, por analizar y diseñar)

El usuario quiere crearla. Base: `third_parties` ya admite `isCustomer`.
Propuesta (recomendaciones, sin aprobar):
- Clientes autorizados creados en el panel (OWNER/ADMIN) con **cupo de
  crédito** y **plazo** (p. ej. 15 días).
- POS: método de pago "Crédito" que exige elegir el cliente; se puede
  mezclar con otros pagos; **bloquea** si supera el cupo disponible.
  Vende a crédito quien cobra.
- **Abonos** en el POS dentro del turno (los de efectivo entran al cuadre
  de caja; los demás no).
- **Saldo por cliente** como cuenta corriente con historial (ventas a
  crédito, abonos, anulaciones); alerta de clientes con pagos vencidos.

## Cierre de la sesión 2026-10-05 (final)

**Implementado y subido hoy:** fases 10 y 11 completas y cerradas, más el
menú desplegable (último commit `0a0dd2a`). Árbol limpio.

**Pendiente (mañana):**
- Usuario: comprar el dominio y configurar Resend (guía arriba); responder
  destinatarios y contenido del reporte.
- Claude: análisis y diseño de la **fase 12** (se puede empezar por
  existencia ideal y lista de compras aunque el dominio no esté).
- Después: fase 13 (cartera), preparación para producción, despliegue.

**Errores conocidos:** los de la sección anterior; `next dev` quedó
encendido en el puerto 3000 al cerrar (detenerlo con `taskkill /PID <pid>
/T /F` si estorba).

**Próximo paso recomendado:** diseño de la fase 12 con las respuestas del
usuario sobre destinatarios y contenido del reporte.


## Sesión 2026-10-06 — Fase 12: lista de compras y reporte de cierre

Decisiones del usuario (2026-10-06), todas las recomendadas:
- **Existencia ideal por empresa** (un valor por insumo, como el mínimo,
  contra la suma de las bodegas). Por sucursal, cuando un cliente tenga más
  de una.
- **Correo con lista de compras + resumen corto del día** (ventas, gastos,
  faltante/sobrante).
- **Destinatarios configurables** ("Correos para el reporte de cierre" en
  Configuración > Negocio); vacío = no se envía.
- El dominio y Resend se configuran después, paso a paso con el usuario.

Componentes: 1) existencia ideal del insumo; 2) página "Lista de compras"
en Inventario (+ impresión); 3) destinatarios en Configuración > Negocio;
4) reporte al cerrar el último turno abierto (POS o panel, con `after()`,
outbox en dev); 5) Resend (con el dominio); 6) cierre (ADR 0012, README).

### Componente 1 — Existencia ideal del insumo (aprobado 2026-10-06)

- Migración `20261006120000_add_supply_ideal_stock` (**aplicada en test y
  dev**; diff vacío): `supplies.idealStock Decimal(14,3)` nullable con
  `CHECK >= 0`.
- `supplySchema`: `idealStock` opcional (vacío = null) y regla "El stock
  ideal no puede ser menor que el mínimo." en el campo `idealStock` (si el
  mínimo es inválido, solo se reporta el mínimo). `SupplyData` exige
  `idealStock`; DTO del insumo con `idealStock`.
- UI: formulario reordenado (Unidad | Costo; Stock mínimo | Stock ideal),
  tarjeta "Stock ideal" en la ficha (4 tarjetas) y "· ideal N" en la
  lista. Sin auditoría (como el mínimo).
- Pruebas: unitarias del ideal y ajustes en las de integración (las
  llamadas a `createSupply` llevan `idealStock: null`). Verificado:
  typecheck, lint, suite **428/428**, build; sin sesión la ruta redirige
  al login. Revisión visual con sesión: la hace el usuario.
- Aprobado por el usuario el 2026-10-06 (revisión en el navegador a su cargo).

Commit `e703ea2` (subido).

### Componente 2 — Lista de compras (aprobado 2026-10-06)

Diseño aprobado el 2026-10-06 con las recomendaciones: **saldo negativo
cuenta como 0** (comprar = ideal; se marca "Saldo negativo") y **hoja
impresa incluida**. Sin migración.
- Servicio `services/shopping-list.ts`: `buildShoppingList` (puro; grupos
  `toBuy` — ideal − max(existencia, 0) > 0 —, `enough` y `noSuggestion` —
  sin ideal o sin carga inicial —; orden por nombre, sin archivados),
  `loadShoppingList(companyId)` **sin permiso** (para el reporte de
  cierre, que puede disparar un cajero) y `getShoppingList(session)` con
  `inventory.manage` (formatos, empresa, quién imprime). `toSupplyDto` de
  `services/inventory.ts` ahora exportado.
- Página `/inventario/lista-de-compras` (menú "Lista de compras" después
  de Insumos, ícono `ClipboardList`): secciones Por comprar (con "Nada por
  comprar" si todo alcanza), Alcanzan y Sin sugerencia (enlace "Definir
  stock ideal"); aviso si ningún insumo tiene ideal; botón "Imprimir
  lista". Componentes `components/inventory/shopping-list.tsx`.
- Hoja `/imprimir/lista-compras` (80/58 mm y Carta,
  `shoppingListSheetHref`): Por comprar y Sin sugerencia con columna
  "Comprado" en blanco; los que alcanzan solo se cuentan.
- Pruebas: `shopping-list.test.ts` (4: suma de bodegas, negativo como 0,
  decimales, ideal exacto alcanza, sin carga, archivados fuera, cálculo
  sin permiso igual, otra empresa, cajero) y menú. Verificado: typecheck,
  lint, suite **432/432**, build; sin sesión las rutas redirigen al login.
  Revisión visual con sesión (y la hoja en la impresora): la hace el
  usuario.

Commit `fcd6356` (subido).

### Componente 3 — Destinatarios del reporte (aprobado 2026-10-06)

Diseño aprobado el 2026-10-06 (tarjeta propia en Negocio, solo OWNER,
máximo 5, con auditoría).
- Migración `20261006130000_add_closing_report_emails` (**aplicada en test
  y dev**; diff vacío): `companies.closingReportEmails TEXT[]` (default
  vacío) con `CHECK (cardinality <= 5)`.
- `closingReportEmailsSchema` (`validations/companies.ts`): separa por
  coma, punto y coma, espacios o saltos; cada uno con `emailSchema`
  (minúsculas), sin repetidos, máx. `CLOSING_REPORT_MAX_EMAILS` (5);
  mensaje con el correo inválido.
- Datos: `findClosingReportEmails` (lo usará el reporte) y
  `updateClosingReportEmails`. Servicio (`company.manage`):
  `getClosingReportRecipients`, `saveClosingReportRecipients` (no escribe
  ni audita si la lista no cambió; evento
  `COMPANY_REPORT_RECIPIENTS_UPDATED` sin los correos).
- UI `components/company/closing-report-{card,actions,fields}`: tarjeta
  "Reporte de cierre del día" entre el logo y los datos del negocio; campo
  de texto con "Agregar mi correo" (requiere JS; sin JS se escribe a mano);
  aviso "Guardado. El reporte de cierre no se enviará." si queda vacío.
  El asistente de configuración inicial no cambia.
- Pruebas: `closing-report-recipients.test.ts` (5). Verificado:
  typecheck, lint, suite **437/437**, build; sin sesión Negocio redirige
  al login. Revisión visual con sesión: la hace el usuario.
- Corrección reportada por el usuario (captura): un correo repetido se
  quitaba en silencio, así que 6 copias del mismo pasaban como 1 sin
  ningún aviso. Ahora un repetido (sin distinguir mayúsculas) es error
  "El correo X está repetido." y la ayuda dice "Hasta 5 correos
  distintos". En su captura los dos correos eran distintos
  (bevagas10 / bevargas10). Suite 437/437, typecheck y lint.

Commit `87b02e5` (subido).

### Componente 4 — Envío del reporte al cerrar el último turno (aprobado 2026-10-06)

Diseño aprobado el 2026-10-06 **con historial** (tabla `closing_reports`).
- Migración `20261006140000_add_closing_reports` (**aplicada en test y
  dev**; diff vacío; RLS verificado en dev): enum `ClosingReportStatus`
  (`PENDING`/`SENT`/`FAILED`/`SKIPPED`) y `closing_reports` (turno que lo
  disparó con FK compuesta, `periodStart`, `createdAt` = fin del período,
  destinatarios, enviados, error ≤ 500, `finishedAt`). CHECK: 0–5
  destinatarios, enviados ≤ destinatarios, SKIPPED ⇔ 0 destinatarios,
  PENDING ⇔ sin `finishedAt`, `periodStart < createdAt`.
- **Reserva** `claimClosingReport` (`data/closing-reports.ts`): bloquea la
  fila de la empresa `FOR UPDATE`; sigue solo si no queda ningún turno
  abierto en la empresa y hay turnos cerrados en (último reporte, ahora];
  el primero cubre las últimas 24 h. Sin destinatarios crea `SKIPPED`
  (marca el corte). Con dos cierres a la vez sale un solo reporte (prueba
  3/3). `findClosingReportPeriod`: turnos del período, ventas (por método
  en el orden de la empresa, anuladas aparte) y movimientos de caja.
- **Servicio** `services/closing-report.ts`: `buildClosingReportEmail`
  (puro; texto plano; asunto "Cierre del día · Empresa · fecha · N insumos
  por comprar"; lista de compras —sin sugerencia hasta 15 y "y N más"—,
  ventas, métodos, anuladas, gastos y —si hay— retiros e ingresos, caja
  por turno con sucursal si hay varias, enlace a la lista y pie) y
  `sendClosingReportIfLast(companyId, cashSessionId)`: un correo por
  destinatario; `SENT` si llegaron todos, si no `FAILED` con el primer
  motivo; nunca lanza. Fecha y horas en la zona de la empresa.
- Se dispara con `after()` en `closeShiftAction` (POS) y
  `closeShiftFromPanelAction` (panel), después de responder.
- `setMessageSenderForTesting` en `services/messaging`. `tests/helpers.ts`
  limpia `closing_reports`.
- Negocio: la tarjeta muestra el último reporte (`getLastClosingReport`,
  `company.manage`): enviado a N, enviándose, sin destinatarios o "no se
  pudo enviar (llegó a X de Y). Motivo: …" en rojo.
- En producción, hasta Resend, el envío queda `FAILED` con "No hay
  proveedor de mensajes configurado".
- Pruebas: `closing-report.test.ts` (7: no sale con turnos abiertos,
  contenido y un correo por destinatario, cierre desde el panel, no se
  repite, concurrencia, fallo parcial, SKIPPED, permisos y otra empresa,
  y el texto puro con negativos, anuladas, retiros, varias sucursales y
  lista larga). Los montos usan espacio no separable (es-CO). Verificado:
  typecheck, lint, suite **444/444**, build.
- **Sin probar de punta a punta en el navegador:** cerrar el último turno
  en dev y ver el correo en `/dev/outbox` (lo hace el usuario).

Commit `d79a3c0` (subido).

### Componente 5 — Resend y correos con la marca (aprobado 2026-10-06)

Diseño del código aprobado el 2026-10-06 (avanzarlo mientras el usuario
compra el dominio).
- `env.ts` → `getMailConfig()`: `RESEND_API_KEY` (sin ella, null) y
  `MAIL_FROM` ("Nombre <dir@dominio>" o la dirección); con clave y
  remitente inválido lanza "MAIL_FROM no está configurado o no es válido".
- `services/messaging/resend.ts` → `createResendSender` (fetch a
  `https://api.resend.com/emails`, un destinatario por correo, texto plano,
  timeout 15 s; error "Resend rechazó el correo (código): motivo" sin la
  clave). `getMessageSender`: prueba → Resend si hay clave (también en
  dev) → outbox en dev → error.
- `tests/setup.ts` borra `RESEND_API_KEY`/`MAIL_FROM`: las pruebas nunca
  envían correos reales. Pruebas `tests/unit/resend.test.ts` (4).
- `.env.example`, `.env` (vacías, las llena el usuario) y README.
  Verificado: typecheck, lint, suite **448/448**, build.
- Pendiente (usuario, paso a paso): comprar el dominio (pidió guía y
  recomendaciones antes), cuenta de Resend, subdominio `envios.` con DNS
  en Cloudflare, API key en `.env` y `MAIL_FROM`; luego prueba real de
  envío y commit.
- **Dominio comprado por el usuario (2026-10-06): `teruwork.com`** en
  Cloudflare Registrar (dominio de TERU, no solo del POS). Plan:
  `envios.teruwork.com` para Resend (región São Paulo si está), sistema en
  un subdominio (`pos.` o `app.`) al desplegar. `.env` ya tiene
  `MAIL_FROM="Teru POS <reportes@envios.teruwork.com>"`; falta la clave
  (la pega el usuario). Usar claves de Resend distintas para dev y
  producción.
- Primer envío real por Resend (2026-10-06): prueba de texto y reporte de
  cierre reales llegaron a bevargas10@gmail.com (destinatario de Su Arepa).
- **Ajuste pedido por el usuario: correos con estilo de marca.** Guía
  visual `../Diseño-guia-correo.txt` (Tailwind + naranja), traducida a la
  paleta TERU híbrida (encabezado morado oscuro con insignia lima, contenido
  claro, botón morado, pie negro con "Teru POS ●" lima).
  - `services/messaging/email-layout.ts`: `escapeHtml`, `emailLayout`
    (tablas y estilos en línea; media query para apilar en celular con las
    clases `col` / `stack`), `badge`, `button`, `card`, `sectionTitle`,
    `bodyRow` y `simpleEmail` (saludo, párrafos, botón y enlace en texto).
    Marca de la empresa: su logo (`publicFileUrl`) o su inicial sobre lima.
  - `OutgoingEmail.html` opcional (siempre con `text`); Resend lo envía; el
    outbox de desarrollo lo muestra en un iframe `sandbox=""`.
  - Reporte: armado movido a `services/closing-report-email.ts` (texto +
    HTML; `companyUrl` y `logoUrl` en lugar de `shoppingListUrl`). Orden de
    la guía: cuadre de caja por turno (cuadrada verde, faltante rojo,
    sobrante morado), resumen (ventas, gastos, retiros e ingresos si hay;
    métodos con % del total; anuladas), lista de compras con barra
    existencia/ideal y "Comprar X", sin sugerencia en tabla con estado,
    botones "Ver lista de compras" y "Ver cierres de caja", pie con fecha,
    cómo dejar de recibirlo y aviso de confidencialidad.
  - Se omitió de la guía lo que no existe o sería falso: ID de referencia,
    "prioridad alta", "caja verificada", descargar PDF / Excel, "generar
    orden de compra", barra de responder/reenviar (era del cliente de
    correo), diagnósticos inventados ("Normal", "Abastecido").
  - Recuperar contraseña e invitación usan `simpleEmail`.
  - Revisado con Chrome sin interfaz a 720 px y en un marco de 390 px
    (Chrome sin interfaz no baja de ~500 px de ventana: medir en iframe).
    Vista previa con datos de ejemplo enviada por Resend al usuario.
  - Pruebas: HTML escapado, barra, enlaces y marca. Suite **449/449**,
    typecheck, lint y build.
- Aprobado por el usuario el 2026-10-06 (vista previa revisada en Gmail).

## Cierre de la sesión 2026-10-06

**Implementado hoy (todo con commit y subido a `origin/master`):**
- Fase 12, componentes 1–5 aprobados: existencia ideal del insumo
  (`e703ea2`), lista de compras con hoja impresa (`fcd6356`),
  destinatarios del reporte en Negocio (`87b02e5`), envío del reporte al
  cerrar el último turno con historial `closing_reports` (`d79a3c0`), y
  Resend + correos con la marca TERU (último commit de la sesión).
- Dominio `teruwork.com` comprado por el usuario en Cloudflare;
  `envios.teruwork.com` verificado en Resend (São Paulo) con SPF, DKIM y
  DMARC (`p=none`). Clave `teru-pos-dev` en `.env` (no versionado).

**Pendiente (mañana):**
- **Pedido del usuario: revisar el diseño de los demás correos** que puede
  enviar el sistema (invitaciones, recuperar contraseña, cambio de
  contraseña y cualquier otro que requiera diseño). Hoy ya usan
  `simpleEmail` la recuperación y la invitación; revisarlos con el
  usuario (en Gmail) y decidir si se agregan otros, p. ej. un aviso al
  cambiar la propia contraseña (hoy no se envía ningún correo al
  cambiarla) o al cambiar los destinatarios del reporte.
- Fase 12, componente 6 — cierre: revisión de la fase, ADR 0012 (ideal por
  empresa, negativo como 0, reserva con bloqueo de la empresa, primer
  período de 24 h, SKIPPED como corte, Resend por fetch, correos en
  tablas con estilos en línea) y README (lista de compras, reporte,
  Resend, dominio).
- Después: fase 13 (cartera), preparación para producción (clave de
  Resend aparte `teru-pos-prod`, `APP_URL` con `pos.teruwork.com` u otro
  subdominio, Vercel en `gru1`), despliegue.

**Decisiones técnicas de hoy:** ver los componentes 1–5 de la fase 12.

**Errores y riesgos conocidos:**
- Con `RESEND_API_KEY` en `.env`, **en desarrollo los correos salen de
  verdad** (no van a `/dev/outbox`): cuidado al invitar o recuperar
  contraseñas de prueba. Para volver al outbox, dejar la clave vacía.
- Plan gratis de Resend: 100 correos por día y 1 dominio.
- Gmail ignora la fuente Plus Jakarta Sans (usa la de respaldo).
- Siguen los de sesiones anteriores (`next dev` en Windows deja el
  proceso en el 3000, `prisma generate` con EPERM si `next dev` corre).
- Chrome sin interfaz no baja de ~500 px de ventana: para ver el correo
  en celular, medirlo dentro de un iframe de 390 px.

**Próximo paso recomendado:** revisar con el usuario el diseño de los
demás correos (su pedido) y luego el cierre de la fase 12.

## Sesión 2026-10-07 — Revisión de los correos del sistema

Al iniciar: `prisma generate`, typecheck, suite 449/449 y `next dev`
levantado. Árbol limpio y sincronizado con `origin/master` (`32b73cf`).

Decisiones del usuario (2026-10-07): agregar el aviso de contraseña
cambiada y la bienvenida al propietario; **no** avisar por ahora al cambiar
los destinatarios del reporte ni al desactivar o reactivar una cuenta (poco
valor y gasto del límite de 100 correos por día de Resend). Agregar el
bloque "Tu acceso" a la invitación.

**Implementado (3 componentes aprobados, con commit y subidos):**
1. **"Tu acceso" en la invitación** (`b05fc48`): `simpleEmail` acepta
   `details` opcional (filas etiqueta / valor, `href` opcional), debajo del
   botón y del enlace de respaldo. La invitación muestra correo, rol y
   `/{slug}/login`, también en el texto plano.
2. **Aviso de contraseña cambiada** (`92a632e`):
   `services/auth/password-notice.ts` (`sendPasswordChangedNotice`, vía
   `ACCOUNT` o `RESET_LINK`), llamado después de guardar en
   `changeOwnPassword` y `resetStaffPassword`. Fecha en el formato y la zona
   de la empresa (hora con espacios duros y en medio de la frase para evitar
   "p. m.."). Botón "No fui yo: recuperar contraseña" → `/{slug}/recuperar`.
   Nunca lanza: un fallo del correo no bloquea el cambio. Nueva
   `findUserContact` en `data/users.ts`.
3. **Bienvenida al propietario** (`92f5878`): `services/owner-welcome.ts`;
   `createCompany` la envía y devuelve `emailSent` y `ownerEmail`.
   `company:create` solo muestra el enlace si el envío falló o no hay
   proveedor real (sin `RESEND_API_KEY` iría al outbox en la memoria del
   script). README actualizado.

Verificado: typecheck, lint y suite 453/453. Vistas previas revisadas en
escritorio y a 390 px (Chrome sin interfaz). No probado en Gmail real ni
`company:create` contra `su-arepa-dev` (crearía una empresa).

**Pendiente:**
- Fase 12, componente 6 — cierre: revisión de la fase, ADR 0012 (incluir
  lo de hoy: aviso de contraseña y bienvenida que nunca lanzan, "Tu acceso"
  en `simpleEmail`) y README (lista de compras, reporte, Resend, dominio).
- Después: fase 13 (cartera), preparación para producción, despliegue.

**Errores y riesgos conocidos:**
- Con Resend activo en desarrollo, cambiar o restablecer una contraseña
  también envía el aviso real (además de invitaciones y recuperación).
- Siguen los de sesiones anteriores.

**Próximo paso recomendado:** cierre de la fase 12 (componente 6).
