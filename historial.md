# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repositorio

ERP y sistema de gestión financiera integral, tipo SaaS local: sitio estático sin build que guarda todo en el `localStorage` del navegador. No hay backend.

- **Estructura.** Todo el proyecto vive en `01-FINANZAS/Aplicación con Claude/`, que es la raíz del repositorio: ahí están `.git`, `index.html`, `assets/`, `vercel.json`, `.gitignore`, `.vercelignore`, `versionar.py`, `publicar_datos.py` y este `historial.md`. Fuera de esa carpeta no hay nada del proyecto.
- **Especificación funcional.** `CLAUDE.md` (en la raíz) define **qué** hace el sistema.
- **Archivos eliminados.** El 2026-09-11 el usuario borró de la raíz `Agents.md`, `CLAUDE.md` y `README.md` porque le generaban problemas. Sus reglas vigentes están resumidas en «Convenciones del código».
- **Idioma y moneda.** Todo en español: interfaz, mensajes, nombres de funciones y variables, comentarios y commits. Moneda COP.

## Versiones

**Regla del usuario:** cada modificación de la app es una versión nueva, numerada automáticamente y registrada en el mismo commit que el cambio.

Antes de cada commit, desde la raíz del repositorio (la carpeta «Aplicación con Claude»):

```bash
python versionar.py parche "Qué se corrigió"      # 1.5.0 -> 1.5.1
python versionar.py menor  "Qué se agregó"         # 1.5.0 -> 1.6.0
python versionar.py mayor  "Cambio incompatible"   # 1.5.0 -> 2.0.0
```

El script actualiza a la vez `ERP.VERSION` en `app.js` (visible en el menú y en la pantalla de acceso), el `?v=` de todos los `<link>` y `<script>` de `index.html` y esta tabla: agrega la fila nueva y completa el commit de la versión anterior buscando el mensaje `vX.Y.Z:`. Se niega a numerar dos veces si la versión en curso aún no tiene commit. El commit se escribe con el mensaje `vX.Y.Z: resumen`. Se usa `MAYOR.MENOR.PARCHE`: la menor sube con funcionalidades y el parche con correcciones. El hash de la versión en curso se completa al registrar la siguiente.

