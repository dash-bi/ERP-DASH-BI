-- =====================================================================
-- ERP DASH-BI · Esquema inicial en Supabase (etapa 1 de la migración)
-- ESTADO: APLICADA el 2026-09-14 en el proyecto «ERP Financiero» (nxilhcgjjzluywfinicd),
--         migración «esquema_inicial_erp». Ver también 002_funciones_permisos_privadas.sql.
--
-- Derivado del modelo de assets/JS/db.js y de los campos reales de los
-- datos de DASH-BI (v1.7.0). Reemplaza el localStorage por PostgreSQL:
-- los mismos datos en cualquier navegador, equipo y en Vercel.
--
-- Decisiones:
--   * Cada tabla lleva empresa_id: aísla los datos por empresa con RLS y
--     deja el sistema listo para varias empresas sin rediseñar.
--   * Los id son texto: los registros actuales conservan su id al migrar
--     (etapa 2) y las referencias entre documentos no se rompen. Los
--     registros nuevos reciben un UUID.
--   * Usuarios en Supabase Auth (correo y contraseña reales) + tabla
--     perfiles con el rol. Las contraseñas actuales no se pueden migrar.
--   * Dinero numeric(16,2); costos promedio numeric(16,4); cantidades
--     numeric(14,3). Sin decimales binarios: evita descuadres por redondeo.
--   * RLS en todas las tablas: cada usuario solo ve su empresa; escribe
--     solo en los módulos que su rol tiene habilitados (Permisos por rol).
--
-- Fuera de esta etapa (etapa 3): funciones transaccionales que registran
-- ventas, compras, abonos y pagos en una sola operación (existencias,
-- costo ponderado, saldos). Hasta entonces, las escrituras siguen la
-- lógica actual de la app.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Empresas (reemplaza data.config)
-- ---------------------------------------------------------------------
create table public.empresas (
    id                  text primary key default gen_random_uuid()::text,
    razon_social        text not null check (length(trim(razon_social)) >= 3),
    nit                 text not null default '',
    direccion           text not null default '',
    ciudad              text not null default '',
    telefono            text not null default '',
    email               text not null default '',
    iva_pct             numeric(5,2)  not null default 19 check (iva_pct between 0 and 100),
    capital_inicial     numeric(16,2) not null default 0 check (capital_inicial >= 0),
    -- Parámetros legales de nómina: cambian cada año por decreto.
    salario_minimo      numeric(14,2) not null default 0 check (salario_minimo >= 0),
    auxilio_transporte  numeric(14,2) not null default 0 check (auxilio_transporte >= 0),
    tope_auxilio_smmlv  numeric(5,2)  not null default 2,
    aporte_salud_pct    numeric(5,2)  not null default 4 check (aporte_salud_pct between 0 and 100),
    aporte_pension_pct  numeric(5,2)  not null default 4 check (aporte_pension_pct between 0 and 100),
    consecutivo_venta   integer not null default 1 check (consecutivo_venta >= 1),
    consecutivo_compra  integer not null default 1 check (consecutivo_compra >= 1),
    -- { "contador": ["ventas", ...], "vendedor": [...] }; vacío = permisos por defecto.
    permisos_rol        jsonb not null default '{}'::jsonb,
    creado_en           timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. Perfiles: usuarios del sistema enlazados a Supabase Auth
-- ---------------------------------------------------------------------
create table public.perfiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    empresa_id  text not null references public.empresas (id) on delete cascade,
    usuario     text not null check (usuario ~ '^[a-z0-9._-]{3,30}$'),
    nombre      text not null check (length(trim(nombre)) >= 3),
    rol         text not null check (rol in ('administrador', 'contador', 'vendedor')),
    activo      boolean not null default true,
    creado_en   timestamptz not null default now(),
    unique (empresa_id, usuario)
);
create index perfiles_empresa on public.perfiles (empresa_id);


-- ---------------------------------------------------------------------
-- 3. Terceros: clientes y proveedores
-- ---------------------------------------------------------------------
create table public.terceros (
    id              text primary key default gen_random_uuid()::text,
    empresa_id      text not null references public.empresas (id) on delete cascade,
    tipo            text not null check (tipo in ('cliente', 'proveedor')),
    tipo_doc        text not null default 'NIT',
    documento       text not null default '',
    nombre          text not null check (length(trim(nombre)) > 0),
    telefono        text not null default '',
    email           text not null default '',
    direccion       text not null default '',
    limite_credito  numeric(16,2) not null default 0 check (limite_credito >= 0),
    activo          boolean not null default true,
    creado_en       timestamptz not null default now()
);
create index terceros_empresa_tipo on public.terceros (empresa_id, tipo);


