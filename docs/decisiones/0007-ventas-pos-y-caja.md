# ADR 0007 — Ventas, POS y caja

- **Estado:** aprobada
- **Fecha:** 2026-10-02
- **Fase:** 7 (ventas/POS)

## Contexto

Última capa del orden acordado en el ADR 0004 (catálogo → inventario →
recetas y costos → ventas/POS). El sistema es para **controlar y medir lo
gastado**: cada venta debe descontar el inventario según la receta y cada
turno de caja debe poder cuadrarse. Todavía no existe Compras (fase 8), así
que los saldos de inventario pueden quedar cortos frente a lo vendido.

## Decisiones

### 1. Alcance

Venta de **mostrador**: se arma el pedido y se cobra en el momento. Turno
de caja por persona, POS oscuro, ventas y cierres en el panel, alertas de
configuración e inventario y hojas impresas. Fuera de esta fase: mesas y
cuentas abiertas, domicilios, adiciones, descuentos, propinas, impuestos,
factura electrónica, cliente en la venta, gastos de caja, reportes con
gráficas y la impresión ESC/POS directa.

### 2. Roles y permisos

- Rol nuevo **CASHIER** ("Cajero"): solo `sales.charge` (vender y manejar
  su propio turno). Quien solo tiene el POS entra directo a `/pos`.
- OWNER y ADMIN: `sales.charge`, `sales.view`, `sales.void`, `cash.review`,
  `cash.close` (cerrar el turno de otra persona) y `payments.manage`.
- STAFF sigue sin permisos (queda para cocina y meseros).

### 3. Turno de caja

- Un turno abierto por persona (índice parcial), en una sucursal, con
  fondo inicial. Se cierra contando el efectivo.
- **Conteo ciego:** el cajero no ve el esperado hasta cerrar. Esperado =
  fondo + efectivo cobrado en ventas no anuladas; diferencia = contado −
  esperado (faltante o sobrante).
- Bloqueos: las ventas y anulaciones toman el turno `FOR SHARE` y el
  cierre `FOR UPDATE`; ninguna venta entra en un turno cerrado.
- Un turno abierto de otro día obliga a cerrarlo antes de seguir
  vendiendo. Un administrador puede cerrar el turno olvidado de otra
  persona (`closedById`, motivo obligatorio por CHECK); el inicio del panel
  lo avisa.

### 4. Venta

- Consecutivo por empresa **sin huecos** (`companies.lastSaleNumber`,
  `UPDATE … RETURNING` al final de la transacción).
- En una sola transacción: valida turno, productos y pagos; guarda líneas
  con el precio del momento; descuenta la receta de la **bodega principal
  de la sucursal del turno**, sumando por insumo, convirtiendo a su unidad
  y bloqueando los insumos en orden fijo.
- **Stock negativo permitido:** la venta no se frena por inventario; el
  saldo queda negativo y se avisa. Cantidades de inventario a 6 decimales
  (0,5 g en un insumo en kg).
- **Un producto sin receta no se vende** (`NO_RECIPE`): sin receta no hay
  control de lo gastado.
- **Pago mixto**, un pago por método; los métodos se configuran por
  empresa y hay un solo efectivo. En efectivo se escribe lo recibido: se
  aplica hasta lo que falta y lo demás es cambio (`tendered`).
- **Idempotencia:** cada pedido lleva una clave (`clientKey`, única por
  empresa). Si el cobro se reintenta, el servidor devuelve la venta ya
  registrada en lugar de crear otra.
- El pedido vive en el navegador (`localStorage`, por empresa, persona y
  turno) hasta cobrar. **La pantalla de venta requiere JavaScript**
  (excepción aprobada).
- **Anulación** por estado (`VOIDED`, quién, cuándo y motivo), solo con el
  turno todavía abierto: devuelve el inventario (`SALE_VOID`) y deja de
  contar en el efectivo esperado. Las ventas no se editan ni se borran.

### 5. Datos de la empresa

- **Zona horaria por empresa** (`companies.timeZone`, lista cerrada en
  código). Define el "día" de ventas, turnos y filtros; las fechas siguen
  en UTC.
- **Moneda bloqueada** cuando la empresa tiene ventas.

### 6. Panel

- **Ventas:** lista por rango de días en la zona de la empresa, cajero,
  sucursal y estado; resumen por método de pago; detalle con el
  inventario descontado y la anulación.
- **Cierres de caja:** turnos abiertos y cerrados con su cuadre,
  faltantes y sobrantes del rango y el cierre del turno olvidado. Sin marca
  de "revisado" por ahora.
- **Alertas** en el inicio: productos sin receta o con costo incompleto,
  insumos con saldo negativo, sin carga inicial o bajo mínimo, y turnos
  abiertos de días anteriores. Cada una enlaza a la lista filtrada.

### 7. Impresión

- Por el navegador, en la impresora térmica de la caja (80 o 58 mm):
  comanda de cocina, soporte de venta (no es factura electrónica), cierre
  de turno y hoja de existencias (también en carta). Sin diálogo con
  Chrome `--kiosk-printing`; el cajón, por el driver.
- **Una sola impresora**, en caja: todos los productos van en la comanda.
  Dos impresoras o comanda por categoría necesitan un agente local (QZ
  Tray o similar): después.
- El POS imprime la comanda al cobrar en un marco invisible. El ancho del
  papel y la comanda automática son ajustes **del equipo** (navegador),
  no de la empresa.
- El cajero reimprime comanda y soporte de su turno abierto y el cierre
  de su último turno; el administrador, cualquiera desde el panel.

## Consecuencias

- Cada venta deja rastro en el kardex (`SALE` / `SALE_VOID`) con la venta
  que lo causó; el consumo teórico ya se puede comparar con un conteo
  físico (fase 9).
- Compras (fase 8) debe registrar las entradas con costo real: es la
  causa principal de los saldos negativos.

## Riesgos conocidos

- **Saldos negativos** mientras no exista Compras o no se hagan ajustes.
- **Respuesta perdida y pedido cambiado:** si el cajero cambia el pedido
  antes de reintentar con la misma clave, recibe la venta original (el POS
  lo avisa con su total).
- **Ajustes de impresión por navegador:** si se borran los datos del
  navegador vuelven a 80 mm con comanda automática.
- **Comanda automática:** si la sesión venció o no hay red, la comanda no
  sale y el POS no lo avisa; se reimprime desde "Venta #N".
- **Mínimo por insumo, no por bodega:** con varias bodegas, "Bajo mínimo"
  compara el total de todas.
- **Sin marca de revisado** en los cierres de caja.