| Versión | Fecha | Commit | Cambios |
| --- | --- | --- | --- |
| 1.8.0 | 2026-09-15 | *(esta versión)* | **Piel visual Terra:** rediseño basado en los diseños de Stitch (.design/stitch_erp_financiero_colombiano): verde bosque #4a7c59 sobre crema #faf6f0 con ámbar y terracota, Literata para títulos, Nunito Sans para textos y JetBrains Mono para cifras, menú lateral claro con íconos Material Symbols, tarjetas con borde fino, esquinas de 12 px y sombras suaves, ventas en verde y gastos en terracota en los gráficos, tema oscuro cálido y objetivos táctiles de 44 px. Sin cambios de funcionalidad. |
| 1.7.1 | 2026-09-14 | `f1c6bf3` | **Migración a Supabase, etapa 1:** esquema de 14 tablas con RLS por empresa y por módulo creado en el proyecto «ERP Financiero» (supabase/001_esquema_inicial.sql y 002_funciones_permisos_privadas.sql), probado con usuarios simulados. La app todavía usa localStorage. |
| 1.7.0 | 2026-09-14 | `ef83a47` | **Tablero ejecutivo rediseñado:** jerarquía real de indicadores (4 principales con variación contra el periodo anterior y minigráfica de tendencia, 6 secundarios compactos), rejilla de 12 columnas con Ventas contra gastos, Cartera por antigüedad, Productos más vendidos y Distribución de gastos, barra de filtros fija al desplazarse y estado vacío explicado con acciones. Nuevo cálculo `ERP.finanzas.carteraPorAntiguedad` y nueva minigráfica `ERP.charts.chispa`. |
| 1.6.2 | 2026-09-14 | `c6b0fb8` | **Ventas sin «Cargar factura PDF»:** se retira ese botón de la pestaña de Ventas. Compras y Gastos lo conservan, y una factura de venta leída desde allí sigue abriendo el formulario de ventas prellenado. |
| 1.6.1 | 2026-09-14 | `222fce4` | **Repositorio nuevo:** la app pasa a `github.com/dash-bi/ERP-DASH-BI` (remoto `origin`) con toda su historia; el anterior queda como remoto `finanzas`, sin uso. |
| 1.6.0 | 2026-09-13 | `0a4a39d` | **Datos publicados con la app:** `assets/JS/datos-publicados.js` lleva los datos de DASH-BI (8 clientes, 16 productos, 244 ventas, 60 compras, desde `respaldo-erp-2026-09-13 (1).json`). Un navegador sin datos o con la demostración intacta los carga solo; si ya tenía datos publicados sin cambios, se actualiza al publicar otros; los datos propios o editados nunca se sobrescriben y ven un aviso con el botón «Cargar datos publicados». **publicar_datos.py** genera ese archivo desde un respaldo exportado y numera la versión. |
| 1.5.2 | 2026-09-13 | `1a72cd1` | **Todo el proyecto dentro de «Aplicación con Claude»:** se movieron `.git`, `.gitignore`, `vercel.json` y `versionar.py` a la carpeta, que pasa a ser la raíz del repositorio, sin borrar nada. `vercel.json` ya no necesita `outputDirectory`, `.vercelignore` evita publicar las herramientas del repositorio y el historial de git se conserva como renombrados. |
| 1.5.1 | 2026-09-13 | `5b67555` | **Importar respaldo (JSON):** en Configuración → Datos y respaldo se carga un respaldo exportado para llevar los datos de un navegador, equipo o dirección a otra (por ejemplo, del archivo local a Vercel). Valida el archivo, muestra un resumen (empresa, clientes, productos, ventas, usuarios) y pide confirmar; si el navegador no puede guardar, conserva los datos actuales. Documenta que cada origen tiene sus propios datos. |
| 1.5.0 | 2026-09-13 | `1f167af` | **Empezar desde cero:** en Configuración → Datos y respaldo, un botón borra toda la operación, incluidos los datos de demostración, para registrar la empresa real. Pide razón social, NIT y capital inicial, ofrece exportar un respaldo antes y exige escribir BORRAR. Conserva usuarios, permisos por rol y parámetros de IVA y nómina; reinicia consecutivos en FV-0001 y FC-0001. **Versionado automático:** `versionar.py` numera cada versión y actualiza app.js, index.html e historial.md. |
| 1.4.1 | 2026-09-12 | `2ab344f` | **Versión visible y sin caché:** `ERP.VERSION` se muestra en la cabecera del menú y en la pantalla de acceso, los archivos se piden con `?v=` y `vercel.json` obliga a revalidar, para poder confirmar de un vistazo qué versión sirve el navegador. |
| 1.4.0 | 2026-09-11 | `e094632` | **Permisos por rol configurables:** en Configuración → Permisos por rol el administrador marca qué módulos ve Contador y Vendedor, y el menú, la navegación y la importación de PDF respetan esa selección al instante, también en otras pestañas. Configuración sigue siendo solo del administrador y cada rol debe conservar al menos un módulo. Al entrar se abre el tablero o, si el rol no lo tiene, su primer módulo permitido. **Limpieza de la raíz:** se eliminan `Agents.md`, `CLAUDE.md` y `README.md`; `vercel.json` y `.gitignore` permanecen en la raíz; `historial.md` pasa a la app. |
| — | 2026-09-11 | `5fdd007`, `6cdff0a`, `ebfbcdd` | Commits hechos desde la web de GitHub («Update index.html / base.css / components.css») sin cambios de contenido. |
| 1.3.3 | 2026-09-11 | `65eb224` | La pantalla de acceso deja de mostrar usuarios y contraseñas; contraseñas de la semilla guardadas como hash; credenciales enmascaradas en los bocetos. |
| 1.3.2 | 2026-09-11 | `3545039` | Bocetos de diseño publicados en `.design/`. |
| 1.3.1 | 2026-09-10 | `64ce1f5` | Configuración exclusiva del administrador; la sesión se resincroniza con el rol vigente, incluso desde otra pestaña. |
| 1.3.0 | 2026-09-10 | `7effc30` | Edición de usuarios del sistema: usuario, nombre, rol y contraseña; el sistema nunca queda sin administrador. |
| 1.2.0 | 2026-09-10 | `8640b74` | Edición de ventas, abonos, compras, gastos e inventario; exportación a Excel; carga de facturas PDF con formulario prellenado; vendedor elegido entre los empleados de nómina; tablero con 10 KPI en 2 filas. |
| 1.1.0 | 2026-09-09 | `26394a6` | Piel visual tipo Nubank (morado `#7B2FF7`, verde `#C9F73F`) y restauración de la carpeta de la app. |
| 1.0.1 | 2026-09-09 | `de2b99e` | Intento de mover la app a la raíz para que Vercel la sirviera; revertido en 1.1.0. |
| 1.0.0 | 2026-09-09 | `ce904f7` | Primera versión del ERP. |

