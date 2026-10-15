# ADR 0014 — Cartera (cuentas por cobrar)

- **Estado:** aprobada
- **Fecha:** 2026-10-14
- **Fase:** 14 (cartera)

## Contexto

Su Arepa le vende fiado a algunos clientes (restaurantes, vecinos) y lo
anotaba por fuera del sistema. Hacía falta saber a quién se le vende a
crédito, hasta cuánto, cuánto debe cada uno, qué ya venció, y que el cobro
de esas deudas cuadre con la caja. `third_parties` ya admitía `isCustomer`
desde las compras (ADR 0008).

Decisiones del usuario (2026-10-08), todas las recomendadas: abonos **solo
en el POS** dentro del turno; el **cupo bloquea**; los abonos van **a la
cuenta y cubren primero lo más viejo**; clientes, cupo y plazo los
gestionan OWNER y ADMIN. Pedido adicional: el cliente de crédito tiene
correo y **cada venta a crédito se le envía por correo**.

## Decisiones

### 1. Clientes, cupo y plazo

- Los clientes son `third_parties` con `isCustomer`: `creditLimit`
  `Decimal(12,2)` (≥ 0; **0 = sin crédito**) y `creditDays` (0–365, 30 por
  defecto). Nombre y NIT siguen siendo únicos entre clientes y proveedores
  (la tabla es la misma; el mensaje dice "proveedor o cliente").
- Permiso `customers.manage` (OWNER, ADMIN) para `/clientes`. Crear con
  cupo y cambiar cupo o plazo queda en auditoría
  (`CUSTOMER_CREDIT_CHANGED`, sin valores).
- **No se archiva un cliente con saldo** (con el cliente bloqueado).

### 2. Crédito como método de pago del sistema

- `payment_methods.isCredit`: uno por empresa (índice parcial), nunca a la
  vez efectivo. Se crea **inactivo**: la empresa lo activa en Métodos de
  pago cuando empiece a vender fiado. Se renombra, activa y desactiva como
  los demás.
- Combinable con otros métodos (pago mixto); exige cliente, y un cliente
  solo va en una venta con parte a crédito.

### 3. Saldo calculado, no guardado

- **Saldo = ventas completadas (solo la parte pagada con Crédito) − abonos
  registrados.** Las anuladas no cuentan. No hay una columna de saldo que
  pueda desincronizarse.
- **Disponible = cupo − saldo**, nunca negativo.

### 4. Venta a crédito en el POS

- El POS ofrece Crédito si está activo: busca clientes activos con cupo
  (mínimo 2 letras), muestra su disponible y bloquea "Cobrar" si se pasa.
- En el servidor, el **cliente se bloquea `FOR UPDATE`** y el cupo se
  revisa con el saldo definitivo. Orden de bloqueo: turno → cliente →
  insumos → empresa (consecutivo). Dos ventas simultáneas del mismo cliente
  no pasan con el mismo disponible.
- **Anular una venta a crédito se bloquea si el saldo quedaría negativo**
  (sus abonos ya la cubrieron): primero se anula el abono. No hay saldo a
  favor.
- **Correo de la compra** (pedido, total, lo cargado a la cuenta, otros
  pagos, fecha límite, "Venta #N") al cliente con correo, con `after()`:
  no demora el cobro, nunca lo afecta y no se repite en un reintento. Sin
  registro de envío (solo log si falla).

### 5. Abonos en el POS

- `/pos/abonos`, en el turno abierto de quien cobra (`sales.charge`):
  busca clientes **con saldo** (aunque su cupo sea 0 o esté archivado),
  cualquier método activo menos Crédito, **nunca más que el saldo**,
  efectivo con recibido y cambio, nota opcional. Consecutivo "Abono #N"
  por empresa.
- Los abonos en **efectivo entran al esperado** del cierre (`expectedCash`)
  y aparecen en el cuadre, en la hoja impresa del cierre y en el reporte
  por correo. Los demás métodos no tocan la caja.
