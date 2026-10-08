# Teru POS

Plataforma de gestión multiempresa de TERU (ventas, inventario, caja, etc.).
Cada negocio es una empresa cliente con su propia URL; la arepería
**Su Arepa** es la primera, no el modelo del sistema.

**Estado:** fase 11 cerrada (autenticación del personal, configuración
inicial de la empresa, panel con menú por rol, configuración de negocio y
equipo, logo, catálogo de venta con categorías y productos con precio y
foto, inventario con insumos, bodegas, carga inicial, ajustes y kardex,
recetas con costo y margen, y ventas de mostrador: POS con turno de caja,
pago mixto y descuento de inventario por receta, ventas y cierres de caja
en el panel, alertas y hojas impresas, y compras: proveedores, compra en
borrador que al confirmarse entra al inventario con costo promedio
ponderado, y anulación; y conteo físico por bodega: borrador, confirmación
que corrige el inventario y resultado teórico vs. real valorizado; y
movimientos de caja: gastos con categoría y foto del recibo, retiros e
ingresos en el turno, con su revisión, anulación y totales en el panel;
y "Mi cuenta" para cambiar la propia contraseña).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript estricto
- PostgreSQL (Supabase) + Prisma 6
- Tailwind CSS 4 + shadcn/ui
- Vitest para pruebas
- Docker (imagen de la app y Postgres local opcional)

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completar DATABASE_URL, DIRECT_URL y APP_URL
npm run db:migrate:deploy # aplica las migraciones
npm run db:seed           # crea la empresa su-arepa y su OWNER (ver abajo)
npm run storage:setup     # crea los buckets de archivos (requiere SUPABASE_*)
npm run dev
```

- Inicio: `http://localhost:3000/` (buscador "Ingresa a tu empresa").
- Login del personal: `http://localhost:3000/<slug-empresa>/login`
  (ej. `/su-arepa/login`).
- Mientras la empresa no termine su configuración, el propietario entra al
  asistente `/<slug-empresa>/configuracion-inicial` (Negocio → Equipo →
  Confirmar).
- Panel `/<slug-empresa>`: menú lateral según el rol. Ventas > Vender,
  Ventas, Cierres de caja y Gastos, Compras > Compras y Proveedores, Catálogo >
  Productos y Categorías, Inventario > Insumos, Bodegas y Conteos
  (propietario y administrador), Configuración > Negocio
  (propietario), Equipo, Métodos de pago y Categorías de gasto
  (propietario y administrador).
  El inicio muestra los pendientes (alertas). "Mi cuenta" (`/cuenta`, en
  el pie del menú; en el POS, `/pos/cuenta`) muestra los datos de la
  persona y permite cambiar su contraseña: pide la actual, cierra las
  demás sesiones y se bloquea 15 min tras 5 intentos fallidos.
- POS `/<slug-empresa>/pos` (pantalla oscura, requiere JavaScript): abrir
  turno con fondo inicial, vender con pago mixto y cerrar el turno contando
  el efectivo (conteo ciego). El cajero entra directo aquí. En "Gastos y
  retiros" (`/pos/caja`) registra lo que sale o entra de la caja sin ser
  venta: gastos (con categoría y foto opcional del recibo), retiros e
  ingresos; cuentan en el efectivo esperado del cierre.
- Gastos (`/gastos`): gastos, retiros e ingresos de los turnos con filtros
  (fechas, tipo o categoría, cajero, sucursal) y totales por categoría. Se
  anulan con motivo desde el detalle de su turno en Cierres de caja,
  mientras el turno siga abierto. Los recibos están en un bucket privado:
  `/<slug-empresa>/recibos/<id>` valida quién los pide y redirige a un
  enlace firmado que vence al minuto.
- Inventario: cada insumo tiene su ficha (`/inventario/insumos/<id>`) con
  existencias por bodega, carga inicial, ajustes con motivo, kardex y su
  costo de referencia. Cada movimiento de venta, compra o conteo muestra
  su número ("Venta #N", "Compra #N", "Conteo #N") con enlace al
  documento.
- Compras (`/compras`): la compra se arma en borrador (proveedor, bodega,
  fecha, factura e insumos con lo pagado) y al confirmarse entra a la
  bodega y actualiza el costo promedio de cada insumo. Confirmada no
  cambia: se anula con motivo (no recalcula el costo). El kardex enlaza
  "Compra #N".