-- ---------------------------------------------------------------------
-- 4. Productos y servicios (inventario)
-- ---------------------------------------------------------------------
create table public.productos (
    id            text primary key default gen_random_uuid()::text,
    empresa_id    text not null references public.empresas (id) on delete cascade,
    sku           text not null,
    nombre        text not null check (length(trim(nombre)) > 0),
    categoria     text not null default 'General',
    unidad        text not null default 'UND',
    tipo          text not null default 'producto' check (tipo in ('producto', 'servicio')),
    stock         numeric(14,3) not null default 0,
    stock_minimo  numeric(14,3) not null default 0 check (stock_minimo >= 0),
    costo         numeric(16,4) not null default 0 check (costo >= 0),   -- promedio ponderado
    precio        numeric(16,2) not null default 0 check (precio >= 0),
    gravado       boolean not null default true,
    activo        boolean not null default true,
    creado_en     timestamptz not null default now(),
    unique (empresa_id, sku)
);


-- ---------------------------------------------------------------------
-- 5. Empleados (nómina y vendedores)
-- ---------------------------------------------------------------------
create table public.empleados (
    id                  text primary key default gen_random_uuid()::text,
    empresa_id          text not null references public.empresas (id) on delete cascade,
    documento           text not null default '',
    nombre              text not null check (length(trim(nombre)) > 0),
    cargo               text not null default '',
    salario             numeric(14,2) not null default 0 check (salario >= 0),
    auxilio_transporte  boolean not null default true,
    fecha_ingreso       date,
    activo              boolean not null default true,
    creado_en           timestamptz not null default now()
);
create index empleados_empresa on public.empleados (empresa_id);


-- ---------------------------------------------------------------------
-- 6. Ventas (facturas) e ítems. El costo unitario se congela al emitir.
-- ---------------------------------------------------------------------
create table public.ventas (
    id                 text primary key default gen_random_uuid()::text,
    empresa_id         text not null references public.empresas (id) on delete cascade,
    numero             text not null,
    fecha              date not null,
    cliente_id         text not null references public.terceros (id),
    vendedor_id        text references public.empleados (id) on delete set null,
    vendedor_nombre    text not null default '',
    condicion          text not null check (condicion in ('contado', 'credito')),
    dias_credito       integer not null default 0 check (dias_credito >= 0),
    fecha_vencimiento  date,
    medio_pago         text not null default '',
    subtotal           numeric(16,2) not null default 0 check (subtotal >= 0),
    iva                numeric(16,2) not null default 0 check (iva >= 0),
    total              numeric(16,2) not null default 0 check (total >= 0),
    saldo              numeric(16,2) not null default 0 check (saldo >= 0),
    anulada            boolean not null default false,
    observaciones      text not null default '',
    origen             text not null default 'manual',
    creado_por         uuid references auth.users (id) default auth.uid(),
    creado_en          timestamptz not null default now(),
    unique (empresa_id, numero)
);
create index ventas_empresa_fecha on public.ventas (empresa_id, fecha);
create index ventas_cliente on public.ventas (cliente_id);
create index ventas_vendedor on public.ventas (vendedor_id);
create index ventas_creado_por on public.ventas (creado_por);

create table public.venta_items (
    id              bigint generated always as identity primary key,
    empresa_id      text not null references public.empresas (id) on delete cascade,
    venta_id        text not null references public.ventas (id) on delete cascade,
    linea           smallint not null check (linea >= 1),
    producto_id     text not null references public.productos (id),
    cantidad        numeric(14,3) not null check (cantidad > 0),
    valor_unitario  numeric(16,2) not null check (valor_unitario >= 0),
    descuento_pct   numeric(6,3)  not null default 0 check (descuento_pct between 0 and 100),
    costo_unitario  numeric(16,4) not null default 0 check (costo_unitario >= 0),
    unique (venta_id, linea)
);
create index venta_items_producto on public.venta_items (producto_id);
create index venta_items_empresa on public.venta_items (empresa_id);


