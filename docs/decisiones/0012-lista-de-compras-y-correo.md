# ADR 0012 — Lista de compras, reporte de cierre y correo

- **Estado:** aprobada
- **Fecha:** 2026-10-08
- **Fase:** 12 (lista de compras y reporte por correo)

## Contexto

Su Arepa compra a diario (carne y otros insumos). Al cerrar el día, el
propietario quiere saber cuánto insumo quedó y cuánto comprar para el día
siguiente, sin entrar al sistema. La idea original era WhatsApp; se
analizaron un enlace `wa.me` (manual), la API de WhatsApp Business de Meta
(verificación del negocio, número dedicado, plantillas aprobadas y costo
por mensaje) y el correo. El usuario eligió el **correo**: es más práctico
y, de paso, adelanta el proveedor real que necesitaban la recuperación de
contraseña y las invitaciones para funcionar en producción (ADR 0001 y
0002). WhatsApp queda para cuando se pida.

## Decisiones

### 1. Existencia ideal del insumo

- `supplies.idealStock` (`Decimal(14,3)`, opcional, `CHECK >= 0`): lo que
  se quiere tener al abrir el día. **Un valor por empresa**, contra la suma
  de todas las bodegas, igual que el mínimo. Por sucursal, cuando un
  cliente tenga más de una.
- No puede ser menor que el mínimo (error en el campo del ideal). Sin
  auditoría, como el mínimo.

### 2. Lista de compras

- `buildShoppingList` (puro) clasifica los insumos activos en **Por
  comprar** (ideal − existencia > 0), **Alcanzan** y **Sin sugerencia**
  (sin ideal, o sin carga inicial: la existencia no se conoce).
- **Un saldo negativo cuenta como 0:** indica entradas sin registrar, no
  insumo que se deba; se compra hasta el ideal y la fila se marca "Saldo
  negativo".
- Página `/inventario/lista-de-compras` (`inventory.manage`) y hoja
  impresa `/imprimir/lista-compras` (80/58 mm y Carta) con la columna
  "Comprado" en blanco.
- `loadShoppingList(companyId)` no pide permiso: la usa el reporte, que
  dispara quien cierra el último turno (puede ser un cajero).
  `getShoppingList(session)` pide `inventory.manage`.

### 3. Destinatarios del reporte

- `companies.closingReportEmails` (`TEXT[]`, máximo 5 con `CHECK`). Se
  editan en Configuración > Negocio, solo el propietario
  (`company.manage`). Vacío = no se envía.
- Se escriben separados por coma, punto y coma, espacio o salto de línea;
  se guardan en minúsculas; un repetido es error (antes se quitaba en
  silencio y ocultaba errores de escritura).
- Cada cambio se audita (`COMPANY_REPORT_RECIPIENTS_UPDATED`) **sin** los
  correos; guardar la misma lista no escribe ni audita.

### 4. Reporte al cerrar el último turno

- Se dispara con `after()` al cerrar un turno, desde el POS o desde el
  panel: corre **después de responder**, así que el cierre nunca espera
  ni falla por el correo.
- **Reserva con bloqueo de la empresa** (`claimClosingReport`): en una
  transacción toma la fila de la empresa `FOR UPDATE` y solo sigue si no
  queda **ningún turno abierto en la empresa** y hay turnos cerrados
  después del último reporte. Con dos cierres a la vez sale un solo
  reporte que cubre ambos turnos.
- **Período:** (último reporte, ahora]. El primero de cada empresa cubre
  las últimas 24 h, no todo su historial.
- **Historial** en `closing_reports` (`PENDING` / `SENT` / `FAILED` /
  `SKIPPED`), con el turno que lo disparó, el período, cuántos
  destinatarios y cuántos envíos llegaron, y el primer error (≤ 500).
  Sin destinatarios se guarda `SKIPPED`: **marca el corte**, así el día
  siguiente no arrastra los turnos de hoy. Las reglas están en `CHECK`
  (SKIPPED ⇔ 0 destinatarios, PENDING ⇔ sin `finishedAt`, enviados ≤
  destinatarios, inicio < fin).