## Comandos

No hay `package.json`, build, tests automatizados ni linter. Rutas relativas a la raíz del repositorio (la carpeta «Aplicación con Claude»).

```bash
# Servir la app (también abre con doble clic en index.html: son scripts clásicos)
python -m http.server 8000

# Sintaxis de todos los scripts
for f in assets/JS/*.js; do node --check "$f" || echo "FALLA: $f"; done

# Reglas absolutas del código: no debe imprimir nada.
# El patrón ignora var(--css), ui.confirmar() y comentarios que nombran confirm() o innerHTML.
grep -rnE '\bvar\s+[A-Za-z_$]|\.innerHTML|\b(alert|confirm|prompt)\([^)]' assets/JS
```

`http.server` deja que el navegador cachee los JS: recargar con Ctrl+F5 tras cada cambio.

### Verificación en el navegador (consola, todo cuelga de `window.ERP`)

- **Datos limpios:** `localStorage.removeItem('erp_finanzas_v1'); sessionStorage.clear()` y recargar.
- **Sesión sin escribir contraseña:** `sessionStorage.setItem('erp_finanzas_sesion', JSON.stringify({ id: 'usr_admin' }))` y recargar. Para los otros roles, `usr_conta` y `usr_vende`.
- **Renderizar todos los módulos:** `Object.keys(ERP.app.MODULOS).forEach(ERP.app.irA)`. Un fallo pinta «No fue posible mostrar el módulo» y deja el error en consola.
- **Invariante contable** tras cualquier cambio en transacciones: `ERP.finanzas.balanceGeneral(ERP.util.today()).descuadre` debe ser 0.
- **Criterio de terminado:** consola sin errores y revisión visual a 375 px y 1440 px.

### Despliegue

Push a `main` de **`github.com/dash-bi/ERP-DASH-BI`** (remoto `origin`) → Vercel despliega solo. El repositorio anterior, `github.com/dash-bi/finanzas`, quedó como remoto `finanzas` y ya no se usa; conserva la historia hasta la 1.6.0.

- **`index.html` y `vercel.json` están en la raíz del repositorio**, así que Vercel publica la raíz sin `outputDirectory`. **Root Directory** en cada proyecto de Vercel debe quedar **vacío**: si apunta a «Aplicación con Claude», el build falla porque esa subcarpeta ya no existe dentro del repositorio.
- **`.vercelignore`** evita publicar `versionar.py` y los archivos de configuración de git.
- **Protección de Vercel.** `finanzas-dash-bi.vercel.app` tiene Deployment Protection y redirige al login de Vercel.
- **Versión vieja en producción.** Revisar en Vercel que el despliegue *Current* sea el último commit; un Instant Rollback lo deja fijo.

