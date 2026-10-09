# ADR 0013 — Panel del equipo Teru (empresas de la plataforma)

- **Estado:** aprobada
- **Fecha:** 2026-10-08
- **Fase:** 13 (panel del equipo Teru)

## Contexto

Hasta la fase 12, las empresas se creaban con el script `company:create` y
no había forma de ver desde la aplicación qué empresas tiene la plataforma,
si están usando el sistema o en qué estado está su alta (ADR 0002: "sin
superadmin"). Los otros productos de TERU ya lo resuelven con un panel del
equipo Teru en `/teru`:

- **TERU-RRHH:** rol `SUPER_ADMIN` en la tabla de usuarios (Supabase Auth),
  gestiona empresas y su primer administrador, sin ver datos de empleados.
- **TERU-PREDIOS:** rol `SUPERADMIN` con `organizacionId` nulo (CHECK),
  cookie propia en `/teru`, lista, ficha, alta con el primer administrador y
  desactivar/reactivar cerrando sesiones. El equipo Teru no entra a las
  empresas.

## Decisiones

### 1. Cuentas propias del equipo Teru

- Tablas `platform_users` y `platform_sessions`, **separadas de `users`**.
  En Teru POS `users.companyId` y `user_sessions.companyId` son obligatorios
  y toda la autorización asume una empresa; un rol sin empresa habría
  obligado a revisar cada sesión, DTO y servicio. Con tablas propias el
  login del personal no cambia y una cuenta Teru no puede, ni por error,
  recibir permisos de una empresa.
- Correo único en minúsculas (CHECK), nombre 2–120, contraseña argon2id.
- **Gestión por script:** `npm run teru:create-admin` crea la cuenta;
  `--reset` cambia la contraseña y `--deactivate` / `--activate` quitan o
  devuelven el acceso (`--reset` y `--deactivate` cierran todas sus
  sesiones). La contraseña sale de `TERU_ADMIN_PASSWORD`, nunca de la línea
  de comandos. Todo queda en auditoría (`PLATFORM_USER_*`). No hay registro
  ni recuperación por correo.
- El slug `teru` queda reservado para que ninguna empresa lo tome.

### 2. Login y sesión

- `/teru/login` con el mismo esquema que el personal (ADR 0001): token
  aleatorio en cookie httpOnly y solo su hash en BD, verificación contra un
  hash ficticio si el correo no existe, mismo error para una cuenta
  inactiva, límite de 5 fallos por cuenta y 20 por IP en 15 minutos.
- **Eventos propios** (`PLATFORM_LOGIN_*`, actor `PLATFORM`, sin empresa):
  los fallos de un login no cuentan para el otro. Restablecer con el script
  desbloquea la cuenta (`findLatestAuthEventAt` busca también por
  elemento afectado).
- Cookie `teru_session` con **path `/teru`**: nunca viaja a las rutas de las
  empresas, y la del personal (path `/{slug}`) nunca llega a `/teru`.
  Sesión de **8 h deslizante**, sin "recordar".
- El proxy redirige `/teru` sin cookie al login (redirección optimista); el
  layout valida la sesión y cada servicio la vuelve a exigir.

### 3. Lista y ficha de empresas

- `/teru`: cada empresa con su estado (activa, configuración pendiente,
  desactivada), propietario, usuarios activos, fecha de creación y ventas
  de los últimos 30 días; arriba, un resumen.
- `/teru/empresas/[id]`: uso (ventas completadas de 30 días, última venta,
  último ingreso del personal, usuarios activos, sucursales), datos de la
  empresa y equipo (propietario y cuántos por rol).
- **Solo cifras agregadas:** el panel nunca muestra ventas, productos,
  clientes ni la lista del personal. Las consultas son agrupadas (no una por
  empresa).
- Fechas en hora de Colombia (donde está el equipo), no en la zona de cada
  empresa; montos en la moneda de cada empresa.

### 4. Crear empresa y reenviar la bienvenida

- `/teru/empresas/nueva` usa el mismo `createCompany` del script (sede,
  bodega, métodos de pago, categorías de gasto, invitación del propietario
  y bienvenida). Errores por campo en español.
- `createCompany` recibe quién crea: `SYSTEM` (script) o `PLATFORM` (con la
  cuenta y la IP). Se agrega el evento `COMPANY_CREATED`.
- **El enlace de la invitación nunca se muestra en el panel:** es una
  credencial y quedaría en el historial del navegador o en logs. Si la
  bienvenida falla, la ficha lo avisa y se usa "Reenviar bienvenida".
- "Reenviar bienvenida" (mientras el propietario no tenga cuenta y la
  empresa esté activa) crea un enlace nuevo de 72 h y revoca el anterior.

### 5. Desactivar y reactivar

- Desactivar pide un **motivo** (3–200) y, en una transacción, marca la
  empresa y **cierra todas las sesiones de su personal**. Su login deja de
  existir (404) porque solo se buscan empresas activas. Los datos se
  conservan.
- `companies.deactivatedAt`, `deactivationReason` y `deactivatedById`
  (FK a `platform_users`, `SET NULL`), con CHECK: inactiva ⇔ con fecha ⇔
  con motivo.
- Reactivar borra esos campos; las sesiones cerradas no reviven.
- **Historial** en `company_status_changes` (desactivada o reactivada,
  motivo al desactivar —CHECK—, quién y cuándo), escrito en la misma
  transacción; la ficha muestra los últimos 20.
- El formulario de desactivar avisa cuántos **turnos de caja** siguen
  abiertos: quedan abiertos hasta reactivar la empresa y cerrarlos.
- Auditoría `COMPANY_DEACTIVATED` / `COMPANY_REACTIVATED` (y el alta y el
  reenvío) con actor `PLATFORM` y la IP.

## Consecuencias

- El equipo Teru ve qué empresas tiene, cuáles venden y en qué estado está
  su alta, y puede dar de alta o suspender una empresa sin tocar la BD.
- El script `company:create` sigue funcionando (actor `SYSTEM`).
- La capa de datos tiene una excepción documentada a "todo se filtra por
  empresa": las tablas y consultas del panel Teru.

## Revisión de la fase

- Todas las páginas y acciones de `/teru` (salvo el login) exigen la sesión
  Teru en el servidor; los servicios la vuelven a exigir.
- Una sesión Teru no sirve en una empresa ni una del personal en `/teru`
  (cookies con path distinto, tablas distintas; probado por HTTP).
- Datos de la empresa escapados por React; el panel no expone el detalle de
  ventas ni del personal ni el enlace de invitación.
- **Corregido (revisión):** el README de la capa de datos decía que todo se
  filtra por empresa; ahora documenta la excepción del panel Teru.

## Riesgos conocidos

Revisados con el usuario el 2026-10-08:

- **Sin verificación en dos pasos** en las cuentas Teru, que controlan
  todas las empresas. **Requisito de la preparación para producción:**
  código de una app autenticadora (TOTP).
- **Cuentas Teru solo por script** (crear, restablecer, activar y
  desactivar): no hay pantalla para gestionarlas. Suficiente para un equipo
  pequeño.
- **Turnos abiertos:** al desactivar quedan abiertos (el formulario lo
  avisa con el número) hasta reactivar y cerrarlos.
- **Escala:** la lista carga todas las empresas sin paginar; revisar cuando
  haya muchas.
- El último ingreso cuenta a todo el personal, incluidas las cuentas
  desactivadas.