-- ---------------------------------------------------------------------
-- 7. Abonos: amortizan el saldo de una factura de venta
-- ---------------------------------------------------------------------
create table public.abonos (
    id             text primary key default gen_random_uuid()::text,
    empresa_id     text not null references public.empresas (id) on delete cascade,
    venta_id       text not null references public.ventas (id) on delete cascade,
    cliente_id     text not null references public.terceros (id),
    fecha          date not null,
    valor          numeric(16,2) not null check (valor > 0),
    medio          text not null default '',
    observaciones  text not null default '',
    creado_por     uuid references auth.users (id) default auth.uid(),
    creado_en      timestamptz not null default now()
);
create index abonos_venta on public.abonos (venta_id);
create index abonos_cliente on public.abonos (cliente_id);
create index abonos_empresa_fecha on public.abonos (empresa_id, fecha);
create index abonos_creado_por on public.abonos (creado_por);


-- ---------------------------------------------------------------------
-- 8. Compras e ítems. Suben existencias y el costo promedio ponderado.
-- ---------------------------------------------------------------------
create table public.compras (
    id                   text primary key default gen_random_uuid()::text,
    empresa_id           text not null references public.empresas (id) on delete cascade,
    numero               text not null,
    fecha                date not null,
    proveedor_id         text not null references public.terceros (id),
    documento_proveedor  text not null default '',
    condicion            text not null check (condicion in ('contado', 'credito')),
    dias_credito         integer not null default 0 check (dias_credito >= 0),
    fecha_vencimiento    date,
    medio_pago           text not null default '',
    subtotal             numeric(16,2) not null default 0 check (subtotal >= 0),
    iva                  numeric(16,2) not null default 0 check (iva >= 0),
    total                numeric(16,2) not null default 0 check (total >= 0),
    saldo                numeric(16,2) not null default 0 check (saldo >= 0),
    observaciones        text not null default '',
    -- Datos de la factura PDF importada, si aplica.
    cufe                 text,
    archivo_origen       text,
    creado_por           uuid references auth.users (id) default auth.uid(),
    creado_en            timestamptz not null default now(),
    unique (empresa_id, numero)
);
create index compras_empresa_fecha on public.compras (empresa_id, fecha);
create index compras_proveedor on public.compras (proveedor_id);
create index compras_creado_por on public.compras (creado_por);
create unique index compras_cufe on public.compras (empresa_id, cufe) where cufe is not null and cufe <> '';

create table public.compra_items (
    id              bigint generated always as identity primary key,
    empresa_id      text not null references public.empresas (id) on delete cascade,
    compra_id       text not null references public.compras (id) on delete cascade,
    linea           smallint not null check (linea >= 1),
    producto_id     text not null references public.productos (id),
    cantidad        numeric(14,3) not null check (cantidad > 0),
    valor_unitario  numeric(16,2) not null check (valor_unitario >= 0),
    descuento_pct   numeric(6,3)  not null default 0 check (descuento_pct between 0 and 100),
    unique (compra_id, linea)
);
create index compra_items_producto on public.compra_items (producto_id);
create index compra_items_empresa on public.compra_items (empresa_id);


-- ---------------------------------------------------------------------
-- 9. Pagos a proveedores: amortizan el saldo de una compra a crédito
-- ---------------------------------------------------------------------
create table public.pagos_compra (
    id            text primary key default gen_random_uuid()::text,
    empresa_id    text not null references public.empresas (id) on delete cascade,
    compra_id     text not null references public.compras (id) on delete cascade,
    proveedor_id  text not null references public.terceros (id),
    fecha         date not null,
    valor         numeric(16,2) not null check (valor > 0),
    medio         text not null default '',
    creado_por    uuid references auth.users (id) default auth.uid(),
    creado_en     timestamptz not null default now()
);
create index pagos_compra_compra on public.pagos_compra (compra_id);
create index pagos_compra_proveedor on public.pagos_compra (proveedor_id);
create index pagos_compra_empresa on public.pagos_compra (empresa_id);
create index pagos_compra_creado_por on public.pagos_compra (creado_por);


-- ---------------------------------------------------------------------
-- 10. Gastos operativos y administrativos
-- ---------------------------------------------------------------------
create table public.gastos (
    id              text primary key default gen_random_uuid()::text,
    empresa_id      text not null references public.empresas (id) on delete cascade,
    fecha           date not null,
    categoria       text not null,
    descripcion     text not null default '',
    valor           numeric(16,2) not null check (valor > 0),
    pagado          boolean not null default true,
    medio           text not null default '',
    proveedor       text not null default '',
    referencia      text not null default '',
    origen          text not null default 'manual',   -- manual, nomina, pdf…
    cufe            text,
    archivo_origen  text,
    creado_por      uuid references auth.users (id) default auth.uid(),
    creado_en       timestamptz not null default now()
);
create index gastos_empresa_fecha on public.gastos (empresa_id, fecha);
create index gastos_creado_por on public.gastos (creado_por);
create unique index gastos_cufe on public.gastos (empresa_id, cufe) where cufe is not null and cufe <> '';