## Arquitectura

### Carga y módulos

- **Scripts clásicos**, sin módulos ES, para que funcione en `file://`. Cada archivo es un IIFE que asigna una API pública a `ERP.<modulo>`.
- **El orden de `<script>` en `index.html` es la dependencia:** `util → db → ui → charts/pdf/xlsx/pdfreader → lines → auth → negocio → financials → dashboard → tools/payroll → app`. Las referencias a módulos cargados después solo son válidas dentro de funciones que se ejecutan más tarde (p. ej. `ERP.configuracion` usa `ERP.app.MODULOS`).
- **Agregar un módulo** exige tres cambios:
  1. Su `<script>` en `index.html`.
  2. Su entrada en `MODULOS` (y `GRUPOS`) de `app.js`.
  3. Su clave en `PERMISOS` de `auth.js`, siempre en `PERMISOS.administrador` (la lista completa de módulos) y en los roles que deban verlo por defecto.

### Flujo de datos y repintado

- **Capa de datos única.** `db.js` lee `erp_finanzas_v1` una vez a memoria. Cada mutación llama a `persist()`, que escribe el JSON completo, y emite `U.bus.emit('db:changed')`.
- **Repintado completo.** `app.js` escucha `db:changed` y, con debounce de 90 ms, ejecuta `montarAplicacion()`, que reconstruye todo el shell y la vista activa. Por eso las vistas son funciones `vista(contenedor)` sin estado propio en el DOM, y lo que deba sobrevivir al repintado (filtros) vive en un objeto `estado` del módulo. Los modales cuelgan de `document.body` y sobreviven al repintado.
- **Otras pestañas.** Un evento `storage` recarga `db.load()` y repinta.
- **Sesión y vista.** `montarAplicacion()` resincroniza la sesión con el registro vigente del usuario y elige la vista:
  - `estado.vista = null` al entrar o salir abre `primerModuloPermitido()` sin aviso.
  - Una vista que deja de estar permitida con la sesión abierta, por cambio de rol o de permisos, se reemplaza con el aviso «Su acceso cambió».
  - Las acciones de Configuración revalidan el rol con `autorizado()`.

### Permisos por rol

- **Dónde vive la regla.** `ERP.auth.modulosDeRol(rol)` es la única fuente: el administrador recibe `PERMISOS.administrador`; los demás roles, `config.permisosRol[rol]` si el administrador guardó una selección o `PERMISOS[rol]` si no.
- **Filtros de seguridad.** El resultado se filtra contra la lista completa y excluye `SOLO_ADMINISTRADOR` (`configuracion`), así que un dato alterado no abre Configuración a otro rol.
- **Quién la usa.** `puede()`, `modulosPermitidos()`, el menú lateral, `irA`, el conteo de módulos de la tabla de usuarios y el importador de PDF.
- **Guardado.** `ERP.auth.guardarPermisos({ contador: [...], vendedor: [...] })` exige sesión de administrador y al menos un módulo por rol, y guarda con `db.updateConfig({ permisosRol })`. No requiere migración: `load()` fusiona `config` con los valores por defecto.
- **Alcance de los datos.** «Reiniciar datos de demostración» vuelve a los permisos por defecto, y el respaldo JSON los incluye.
- **Lo que no restringe.** Los permisos son por módulo completo: dentro de un módulo permitido, todos los roles ven lo mismo.

### Contabilidad derivada (lo que más fácil se rompe)

- **Solo se guardan transacciones:** compras, ventas, gastos, abonos, pagos de compra y nóminas. Caja, CxC, CxP, inventario contable, P&G, balance, flujo e indicadores se calculan en `ERP.finanzas` (`financials.js`). Un tipo de transacción nuevo debe reflejarse ahí o el balance descuadra.
- **Ventas y compras.** `registrarVenta` valida existencias y cupo de crédito y **congela `costoUnitario`**. `registrarCompra` recalcula el costo promedio ponderado con el costo neto de descuento.
- **Inventario reversible.** `planificarInventario()` valoriza los movimientos por valor total (existencia × costo) para que revertir un documento devuelva el costo promedio exacto.
- **Edición.** `editarVenta` / `editarCompra` / `editarAbono` **revierten el documento original y aplican el nuevo** con las mismas validaciones, conservando número, abonos y costo congelado.
- **Errores sin excepciones.** Las funciones de negocio devuelven `{ ok: false, error }` (helper `fallo`) y la UI lo muestra en un banner.

