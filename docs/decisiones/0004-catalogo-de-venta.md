# ADR 0004 — Catálogo de venta

- **Estado:** aprobada
- **Fecha:** 2026-09-27
- **Fase:** 4 (catálogo de venta)

## Contexto

El primer módulo de negocio. La referencia visual del asistente proponía
producto con receta, insumos con stock, costos, márgenes e impuestos. Las
reglas del proyecto exigen trazabilidad de todo movimiento de stock, así
que meter recetas ahora arrastraría el inventario completo.

## Decisiones

### 1. Construcción por capas

Catálogo de venta (esta fase) → inventario (insumos, unidades, bodegas,
movimientos) → recetas y costos → ventas/POS. Cada capa es útil sola.
Fuera de esta fase: insumos, recetas, costos, stock, impuestos, precios por
sucursal, combos y opciones o adiciones (se diseñan con el POS).

### 2. Modelo

- `product_categories`: nombre, `position` (orden en el POS), activa.
- `products`: categoría obligatoria, nombre, descripción, precio, foto,
  archivado y agotado.
- **Un precio por producto** (precio final al público). Las listas de
  precios se agregan cuando haya un caso real.
- Reglas en la base de datos, no solo en el código:
  - Nombre único por empresa sin distinguir mayúsculas (índice sobre
    `lower(name)`, solo en SQL).
  - FK compuesta `products(companyId, categoryId)` →
    `product_categories(companyId, id)`: un producto no puede usar una
    categoría de otra empresa.
  - `CHECK (price >= 0)`.
  - Una categoría con productos (aun archivados) no se puede borrar.
- **Productos que no se borran:** se archivan, porque las ventas los
  referenciarán. Agotado ≠ archivado: el agotado sigue en el catálogo.
- Una categoría inactiva no recibe productos nuevos; los que ya tiene se
  pueden seguir editando.

### 3. Precio

`Decimal(12,2)`. Se escribe en un campo numérico (`16500`) con una vista
previa formateada ("$ 16.500"), porque "16.500" es ambiguo. Los decimales
dependen de la moneda de la empresa (`currencyDecimals`): COP sin
centavos, USD/MXN/EUR dos. El valor se normaliza como texto, sin pasar por
números de punto flotante.

### 4. Permiso

`catalog.manage` para OWNER y ADMIN. Menú: grupo "Catálogo" con Productos
y Categorías.

### 5. Auditoría con el elemento afectado

`auth_audit_logs` ganó `targetType` y `targetId`. Eventos de productos
(target `PRODUCT`): creado, editado (solo si algo cambió), cambio de precio
(aparte, para filtrarlo), archivado, restaurado, disponibilidad y foto. Las
categorías no se auditan (bajo impacto).

### 6. Fotos

- Se reutiliza el almacenamiento de archivos (ADR 0003) y la validación de
  imágenes, ahora compartida con el logo (`lib/images.ts`,
  `services/images.ts`).
- **Reducción en el navegador:** antes de subir, la imagen se lleva a
  1200 px y se vuelve a codificar (WebP → PNG → JPEG). Así una foto de
  celular cabe en 1 MB y pierde sus metadatos (ubicación GPS). Sin
  librerías nuevas; el servidor vuelve a validar todo. Aplica también al
  logo.
- La foto se puede subir al crear el producto (se valida antes de crearlo)
  o después, desde su página.

## Consecuencias

- El POS podrá mostrar categorías en su orden, productos disponibles con
  precio y foto, y bloquear los agotados.
- Inventario y recetas se enlazarán a `products` sin cambiar este modelo.

## Riesgos conocidos

- **Cambio de moneda:** los precios no se convierten si la empresa cambia
  de moneda con productos cargados (ya anotado en el ADR 0003).
- **Sin JS**, la imagen se sube tal cual: debe pesar menos de 1 MB y
  conserva sus metadatos.
- **HEIC (iPhone):** algunos navegadores no pueden reducirla; el servidor
  la rechaza con un mensaje claro.
- **Reordenar categorías** renumera todas en una transacción: con alta
  latencia a la BD (desarrollo fuera de sa-east-1) tarda unos segundos.
- **Sin paginación** en la lista de productos: suficiente para cientos de
  productos; revisar si una empresa llega a miles.
- **Nombre de la tabla de auditoría:** `auth_audit_logs` ya registra
  eventos de negocio. Renombrarla cuando exista un módulo de auditoría.
