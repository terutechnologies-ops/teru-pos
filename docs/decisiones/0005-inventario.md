# ADR 0005 — Inventario

- **Estado:** aprobada
- **Fecha:** 2026-09-29
- **Fase:** 5 (inventario)

## Contexto

Segunda capa del orden acordado en el ADR 0004 (catálogo → inventario →
recetas y costos → ventas/POS). Las reglas del proyecto piden inventario
multibodega, trazabilidad de todo movimiento de stock, documentos
inmutables y consistencia transaccional. Las recetas, los costos y las
ventas todavía no existen, así que esta fase prepara el terreno sin
adelantarlos.

## Decisiones

### 1. Alcance

Insumos, unidades de medida, bodegas, carga inicial, ajustes y kardex.
Fuera de esta fase: costos, recetas, compras, traslados entre bodegas,
lotes, vencimientos, alertas y conteo físico. El enlace producto ↔ insumo
(reventa, p. ej. una gaseosa) va con las recetas.

### 2. Unidades fijas en código

`g`, `kg`, `ml`, `l` y `und` (`lib/units.ts`, enum `StockUnit` en la BD).
Dentro de una familia (masa, volumen, conteo) la conversión es un
desplazamiento decimal exacto (`convertQuantity`); entre familias no se
convierte. Sin unidades por empresa: se agregan a la constante cuando un
caso real lo pida. La unidad de un insumo solo cambia mientras no tenga
movimientos (`UNIT_LOCKED`), porque sus cantidades quedarían expresadas en
otra unidad.

### 3. Bodegas por sucursal

- Cada sucursal tiene una **bodega principal**, creada con ella (alta de
  empresa, seed y migración para las existentes). Índice parcial: una sola
  principal por sucursal.
- La principal no se desactiva. **Ninguna bodega con existencias se
  desactiva** (su saldo quedaría oculto y sin poder moverse). No se borran.
- Solo se crean en sucursales activas; FK compuesta `(companyId, branchId)`.

### 4. Insumos

Nombre (único por empresa sin distinguir mayúsculas), unidad, stock mínimo
opcional y archivado. **No se archiva un insumo con existencias.** "Bajo
mínimo" compara el total de todas las bodegas con el mínimo.

### 5. Saldos y movimientos

- `stock_levels` (saldo por bodega e insumo) y `stock_movements`
  (cantidad con signo, `balanceAfter`, motivo, usuario, fecha). Tipos:
  `INITIAL` (una sola vez por bodega e insumo) y `ADJUSTMENT` (entrada o
  salida, **motivo obligatorio** de 3 a 200 caracteres).
- **Consistencia:** el movimiento y el saldo se escriben en la misma
  transacción. El insumo se bloquea con `SELECT … FOR UPDATE` (serializa
  sus movimientos, el cambio de unidad y el archivado) y la bodega con
  `FOR SHARE` (los movimientos corren en paralelo, pero no mientras se
  desactiva, que la toma `FOR UPDATE`).
- **Saldo nunca negativo:** lo valida la transacción y lo garantiza un
  `CHECK` en la BD. Para las ventas se decidirá en su fase si se permite.
- **Inmutables:** la capa de datos no expone edición ni borrado de
  movimientos; se corrige con otro ajuste. Sin trigger en la BD (la
  limpieza de pruebas borra).
- Reglas en SQL: nombres únicos sobre `lower(name)`, cantidad ≠ 0, carga
  inicial > 0, saldo y `balanceAfter` ≥ 0, mínimo ≥ 0. FK compuestas
  `(companyId, …)` a sucursal, bodega e insumo.
- Cantidades `Decimal(14,3)`, validadas y normalizadas como texto, sin
  pasar por números de punto flotante.

### 6. Ficha del insumo y kardex

`/inventario/insumos/[id]` muestra existencias por bodega activa
(agrupadas por sucursal si hay más de una), con "Carga inicial" o
"Ajustar" por fila, y el kardex (últimos 100, filtro por bodega). La
edición está en `/[id]/editar`. Todo funciona sin JS.

### 7. Hora del negocio

Las fechas se guardan en UTC y se muestran en `America/Bogota`
(`BUSINESS_TIME_ZONE`), igual para todas las empresas por ahora. La zona
por empresa llegará con caja y ventas, que cortan por día; el cambio solo
toca el formateo, no los datos.

### 8. Permiso y auditoría

`inventory.manage` para OWNER y ADMIN; menú "Inventario" con Insumos y
Bodegas. Bodegas e insumos no se auditan (como las categorías); los
movimientos son su propio registro.

### 9. Componentes compartidos

Para no seguir copiando piezas de interfaz entre módulos, se crearon
`RowActionButton`, `RenameForm`, `EmptyState`, `StatusTabs` y
`FormField` en `components/shared/`. En el cierre de la fase, categorías,
productos y equipo pasaron a usarlos (se eliminaron sus copias locales);
`RowActionButton` ganó la variante `destructive` para el equipo.

## Consecuencias

- Las recetas podrán descontar insumos con `recordStockMovement` y nuevos
  tipos de movimiento, sin cambiar el modelo.
- Compras y traslados serán nuevos tipos de movimiento con el mismo
  bloqueo y las mismas reglas de saldo.

## Riesgos conocidos

- **Sin costos:** el kardex solo lleva cantidades. Los costos (promedio
  ponderado u otro) llegan en su fase y necesitarán columnas nuevas.
- **Sin JS y desde una pestaña vieja** (el formulario ya no existe en la
  página, p. ej. segunda carga inicial o insumo recién archivado), el
  servidor rechaza el movimiento pero el mensaje no se ve. Con JS sí.
- **Zona horaria fija** (`America/Bogota`) para todas las empresas.
- **Kardex limitado a 100 movimientos** y lista de insumos sin paginación.
- **Transacciones con límite de 20 s** por la latencia a Supabase desde
  fuera de sa-east-1; en producción, la app debe estar en la misma región.
- **Inmutabilidad solo en el código:** un acceso directo a la BD podría
  modificar movimientos.
