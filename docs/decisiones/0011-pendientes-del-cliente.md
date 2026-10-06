# ADR 0011 — Pendientes del cliente: kardex, precio y Mi cuenta

- **Estado:** aprobada
- **Fecha:** 2026-10-05
- **Fase:** 11 (pendientes del cliente)

## Contexto

La hoja de ruta antes de desplegar (aprobada el 2026-10-04) pedía cerrar
tres pendientes que el cliente había pedido durante el uso de prueba:
ver el número de la venta en el kardex, escribir el precio de los
productos con separador de miles y que cada persona pueda cambiar su
propia contraseña sin depender del correo de recuperación (todavía sin
proveedor).

## Decisiones

### 1. "Venta #N" en el kardex

- El kardex del insumo muestra "Venta #N" y "Anulación de venta #N", como
  ya mostraba "Compra #N" y "Conteo #N". `listStockMovements` trae
  `sale { id, number }`.
- El número enlaza al detalle de la venta solo si quien mira tiene
  `sales.view` (`canViewSales`); si no, se ve sin enlace. Un solo
  componente (`DocumentNumber`) arma el número de los tres documentos.

### 2. Precio con separador de miles

- `priceSchema` pasa de `moneySchema` (punto decimal) a `amountSchema`: el
  precio se escribe como los demás montos del sistema (POS, compras,
  cierre), con **punto de miles y coma decimal** ("16.500", "4,50"); sin
  separadores también vale.
- El formulario de producto usa `MoneyField` (tamaño `form`, del alto de
  los demás campos) y al editar muestra el precio guardado ya formateado
  (`amountInputValue`). Se quitó la vista previa "Se verá como", que
  sobraba.
- **Cambio de lectura:** en monedas con centavos, "4.5" ahora es 45 (antes
  4,50). Es el mismo criterio del resto de montos; en COP no cambia nada
  en la práctica.
- El costo de referencia de los insumos no cambia: usa hasta 4 decimales
  con punto y no es un monto de caja.

### 3. Mi cuenta: cambiar la propia contraseña

- Páginas `/[empresa]/cuenta` (panel, cualquier rol con sesión) y
  `/[empresa]/pos/cuenta` (POS: el cajero no entra al panel), con el mismo
  contenido: datos de la persona en solo lectura y el cambio de
  contraseña. Enlaces en el pie del menú del panel y en la barra del POS.
- Pide la contraseña actual, la nueva (las reglas de siempre: 8–200,
  compartidas en `newPasswordSchema`) y su confirmación. La nueva debe ser
  distinta de la actual.
- **Límite de intentos:** 5 contraseñas actuales incorrectas en 15 minutos
  bloquean el cambio (cuentan los fallos posteriores al último cambio
  exitoso). Con una sesión abierta no se debe poder adivinar la
  contraseña.
- Al cambiarla, en una transacción: nuevo hash, **se cierran las demás
  sesiones** de la persona (la actual sigue) y se invalidan los enlaces de
  recuperación pendientes. El hash se calcula fuera de la transacción.
- Auditoría: `PASSWORD_CHANGED`, `PASSWORD_CHANGE_FAILED` y
  `PASSWORD_CHANGE_BLOCKED`, sin contraseñas.
- Funciona sin JS; las contraseñas nunca vuelven al navegador en la
  respuesta.

## Consecuencias

- El kardex lleva al documento que originó cada movimiento de venta,
  compra o conteo.
- Todos los montos de dinero se escriben igual en todo el sistema.
- Cada persona puede cambiar su contraseña sin correo, y si sospecha que
  alguien más la conoce, al cambiarla lo saca de sus otras sesiones.

## Revisión de la fase

- Las páginas nuevas exigen sesión de la empresa (y `sales.charge` en el
  POS); la acción valida la sesión con la empresa enviada; el servicio
  busca a la persona por id **y** empresa, activa.
- **Corregido (revisión):** el cambio de contraseña no invalidaba un enlace
  de recuperación pedido antes; ese enlace seguía sirviendo hasta 20
  minutos después del cambio. Ahora se marcan como usados en la misma
  transacción, como ya hacía el restablecimiento. Prueba ampliada.
- Ningún script ni el seed usan el esquema del precio (crean productos por
  la capa de datos, con el texto decimal ya validado).

## Riesgos conocidos

- Con la configuración inicial pendiente, el POS muestra solo el aviso y
  el cajero no ve "Mi cuenta" hasta que el propietario termine.
- Los datos personales (nombre, correo) no se editan desde "Mi cuenta"
  ni desde Equipo; si hace falta, será otro componente.
- Los fallos de login anteriores a un cambio de contraseña siguen
  contando para el bloqueo del login durante su ventana (el
  restablecimiento sí los reinicia).