### Migración a Supabase (en curso)

- **Proyecto:** «ERP Financiero», ref `nxilhcgjjzluywfinicd` (us-east-1, PostgreSQL 17). Claude Code accede por el conector MCP de Supabase ya autenticado; no hay `.mcp.json` en el repositorio.
- **Objetivo aprobado por el usuario:** reemplazar `localStorage` por una base compartida, con Supabase Auth y reglas por rol, para que local, Vercel y cualquier equipo vean los mismos datos. Al terminar, `datos-publicados.js` dejará de ser necesario y los datos saldrán del repositorio público.
- **Etapas:**
  1. **Esquema. HECHO el 2026-09-14.** `supabase/001_esquema_inicial.sql` y `supabase/002_funciones_permisos_privadas.sql` están aplicados.
  2. **Migración de datos DASH-BI. PENDIENTE.** Necesita un correo por usuario: las contraseñas djb2 no se pueden migrar a Supabase Auth.
  3. **Conexión de la app. PENDIENTE.** Funciones transaccionales para registrar ventas, compras, abonos y pagos (existencias, costo ponderado y saldos en una operación), y reemplazo de `db.js` módulo por módulo.
- **Modelo:**
  - 14 tablas con `empresa_id`, que permiten varias empresas.
  - Los `id` son texto: se conservan los actuales al migrar y los nuevos reciben un UUID.
  - Dinero en `numeric(16,2)`, costo promedio en `numeric(16,4)` y cantidades en `numeric(14,3)`.
  - Ítems de venta y compra en tablas hijas.
  - `empresas` reemplaza `config`, incluidos `permisos_rol` y los consecutivos.
  - `perfiles` enlaza `auth.users` con usuario, nombre y rol.
- **Seguridad (RLS en todas las tablas):**
  - Lectura: cualquier usuario activo de la empresa.
  - Escritura: solo si `privado.puede_modulo(<módulo>)`, la misma regla que `ERP.auth.modulosDeRol`.
  - `empresas` y `perfiles` solo los modifica el administrador.
  - `privado.empresa_actual()`, `privado.rol_actual()` y `privado.puede_modulo()` no están expuestas en la API.
  - `public.tomar_consecutivo('venta'|'compra')` numera de forma atómica. Es el único aviso restante del asesor de seguridad, y es intencional.
- **Verificado:** con una transacción revertida y usuarios simulados, el vendedor lee su empresa, crea clientes y numera ventas (FV-0001, FV-0002), pero no crea gastos, no escribe en otra empresa, no modifica la empresa ni numera compras. Otra empresa solo ve sus datos y un usuario sin sesión no ve nada. La base quedó vacía tras la prueba.
- **Al tocar el esquema:** aplicar con `apply_migration`, guardar la misma migración como `supabase/00N_*.sql` y volver a revisar los asesores de seguridad y rendimiento. `supabase/` está en `.vercelignore`.

### Datos publicados con la app

- **Qué son.** `assets/JS/datos-publicados.js` define `ERP.DATOS_PUBLICADOS = { id, fecha, archivo, datos }` y se carga antes de `db.js`. Lo genera `publicar_datos.py` desde un respaldo exportado, y el `id` es un hash del contenido. **El repositorio y el sitio son públicos**: el usuario aceptó publicar sus datos, incluidos los usuarios con contraseñas cifradas.
- **Flujo del usuario:**
  1. En su copia de trabajo, Exportar datos (JSON).
  2. `python publicar_datos.py "C:/Users/VENTAS 2/Downloads/respaldo-erp-….json"`, que valida, genera el archivo y numera la versión con `versionar.py`.
  3. Commit y push.