- Un correo **por destinatario** (ninguno ve a los demás). `SENT` si
  llegaron todos; si no, `FAILED` con el motivo. La tarjeta de Negocio
  muestra el último resultado ("no se pudo enviar (llegó a 1 de 2).
  Motivo: …").
- **Contenido:** cuadre de caja por turno (cuadrada, faltante, sobrante),
  resumen del período (ventas por método de pago con su %, anuladas
  aparte, gastos, retiros e ingresos), lista de compras con barra
  existencia/ideal y "Comprar X", insumos sin sugerencia (hasta 15 y "y N
  más") y enlaces a la lista de compras y a los cierres de caja. Fechas y
  horas en la zona de la empresa.
- Se omitió de la guía visual lo que no existe o sería falso: número de
  referencia, "prioridad", "caja verificada", descargas PDF/Excel,
  "generar orden de compra" y diagnósticos inventados.

### 5. Resend como proveedor de correo

- **Por su API REST con `fetch`**, sin SDK (`createResendSender`): un
  destinatario por llamada, texto plano siempre y HTML si lo hay, timeout
  de 15 s. El error que lanza nunca incluye la clave (queda guardado en el
  historial del reporte).
- Configuración: `RESEND_API_KEY` y `MAIL_FROM` (remitente de un dominio
  verificado). Con clave y remitente inválido, error de configuración
  explícito.
- `getMessageSender()`: pruebas (`setMessageSenderForTesting`) → Resend si
  hay clave (**también en desarrollo**, para probar el envío real) →
  outbox en desarrollo → error fuera de desarrollo. `tests/setup.ts` borra
  las variables: las pruebas nunca envían correos reales.
- **Dominio:** `teruwork.com` (Cloudflare Registrar), con el subdominio
  `envios.teruwork.com` verificado en Resend (región São Paulo, SPF, DKIM y
  DMARC `p=none`). El subdominio cuida la reputación del dominio principal.
  Una clave de Resend por entorno (`teru-pos-dev`; la de producción
  aparte), con permiso "Sending access" solo para ese dominio.

### 6. Correos con la marca TERU

- `services/messaging/email-layout.ts`: tablas y estilos en línea (lo que
  respetan Gmail, Outlook y Apple Mail; sin JS, SVG ni CSS externo), media
  query para apilar en el celular, paleta TERU híbrida (encabezado morado
  oscuro con insignia lima, contenido claro con acción morada, pie negro).
  Marca de la empresa: su logo o su inicial sobre lima.
- **Todo texto que viene de datos pasa por `escapeHtml`** (nombres de
  empresa, personas, insumos, métodos de pago, correos y enlaces).
- `simpleEmail` (saludo, párrafos, botón, el enlace en texto por si el
  botón no abre, bloque opcional de datos clave y nota) lo usan
  recuperación de contraseña, invitación al equipo (con "Tu acceso":
  correo, rol y dirección de inicio de sesión), aviso de contraseña
  cambiada y bienvenida al propietario.
- El outbox de desarrollo muestra el HTML en un `iframe` con
  `sandbox=""` (sin scripts ni navegación).

### 7. Correos nuevos de la plataforma

- **Aviso de contraseña cambiada** (desde Mi cuenta o con un enlace de
  recuperación), con fecha y hora en la zona de la empresa y el botón
  "No fui yo: recuperar contraseña".
- **Bienvenida al propietario** al crear una empresa con
  `company:create`: lleva la invitación y "Tu acceso". El script muestra
  el enlace solo si el envío falló o no hay proveedor real.
- Ambos **nunca lanzan**: un fallo del correo no deshace el cambio de
  contraseña ni el alta de la empresa (queda en el log).
- No se avisa (decisión del usuario) al cambiar los destinatarios del
  reporte ni al desactivar o reactivar una cuenta: poco valor y gasto del
  límite diario del plan gratuito.

## Consecuencias

- El propietario recibe al cerrar el día qué comprar y cómo quedó la
  caja, sin entrar al sistema; quien compra puede llevar la hoja impresa.
- Recuperar contraseña, invitar al equipo y dar de alta empresas
  funcionan fuera de desarrollo.
- El sistema depende de un proveedor externo para estos correos; cambiar
  de proveedor es implementar otro `MessageSender`.

## Revisión de la fase

- Páginas y acciones nuevas con sesión y permiso de la empresa enviada
  (lista de compras y su hoja con `inventory.manage`; destinatarios y
  último reporte con `company.manage`); datos filtrados por empresa; el
  reporte solo lee datos de la empresa del turno cerrado.
- HTML de los correos escapado en todos los puntos con datos; el outbox
  aislado en un `iframe` sin permisos; errores del proveedor sin la clave.
- **Corregido (revisión):** con Resend, "Recuperar contraseña" revelaba
  qué correos tienen cuenta. Para una cuenta existente la respuesta
  esperaba la llamada a Resend (más lenta) y, si el envío fallaba (p. ej.
  al pasar el límite diario), mostraba un error; para un correo sin cuenta
  respondía "enviado" de inmediato. Ahora el servicio recibe `defer` (la
  acción pasa `after`), el correo sale después de responder y un fallo
  del envío solo queda en el log. Era el riesgo que el ADR 0001 dejó para
  "al conectar el proveedor real". Dos pruebas nuevas en
  `password-reset.test.ts` fallaban antes y pasan después.

## Riesgos conocidos

- **Plan gratuito de Resend:** 100 correos por día y 3.000 por mes. Con
  varias empresas y hasta 5 destinatarios cada una, revisar el plan antes
  de crecer.
- **Correos reales en desarrollo:** con `RESEND_API_KEY` en `.env`, invitar,
  recuperar o cambiar contraseñas de prueba envía correos de verdad. Para
  volver al outbox, dejar la clave vacía.
- **Recuperación:** la respuesta aún tarda algo más si la cuenta existe
  (crea el token y audita), pero ya no incluye el envío del correo. Si el
  correo falla, la persona no recibe nada y puede volver a pedirlo.
- **Aviso de contraseña cambiada:** se envía antes de responder, así que
  un proveedor lento demora la respuesta del cambio (hasta el timeout de
  15 s); nunca la hace fallar.
- **Un reporte fallido no se reintenta:** queda `FAILED` en el historial y
  el siguiente cubre solo lo nuevo. Si el proceso muere a mitad del envío,
  el reporte queda `PENDING`.
- **"Último turno" es de la empresa:** con varias sucursales, el reporte
  sale cuando cierra la última de todas, y el ideal es por empresa.
- **Un solo reporte por cierre del último turno:** si se reabre y se cierra
  otro turno el mismo día, sale otro reporte con solo ese turno.
- Gmail ignora la fuente Plus Jakarta Sans y usa la de respaldo.
