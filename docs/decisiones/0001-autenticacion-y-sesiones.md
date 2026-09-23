# ADR 0001 — Autenticación y sesiones

- **Estado:** aprobada
- **Fecha:** 2026-09-22
- **Fase:** inicial (base del proyecto y autenticación)

## Contexto

La fase inicial exige login, cierre de sesión y recuperación de credenciales,
con la estrategia de sesiones definida antes de implementar (reglas §5).
El modelo de datos ya separa `User` (personal) de `Customer` (clientes) y el
email es único **por empresa** (`@@unique([companyId, email])`), no global.

## Decisiones

### 1. Alcance de la fase: login del personal

Se implementa solo el login del panel interno (`User`: OWNER / ADMIN / STAFF).
El login de clientes (registro, Google, Apple) queda para la fase del módulo
de pedidos. El diseño de referencia se adapta: misma paleta y tipografía, sin
registro, redes sociales ni textos promocionales.

### 2. Resolución de empresa: slug en la URL

Rutas bajo `/[empresa]/...` (ej. `/su-arepa/login`). El slug se resuelve a
`Company` activa; si no existe o está inactiva → 404.
La sesión queda ligada a la empresa: una sesión de la empresa A nunca es
válida en rutas de la empresa B.
Se podrá migrar a subdominios más adelante sin cambiar la lógica de negocio.

### 3. Sesiones propias en base de datos (sin Auth.js)

- Nueva tabla `Session` (userId, companyId, tokenHash, expiresAt, revokedAt,
  lastUsedAt, ipAddress, userAgent).
- La cookie `httpOnly`, `secure` (en producción), `sameSite=lax`, `path=/`
  contiene solo un token aleatorio (32 bytes); en BD se guarda su hash SHA-256.
- Duración: 12 h con renovación deslizante mientras haya actividad.
  "Recordar mi sesión" extiende a 30 días.
- Logout: se revoca la sesión en BD y se borra la cookie.
- Cambio o restablecimiento de contraseña revoca todas las sesiones del usuario.

Descartado Auth.js v5: sigue en beta, encaja mal con credenciales y audiencias
separadas, y con JWT no se pueden revocar sesiones. `AUTH_SECRET` y
`NEXTAUTH_URL` se retiran del `.env`.

### 4. Contraseñas

Hash con `argon2id`. Mínimo 8 caracteres. Mensajes de error genéricos
("credenciales inválidas") para no revelar si la cuenta existe.

### 5. Recuperación de contraseña

- Enlace con token de un solo uso, 20 minutos de validez, hash SHA-256 en BD.
- Solicitar un nuevo token invalida los anteriores.
- La respuesta es idéntica exista o no la cuenta.
- Límite de intentos por cuenta e IP (login y recuperación).

### 6. Envío de mensajes: adaptador

Interfaz `MessageSender` en `src/server/services`. En desarrollo, un adaptador
guarda los mensajes y los muestra en `/dev/outbox` (ruta deshabilitada fuera de
`development`). Los proveedores reales (Resend, Twilio/WhatsApp) se conectan
después sin tocar la lógica. Nunca se registran tokens en logs.

### 7. Protección de rutas y autorización

`src/proxy.ts` (Next 16, antes "middleware") solo hace la redirección
optimista a login si falta la cookie. La validación real de sesión y de
permisos ocurre siempre en el servidor (servicios / data layer).

### 8. Auditoría

`AuthAuditLog` registra: login exitoso, login fallido, logout, solicitud de
recuperación y cambio de contraseña, con IP y user agent.

## Consecuencias

- Requiere una migración nueva (`Session`) y las dependencias `argon2` y
  `server-only`.
- Se mantiene control total sobre revocación y auditoría, a cambio de más
  código propio (acotado a `src/server`).
