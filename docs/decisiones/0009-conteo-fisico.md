# ADR 0009 — Conteo físico y consumo teórico vs. real

- **Estado:** aprobada
- **Fecha:** 2026-10-04
- **Fase:** 9 (conteo físico)

## Contexto

Con ventas (ADR 0007) cada venta descuenta el inventario por receta, y con
compras (ADR 0008) lo que entra tiene costo real. Faltaba comparar lo que
el sistema cree que hay con lo que hay de verdad: el sistema es para
controlar y medir lo gastado, y la diferencia entre el consumo teórico
(las recetas) y el real (lo que salió) es merma, porciones mal servidas,
recetas mal escritas o pérdidas.

## Decisiones

### 1. Alcance

Conteo por bodega en borrador, confirmación que corrige el inventario,
lista de confirmados, resultado teórico vs. real por insumo valorizado y
"Conteo #N" en el kardex. Fuera de esta fase: traslados entre bodegas,
conteos por categoría o programados, gráficas y el aviso por WhatsApp.

### 2. Decisiones del usuario

- **Saldo del sistema al confirmar**, no a una hora indicada: se cuenta
  sin ventas en curso y la pantalla lo advierte (con el número de turnos
  abiertos en la sucursal).
- **Conteo parcial:** se listan todos los insumos activos; los que quedan
  en blanco no se ajustan. El resultado de cada insumo se mide desde su
  último conteo en esa bodega.
- **Sin anulación:** un conteo confirmado es definitivo; se corrige con
  otro conteo o con un ajuste.
- **Saldo visible** mientras se registra (no es conteo ciego, a diferencia
  del cierre de caja).

### 3. Permiso

`inventory.manage` (OWNER y ADMIN) para todo: empezar, guardar, confirmar,
eliminar el borrador y ver los resultados. Sin permiso nuevo.

### 4. Modelo

- `inventory_counts` (borrador `DRAFT` sin número, `CONFIRMED` con
  consecutivo por empresa `companies.lastInventoryCountNumber`, bodega,
  quién y cuándo empezó y confirmó) e `inventory_count_lines` (un insumo
  una vez por conteo, la unidad que vio quien contó y lo contado ≥ 0, a 3
  decimales).
- **Un borrador por bodega** (índice parcial): empezar un conteo en una
  bodega que ya tiene uno lo retoma. Los borradores son de la empresa, no
  de quien los empezó, y se borran con sus líneas (no son documentos).
- Al confirmar, cada línea guarda lo que hace falta para su resultado sin
  recalcular después: saldo del sistema, diferencia (contado − sistema),
  costo unitario del insumo, inicio del período y lo contado entonces,
  vendido, comprado y ajustado del período. Reglas en SQL: datos de
  confirmación todos o ninguno, `difference = contado − sistema`, inicio
  del período ⇔ conteo anterior.
- Movimiento `COUNT` por la diferencia (solo si no es cero), enlazado al
  conteo (`stock_movements.inventoryCountId`, con CHECK del enlace). No
  cambia el costo promedio. Sirve también de **carga inicial**; contar 0
  de un insumo sin carga no crea saldo (sigue "sin carga inicial").

### 5. Confirmación y guardado por lotes

- La confirmación bloquea el conteo, la bodega (`FOR SHARE`, debe estar
  activa) y todos sus insumos en una consulta `FOR UPDATE` ordenada por id
  (el mismo orden que ventas y compras). Valida todo antes de escribir
  (devolver un error dentro de `$transaction` confirma lo ya escrito).
- Lee saldos, conteo anterior (`DISTINCT ON`) y sumas del período en pocas
  consultas, y escribe saldos (`INSERT … ON CONFLICT`), movimientos
  (`createMany`) y líneas (`UPDATE … FROM unnest`) de una vez. Por eso
  **no** usa `writeStockMovement`. Motivo: con la latencia a Supabase
  desde desarrollo (~0,3–0,8 s por consulta), una consulta por línea
  agotaba la transacción con decenas de insumos.
- Guardar el borrador también va por lotes (corregido en la revisión de
  la fase; ver abajo).
- La unidad mostrada viaja con lo contado: si el insumo cambió de unidad,
  no se guarda ni se confirma (`UNIT_CHANGED`). Un insumo archivado con
  algo contado se muestra marcado y hay que dejarlo en blanco.
- Lo contado acepta coma decimal.

### 6. Período y resultado

