-- =====================================================================
-- ERP DASH-BI · Conexión de la aplicación con Supabase (etapa 2)
-- ESTADO: APLICADA el 2026-09-15 en «ERP Financiero» (nxilhcgjjzluywfinicd),
--         migración «conexion_app». Ver 001 (esquema) y 002 (permisos).
--
-- Qué resuelve: la aplicación guarda sus datos en localStorage, que es
-- propio de cada navegador y de cada dirección. Aquí se crean las
-- funciones que permiten guardar esos mismos datos en PostgreSQL y
-- recuperarlos en cualquier equipo, con la forma exacta que maneja la
-- app (assets/JS/db.js, formato 2). El recorrido es de ida y vuelta sin
-- pérdida: lo que se sube es idéntico a lo que se descarga.
--
-- Por qué instantáneas (snapshot) y no una escritura por documento:
--   * La app calcula existencias, costo promedio y saldos en el cliente,
--     en una sola operación sobre todo el conjunto. Subir el conjunto
--     completo dentro de una transacción conserva esa coherencia; subir
--     documento por documento la rompería a mitad de camino.
--   * El volumen es pequeño (cientos de registros): una instantánea pesa
--     menos de 1 MB y viaja en una sola llamada.
--   * La app sigue funcionando sin conexión, que es como se usa hoy.
-- La etapa 3 sustituirá esto por funciones transaccionales por documento.
--
-- Control de concurrencia: empresas.rev sube en cada carga. Quien sube
-- declara la revisión de la que partió; si en la nube ya hay otra, la
-- subida se rechaza en vez de pisar el trabajo del otro usuario.
--
-- Las contraseñas de la app (hash djb2 en data.usuarios) NO viajan a la
-- nube: el acceso a los datos compartidos lo controla Supabase Auth con
-- RLS, y cada navegador conserva sus propios usuarios locales.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columnas que faltaban para reflejar data.config y la sincronización
-- ---------------------------------------------------------------------
alter table public.empresas
    add column if not exists fecha_semilla    date,                                  -- config.fechaSemilla (datos de demostración)
    add column if not exists rev              integer not null default 0,            -- revisión de la instantánea
    add column if not exists sincronizado_en  timestamptz,
    add column if not exists sincronizado_por uuid references auth.users (id);


-- ---------------------------------------------------------------------
-- 2. Quién soy: empresa, rol y revisión actual de la nube
-- ---------------------------------------------------------------------
create or replace function public.mi_perfil()
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'usuario',        p.usuario,
        'nombre',         p.nombre,
        'rol',            p.rol,
        'empresaId',      e.id,
        'empresa',        e.razon_social,
        'nit',            e.nit,
        'rev',            e.rev,
        'sincronizadoEn', e.sincronizado_en
    )
    from public.perfiles p
    join public.empresas e on e.id = p.empresa_id
    where p.id = auth.uid() and p.activo
$$;