- **Origen de los datos (`data.meta`).** Registra de dónde salieron los datos guardados en cada navegador: `demo` (con `elegido` si se pidió desde Configuración), `publicado` (con `publicadoId`) o `local`. `editado` se marca en `persist()` salvo en escrituras del sistema (`comoSistema`).
- **Regla de `load()`:**
  - Navegador sin datos: carga los publicados.
  - Demostración que nadie pidió, o publicados anteriores sin `editado`: se reemplazan solos. Los publicados anteriores muestran el aviso «Datos actualizados».
  - `local`, editados o demostración elegida: **nunca se sobrescriben**. Si hay publicados nuevos sobre datos editados, avisa y Configuración ofrece «Cargar datos publicados».
- **Datos anteriores a la 1.6.0, sin `meta`.** Solo la demostración con el nombre ficticio «Distribuciones Andina S.A.S.» cuenta como desechable. Una demostración renombrada, como la copia local DASH-BI del usuario, es `local`.
- **Balance de los datos publicados.** El respaldo DASH-BI de 2026-09-13 trae un descuadre de $0,45 por redondeo en los datos de origen. La interfaz solo advierte descuadres mayores a $1.

### Reiniciar, empezar desde cero e importar

- **Los datos viven por origen.** Cada navegador y cada dirección (archivo local `file://`, `localhost`, cada dominio de Vercel) tiene su propio `localStorage`. El código puede ser idéntico y mostrar otra empresa: eso son datos distintos, no una versión anterior. La versión del programa se confirma con el número en pantalla.
- **`db.validarRespaldo(texto)` / `db.importarRespaldo(texto)`** («Importar respaldo (JSON)») llevan los datos de un origen a otro:
  - Validan el JSON, el formato (`SCHEMA_VERSION`), que las colecciones sean listas y que exista un administrador activo.
  - Muestran un resumen y piden confirmar antes de reemplazar.
  - Si `persist()` falla, restauran los datos anteriores.
  - Si el usuario conectado no existe en el respaldo, el montaje devuelve a la pantalla de acceso.

- **`db.reset()`** («Reiniciar datos de demostración») regenera la empresa ficticia completa, incluidos los usuarios con sus contraseñas iniciales.
- **`db.vaciar({ empresa, nit, capitalInicial })`** («Empezar desde cero») deja todas las colecciones vacías y reemplaza los datos de la empresa. Conserva los usuarios, `permisosRol` y los parámetros de IVA y nómina, y reinicia los consecutivos.
  - Un sistema vacío no se vuelve a sembrar: `load()` solo siembra si no hay datos guardados o están dañados.
  - Todos los módulos toleran colecciones vacías. Una colección nueva debe ir en `emptySchema()` para que `vaciar` la limpie.

### Esquema y migraciones

`SCHEMA_VERSION` está en `db.js`. `load()` **regenera la demostración si la versión guardada no coincide**, lo que borra los datos del usuario. Un cambio de esquema se resuelve en `migrar()`, que es no destructiva y completa campos, antes de pensar en subir la versión.

### Autenticación

- **Local.** `hashClave` es djb2: separa responsabilidades, no es seguridad.
- **Contraseñas iniciales.** En la semilla están como hash literal. No volver a escribirlas en texto plano en código, documentación, bocetos ni pantalla de acceso.
- **Último administrador.** `db.actualizarUsuario` impide dejar el sistema sin administrador activo.

### UI sin dependencias