- Conteos (`/inventario/conteos`): se cuenta una bodega en borrador (se
  puede guardar el avance; lo que queda en blanco no se ajusta) y al
  confirmar cada diferencia entra al kardex como "Conteo #N". El detalle
  del conteo confirmado muestra por insumo lo vendido (consumo teórico),
  el consumo real, la diferencia sobre lo vendido y su valor, con el
  faltante, el sobrante y el neto. Sin anulación: se corrige con otro
  conteo o un ajuste.
- Montos de dinero (precio de productos, POS, compras, caja): punto de
  miles y coma decimal ("16.500", "4,50"), también sin separadores.
- Recetas: cada producto tiene la pestaña Receta
  (`/catalogo/productos/<id>/receta`) con los insumos que lleva una unidad
  vendida, su costo y el margen sobre el precio.
- Correos (recuperación de contraseña, invitaciones y reporte de cierre):
  con `RESEND_API_KEY` salen por Resend; sin ella, en desarrollo se ven en
  `http://localhost:3000/dev/outbox` y en producción el envío falla.

### Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión de la app (Supabase: transaction pooler, puerto 6543) |
| `DIRECT_URL` | Conexión para migraciones (session pooler, puerto 5432) |
| `APP_URL` | URL pública, para armar enlaces de recuperación e invitación |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Almacenamiento de archivos en Supabase Storage (logos y fotos de productos en un bucket público; recibos de gastos en uno privado). Opcionales: sin ellas no se suben archivos. La clave es secreta (`sb_secret_...`) |
| `RESEND_API_KEY`, `MAIL_FROM` | Correo por Resend. La clave (`re_...`, permiso "Sending access" solo para el dominio de envío) es secreta; `MAIL_FROM` es el remitente de un dominio verificado (`Teru POS <reportes@envios.dominio.com>`). Sin clave: outbox en desarrollo, error en producción |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_PASSWORD` | Solo para `npm run db:seed` |

Los archivos `.env*` no se versionan (salvo `.env.example`).

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (`output: standalone`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera tipos de rutas y ejecuta `tsc` |
| `npm test` | Pruebas unitarias e integración |
| `npm run test:db:migrate` | Aplica migraciones a la BD de pruebas (`.env.test`) |
| `npm run db:migrate:deploy` | Aplica migraciones pendientes |
| `npm run db:seed` | Datos iniciales (idempotente) |
| `npm run company:create -- --name ... --slug ... --owner-name ... --owner-email ...` | Alta de empresa: sucursal principal + bienvenida al propietario por correo con su invitación (72 h); sin Resend o si el envío falla, muestra el enlace |
| `npm run storage:setup` | Crea el bucket público `company-assets` y el privado `company-private` (idempotente, una vez por entorno) |

## Pruebas

- **Unitarias** (`tests/unit`): no requieren BD.
- **Integración** (`tests/integration`): corren contra un PostgreSQL 17
  local (misma versión principal que Supabase), base `teru_pos_test`,
  configurado en `.env.test` (`DATABASE_URL` y `DIRECT_URL` iguales). La
  suite completa tarda unos segundos. El almacenamiento de archivos usa una
  versión en memoria: no necesitan `SUPABASE_SECRET_KEY`.
  Se niegan a correr si `.env.test` apunta a la BD de desarrollo.

```bash
# Una vez: crear la base (con el usuario postgres de la instalación local)
psql -U postgres -c "CREATE DATABASE teru_pos_test"
npm run test:db:migrate   # una vez, y tras cada migración nueva
npm test
```

## Migraciones

`prisma migrate dev` **no** funciona en este proyecto: la migración que
habilita RLS sobre `_prisma_migrations` falla al reaplicarse en la shadow
database. Flujo para crear una migración:

1. Editar `prisma/schema.prisma`.
2. Generar el SQL contra la BD real:
   ```bash
   npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma --script
   ```
3. Guardarlo en `prisma/migrations/<AAAAMMDDHHMMSS>_<nombre>/migration.sql`
   y agregar `ENABLE ROW LEVEL SECURITY` a cada tabla nueva.
4. `npm run db:migrate:deploy` y `npx prisma generate`.

Nunca editar una migración ya aplicada: crear una nueva.

## Impresión

Las hojas se imprimen desde el navegador en la impresora térmica instalada
en la caja (58 u 80 mm): comanda y soporte de una venta, cierre de turno y
existencias de una bodega (esta también en carta), en
`/[empresa]/imprimir/...`. El POS imprime la comanda al cobrar sin salir de
la pantalla de venta; el ancho del papel y la comanda automática se
ajustan en "Impresión" (se guardan en ese navegador).

- **Sin diálogo de impresión:** abrir Chrome con `--kiosk-printing` (por
  ejemplo, en el acceso directo: `chrome.exe --kiosk-printing
  https://…/su-arepa/pos`). Imprime en la impresora predeterminada de
  Windows, que debe ser la térmica, con el rollo de 80 o 58 mm como tamaño
  de papel en el driver.