-- ---------------------------------------------------------------------
-- 11. Presupuesto mensual por categoría de gasto
-- ---------------------------------------------------------------------
create table public.presupuestos (
    id          text primary key default gen_random_uuid()::text,
    empresa_id  text not null references public.empresas (id) on delete cascade,
    periodo     char(7) not null check (periodo ~ '^\d{4}-\d{2}$'),
    categoria   text not null,
    monto       numeric(16,2) not null default 0 check (monto >= 0),
    unique (empresa_id, periodo, categoria)
);


-- ---------------------------------------------------------------------
-- 12. Nómina liquidada por empleado y periodo
-- ---------------------------------------------------------------------
create table public.nominas (
    id                      text primary key default gen_random_uuid()::text,
    empresa_id              text not null references public.empresas (id) on delete cascade,
    empleado_id             text not null references public.empleados (id),
    empleado_nombre         text not null default '',
    periodo                 char(7) not null check (periodo ~ '^\d{4}-\d{2}$'),
    dias                    numeric(5,2)  not null default 30 check (dias between 0 and 31),
    salario_base            numeric(14,2) not null default 0,
    horas_extra_diurna      numeric(8,2)  not null default 0,
    horas_extra_nocturna    numeric(8,2)  not null default 0,
    horas_recargo_nocturno  numeric(8,2)  not null default 0,
    horas_dominical         numeric(8,2)  not null default 0,
    bonificaciones          numeric(14,2) not null default 0,
    otras_deducciones       numeric(14,2) not null default 0,
    aplica_auxilio          boolean not null default true,
    devengado               numeric(14,2) not null default 0,
    total_deducciones       numeric(14,2) not null default 0,
    neto                    numeric(14,2) not null default 0,
    costo_empleador         numeric(14,2) not null default 0,
    -- Resto de valores calculados: valor hora, extras, salud, pensión, auxilio, provisiones.
    detalle                 jsonb not null default '{}'::jsonb,
    creado_en               timestamptz not null default now(),
    unique (empresa_id, empleado_id, periodo)
);
create index nominas_empleado on public.nominas (empleado_id);


-- =====================================================================
-- Seguridad: Row Level Security
-- =====================================================================

-- Empresa y rol del usuario conectado. security definer + search_path vacío:
-- las políticas las consultan sin quedar sujetas a su propia RLS.
create or replace function public.empresa_actual()
returns text language sql stable security definer set search_path = '' as $$
    select p.empresa_id from public.perfiles p where p.id = auth.uid() and p.activo
$$;

create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = '' as $$
    select p.rol from public.perfiles p where p.id = auth.uid() and p.activo
$$;

-- Misma regla que ERP.auth.modulosDeRol: el administrador tiene todo,
-- Configuración nunca se delega y, sin selección guardada, rigen los permisos por defecto.
create or replace function public.puede_modulo(modulo text)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((
        select case
            when p.rol = 'administrador' then true
            when modulo = 'configuracion' then false
            when e.permisos_rol ? p.rol then (e.permisos_rol -> p.rol) ? modulo
            when p.rol = 'contador' then modulo = any (array['dashboard','clientes','proveedores','inventario',
                'compras','gastos','ventas','cartera','financieros','equilibrio','prestamos','nomina'])
            when p.rol = 'vendedor' then modulo = any (array['dashboard','clientes','inventario','ventas','cartera'])
            else false
        end
        from public.perfiles p
        join public.empresas e on e.id = p.empresa_id
        where p.id = auth.uid() and p.activo
    ), false)
$$;

-- Consecutivo atómico: dos usuarios facturando a la vez nunca obtienen el mismo número.
create or replace function public.tomar_consecutivo(tipo text)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_empresa text := public.empresa_actual();
    v_valor   integer;
