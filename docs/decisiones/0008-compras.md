# ADR 0008 — Compras

- **Estado:** aprobada
- **Fecha:** 2026-10-03
- **Fase:** 8 (compras)

## Contexto

Con ventas (ADR 0007) cada venta descuenta el inventario por receta, pero
las entradas solo podían registrarse como carga inicial o ajuste manual, y
el costo de cada insumo era un costo de referencia escrito a mano (ADR
0006). Eso dejaba saldos negativos y costos desactualizados. Compras
registra lo que entra con lo que realmente se pagó.

## Decisiones

### 1. Alcance

Proveedores, compra en borrador, confirmación (entra al inventario y
actualiza el costo), lista, detalle y anulación. Fuera de esta fase:
pagos y cuentas por pagar, gastos de caja, impuestos desglosados,
devoluciones parciales, órdenes de compra, clientes en terceros y el aviso
por WhatsApp de lo que falta.

### 2. Terceros unificados

- Tabla única `third_parties` con los papeles `isSupplier` e `isCustomer`
  (al menos uno, por CHECK): cuando lleguen los clientes se agregan en la
  misma tabla, sin duplicar a quien es ambas cosas.
- Nombre único (sin distinguir mayúsculas) y NIT único por empresa, en
  SQL. Los errores se marcan en su campo según el índice que falló.
- No se borran: se **archivan**. Un proveedor archivado no se elige en
  compras nuevas; las anteriores lo conservan.
- Sin auditoría: no mueven dinero ni existencias.

### 3. Permiso

`purchases.manage` (OWNER y ADMIN) para proveedores, compras y anulación.
No hay permiso aparte para anular: a diferencia de ventas, nadie compra
sin poder anular.

### 4. Borrador y confirmación

- La compra nace en **borrador** (`DRAFT`, sin número): proveedor activo,
  bodega activa, día de la compra (no futuro, sin hora) y factura
  opcional. Los borradores son de la empresa, no de quien los creó, y se
  borran con sus líneas (no son documentos).
- Cada línea: un insumo (una vez por compra), cantidad en cualquier unidad
  de su familia y **lo pagado por la línea, con impuestos**. La pantalla
  muestra el costo por unidad del insumo que resulta.
- **Confirmar**, en una transacción: bloquea la compra, la bodega
  (`FOR SHARE`) y los insumos en orden; **valida todo antes de escribir**
  (devolver un error dentro de `$transaction` confirma lo ya escrito);
  entra cada línea a la bodega (`PURCHASE`), actualiza el costo y asigna
  el consecutivo por empresa al final (`companies.lastPurchaseNumber`,
  sin huecos). Confirmada no cambia.

### 5. Costo promedio ponderado

- Al confirmar: `(existencia × costo actual + pagado) / (existencia +
  cantidad)`, con la existencia total del insumo (todas las bodegas), a 4
  decimales. Sin costo previo o con existencia total ≤ 0, toma el de la
  compra.
- El cambio de costo **no se audita aparte**: la compra guarda quién y
  cuándo la confirmó, y el kardex enlaza cada movimiento con "Compra #N".
- El costo sigue siendo editable a mano en la ficha del insumo.

### 6. Anulación

- Por estado (`VOIDED`, quién, cuándo y motivo), sin límite de tiempo (no
  toca la caja). Saca de la bodega lo que la compra entró
  (`PURCHASE_VOID`); el saldo **puede quedar negativo** si ya se consumió,
  como con las ventas.
- **No recalcula el costo promedio**: deshacer un promedio exige conocer
  todo lo que pasó después. La pantalla lo advierte y sugiere corregirlo
  en la ficha del insumo.
- La bodega se toma `FOR SHARE` y debe estar activa: una bodega inactiva
  no puede quedar con saldo, y desactivarla exige saldo 0 con
  `FOR UPDATE` (corregido en la revisión de la fase; ver abajo).

### 7. Panel

- **Compras:** borradores arriba; compras confirmadas y anuladas por día
  de la compra (por defecto los **últimos 30 días**: son menos frecuentes
  que las ventas), proveedor (también archivados con compras), estado y
  bodega; resumen de lo comprado y lo anulado; ir a la compra por número.
- **Detalle:** factura, insumos con su costo resultante, inventario que
  movió y, si se anuló, quién, cuándo y por qué.
- El menú marca solo la sección de ruta más específica (Compras y
  Proveedores comparten el prefijo `/compras`).

## Consecuencias

- Las entradas tienen costo real y trazabilidad: cada movimiento de compra
  apunta a su compra. Los saldos negativos que dejaban las ventas se
  corrigen comprando, no ajustando.
- Un insumo sin carga inicial deja de aparecer como tal tras su primera
  compra; el borrador lo advierte (la existencia anterior no se conocía).
- El conteo físico y el consumo teórico contra el real (fase 9) ya pueden
  valorizarse con costos de compra.

## Revisión de la fase

- Todas las acciones validan sesión y permiso con la empresa enviada;
  todas las páginas exigen el permiso en el servidor; datos filtrados por
  empresa y FK compuestas.
- **Corregido:** anular no tomaba la bodega ni revisaba que estuviera
  activa. Si la existencia de una compra hecha en una bodega secundaria se
  consumía hasta 0, la bodega se podía desactivar y la anulación la dejaba
  **inactiva con saldo negativo** (también en una carrera entre anular y
  desactivar). Ahora la anulación la bloquea `FOR SHARE` y rechaza si está
  inactiva. Pruebas nuevas (incluida la carrera) fallaban antes del
  arreglo y pasan después.

## Riesgos conocidos

- **Anular no recalcula el costo:** si la compra anulada movió el
  promedio, queda así hasta que alguien lo corrija en la ficha.
- **Borrador con proveedor archivado:** se puede confirmar (el proveedor
  ya estaba elegido); para cambiar sus datos de factura hay que elegir
  otro proveedor o restaurarlo.
- **Insumo sin carga inicial:** la compra se suma a una existencia
  desconocida; solo se avisa.
- **Mensajes de duplicado** dicen "proveedor" aunque el índice es de
  terceros: revisarlos cuando lleguen los clientes.
