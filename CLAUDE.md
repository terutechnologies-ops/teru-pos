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
