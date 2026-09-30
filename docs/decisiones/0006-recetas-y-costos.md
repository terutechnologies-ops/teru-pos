# ADR 0006 — Recetas y costos

- **Estado:** aprobada
- **Fecha:** 2026-09-29
- **Fase:** 6 (recetas y costos)

## Contexto

Tercera capa del orden acordado en el ADR 0004 (catálogo → inventario →
recetas y costos → ventas/POS). La referencia visual del asistente
mostraba costo unitario de compra, receta del producto (BOM), costo y
margen, sub-recetas y merma. Todavía no existe el módulo de compras, que
es la fuente natural del costo real de los insumos.

## Decisiones

### 1. Alcance

Costo de referencia de los insumos, receta simple por producto y costo y
margen calculados. Fuera de esta fase: costo promedio ponderado (llega con
Compras), sub-recetas o pre-elaborados, merma, descuento de inventario al
vender (fase de ventas) y costos por sucursal.

### 2. Costo de referencia del insumo

- `supplies.unitCost Decimal(14,4)`, opcional, por unidad del insumo y en
  la moneda de la empresa. Cuatro decimales en cualquier moneda: un gramo
  en COP puede costar 3,25. `CHECK (unitCost >= 0)`.
- Lo escribe una persona (OWNER o ADMIN, `inventory.manage`) hasta que
  Compras lo calcule.
- **Historial solo en auditoría:** `SUPPLY_COST_CHANGED` con el insumo
  (quién y cuándo, sin valores, como el precio de los productos). Se
  registra al crear con costo y en cada cambio, también al quitarlo. El
  historial con valores llegará con las compras.

### 3. Receta

- `product_recipe_items`: producto, insumo, cantidad (`Decimal(14,3)`,
  `CHECK > 0`) y unidad. Cantidades **por unidad vendida**. Un producto de
  reventa (una gaseosa) es una receta de 1 und de su insumo, con lo que
  queda resuelto el enlace producto ↔ insumo pendiente de la fase 5.
- La línea guarda su propia unidad, de la **familia** del insumo (120 g de
  un insumo que se lleva en kg). La capa de datos lo valida con el insumo
  bloqueado (`lockSupply`), y `updateSupply` no deja cambiar a otra familia
  la unidad de un insumo usado en recetas (`UNIT_IN_RECIPES`).
- Un insumo aparece una vez por receta; FK compuestas por empresa a
  producto e insumo; un insumo archivado no se agrega, pero sus líneas se
  pueden ajustar o quitar.
- Las líneas son configuración, no documentos: quitar una la borra. Cada
  cambio se audita sobre el producto (`PRODUCT_RECIPE_CHANGED`) porque
  afecta su costo.
- Permiso `catalog.manage`. Página propia `/catalogo/productos/[id]/receta`
  con pestañas "Datos" y "Receta". Funciona sin JS; con JS el formulario
  preselecciona la unidad del insumo y limita las de su familia.

### 4. Costo y margen

- Costo de una línea = cantidad convertida a la unidad del insumo × costo
  de referencia; costo del producto = suma de las líneas. Decimal exacto;
  se redondea solo al mostrar (`services/costing.ts`).
- Margen = precio − costo, y porcentaje sobre el precio de venta (un
  decimal; sin porcentaje si el precio es 0).
- **Costo incompleto:** si algún insumo no tiene costo se muestra el costo
  parcial con cuántos faltan y **no se muestra margen**, porque sería
  engañoso.
- Se muestra en la receta (precio, costo y margen; costo por línea) y en
  la lista de productos. Margen negativo en rojo.
- Solo OWNER y ADMIN ven costos: el personal no tiene acceso al catálogo
  ni al inventario.

## Consecuencias

- Las ventas podrán descontar inventario con las líneas de la receta,
  convirtiendo a la unidad del insumo con la misma lógica.
- Cuando exista Compras, `unitCost` pasará a calcularse (promedio
  ponderado u otro método) sin cambiar recetas ni el cálculo del margen.

## Riesgos conocidos

- **Costo desactualizado:** el costo de referencia depende de que alguien
  lo mantenga al día.
- **Cambio de unidad dentro de la familia:** un insumo sin movimientos
  puede pasar de kg a g; si no se corrige también su costo (que es por
  unidad), el costo de las recetas queda multiplicado o dividido por 1000.
  El formulario muestra "Costo por g" al cambiar la unidad, pero no lo
  impide.
- **Cambio de moneda** de la empresa: ni precios ni costos se convierten
  (ya anotado en los ADR 0003 y 0004).
- **Sin JS y desde una pestaña vieja**, el rechazo de una acción de la
  receta no muestra mensaje (misma limitación de la fase 5).
- **Sin historial de costos con valores** hasta el módulo de compras.