begin
    if v_empresa is null then
        raise exception 'El usuario no pertenece a una empresa activa';
    end if;
    if tipo = 'venta' and public.puede_modulo('ventas') then
        update public.empresas set consecutivo_venta = consecutivo_venta + 1
         where id = v_empresa returning consecutivo_venta - 1 into v_valor;
        return 'FV-' || lpad(v_valor::text, 4, '0');
    elsif tipo = 'compra' and public.puede_modulo('compras') then
        update public.empresas set consecutivo_compra = consecutivo_compra + 1
         where id = v_empresa returning consecutivo_compra - 1 into v_valor;
        return 'FC-' || lpad(v_valor::text, 4, '0');
    end if;
    raise exception 'Sin permiso para numerar documentos de tipo %', tipo;
end
$$;

revoke execute on function public.empresa_actual(), public.rol_actual(), public.puede_modulo(text),
    public.tomar_consecutivo(text) from public, anon;
grant execute on function public.empresa_actual(), public.rol_actual(), public.puede_modulo(text),
    public.tomar_consecutivo(text) to authenticated;

-- Empresas: todos los usuarios leen su empresa; solo el administrador la modifica.
alter table public.empresas enable row level security;
create policy empresas_leer on public.empresas for select to authenticated
    using (id = (select public.empresa_actual()));
create policy empresas_modificar on public.empresas for update to authenticated
    using (id = (select public.empresa_actual()) and (select public.rol_actual()) = 'administrador')
    with check (id = (select public.empresa_actual()));

-- Perfiles: los usuarios de la empresa se ven entre sí; solo el administrador los gestiona.
alter table public.perfiles enable row level security;
create policy perfiles_leer on public.perfiles for select to authenticated
    using (empresa_id = (select public.empresa_actual()));
create policy perfiles_crear on public.perfiles for insert to authenticated
    with check (empresa_id = (select public.empresa_actual()) and (select public.rol_actual()) = 'administrador');
create policy perfiles_modificar on public.perfiles for update to authenticated
    using (empresa_id = (select public.empresa_actual()) and (select public.rol_actual()) = 'administrador')
    with check (empresa_id = (select public.empresa_actual()));
create policy perfiles_eliminar on public.perfiles for delete to authenticated
    using (empresa_id = (select public.empresa_actual()) and (select public.rol_actual()) = 'administrador');

-- Tablas de operación: todos los usuarios activos de la empresa LEEN (el tablero y los
-- estados financieros cruzan varias tablas); ESCRIBE quien tiene el módulo habilitado.
do $$
declare
    regla record;
begin
    for regla in
        select * from (values
            ('terceros',     $x$public.puede_modulo(case when tipo = 'cliente' then 'clientes' else 'proveedores' end)
                              or public.puede_modulo(case when tipo = 'cliente' then 'ventas' else 'compras' end)
                              or (tipo = 'proveedor' and public.puede_modulo('gastos'))$x$),
            ('productos',    $x$public.puede_modulo('inventario') or public.puede_modulo('compras') or public.puede_modulo('ventas')$x$),
            ('empleados',    $x$public.puede_modulo('nomina')$x$),
            ('ventas',       $x$public.puede_modulo('ventas')$x$),
            ('venta_items',  $x$public.puede_modulo('ventas')$x$),
            ('abonos',       $x$public.puede_modulo('cartera') or public.puede_modulo('ventas')$x$),
            ('compras',      $x$public.puede_modulo('compras')$x$),
            ('compra_items', $x$public.puede_modulo('compras')$x$),
            ('pagos_compra', $x$public.puede_modulo('compras')$x$),
            ('gastos',       $x$public.puede_modulo('gastos') or public.puede_modulo('nomina')$x$),
            ('presupuestos', $x$public.puede_modulo('financieros')$x$),
            ('nominas',      $x$public.puede_modulo('nomina')$x$)
        ) as t(tabla, permiso)
    loop
        execute format('alter table public.%I enable row level security', regla.tabla);
        execute format(
            'create policy %I on public.%I for select to authenticated using (empresa_id = (select public.empresa_actual()))',
            regla.tabla || '_leer', regla.tabla);
        execute format(
            'create policy %I on public.%I for insert to authenticated with check (empresa_id = (select public.empresa_actual()) and (%s))',
            regla.tabla || '_crear', regla.tabla, regla.permiso);
        execute format(
            'create policy %I on public.%I for update to authenticated using (empresa_id = (select public.empresa_actual()) and (%s)) with check (empresa_id = (select public.empresa_actual()))',
            regla.tabla || '_modificar', regla.tabla, regla.permiso);
        execute format(
            'create policy %I on public.%I for delete to authenticated using (empresa_id = (select public.empresa_actual()) and (%s))',
            regla.tabla || '_eliminar', regla.tabla, regla.permiso);
    end loop;
end
$$;