- **Cajón de dinero:** se abre con la opción del driver de la impresora
  (p. ej. "Abrir cajón al imprimir" / *Cash drawer*).

## Estructura

```
src/
  app/                  Rutas (App Router)
    [empresa]/          Rutas por empresa: login, recuperar, restablecer,
                        invitacion, configuracion-inicial (asistente) y
                        (panel): inicio, cuenta, ventas, caja, gastos,
                        compras (con proveedores),
                        catalogo/{productos (con [id]/receta),categorias},
                        inventario/{insumos,bodegas,conteos} y
                        configuracion/{negocio,equipo,pagos,gastos};
                        pos (venta, caja, cierre, turno y cuenta),
                        imprimir/{comanda,soporte,cierre,existencias} y
                        recibos/[id] (enlace firmado al recibo)
    dev/outbox/         Bandeja de correos (solo desarrollo)
  components/
    ui/                 Componentes shadcn/ui
    account/            Mi cuenta y cambio de contraseña
    shared/             Componentes propios reutilizables
    cash/               Cierres de caja, movimientos de caja y gastos
    expenses/           Categorías de gasto
    catalog/            Categorías, productos, fotos, recetas y costos
    company/            Formularios de datos y logo de la empresa
    inventory/          Bodegas, insumos, movimientos, kardex y conteos
    payments/           Métodos de pago
    pos/                Turno de caja y pantalla de venta
    printing/           Hojas impresas y ajustes de impresión del equipo
    purchases/          Proveedores y compras (borrador, lista, anulación)
    sales/              Ventas en el panel y anulación
    team/               Invitaciones y lista del equipo
  lib/                  Cliente Prisma, marca, formatos, roles, imágenes,
                        unidades de medida y utilidades
  proxy.ts              Redirección optimista a login (no es autorización)
  server/
    data/               Único acceso a Prisma; filtra siempre por empresa
    services/           Lógica de negocio (auth y permisos, empresas, equipo,
                        catálogo, inventario y conteos, recetas y costos,
                        ventas, caja y sus movimientos, categorías de
                        gasto, métodos de pago, alertas,
                        compras y terceros,
                        mensajería, imágenes y almacenamiento)
    http/               Adaptador Next: cookies, cabeceras, sesión actual
    validations/        Esquemas Zod
    dto/                Tipos expuestos fuera de los servicios
prisma/                 Esquema, migraciones y seed
scripts/                Scripts de soporte (alta de empresas)
tests/                  Pruebas unitarias e integración
docs/decisiones/        Decisiones de arquitectura (ADR)
```

## Decisiones

- [ADR 0001 — Autenticación y sesiones](docs/decisiones/0001-autenticacion-y-sesiones.md)
- [ADR 0002 — Empresa, sucursal y equipo](docs/decisiones/0002-empresa-sucursal-y-equipo.md)
- [ADR 0003 — Panel, permisos por rol y almacenamiento de archivos](docs/decisiones/0003-panel-permisos-y-archivos.md)
- [ADR 0004 — Catálogo de venta](docs/decisiones/0004-catalogo-de-venta.md)
- [ADR 0005 — Inventario](docs/decisiones/0005-inventario.md)
- [ADR 0006 — Recetas y costos](docs/decisiones/0006-recetas-y-costos.md)
- [ADR 0007 — Ventas, POS y caja](docs/decisiones/0007-ventas-pos-y-caja.md)
- [ADR 0008 — Compras](docs/decisiones/0008-compras.md)
- [ADR 0009 — Conteo físico y consumo teórico vs. real](docs/decisiones/0009-conteo-fisico.md)
- [ADR 0010 — Movimientos de caja](docs/decisiones/0010-movimientos-de-caja.md)
- [ADR 0011 — Pendientes del cliente: kardex, precio y Mi cuenta](docs/decisiones/0011-pendientes-del-cliente.md)
