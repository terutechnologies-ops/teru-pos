# ADR 0010 — Movimientos de caja (gastos, retiros e ingresos)

- **Estado:** aprobada
- **Fecha:** 2026-10-05
- **Fase:** 10 (movimientos de caja)

## Contexto

El turno de caja (ADR 0007) cuadra el efectivo con el fondo inicial y lo
cobrado en efectivo. En la operación real sale efectivo de la caja que no
es una venta (el domicilio, la pipeta de gas, el aseo, una compra menor),
se saca efectivo a la caja fuerte o se agrega sencillo. Sin registrarlo,
cada uno de esos casos aparecía como faltante o sobrante en el cierre, y
el gasto del negocio no quedaba medido.

## Decisiones

### 1. Alcance

Tres tipos de movimiento en el turno abierto: **gasto** (con categoría,
nota y foto opcional del recibo), **retiro** y **ingreso** (no cuentan
como gasto ni como venta). Cuentan en el efectivo esperado del cierre. En
el panel: revisión y anulación desde el detalle del turno, la hoja impresa
del cierre con los movimientos y la página Gastos con filtros y totales
por categoría.

Fuera de esta fase (aceptado por el usuario): compras pagadas desde la
caja (irán con cuentas por pagar; mientras tanto, gasto "Compras menores"
con el número de la compra en la nota), cuentas por pagar, presupuestos,
gráficas y que un administrador registre en el turno de otra persona.

### 2. Decisiones del usuario

- **Categorías de gasto configurables** por empresa, con cinco por defecto
  (Domicilios y transporte, Gas y servicios, Aseo, Compras menores, Otros)
  que crean el alta de empresa, el seed y la migración para las
  existentes.
- **Retiros e ingresos** además de gastos.
- **Anulan solo OWNER y ADMIN**, con motivo y mientras el turno siga
  abierto.
- **Foto opcional del recibo** en un bucket privado con enlaces
  temporales.
- La hoja del cierre lleva **totales y una línea por movimiento**; la
  página Gastos muestra **hoy** por defecto (como Ventas y Cierres).

### 3. Permisos

- Registrar: `sales.charge`, solo en el turno abierto propio (como una
  venta).
- Anular: `cash.void` (OWNER, ADMIN).
- Consultar en el panel (detalle del turno, página Gastos, recibos de
  cualquier turno): `cash.review`.
- Categorías de gasto: `expenses.manage` (OWNER, ADMIN), sin auditoría
  (como las categorías del catálogo).

### 4. Modelo

- `expense_categories` (nombre único por empresa sobre `lower(name)`,
  posición, activa). **Siempre queda al menos una activa:** desactivar y
  eliminar bloquean todas las categorías de la empresa (`FOR UPDATE`) y
  responden `LAST_ACTIVE`. Solo se elimina una categoría sin gastos; con
  gastos se desactiva.
- `cash_movements` (turno, tipo, monto, categoría, nota ≤ 200,
  `receiptPath`, quién y cuándo, estado `RECORDED` / `VOIDED` con quién,
  cuándo y por qué). FK compuestas por empresa. Reglas en SQL: monto > 0,
  categoría ⇔ gasto, foto solo en gastos, anulación completa.
- Un movimiento no se borra ni se edita: se anula (documento con
  trazabilidad, como ventas y compras). La anulación guarda quién, cuándo y
  por qué en la misma fila; sin auditoría aparte.

### 5. Efectivo esperado y concurrencia

- `expectedCash` = fondo + efectivo de ventas no anuladas + ingresos −
  gastos − retiros no anulados. Lo usan el cierre del POS, el del panel y
  el "Cómo va" de un turno abierto.
- Registrar toma el turno `FOR SHARE` (como una venta) y anular también:
  el cierre (`FOR UPDATE`) espera a que terminen y nada entra después.
  Anular usa `updateMany` sobre `RECORDED`: de dos anulaciones a la vez,
  solo una pasa.
- Con el turno cerrado ya no se registra ni se anula: el cierre guardó el
  esperado. El cuadre de un turno cerrado se reconstruye con el esperado
  guardado y los totales de los movimientos (las ventas en efectivo se
  derivan en el POS; el panel las lee de los pagos).

### 6. Recibos en almacenamiento privado