-- ---------------------------------------------------------------------
-- 3. Primera vez: crear la empresa y quedar como administrador
--    Sin esto no se puede empezar: perfiles solo admite altas hechas por
--    un administrador, y el primer usuario todavía no tiene perfil.
-- ---------------------------------------------------------------------
create or replace function public.crear_empresa(
    razon_social text,
    nit          text default '',
    usuario      text default 'admin',
    nombre       text default 'Administrador'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_uid     uuid := auth.uid();
    v_usuario text := lower(trim(coalesce(usuario, '')));
    v_nombre  text := trim(coalesce(nombre, ''));
    v_id      text;
begin
    if v_uid is null then
        raise exception 'Inicie sesión en Supabase antes de crear la empresa';
    end if;
    if exists (select 1 from public.perfiles p where p.id = v_uid) then
        raise exception 'Este usuario ya pertenece a una empresa';
    end if;
    if length(trim(coalesce(razon_social, ''))) < 3 then
        raise exception 'Escriba la razón social de la empresa (mínimo 3 caracteres)';
    end if;
    if v_usuario !~ '^[a-z0-9._-]{3,30}$' then
        v_usuario := 'admin';
    end if;
    if length(v_nombre) < 3 then
        v_nombre := 'Administrador';
    end if;

    insert into public.empresas (razon_social, nit)
    values (trim(razon_social), coalesce(nit, ''))
    returning id into v_id;

    insert into public.perfiles (id, empresa_id, usuario, nombre, rol)
    values (v_uid, v_id, v_usuario, v_nombre, 'administrador');

    return public.mi_perfil();
end
$$;


-- ---------------------------------------------------------------------
-- 4. Descargar: devuelve los datos de la empresa con la forma de db.js
--    Las claves van en camelCase y las fechas como AAAA-MM-DD, tal como
--    las escribe y las lee la aplicación.
-- ---------------------------------------------------------------------
create or replace function public.descargar_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_empresa text := privado.empresa_actual();
    e         public.empresas%rowtype;
begin
    if v_empresa is null then
        raise exception 'El usuario no pertenece a una empresa activa';
    end if;
    select * into e from public.empresas where id = v_empresa;

    return jsonb_build_object(
        'version', 2,
        'config', jsonb_build_object(
            'empresa',            e.razon_social,
            'nit',                e.nit,
            'direccion',          e.direccion,
            'ciudad',             e.ciudad,
            'telefono',           e.telefono,
            'email',              e.email,
            'ivaPct',             e.iva_pct,
            'capitalInicial',     e.capital_inicial,
            'salarioMinimo',      e.salario_minimo,
            'auxilioTransporte',  e.auxilio_transporte,
            'topeAuxilioSmmlv',   e.tope_auxilio_smmlv,
            'aporteSaludPct',     e.aporte_salud_pct,
            'aportePensionPct',   e.aporte_pension_pct,
            'consecutivoVenta',   e.consecutivo_venta,
            'consecutivoCompra',  e.consecutivo_compra,
            'permisosRol',        e.permisos_rol
        ) || case when e.fecha_semilla is null then '{}'::jsonb
                  else jsonb_build_object('fechaSemilla', e.fecha_semilla::text) end,

        'terceros', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'tipo', t.tipo, 'tipoDoc', t.tipo_doc, 'documento', t.documento,
                'nombre', t.nombre, 'telefono', t.telefono, 'email', t.email,
                'direccion', t.direccion, 'limiteCredito', t.limite_credito, 'activo', t.activo
            ) order by t.id), '[]'::jsonb)
            from public.terceros t where t.empresa_id = v_empresa),

        'productos', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', p.id, 'sku', p.sku, 'nombre', p.nombre, 'categoria', p.categoria,
                'unidad', p.unidad, 'tipo', p.tipo, 'stock', p.stock, 'stockMinimo', p.stock_minimo,
                'costo', p.costo, 'precio', p.precio, 'gravado', p.gravado, 'activo', p.activo
            ) order by p.id), '[]'::jsonb)
            from public.productos p where p.empresa_id = v_empresa),

        'empleados', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', em.id, 'documento', em.documento, 'nombre', em.nombre, 'cargo', em.cargo,
                'salario', em.salario, 'auxilioTransporte', em.auxilio_transporte,
                'ingreso', coalesce(em.fecha_ingreso::text, ''), 'activo', em.activo
            ) order by em.id), '[]'::jsonb)
            from public.empleados em where em.empresa_id = v_empresa),

        'ventas', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', v.id, 'numero', v.numero, 'fecha', v.fecha::text,
                'clienteId', v.cliente_id, 'vendedorId', coalesce(v.vendedor_id, ''),
                'vendedor', v.vendedor_nombre, 'condicion', v.condicion,
                'diasCredito', v.dias_credito, 'fechaVencimiento', coalesce(v.fecha_vencimiento::text, ''),
                'medioPago', v.medio_pago, 'subtotal', v.subtotal, 'iva', v.iva,
                'total', v.total, 'saldo', v.saldo, 'anulada', v.anulada,
                'observaciones', v.observaciones,
                'items', (
                    select coalesce(jsonb_agg(jsonb_build_object(
                        'productoId', i.producto_id, 'cantidad', i.cantidad,
                        'valorUnitario', i.valor_unitario, 'descuentoPct', i.descuento_pct,
                        'costoUnitario', i.costo_unitario
                    ) order by i.linea), '[]'::jsonb)
                    from public.venta_items i where i.venta_id = v.id)
            ) order by v.numero), '[]'::jsonb)
            from public.ventas v where v.empresa_id = v_empresa),

        'abonos', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', a.id, 'ventaId', a.venta_id, 'clienteId', a.cliente_id,
                'fecha', a.fecha::text, 'valor', a.valor, 'medio', a.medio,
                'observaciones', a.observaciones
            ) order by a.fecha, a.id), '[]'::jsonb)
            from public.abonos a where a.empresa_id = v_empresa),

        'compras', (
            select coalesce(jsonb_agg(
                jsonb_build_object(
                    'id', c.id, 'numero', c.numero, 'fecha', c.fecha::text,
                    'proveedorId', c.proveedor_id, 'documentoProveedor', c.documento_proveedor,
                    'condicion', c.condicion, 'diasCredito', c.dias_credito,
                    'fechaVencimiento', coalesce(c.fecha_vencimiento::text, ''),
                    'medioPago', c.medio_pago, 'subtotal', c.subtotal, 'iva', c.iva,
                    'total', c.total, 'saldo', c.saldo, 'observaciones', c.observaciones,
                    'items', (
                        select coalesce(jsonb_agg(jsonb_build_object(
                            'productoId', i.producto_id, 'cantidad', i.cantidad,
                            'valorUnitario', i.valor_unitario, 'descuentoPct', i.descuento_pct
                        ) order by i.linea), '[]'::jsonb)
                        from public.compra_items i where i.compra_id = c.id)
                )
                || case when c.cufe is null then '{}'::jsonb else jsonb_build_object('cufe', c.cufe) end
                || case when c.archivo_origen is null then '{}'::jsonb else jsonb_build_object('archivoOrigen', c.archivo_origen) end
            order by c.numero), '[]'::jsonb)
            from public.compras c where c.empresa_id = v_empresa),

        'pagosCompra', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', pc.id, 'compraId', pc.compra_id, 'proveedorId', pc.proveedor_id,
                'fecha', pc.fecha::text, 'valor', pc.valor, 'medio', pc.medio
            ) order by pc.fecha, pc.id), '[]'::jsonb)
            from public.pagos_compra pc where pc.empresa_id = v_empresa),

        'gastos', (
            select coalesce(jsonb_agg(
                jsonb_build_object(
                    'id', g.id, 'fecha', g.fecha::text, 'categoria', g.categoria,
                    'descripcion', g.descripcion, 'valor', g.valor, 'pagado', g.pagado,
                    'medio', g.medio, 'proveedor', g.proveedor, 'referencia', g.referencia,
                    'origen', g.origen
                )
                || case when g.cufe is null then '{}'::jsonb else jsonb_build_object('cufe', g.cufe) end
                || case when g.archivo_origen is null then '{}'::jsonb else jsonb_build_object('archivoOrigen', g.archivo_origen) end
            order by g.fecha, g.id), '[]'::jsonb)
            from public.gastos g where g.empresa_id = v_empresa),

        'presupuestos', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', pr.id, 'periodo', pr.periodo, 'categoria', pr.categoria, 'monto', pr.monto
            ) order by pr.periodo, pr.categoria), '[]'::jsonb)
            from public.presupuestos pr where pr.empresa_id = v_empresa),

        -- detalle guarda los valores calculados que la app añade a cada
        -- liquidación (valor hora, extras, salud, pensión, provisiones…).
        'nominas', (
            select coalesce(jsonb_agg(n.detalle || jsonb_build_object(
                'id', n.id, 'empleadoId', n.empleado_id, 'empleadoNombre', n.empleado_nombre,
                'periodo', n.periodo, 'dias', n.dias, 'salarioBase', n.salario_base,
                'horasExtraDiurna', n.horas_extra_diurna, 'horasExtraNocturna', n.horas_extra_nocturna,
                'horasRecargoNocturno', n.horas_recargo_nocturno, 'horasDominical', n.horas_dominical,
                'bonificaciones', n.bonificaciones, 'otrasDeducciones', n.otras_deducciones,
                'aplicaAuxilio', n.aplica_auxilio, 'devengado', n.devengado,
                'totalDeducciones', n.total_deducciones, 'neto', n.neto,
                'costoEmpleador', n.costo_empleador
            ) order by n.periodo, n.id), '[]'::jsonb)
            from public.nominas n where n.empresa_id = v_empresa),

        'nube', jsonb_build_object(
            'rev', e.rev,
            'sincronizadoEn', e.sincronizado_en,
            'empresaId', e.id)
    );