- La confirmación y sus movimientos llevan **la misma hora**
  (`confirmedAt`); el siguiente conteo de cada insumo en esa bodega suma
  los movimientos con `createdAt` posterior. Sin conteo anterior, desde el
  primer movimiento.
- Vendido = −(SALE + SALE_VOID) (consumo teórico de las recetas),
  comprado = PURCHASE + PURCHASE_VOID, ajustado = INITIAL + ADJUSTMENT.
- **Resultado por insumo** (`services/count-results.ts`): inicio = lo
  contado la vez anterior (o 0, y la carga inicial va en los ajustes);
  **consumo real = vendido − diferencia**, calculado con la diferencia
  guardada y no recalculando el saldo, así el detalle siempre cuadra con
  el kardex; **% sobre lo vendido** = diferencia ÷ vendido (negativo =
  faltó; sin porcentaje si no se vendió); **valor** = diferencia × costo
  al confirmar ("Sin costo" si el insumo no tenía).
- Totales: faltante, sobrante y neto valorizados; las líneas con
  diferencia y sin costo no suman y se avisa cuántas son.
- Montos y cantidades en decimal exacto; se redondean solo al mostrar.

### 7. Panel

- `/inventario/conteos`: "Nuevo conteo", "En curso" y confirmados por día
  de confirmación en la zona de la empresa (por defecto los **últimos 90
  días**: los conteos suelen ser mensuales), filtro por bodega e "Ir al
  conteo #N". Cada fila con insumos contados, con diferencia, quién
  confirmó y el valor neto (una sola consulta SQL suma todos los conteos
  de la lista).
- Detalle: borrador editable (funciona sin JS salvo la diferencia en vivo
  y el buscador) o, confirmado, el resumen y la tabla del resultado.
- "Registrar conteo" junto a "Imprimir existencias" en Bodegas e Insumos;
  la hoja impresa puede volver al conteo.
- Kardex: "Conteo #N" con enlace.

## Consecuencias

- El inventario se puede corregir con trazabilidad completa: cada
  diferencia es un movimiento enlazado a su conteo, con quién y cuándo.
- El costo de la merma queda medido por insumo y por conteo, con el costo
  de compra del momento.
- El primer conteo de un insumo no tiene período anterior: su resultado
  muestra la carga inicial en los ajustes y el consumo desde entonces.

## Revisión de la fase

- Todas las acciones validan sesión y permiso con la empresa enviada;
  todas las páginas exigen el permiso en el servidor; datos filtrados por
  empresa y FK compuestas.
- **Corregido:** guardar el borrador hacía una consulta por insumo dentro
  de una transacción con el límite por defecto de 5 s; con ~0,3 s por
  consulta a Supabase desde desarrollo, guardar más de unos 12 insumos
  contados fallaba (confirmar también guarda primero). Ahora reemplaza las
  líneas enviadas con dos consultas (`deleteMany` + `createMany`) y un
  insumo repetido en el formulario vale por su último valor. Prueba nueva
  con 41 insumos.
- **Corregido:** la lista de confirmados (y el `updatedAt` del saldo al
  confirmar) pasaban fechas a SQL directo como `timestamptz`, que
  PostgreSQL compara con la zona de su sesión. En Supabase (UTC) funcionaba;
  en la base local de pruebas (`America/Bogota`) el rango quedaba corrido
  5 horas. Ahora van como texto ISO a `timestamp(3)`, igual que las
  columnas. La prueba nueva (conteo a las 23:30 de Bogotá) fallaba antes
  del arreglo y pasa después.

## Riesgos conocidos

- **Venta que cruza la confirmación:** el período se corta por la hora de
  los movimientos (`createdAt`, con milisegundos). Una venta que empieza
  antes de confirmar y termina después podría quedar en el período
  equivocado: el "vendido" y el consumo real de ese conteo no la
  incluirían, aunque el saldo, la diferencia y el kardex sí son correctos.
  Por eso la pantalla pide contar sin ventas en curso.
- **Contar con ventas en curso:** lo vendido mientras se cuenta cambia el
  saldo del sistema, que se toma al confirmar; la diferencia saldría
  inflada. Solo se advierte.
- **Sin anulación:** un conteo mal hecho se corrige con otro conteo o un
  ajuste; el primero queda en el historial.
- **Costo nulo:** la diferencia de un insumo sin costo no se valoriza.
- **Confirmar en dev cambia el inventario real** de la empresa en esa base.