- Bucket privado `company-private` (además del público `company-assets`);
  `npm run storage:setup` crea los dos. `PrivateFileStorage` agrega
  `signedUrl` al adaptador de Supabase Storage (REST, sin SDK).
- La foto se reduce en el navegador como las de productos y se valida en
  el servidor (tamaño y tipo real) **antes** de registrar el gasto. Si lo
  único que falla es subirla, el gasto queda registrado sin foto y se
  avisa.
- Ruta `companies/{empresa}/receipts/{movimiento}-{uuid}.{ext}`.
- La página nunca recibe un enlace del archivo: `/[empresa]/recibos/[id]`
  (route handler) valida la sesión de la empresa y quién lo pide (dueño
  del turno o `cash.review`) y redirige (`no-store`) a un enlace firmado
  de **60 s**. Un recibo ajeno o inexistente da 404; si el almacenamiento
  no responde, 503.

### 7. Interfaz

- POS: "Gastos y retiros" (`/pos/caja`) con el formulario (tipo en
  tarjetas, monto con separador de miles, categoría y foto en gastos) y la
  lista del turno con sus totales. El cierre del POS muestra los totales
  sin el esperado (conteo ciego); el resultado del turno muestra el cuadre
  completo.
- Panel, detalle del turno (`/caja/[id]`): cuadre completo y sección
  "Gastos, retiros e ingresos" con recibo y "Anular" (motivo 3–200).
- Hoja impresa del cierre: sección de movimientos (hora, categoría o tipo,
  monto con signo; los anulados solo como número) y el cuadre con
  ingresos, gastos y retiros solo si los hubo.
- Página Gastos (`/gastos`, grupo Ventas): filtros por fechas del registro,
  "Mostrar" (todo, gastos, una categoría —también inactiva—, retiros o
  ingresos), cajero y sucursal; resumen de gastos por categoría con
  porcentaje, retiros e ingresos aparte y anulados fuera de los totales
  (el resumen no depende de "Mostrar"); lista de los 200 más recientes con
  enlace al turno y al recibo. Se anula solo desde el turno.
- `CashBreakdown`, `CashMovementList` y `CASH_MOVEMENT_KINDS` están en
  `components/cash/`: los comparten el POS y el panel.

## Consecuencias

- El faltante o sobrante del cierre ya no mezcla los gastos del día: cada
  salida de efectivo tiene su registro, su categoría y, si se quiere, su
  recibo.
- El gasto en efectivo queda medido por categoría, cajero y sucursal.
- Los retiros a la caja fuerte quedan registrados pero no se confunden con
  gasto.

## Revisión de la fase

- Todas las acciones validan sesión y permiso con la empresa enviada;
  todas las páginas exigen el permiso en el servidor; datos filtrados por
  empresa y FK compuestas; los recibos solo se sirven con enlace firmado
  tras validar a quien los pide.
- **Corregido (componente 4):** tras el componente 3, el cuadre del
  detalle del turno en el panel y el de la hoja impresa decían "fondo +
  efectivo de ventas = esperado", pero el esperado ya incluía los
  movimientos; con gastos no cuadraba.
- **Corregido (componente 4):** el filtro "Mostrar" leía los tipos de un
  objeto; `?ver=constructor` devolvía una propiedad heredada. Ahora es un
  `Map`.
- **Corregido (revisión):** si el almacenamiento fallaba al firmar el
  enlace, `/recibos/[id]` respondía con un error 500 genérico; ahora
  responde 503 con un mensaje y lo registra en el log.

## Riesgos conocidos

- **Movimiento olvidado:** un gasto que no se registra sigue saliendo como
  faltante del cierre. Solo el uso lo resuelve.
- **Anular después de cerrar:** no se puede; un movimiento mal registrado
  en un turno ya cerrado queda en el cuadre y se explica en la nota del
  cierre.
- **Recibos sin vencimiento propio:** los archivos del bucket privado no se
  borran (tampoco al anular el gasto). Si crecen, definir una política de
  retención.
- **Compras pagadas desde la caja** se registran como gasto "Compras
  menores": el inventario entra por la compra y el efectivo por el gasto,
  sin enlace entre ambos hasta que existan las cuentas por pagar.
- El bucket privado se crea por entorno con `storage:setup` (pendiente en
  la preparación para producción, junto con el bucket por entorno).