end
$$;


-- ---------------------------------------------------------------------
-- 5. Subir: reemplaza los datos de la empresa por la instantánea local
--    Todo ocurre dentro de la transacción de la función: o entra el
--    conjunto completo, o no cambia nada.
-- ---------------------------------------------------------------------
create or replace function public.subir_snapshot(payload jsonb, rev_base integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_empresa    text := privado.empresa_actual();
    v_rol        text := privado.rol_actual();
    v_rev        integer;
    v_cfg        jsonb := coalesce(payload -> 'config', '{}'::jsonb);
    v_terceros   jsonb := coalesce(payload -> 'terceros', '[]'::jsonb);
    v_productos  jsonb := coalesce(payload -> 'productos', '[]'::jsonb);
    v_empleados  jsonb := coalesce(payload -> 'empleados', '[]'::jsonb);
    v_ventas     jsonb := coalesce(payload -> 'ventas', '[]'::jsonb);
    v_abonos     jsonb := coalesce(payload -> 'abonos', '[]'::jsonb);
    v_compras    jsonb := coalesce(payload -> 'compras', '[]'::jsonb);
    v_pagos      jsonb := coalesce(payload -> 'pagosCompra', '[]'::jsonb);
    v_gastos     jsonb := coalesce(payload -> 'gastos', '[]'::jsonb);
    v_presup     jsonb := coalesce(payload -> 'presupuestos', '[]'::jsonb);
    v_nominas    jsonb := coalesce(payload -> 'nominas', '[]'::jsonb);
    ids_tercero  text[];
    ids_producto text[];
    ids_venta    text[];
    ids_compra   text[];
    ids_empleado text[];
    v_falla      text;
begin
    if v_empresa is null then
        raise exception 'El usuario no pertenece a una empresa activa';
    end if;
    if v_rol is distinct from 'administrador' then
        raise exception 'Solo el administrador puede reemplazar los datos de la empresa en la nube';
    end if;
    if (payload ->> 'version') is distinct from '2' then
        raise exception 'La instantánea tiene el formato % y la nube usa el formato 2', coalesce(payload ->> 'version', 'desconocido');
    end if;
    if length(trim(coalesce(v_cfg ->> 'empresa', ''))) < 3 then
        raise exception 'La instantánea no trae la razón social de la empresa';
    end if;

    select e.rev into v_rev from public.empresas e where e.id = v_empresa for update;
    if rev_base is not null and rev_base <> v_rev then
        raise exception 'CONFLICTO: la nube va en la revisión % y usted partió de la %. Descargue antes de subir.', v_rev, rev_base;
    end if;

    -- Integridad referencial: se revisa antes de borrar nada, para que un
    -- dato suelto no deje la nube a medio escribir.
    ids_tercero  := array(select x ->> 'id' from jsonb_array_elements(v_terceros) x);
    ids_producto := array(select x ->> 'id' from jsonb_array_elements(v_productos) x);
    ids_venta    := array(select x ->> 'id' from jsonb_array_elements(v_ventas) x);
    ids_compra   := array(select x ->> 'id' from jsonb_array_elements(v_compras) x);
    ids_empleado := array(select x ->> 'id' from jsonb_array_elements(v_empleados) x);

    select 'la venta ' || (v ->> 'numero') || ' apunta a un cliente que no existe' into v_falla
      from jsonb_array_elements(v_ventas) v where not ((v ->> 'clienteId') = any (ids_tercero)) limit 1;
    if v_falla is null then
        select 'la venta ' || (v ->> 'numero') || ' tiene un producto que no existe' into v_falla
          from jsonb_array_elements(v_ventas) v, jsonb_array_elements(v -> 'items') i
         where not ((i ->> 'productoId') = any (ids_producto)) limit 1;
    end if;
    if v_falla is null then
        select 'la compra ' || (c ->> 'numero') || ' apunta a un proveedor que no existe' into v_falla
          from jsonb_array_elements(v_compras) c where not ((c ->> 'proveedorId') = any (ids_tercero)) limit 1;
    end if;
    if v_falla is null then
        select 'la compra ' || (c ->> 'numero') || ' tiene un producto que no existe' into v_falla
          from jsonb_array_elements(v_compras) c, jsonb_array_elements(c -> 'items') i
         where not ((i ->> 'productoId') = any (ids_producto)) limit 1;
    end if;
    if v_falla is null then
        select 'hay un abono sobre una venta que no existe' into v_falla
          from jsonb_array_elements(v_abonos) a where not ((a ->> 'ventaId') = any (ids_venta)) limit 1;
    end if;
    if v_falla is null then
        select 'hay un pago sobre una compra que no existe' into v_falla
          from jsonb_array_elements(v_pagos) p where not ((p ->> 'compraId') = any (ids_compra)) limit 1;
    end if;
    if v_falla is null then
        select 'hay una nómina de un empleado que no existe' into v_falla
          from jsonb_array_elements(v_nominas) n where not ((n ->> 'empleadoId') = any (ids_empleado)) limit 1;
    end if;
    if v_falla is not null then
        raise exception 'No se subió nada: %. Revise los datos locales.', v_falla;
    end if;

    -- Se borra en orden inverso a las dependencias y se vuelve a insertar.
    delete from public.venta_items  where empresa_id = v_empresa;
    delete from public.abonos       where empresa_id = v_empresa;
    delete from public.ventas       where empresa_id = v_empresa;
    delete from public.compra_items where empresa_id = v_empresa;
    delete from public.pagos_compra where empresa_id = v_empresa;
    delete from public.compras      where empresa_id = v_empresa;
    delete from public.nominas      where empresa_id = v_empresa;
    delete from public.gastos       where empresa_id = v_empresa;
    delete from public.presupuestos where empresa_id = v_empresa;
    delete from public.empleados    where empresa_id = v_empresa;
    delete from public.productos    where empresa_id = v_empresa;
    delete from public.terceros     where empresa_id = v_empresa;

    insert into public.terceros (id, empresa_id, tipo, tipo_doc, documento, nombre, telefono, email, direccion, limite_credito, activo)
    select x ->> 'id', v_empresa,
           case when (x ->> 'tipo') = 'proveedor' then 'proveedor' else 'cliente' end,
           coalesce(nullif(x ->> 'tipoDoc', ''), 'NIT'), coalesce(x ->> 'documento', ''),
           coalesce(x ->> 'nombre', ''), coalesce(x ->> 'telefono', ''), coalesce(x ->> 'email', ''),
           coalesce(x ->> 'direccion', ''), coalesce((x ->> 'limiteCredito')::numeric, 0),
           coalesce((x ->> 'activo')::boolean, true)
      from jsonb_array_elements(v_terceros) x;

    insert into public.productos (id, empresa_id, sku, nombre, categoria, unidad, tipo, stock, stock_minimo, costo, precio, gravado, activo)
    select x ->> 'id', v_empresa, coalesce(x ->> 'sku', x ->> 'id'), coalesce(x ->> 'nombre', ''),
           coalesce(nullif(x ->> 'categoria', ''), 'General'), coalesce(nullif(x ->> 'unidad', ''), 'UND'),
           case when (x ->> 'tipo') = 'servicio' then 'servicio' else 'producto' end,
           coalesce((x ->> 'stock')::numeric, 0), coalesce((x ->> 'stockMinimo')::numeric, 0),
           coalesce((x ->> 'costo')::numeric, 0), coalesce((x ->> 'precio')::numeric, 0),
           coalesce((x ->> 'gravado')::boolean, true), coalesce((x ->> 'activo')::boolean, true)
      from jsonb_array_elements(v_productos) x;

    insert into public.empleados (id, empresa_id, documento, nombre, cargo, salario, auxilio_transporte, fecha_ingreso, activo)
    select x ->> 'id', v_empresa, coalesce(x ->> 'documento', ''), coalesce(x ->> 'nombre', ''),
           coalesce(x ->> 'cargo', ''), coalesce((x ->> 'salario')::numeric, 0),
           coalesce((x ->> 'auxilioTransporte')::boolean, true),
           nullif(x ->> 'ingreso', '')::date, coalesce((x ->> 'activo')::boolean, true)
      from jsonb_array_elements(v_empleados) x;

    insert into public.ventas (id, empresa_id, numero, fecha, cliente_id, vendedor_id, vendedor_nombre,
                               condicion, dias_credito, fecha_vencimiento, medio_pago,
                               subtotal, iva, total, saldo, anulada, observaciones)
    select x ->> 'id', v_empresa, coalesce(x ->> 'numero', x ->> 'id'), (x ->> 'fecha')::date,
           x ->> 'clienteId',
           case when (x ->> 'vendedorId') = any (ids_empleado) then x ->> 'vendedorId' end,
           coalesce(x ->> 'vendedor', ''),
           case when (x ->> 'condicion') = 'credito' then 'credito' else 'contado' end,
           coalesce((x ->> 'diasCredito')::integer, 0), nullif(x ->> 'fechaVencimiento', '')::date,
           coalesce(x ->> 'medioPago', ''), coalesce((x ->> 'subtotal')::numeric, 0),
           coalesce((x ->> 'iva')::numeric, 0), coalesce((x ->> 'total')::numeric, 0),
           coalesce((x ->> 'saldo')::numeric, 0), coalesce((x ->> 'anulada')::boolean, false),
           coalesce(x ->> 'observaciones', '')
      from jsonb_array_elements(v_ventas) x;

    insert into public.venta_items (empresa_id, venta_id, linea, producto_id, cantidad, valor_unitario, descuento_pct, costo_unitario)
    select v_empresa, x ->> 'id', i.orden, i.item ->> 'productoId',
           (i.item ->> 'cantidad')::numeric, coalesce((i.item ->> 'valorUnitario')::numeric, 0),
           coalesce((i.item ->> 'descuentoPct')::numeric, 0), coalesce((i.item ->> 'costoUnitario')::numeric, 0)
      from jsonb_array_elements(v_ventas) x,
           lateral jsonb_array_elements(coalesce(x -> 'items', '[]'::jsonb)) with ordinality as i(item, orden);

    insert into public.abonos (id, empresa_id, venta_id, cliente_id, fecha, valor, medio, observaciones)
    select x ->> 'id', v_empresa, x ->> 'ventaId', x ->> 'clienteId', (x ->> 'fecha')::date,
           (x ->> 'valor')::numeric, coalesce(x ->> 'medio', ''), coalesce(x ->> 'observaciones', '')
      from jsonb_array_elements(v_abonos) x;

    insert into public.compras (id, empresa_id, numero, fecha, proveedor_id, documento_proveedor,
                                condicion, dias_credito, fecha_vencimiento, medio_pago,
                                subtotal, iva, total, saldo, observaciones, cufe, archivo_origen)
    select x ->> 'id', v_empresa, coalesce(x ->> 'numero', x ->> 'id'), (x ->> 'fecha')::date,
           x ->> 'proveedorId', coalesce(x ->> 'documentoProveedor', ''),
           case when (x ->> 'condicion') = 'credito' then 'credito' else 'contado' end,
           coalesce((x ->> 'diasCredito')::integer, 0), nullif(x ->> 'fechaVencimiento', '')::date,
           coalesce(x ->> 'medioPago', ''), coalesce((x ->> 'subtotal')::numeric, 0),
           coalesce((x ->> 'iva')::numeric, 0), coalesce((x ->> 'total')::numeric, 0),
           coalesce((x ->> 'saldo')::numeric, 0), coalesce(x ->> 'observaciones', ''),
           nullif(x ->> 'cufe', ''), nullif(x ->> 'archivoOrigen', '')
      from jsonb_array_elements(v_compras) x;

    insert into public.compra_items (empresa_id, compra_id, linea, producto_id, cantidad, valor_unitario, descuento_pct)
    select v_empresa, x ->> 'id', i.orden, i.item ->> 'productoId',
           (i.item ->> 'cantidad')::numeric, coalesce((i.item ->> 'valorUnitario')::numeric, 0),
           coalesce((i.item ->> 'descuentoPct')::numeric, 0)
      from jsonb_array_elements(v_compras) x,
           lateral jsonb_array_elements(coalesce(x -> 'items', '[]'::jsonb)) with ordinality as i(item, orden);

    insert into public.pagos_compra (id, empresa_id, compra_id, proveedor_id, fecha, valor, medio)
    select x ->> 'id', v_empresa, x ->> 'compraId', x ->> 'proveedorId', (x ->> 'fecha')::date,
           (x ->> 'valor')::numeric, coalesce(x ->> 'medio', '')
      from jsonb_array_elements(v_pagos) x;

    insert into public.gastos (id, empresa_id, fecha, categoria, descripcion, valor, pagado, medio,
                               proveedor, referencia, origen, cufe, archivo_origen)
    select x ->> 'id', v_empresa, (x ->> 'fecha')::date, coalesce(x ->> 'categoria', 'Otros gastos'),
           coalesce(x ->> 'descripcion', ''), (x ->> 'valor')::numeric,
           coalesce((x ->> 'pagado')::boolean, true), coalesce(x ->> 'medio', ''),
           coalesce(x ->> 'proveedor', ''), coalesce(x ->> 'referencia', ''),
           coalesce(nullif(x ->> 'origen', ''), 'manual'), nullif(x ->> 'cufe', ''), nullif(x ->> 'archivoOrigen', '')
      from jsonb_array_elements(v_gastos) x;

    insert into public.presupuestos (id, empresa_id, periodo, categoria, monto)
    select x ->> 'id', v_empresa, x ->> 'periodo', coalesce(x ->> 'categoria', 'Otros gastos'),
           coalesce((x ->> 'monto')::numeric, 0)
      from jsonb_array_elements(v_presup) x;

    insert into public.nominas (id, empresa_id, empleado_id, empleado_nombre, periodo, dias, salario_base,
                                horas_extra_diurna, horas_extra_nocturna, horas_recargo_nocturno, horas_dominical,
                                bonificaciones, otras_deducciones, aplica_auxilio, devengado,
                                total_deducciones, neto, costo_empleador, detalle)
    select x ->> 'id', v_empresa, x ->> 'empleadoId', coalesce(x ->> 'empleadoNombre', ''), x ->> 'periodo',
           coalesce((x ->> 'dias')::numeric, 30), coalesce((x ->> 'salarioBase')::numeric, 0),
           coalesce((x ->> 'horasExtraDiurna')::numeric, 0), coalesce((x ->> 'horasExtraNocturna')::numeric, 0),
           coalesce((x ->> 'horasRecargoNocturno')::numeric, 0), coalesce((x ->> 'horasDominical')::numeric, 0),
           coalesce((x ->> 'bonificaciones')::numeric, 0), coalesce((x ->> 'otrasDeducciones')::numeric, 0),
           coalesce((x ->> 'aplicaAuxilio')::boolean, true), coalesce((x ->> 'devengado')::numeric, 0),
           coalesce((x ->> 'totalDeducciones')::numeric, 0), coalesce((x ->> 'neto')::numeric, 0),
           coalesce((x ->> 'costoEmpleador')::numeric, 0),
           -- El resto de valores calculados viaja tal cual y vuelve igual al descargar.
           x - array['id', 'empleadoId', 'empleadoNombre', 'periodo', 'dias', 'salarioBase',
                     'horasExtraDiurna', 'horasExtraNocturna', 'horasRecargoNocturno', 'horasDominical',
                     'bonificaciones', 'otrasDeducciones', 'aplicaAuxilio', 'devengado',
                     'totalDeducciones', 'neto', 'costoEmpleador']
      from jsonb_array_elements(v_nominas) x;

    update public.empresas set
        razon_social       = trim(v_cfg ->> 'empresa'),
        nit                = coalesce(v_cfg ->> 'nit', ''),
        direccion          = coalesce(v_cfg ->> 'direccion', ''),
        ciudad             = coalesce(v_cfg ->> 'ciudad', ''),
        telefono           = coalesce(v_cfg ->> 'telefono', ''),
        email              = coalesce(v_cfg ->> 'email', ''),
        iva_pct            = coalesce((v_cfg ->> 'ivaPct')::numeric, 19),
        capital_inicial    = coalesce((v_cfg ->> 'capitalInicial')::numeric, 0),
        salario_minimo     = coalesce((v_cfg ->> 'salarioMinimo')::numeric, 0),
        auxilio_transporte = coalesce((v_cfg ->> 'auxilioTransporte')::numeric, 0),
        tope_auxilio_smmlv = coalesce((v_cfg ->> 'topeAuxilioSmmlv')::numeric, 2),
        aporte_salud_pct   = coalesce((v_cfg ->> 'aporteSaludPct')::numeric, 4),
        aporte_pension_pct = coalesce((v_cfg ->> 'aportePensionPct')::numeric, 4),
        consecutivo_venta  = greatest(coalesce((v_cfg ->> 'consecutivoVenta')::integer, 1), 1),
        consecutivo_compra = greatest(coalesce((v_cfg ->> 'consecutivoCompra')::integer, 1), 1),
        permisos_rol       = case when jsonb_typeof(v_cfg -> 'permisosRol') = 'object' then v_cfg -> 'permisosRol' else '{}'::jsonb end,
        fecha_semilla      = nullif(v_cfg ->> 'fechaSemilla', '')::date,
        rev                = rev + 1,
        sincronizado_en    = now(),
        sincronizado_por   = auth.uid()
     where id = v_empresa
     returning rev into v_rev;

    return jsonb_build_object(
        'rev', v_rev,
        'sincronizadoEn', now(),
        'resumen', jsonb_build_object(
            'terceros',     jsonb_array_length(v_terceros),
            'productos',    jsonb_array_length(v_productos),
            'empleados',    jsonb_array_length(v_empleados),
            'ventas',       jsonb_array_length(v_ventas),
            'compras',      jsonb_array_length(v_compras),
            'gastos',       jsonb_array_length(v_gastos),
            'abonos',       jsonb_array_length(v_abonos),
            'pagosCompra',  jsonb_array_length(v_pagos),
            'presupuestos', jsonb_array_length(v_presup),
            'nominas',      jsonb_array_length(v_nominas)));
end
$$;


-- ---------------------------------------------------------------------
-- 6. Permisos de ejecución: nada para el visitante anónimo
-- ---------------------------------------------------------------------
revoke execute on function public.mi_perfil(), public.crear_empresa(text, text, text, text),
    public.descargar_snapshot(), public.subir_snapshot(jsonb, integer) from public, anon;
grant execute on function public.mi_perfil(), public.crear_empresa(text, text, text, text),
    public.descargar_snapshot(), public.subir_snapshot(jsonb, integer) to authenticated;