- `balanceAfter` guardado en el abono: el comprobante reimpreso y el correo
  muestran lo que quedó debiendo **al registrarlo**, no el saldo de hoy.
- Comprobante impreso opcional (80/58 mm) y correo al cliente con cada
  abono ("paz y salvo" si quedó en 0).
- **Anular un abono** solo desde el detalle del turno en el panel
  (`cash.void`), con motivo y con el turno abierto: el cierre ya guardó el
  esperado. La deuda vuelve, aunque supere el cupo.

### 6. Vencimiento, estado de cuenta y cartera

- **Fecha límite = día de la venta (en la zona de la empresa) + el plazo
  actual del cliente** (opción A del usuario). Sin migración; si se le dan
  más días a un cliente, sus vencidos desaparecen de inmediato. El correo
  de la compra usa el mismo cálculo (`creditDueDay`).
- **Vencido:** los abonos cubren las ventas de la más vieja a la más nueva;
  lo que queda sin cubrir de una venta cuya fecha límite ya pasó está
  vencido (el día de la fecha límite todavía no). Un solo cálculo puro
  (`services/credit-aging.ts`) para la ficha, la cartera y la alerta.
- **Ficha `/clientes/[id]`:** Debe, Vencido, Disponible, Cupo y plazo, y
  los movimientos (ventas a crédito y abonos, también anulados) con el
  saldo después de cada uno y el estado de cada venta (pagada, vence,
  vencida hace N días, falta $X).
- **Cartera en `/clientes`:** resumen (por cobrar, vencido, clientes) y
  pestaña **Deben**, de lo más vencido a lo menos; incluye archivados que
  deben.
- **Alerta** "Clientes con pagos vencidos" en "Pendientes"
  (`customers.manage`), no urgente: no frena la venta.

## Fuera de alcance

Intereses, estado de cuenta impreso o por correo, saldo a favor, venta a
crédito desde el panel, bloqueo de la venta por vencidos (solo bloquea el
cupo), cuentas por pagar, facturación electrónica (cuando llegue, los
comprobantes irán por correo a quien los pida).

## Consecuencias

- El negocio sabe quién le debe, cuánto, qué venció y cuánto puede seguir
  fiando; los cobros en efectivo cuadran con la caja.
- El saldo siempre es consistente con las ventas y los abonos (se
  calcula), a costa de calcularlo en cada consulta.

## Revisión de la fase

- Todas las acciones validan la sesión y el permiso con la empresa enviada
  (`customers.manage`, `sales.charge`, `cash.void`); las páginas exigen
  permiso en el servidor y los servicios lo vuelven a exigir. Datos
  filtrados por empresa; los clientes, abonos y ventas usan FK compuestas
  por empresa.
- Bloqueos del cliente en venta, abono, anulación y archivo; consecutivos
  al final de la transacción; correos escapados y enviados después de
  responder.
- **Corregido (revisión):** si un cliente pagaba todo, se archivaba y
  después se anulaba el abono, quedaba archivado con deuda: la cartera y la
  alerta la contaban, pero la pestaña "Deben" no lo mostraba. Ahora "Deben"
  incluye a los archivados que deben (con su insignia). Prueba nueva que
  fallaba antes del arreglo.

## Riesgos conocidos

- **Plazo actual:** cambiar el plazo de un cliente mueve la fecha límite de
  sus ventas pasadas; puede no coincidir con la del correo de la compra.
- **Saldo calculado:** la ficha, la cartera y la alerta del inicio suman
  todas las ventas a crédito y abonos de la empresa en cada carga. Medir
  cuando haya muchos clientes o años de historia.
- El buscador de abonos revisa los primeros 100 clientes que coinciden con
  lo escrito y muestra los que deben; con más coincidencias hay que
  escribir más letras.
- Los correos de crédito y abono no se registran ni se reenvían; si Resend
  falla, solo queda en el log. Con el plan gratuito (100 por día) compiten
  con los demás correos.
- Un cliente archivado puede volver a deber si se anula un abono; aparece
  en "Deben" y se le cobra desde el POS.
