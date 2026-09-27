# ADR 0002 — Empresa, sucursal y equipo

- **Estado:** aprobada
- **Fecha:** 2026-09-27
- **Fase:** 2 (configuración inicial de la empresa)

## Contexto

Teru POS es una plataforma multiempresa: cada empresa cliente (la primera es
Su Arepa) es un registro de `companies` con su slug en la URL. Tras la fase
de autenticación, una empresa recién creada no tenía datos comerciales,
sucursal ni forma de sumar personal. La referencia visual
(`Diseño_configuracion_empresa.txt`) propone un asistente de 4 pasos; es una
guía, no una especificación, y muestra funciones de módulos futuros.

## Decisiones

### 1. Alcance: asistente de 3 pasos

Negocio → Equipo → Confirmar. Los pasos de insumos y producto/receta se
insertan en el asistente cuando existan los módulos de inventario y
productos. Quedan fuera: impuestos, redondeo de efectivo, logo, rubro,
invitación por celular, POS/caja y roles nuevos. Solo se modela lo que usa
esta fase.

### 2. Alta de empresas por script

`npm run company:create` crea empresa, sucursal principal e invitación del
propietario en una transacción e imprime el enlace. No hay registro público
ni superadministrador de la plataforma por ahora.

### 3. Modelo de datos

- `Company`: `taxId`, `phone`, `email`, `address` (texto libre, opcionales)
  y `setupCompletedAt` (null = configuración pendiente).
- `Branch`: sucursales; una sola principal por empresa (índice único parcial
  `branches_one_main_per_company`, solo en SQL). Aún no se vinculan usuarios.
- `StaffInvitation`: tabla aparte en lugar de crear `User` inactivos, para no
  tocar el login aprobado. Guarda el hash del token, quién invitó y el
  usuario creado al aceptar.
- RLS habilitado en las tablas nuevas, como en el resto.

### 4. Roles fijos y permisos en código

Roles OWNER, ADMIN y STAFF; permisos definidos en
`services/auth/permissions.ts`. Por ahora `company.setup` y `team.manage`
son solo del OWNER. Cada módulo agrega sus permisos (y roles como CASHIER)
cuando se construye. Doble control: `requirePermission` en páginas y
acciones (redirige al panel) y `assertPermission` en cada servicio (lanza
`ForbiddenError`), por si una acción se invoca directamente.

### 5. Flujo del asistente

- Con la configuración pendiente, quien tiene `company.setup` es enviado al
  asistente; el resto entra al panel con un aviso (sin bucles de
  redirección). Con la configuración completa, el asistente redirige al
  panel.
- Cada paso guarda directamente en la BD: si el propietario sale, retoma
  donde iba. No hay borradores.
- "Finalizar configuración" marca `setupCompletedAt` una sola vez
  (idempotente) y registra `COMPANY_SETUP_COMPLETED`. Las invitaciones
  pendientes no lo impiden.

### 6. Moneda y formatos

- Monedas habilitadas: COP, USD, MXN, EUR (`SUPPORTED_CURRENCIES`). La
  validación del servidor usa la misma lista; habilitar otra es agregarla
  ahí.
- Formatos de fecha: `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, calculados con
  componentes UTC (igual en servidor y navegador).
- Separadores numéricos fijos `es-CO` hasta que exista el formato de números
  por empresa (módulo de productos y precios).

### 7. Invitaciones del personal

- Enlace con token de un solo uso, 72 h, hash SHA-256 en BD, enviado por
  `MessageSender` (outbox en desarrollo). Se invita ADMIN o STAFF; el OWNER
  sale del script.
- Una invitación nueva al mismo correo revoca la anterior; reenviar genera un
  token nuevo. No se invita un correo que ya tiene cuenta en la empresa.
- Aceptar, en una transacción: reclama la invitación (el `UPDATE` bloquea la
  fila, así dos aceptaciones simultáneas no crean dos cuentas) y crea el
  usuario con el rol invitado. Luego va al login; no inicia sesión solo.
- Desactivar a un miembro revoca sus sesiones en la misma transacción. Nadie
  puede desactivar al OWNER ni a sí mismo.

### 8. Marca de la plataforma y de la empresa

La marca Teru POS va en lo que es de la plataforma (página raíz `/`, títulos
de pestaña y firma al pie de las pantallas de acceso). El nombre de la
empresa va en lo suyo (login, asistente). El slug de una empresa se
considera fijo porque viaja en enlaces enviados por correo.

## Consecuencias

- Tras finalizar el asistente no hay dónde editar negocio ni equipo hasta que
  exista la sección de configuración del panel (siguiente fase).
- Los formularios usan Server Actions con campos ocultos y funcionan sin
  JavaScript.

## Riesgos conocidos

- **Proveedor de correo:** sin él, las invitaciones (igual que la
  recuperación) no funcionan fuera de desarrollo.
- **Envío fallido:** la invitación se guarda antes de enviar el correo; si
  el envío falla queda pendiente sin entregar y se puede reenviar.
- **Auditoría sin objetivo:** `auth_audit_logs` registra quién hizo cada
  acción del equipo, pero no sobre qué invitación o miembro. Ampliar cuando
  exista un módulo de auditoría.
- **Dirección duplicable:** la dirección de la sede principal se guarda en
  `Company.address`; `Branch.address` queda vacía. Definir la fuente al
  construir el módulo de sucursales.
- **Navegador compartido:** si al abrir una invitación hay otra sesión de la
  empresa abierta, el login la muestra y permite cerrarla (el invitado
  normalmente usa su propio equipo).
- **ADMIN sin permisos:** invitarlo hoy solo da acceso al panel.
