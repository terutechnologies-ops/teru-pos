# ADR 0003 — Panel, permisos por rol y almacenamiento de archivos

- **Estado:** aprobada
- **Fecha:** 2026-09-27
- **Fase:** 3 (panel y configuración)

## Contexto

Al cerrar la fase 2, una empresa terminaba el asistente de configuración y
no tenía dónde volver a editar sus datos ni su equipo. El panel era una
página provisional sin navegación, el Administrador no tenía ningún permiso
y la empresa no podía mostrar su logo.

## Decisiones

### 1. Dos áreas y roles fijos con permisos por acción

Teru POS tendrá un área operativa (POS: menú, pedidos, cobro, turno de
caja) y una administrativa (ventas, compras, inventario, menú, cierres,
configuración, equipo). Cada persona ve solo lo que su rol permite.

Se mantienen **roles fijos con permisos definidos en código**
(`services/auth/permissions.ts`), nombrados por acción (`company.manage`,
`team.manage`), no por pantalla. Se descartaron por ahora los permisos
adicionales por persona y los roles personalizados; con permisos por acción
se pueden agregar después sin rehacer los módulos.

`company.setup` pasó a llamarse `company.manage`: también cubre editar los
datos después del asistente.

| Permiso | OWNER | ADMIN | STAFF |
|---|---|---|---|
| `company.manage` (datos del negocio, logo, asistente) | Sí | No | No |
| `team.manage` (invitar y activar personal) | Sí | Sí | No |

### 2. Jerarquía dentro del equipo

El permiso da acceso; `canManageRole` (`lib/staff-roles.ts`) limita sobre
quién: el OWNER gestiona ADMIN y STAFF, el ADMIN solo STAFF y nadie gestiona
al OWNER ni cambia su propio estado. Se aplica en el servicio de equipo (y en
la consulta que activa o desactiva, para que sea atómico); la interfaz solo
oculta lo que no se puede hacer. Un ADMIN puede gestionar al personal aunque
la configuración inicial siga pendiente.

### 3. Navegación del panel

- Una lista única de secciones (`(panel)/navigation.ts`), cada una con su
  permiso. El servidor la filtra por rol y el menú (shadcn Sidebar) solo la
  dibuja. Cada página vuelve a verificar su permiso.
- El menú muestra **solo módulos que existen**, sin "Próximamente".
- Rutas: `/[empresa]` (inicio), `/[empresa]/configuracion/{negocio,equipo}`
  y `/[empresa]/configuracion-inicial` (asistente). `/configuracion` lleva a
  la primera sección permitida.
- Los formularios del negocio y del equipo son los mismos en el asistente y
  en el panel (`components/company`, `components/team`); solo cambian el pie
  y lo que pasa al guardar.

### 4. Almacenamiento de archivos: adaptador + Supabase Storage

Interfaz `FileStorage` (`services/storage`) con una implementación para
Supabase Storage por su API REST (sin SDK) y otra en memoria para pruebas,
igual que el adaptador de mensajes. Se guarda la **ruta** del archivo, no su
URL. Bucket público `company-assets`, creado con `npm run storage:setup`.

Se eligió sobre guardar la imagen en PostgreSQL porque las fotos de
productos y menús necesitarán almacenamiento de archivos de todos modos;
el adaptador permite cambiar a S3, R2 u otro proveedor sin tocar la lógica.

Sin `SUPABASE_URL` y `SUPABASE_SECRET_KEY` la app funciona, pero no se
pueden subir archivos.

### 5. Logo de la empresa

PNG, JPEG o WebP de hasta 1 MB, validado por su contenido (no por la
extensión); sin SVG porque puede llevar scripts. Cada logo usa una ruta
única, así se sirve con caché de un año sin mostrar versiones viejas; el
anterior se borra sin hacer fallar la operación. Se muestra en las
pantallas de acceso, el menú y el asistente; sin logo, el ícono de tienda.

### 6. Auditoría

Nuevos eventos: `COMPANY_PROFILE_UPDATED` (solo si algo cambió, sin los
valores), `COMPANY_LOGO_UPDATED` y `COMPANY_LOGO_REMOVED`.

### 7. Corrección del proxy

El `matcher` de `src/proxy.ts` tenía `\.` dentro de un string de JavaScript
(queda `.`), así que excluía casi todas las rutas y el proxy nunca corría en
las de empresa. No era un problema de seguridad (el servidor siempre valida),
pero la redirección rápida al login no funcionaba. Ahora usa `\\.`.

## Consecuencias

- Cada módulo nuevo declara sus permisos por acción, los asigna a los roles
  fijos y agrega su entrada al menú.
- Cada entorno necesita su clave de Storage y su bucket.

## Riesgos conocidos

- **Clave de Storage:** la clave secreta da acceso total al proyecto de
  Supabase. Solo va en variables de entorno del servidor.
- **Caché del CDN:** tras borrar un logo, su URL antigua puede seguir
  respondiendo hasta que venza la caché. La ruta es única y ya no se usa.
- **Cambio de moneda:** hoy se puede cambiar libremente. Cuando existan
  ventas o precios habrá que bloquearlo o advertir.
- **Auditoría sin objetivo:** sigue sin registrarse sobre qué miembro o
  invitación se actuó (ver ADR 0002).
- **`bodySizeLimit` de 2 MB** aplica a todas las Server Actions, no solo al
  logo.