- **Constructor de DOM.** `U.el(tag, { class, text, attrs, props, on, style }, hijos)` sustituye a `innerHTML`. `attrs` omite valores `null`/`false`; `props` asigna propiedades como `checked` o `disabled`.
- **Tablas.** `ui.tabla(filas, columnas, opts)` devuelve `{ nodo, refrescar, estado, filas }`. `filas()` entrega las filas ordenadas y filtradas, y es lo que exportan los botones de Excel: se exporta lo que se ve.
- **Diálogos.** `ui.modal`, `ui.confirmar` y los `toast*` reemplazan los diálogos nativos.
- **Editor de líneas.** `lines.js` lo comparten ventas y compras, e incluye la opción de crear un producto desde una línea leída de un PDF.
- **Implementaciones propias en lugar de librerías:**
  - `charts.js`: gráficos SVG; colores por las variables `--c1`…`--c8` de `base.css`.
  - `pdf.js`: escritor de PDF.
  - `xlsx.js`: ZIP sin compresión con CRC32.
  - `pdfreader.js`: extrae texto con `DecompressionStream`.
- **Importación de facturas.** `importer.js` decide si es compra, gasto o venta comparando NIT con `config.nit` y el contenido. **Nunca registra solo**: abre el formulario prellenado para confirmar y bloquea CUFE duplicados.
- **Piel visual.** Vive solo en `assets/CSS/`: `base.css` (tokens y tema claro/oscuro por `data-theme`), `layout.css` y `components.css`.

## Convenciones del código

Reglas que el usuario fijó al construir el sistema. Venían de `Agents.md` y siguen vigentes en el código.

- **Prohibido** `var`, `innerHTML`, `alert()`, `confirm()` y `prompt()`. Usar `const`/`let`, `document.createElement` (vía `U.el`), `addEventListener` y `preventDefault()` en los `submit`. Todo feedback va dentro del DOM: toasts, banners, modales y estados vacío/cargando/error.
- **Sin frameworks ni paquetes.** Las únicas externas autorizadas eran Chart.js, jsPDF/AutoTable y Google Fonts. Hoy solo se usa Google Fonts: Literata, Nunito Sans, JetBrains Mono y los íconos Material Symbols Outlined (pedidos con `icon_names`, solo los que usa el menú y la barra superior); gráficos y PDF son nativos. La especificación de la app aún pide Chart.js, jsPDF e Inter/Roboto: no migrar sin aprobación del usuario.
- **Capa de datos única.** Los módulos nunca tocan `localStorage` directamente.
- **Estructura.** `index.html` + `assets/CSS|JS|IMG`, sin carpetas nuevas sin justificación.
- **Consistencia.** KPIs, gráficos y tablas usan el mismo conjunto de datos filtrado. Nunca inventar datos ni métricas.
- **Ante una duda que afecte el resultado**, preguntar al usuario en lugar de decidir.

## Contexto que no se deduce del código

- **2026-09-13, reorganización (1.5.2).** A pedido del usuario, todo el proyecto quedó dentro de «Aplicación con Claude»: se movieron `.git`, `.gitignore`, `vercel.json` y `versionar.py` desde `01-FINANZAS/`, sin borrar nada, porque la app o el flujo de trabajo los usan. Git registró los archivos como renombrados, así que el historial se conserva. Hasta la versión 1.5.1 las rutas del repositorio empiezan por `Aplicación con Claude/`.

- **El repositorio está dentro de Google Drive** (`G:\Mi unidad`), y archivos y carpetas han aparecido, desaparecido o cambiado de lugar por acciones externas. Antes de cada commit, revisar `git status`, verificar con `git fetch` si GitHub tiene commits nuevos y no subir borrados masivos ni carpetas nuevas sin confirmar con el usuario.
- **Versión anterior del sistema.** Existió en `_version-anterior/` y luego en `Version vieja/`, y nunca se publicó. Si reaparece, no debe subirse: un segundo `index.html` competiría con el despliegue.
- **Preferencias del usuario:**
  - Pide que los cambios se suban directamente al repositorio.
  - Exige no publicar material confidencial (`.env`, llaves, respaldos `respaldo-erp-*.json`).
  - Espera verificación en el navegador antes de dar algo por terminado.
  - Quiere cada versión documentada aquí.
