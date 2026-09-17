-- =====================================================================
-- ERP DASH-BI · Organización SaaS multiempresa y roles en árbol
--
-- Añade el nivel de plataforma sobre el modelo que ya existe, sin tocar
-- los datos de las organizaciones actuales. El árbol queda así:
--
--   Nivel 0 · Plataforma      super_administrador   (sin empresa)
--   Nivel 1 · Organización    administrador         (una empresa)
--   Nivel 2 · Operación       contador · vendedor · auxiliar
--
-- Cada perfil guarda parent_id: quién lo dio de alta. Eso es lo que
-- permite dibujar el árbol y auditar de dónde salió cada acceso.
--
-- AISLAMIENTO. No cambia: cada usuario solo ve su empresa, por RLS. El
-- super administrador NO entra a los datos de nadie: su empresa_actual()
-- es nula, así que ninguna política de las tablas de operación lo deja
-- pasar. Gobierna organizaciones (altas, suspensiones, auditoría) a
-- través de las funciones saas_*, que comprueban su rol una por una.
--
-- SUSPENDER una organización deja fuera a todos sus usuarios de
-- inmediato: privado.empresa_actual() solo devuelve empresas activas.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin efectos adicionales.
-- Aplicar en el SQL Editor de Supabase o con `apply_migration`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Roles nuevos y jerarquía en las tablas existentes
-- ---------------------------------------------------------------------

-- El super administrador es de plataforma: no pertenece a ninguna empresa.
alter table public.perfiles alter column empresa_id drop not null;

alter table public.perfiles
    add column if not exists parent_id uuid references public.perfiles (id) on delete set null;

comment on column public.perfiles.parent_id is
    'Perfil que dio de alta a este usuario: el super administrador para los administradores de organización, y el administrador para los perfiles operativos.';

create index if not exists perfiles_parent on public.perfiles (parent_id);

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
    check (rol in ('super_administrador', 'administrador', 'contador', 'vendedor', 'auxiliar'));

-- Un perfil de plataforma no tiene empresa; cualquier otro la exige.
alter table public.perfiles drop constraint if exists perfiles_empresa_segun_rol;
alter table public.perfiles add constraint perfiles_empresa_segun_rol
    check ((rol = 'super_administrador' and empresa_id is null)
        or (rol <> 'super_administrador' and empresa_id is not null));

-- Nadie se invita a sí mismo a la plataforma: el rol de super administrador
-- no se puede repartir por correo (ver el apartado 9).
alter table public.invitaciones drop constraint if exists invitaciones_rol_check;
alter table public.invitaciones add constraint invitaciones_rol_check
    check (rol in ('administrador', 'contador', 'vendedor', 'auxiliar'));


-- ---------------------------------------------------------------------
-- 2. Estado de cada organización
-- ---------------------------------------------------------------------
alter table public.empresas
    add column if not exists estado     text not null default 'activa',
    add column if not exists creada_por uuid references auth.users (id);

alter table public.empresas drop constraint if exists empresas_estado_check;
alter table public.empresas add constraint empresas_estado_check
    check (estado in ('activa', 'suspendida'));

create index if not exists empresas_estado on public.empresas (estado);
create index if not exists empresas_creada_por on public.empresas (creada_por);


-- ---------------------------------------------------------------------
-- 3. Ayudantes privados (no se publican en la API)
-- ---------------------------------------------------------------------

create or replace function privado.es_super()
returns boolean language sql stable security definer set search_path = '' as $fn$
    select exists (
        select 1 from public.perfiles p
         where p.id = auth.uid() and p.activo and p.rol = 'super_administrador')
$fn$;

-- Una organización suspendida deja de existir para sus usuarios.
create or replace function privado.empresa_actual()
returns text language sql stable security definer set search_path = '' as $fn$
    select p.empresa_id
      from public.perfiles p
      join public.empresas e on e.id = p.empresa_id
     where p.id = auth.uid() and p.activo and e.estado = 'activa'
$fn$;

create or replace function privado.rol_actual()
returns text language sql stable security definer set search_path = '' as $fn$
    select p.rol from public.perfiles p where p.id = auth.uid() and p.activo
$fn$;

/* Misma regla que ERP.auth.modulosDeRol en el navegador. Las dos listas
   tienen que cambiar juntas: esta manda sobre los datos, la del cliente
   solo sobre lo que se dibuja. */
create or replace function privado.puede_modulo(modulo text)
returns boolean language sql stable security definer set search_path = '' as $fn$
    select coalesce((
        select case
            -- La plataforma no toca datos de ninguna organización.
            when p.rol = 'super_administrador' then false
            when p.rol = 'administrador' then modulo <> 'plataforma'
            when modulo in ('configuracion', 'plataforma') then false
            when e.permisos_rol ? p.rol then (e.permisos_rol -> p.rol) ? modulo
            when p.rol = 'contador' then modulo = any (array['dashboard','clientes','proveedores','inventario',
                'compras','gastos','ventas','cartera','financieros','equilibrio','prestamos','nomina'])
            when p.rol = 'vendedor' then modulo = any (array['dashboard','clientes','inventario','ventas','cartera'])
            when p.rol = 'auxiliar' then modulo = any (array['dashboard','clientes','proveedores','inventario',
                'compras','gastos','cartera'])
            else false
        end
        from public.perfiles p
        join public.empresas e on e.id = p.empresa_id
        where p.id = auth.uid() and p.activo and e.estado = 'activa'
    ), false)
$fn$;


-- ---------------------------------------------------------------------
-- 4. Al registrarse, el perfil hereda de quien lo invitó
-- ---------------------------------------------------------------------
create or replace function privado.al_registrar_usuario()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
    inv       public.invitaciones%rowtype;
    v_usuario text;
    v_padre   uuid;
    v_intento integer := 1;
begin
    if new.email is null then return new; end if;

    select * into inv
      from public.invitaciones
     where lower(email) = lower(new.email)
       and estado = 'pendiente'
       and expira_en > now()
     order by creada_en desc
     limit 1;
    if not found then return new; end if;

    v_usuario := inv.usuario;
    while exists (select 1 from public.perfiles p
                   where p.empresa_id = inv.empresa_id and p.usuario = v_usuario) loop
        v_intento := v_intento + 1;
        v_usuario := left(inv.usuario, 27) || v_intento::text;
    end loop;

    -- Solo si quien invitó tiene perfil: parent_id apunta a public.perfiles.
    select p.id into v_padre from public.perfiles p where p.id = inv.creada_por;

    insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol, parent_id)
    values (new.id, inv.empresa_id, lower(new.email), v_usuario, inv.nombre, inv.rol, v_padre)
    on conflict (id) do nothing;

    update public.invitaciones
       set estado = 'aceptada', aceptada_en = now(), aceptada_por = new.id
     where id = inv.id;

    return new;
end
$fn$;


-- ---------------------------------------------------------------------
-- 5. Plataforma: funciones del super administrador
-- ---------------------------------------------------------------------

/* Todas las organizaciones con su estado, sus administradores y el
   volumen de datos de cada una. Solo lee: no abre los datos de nadie. */
create or replace function public.saas_listar_organizaciones()
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
    if not privado.es_super() then
        raise exception 'Solo el super administrador de la plataforma puede ver las organizaciones';
    end if;

    return jsonb_build_object(
        'organizaciones', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id',             e.id,
                'razonSocial',    e.razon_social,
                'nit',            e.nit,
                'estado',         e.estado,
                'creadaEn',       e.creado_en,
                'rev',            e.rev,
                'sincronizadoEn', e.sincronizado_en,
                'usuarios', jsonb_build_object(
                    'total',   (select count(*) from public.perfiles p where p.empresa_id = e.id),
                    'activos', (select count(*) from public.perfiles p where p.empresa_id = e.id and p.activo)),
                'invitacionesPendientes', (
                    select count(*) from public.invitaciones i
                     where i.empresa_id = e.id and i.estado = 'pendiente' and i.expira_en > now()),
                'administradores', (
                    select coalesce(jsonb_agg(jsonb_build_object(
                        'nombre', p.nombre, 'email', p.email, 'usuario', p.usuario,
                        'activo', p.activo, 'ultimoAcceso', p.ultimo_acceso
                    ) order by p.nombre), '[]'::jsonb)
                    from public.perfiles p
                    where p.empresa_id = e.id and p.rol = 'administrador'),
                'datos', jsonb_build_object(
                    'ventas',    (select count(*) from public.ventas v where v.empresa_id = e.id),
                    'compras',   (select count(*) from public.compras c where c.empresa_id = e.id),
                    'gastos',    (select count(*) from public.gastos g where g.empresa_id = e.id),
                    'productos', (select count(*) from public.productos pr where pr.empresa_id = e.id),
                    'terceros',  (select count(*) from public.terceros t where t.empresa_id = e.id))
            ) order by e.razon_social), '[]'::jsonb)
            from public.empresas e),
        'resumen', jsonb_build_object(
            'organizaciones', (select count(*) from public.empresas),
            'activas',        (select count(*) from public.empresas where estado = 'activa'),
            'usuarios',       (select count(*) from public.perfiles where rol <> 'super_administrador'),
            'superAdmins',    (select count(*) from public.perfiles where rol = 'super_administrador'))
    );
end
$fn$;


/* Da de alta una organización y a su administrador en una sola operación.
   Si el correo ya tiene cuenta y no pertenece a ninguna empresa, entra de
   una vez; si no, queda invitado y entra al registrarse con ese correo. */
create or replace function public.saas_crear_organizacion_con_admin(
    p_nombre_empresa text,
    p_email_admin    text,
    p_nombre_admin   text,
    p_nit            text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
    v_correo  text := lower(trim(coalesce(p_email_admin, '')));
    v_nombre  text := trim(coalesce(p_nombre_admin, ''));
    v_empresa text;
    v_cuenta  uuid;
    v_usuario text;
    v_padre   uuid;
    v_id      uuid;
begin
    if not privado.es_super() then
        raise exception 'Solo el super administrador de la plataforma puede crear organizaciones';
    end if;
    if length(trim(coalesce(p_nombre_empresa, ''))) < 3 then
        raise exception 'Escriba la razón social de la organización (mínimo 3 caracteres)';
    end if;
    if v_correo !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'El correo «%» no es válido', coalesce(p_email_admin, '');
    end if;
    if length(v_nombre) < 3 then
        raise exception 'Escriba el nombre del administrador (mínimo 3 caracteres)';
    end if;
    if exists (select 1 from public.invitaciones i
                where lower(i.email) = v_correo and i.estado = 'pendiente' and i.expira_en > now()) then
        raise exception 'El correo % ya tiene una invitación pendiente', v_correo;
    end if;

    select u.id into v_cuenta from auth.users u where lower(u.email) = v_correo limit 1;
    if v_cuenta is not null and exists (select 1 from public.perfiles p where p.id = v_cuenta) then
        raise exception 'La cuenta % ya pertenece a una organización', v_correo;
    end if;

    insert into public.empresas (razon_social, nit, creada_por)
    values (trim(p_nombre_empresa), coalesce(p_nit, ''), auth.uid())
    returning id into v_empresa;

    -- Nombre de usuario a partir del correo, dentro de la organización nueva.
    v_usuario := left(regexp_replace(split_part(v_correo, '@', 1), '[^a-z0-9._-]', '', 'g'), 27);
    if length(coalesce(v_usuario, '')) < 3 then v_usuario := 'admin'; end if;

    select p.id into v_padre from public.perfiles p where p.id = auth.uid();

    if v_cuenta is not null then
        insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol, parent_id)
        values (v_cuenta, v_empresa, v_correo, v_usuario, v_nombre, 'administrador', v_padre);
        return jsonb_build_object('empresaId', v_empresa, 'estado', 'vinculada',
                                  'email', v_correo, 'usuario', v_usuario);
    end if;

    insert into public.invitaciones (empresa_id, email, usuario, nombre, rol)
    values (v_empresa, v_correo, v_usuario, v_nombre, 'administrador')
    returning id into v_id;

    return jsonb_build_object('empresaId', v_empresa, 'estado', 'pendiente',
                              'invitacionId', v_id, 'email', v_correo, 'usuario', v_usuario);
end
$fn$;


/* Suspender deja fuera a todos los usuarios de esa organización sin
   borrar nada; reactivar los devuelve tal como estaban. */
create or replace function public.saas_cambiar_estado_organizacion(
    p_empresa_id text,
    p_estado     text
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_razon text;
begin
    if not privado.es_super() then
        raise exception 'Solo el super administrador de la plataforma puede cambiar el estado de una organización';
    end if;
    if p_estado not in ('activa', 'suspendida') then
        raise exception 'El estado «%» no existe: use activa o suspendida', coalesce(p_estado, '');
    end if;

    update public.empresas set estado = p_estado
     where id = p_empresa_id
     returning razon_social into v_razon;
    if not found then
        raise exception 'Esa organización no existe';
    end if;

    return jsonb_build_object('ok', true, 'empresaId', p_empresa_id,
                              'razonSocial', v_razon, 'estado', p_estado);
end
$fn$;


-- ---------------------------------------------------------------------
-- 6. Funciones de organización, al día con los roles nuevos
-- ---------------------------------------------------------------------

create or replace function public.mi_perfil()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v jsonb;
begin
    select jsonb_build_object(
        'id',             p.id,
        'usuario',        p.usuario,
        'nombre',         p.nombre,
        'email',          p.email,
        'rol',            p.rol,
        'activo',         p.activo,
        'esSuper',        p.rol = 'super_administrador',
        'parentId',       p.parent_id,
        'empresaId',      p.empresa_id,
        'empresa',        coalesce(e.razon_social, ''),
        'nit',            coalesce(e.nit, ''),
        'estadoEmpresa',  coalesce(e.estado, ''),
        'rev',            coalesce(e.rev, 0),
        'sincronizadoEn', e.sincronizado_en
    ) into v
    from public.perfiles p
    left join public.empresas e on e.id = p.empresa_id
    where p.id = auth.uid() and p.activo;

    if v is not null then
        update public.perfiles set ultimo_acceso = now() where id = auth.uid();
    end if;
    return v;
end
$fn$;


create or replace function public.invitar_usuario(
    p_email   text,
    p_rol     text,
    p_usuario text default null,
    p_nombre  text default null
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
    v_empresa  text := privado.empresa_actual();
    v_correo   text := lower(trim(coalesce(p_email, '')));
    v_usuario  text := lower(trim(coalesce(p_usuario, '')));
    v_nombre   text := trim(coalesce(p_nombre, ''));
    v_cuenta   uuid;
    v_padre    uuid;
    v_intento  integer := 1;
    v_base     text;
    v_id       uuid;
begin
    if v_empresa is null then
        raise exception 'El usuario no pertenece a una empresa activa';
    end if;
    if privado.rol_actual() is distinct from 'administrador' then
        raise exception 'Solo el administrador puede invitar usuarios';
    end if;
    if v_correo !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'El correo «%» no es válido', coalesce(p_email, '');
    end if;
    -- El rol de plataforma no se reparte desde una organización.
    if p_rol not in ('administrador', 'contador', 'vendedor', 'auxiliar') then
        raise exception 'El rol «%» no se puede asignar desde la empresa', coalesce(p_rol, '');
    end if;
    if length(v_nombre) < 3 then
        raise exception 'Escriba el nombre de la persona (mínimo 3 caracteres)';
    end if;

    if exists (select 1 from public.perfiles p
                where p.empresa_id = v_empresa and lower(p.email) = v_correo) then
        raise exception 'El correo % ya tiene acceso a esta empresa', v_correo;
    end if;
    if exists (select 1 from public.invitaciones i
                where lower(i.email) = v_correo and i.estado = 'pendiente' and i.expira_en > now()) then
        raise exception 'El correo % ya tiene una invitación pendiente', v_correo;
    end if;

    v_base := nullif(regexp_replace(v_usuario, '[^a-z0-9._-]', '', 'g'), '');
    if v_base is null then
        v_base := regexp_replace(split_part(v_correo, '@', 1), '[^a-z0-9._-]', '', 'g');
    end if;
    v_base := left(coalesce(nullif(v_base, ''), 'usuario'), 27);
    if length(v_base) < 3 then v_base := v_base || 'usr'; end if;
    v_usuario := v_base;
    while exists (select 1 from public.perfiles p
                   where p.empresa_id = v_empresa and p.usuario = v_usuario) loop
        v_intento := v_intento + 1;
        v_usuario := v_base || v_intento::text;
    end loop;

    select u.id into v_cuenta from auth.users u where lower(u.email) = v_correo limit 1;
    select p.id into v_padre from public.perfiles p where p.id = auth.uid();

    if v_cuenta is not null then
        if exists (select 1 from public.perfiles p where p.id = v_cuenta) then
            raise exception 'Esa cuenta ya pertenece a otra empresa';
        end if;
        insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol, parent_id)
        values (v_cuenta, v_empresa, v_correo, v_usuario, v_nombre, p_rol, v_padre);
        return jsonb_build_object('estado', 'vinculada', 'email', v_correo, 'usuario', v_usuario);
    end if;

    insert into public.invitaciones (empresa_id, email, usuario, nombre, rol)
    values (v_empresa, v_correo, v_usuario, v_nombre, p_rol)
    returning id into v_id;

    return jsonb_build_object('estado', 'pendiente', 'id', v_id, 'email', v_correo, 'usuario', v_usuario);
end
$fn$;


create or replace function public.actualizar_perfil(
    p_id     uuid,
    p_nombre text default null,
    p_rol    text default null,
    p_activo boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
    v_empresa text := privado.empresa_actual();
    actual    public.perfiles%rowtype;
    v_nombre  text;
    v_rol     text;
    v_activo  boolean;
begin
    if privado.rol_actual() is distinct from 'administrador' then
        raise exception 'Solo el administrador puede cambiar los usuarios';
    end if;
    select * into actual from public.perfiles where id = p_id and empresa_id = v_empresa;
    if not found then
        raise exception 'Ese usuario no pertenece a esta empresa';
    end if;

    v_nombre := coalesce(nullif(trim(coalesce(p_nombre, '')), ''), actual.nombre);
    v_rol    := coalesce(p_rol, actual.rol);
    v_activo := coalesce(p_activo, actual.activo);
    if v_rol not in ('administrador', 'contador', 'vendedor', 'auxiliar') then
        raise exception 'El rol «%» no se puede asignar desde la empresa', v_rol;
    end if;
    if length(v_nombre) < 3 then
        raise exception 'El nombre debe tener al menos 3 caracteres';
    end if;

    if (actual.rol = 'administrador' and actual.activo)
       and (v_rol <> 'administrador' or not v_activo)
       and not exists (select 1 from public.perfiles p
                        where p.empresa_id = v_empresa and p.id <> p_id
                          and p.rol = 'administrador' and p.activo) then
        raise exception 'La empresa quedaría sin un administrador activo';
    end if;

    update public.perfiles
       set nombre = v_nombre, rol = v_rol, activo = v_activo
     where id = p_id;

    return jsonb_build_object('ok', true);
end
$fn$;


/* Usuarios de la empresa con su jefe, para dibujar el árbol. */
create or replace function public.usuarios_empresa()
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_empresa text := privado.empresa_actual();
begin
    if v_empresa is null then
        raise exception 'El usuario no pertenece a una empresa activa';
    end if;
    return jsonb_build_object(
        'usuarios', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', p.id, 'usuario', p.usuario, 'nombre', p.nombre, 'rol', p.rol,
                'email', p.email, 'activo', p.activo, 'ultimoAcceso', p.ultimo_acceso,
                'creadoEn', p.creado_en,
                'parentId', p.parent_id,
                'parentNombre', (select j.nombre from public.perfiles j where j.id = p.parent_id)
            ) order by case p.rol when 'administrador' then 0 when 'contador' then 1
                                  when 'vendedor' then 2 else 3 end, p.usuario), '[]'::jsonb)
            from public.perfiles p where p.empresa_id = v_empresa),
        'invitaciones', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'email', i.email, 'usuario', i.usuario, 'nombre', i.nombre,
                'rol', i.rol, 'creadaEn', i.creada_en, 'expiraEn', i.expira_en
            ) order by i.creada_en desc), '[]'::jsonb)
            from public.invitaciones i
            where i.empresa_id = v_empresa and i.estado = 'pendiente' and i.expira_en > now())
    );
end
$fn$;


/* Alta por cuenta propia: quien se registra sin invitación crea su
   organización y queda como su administrador. No crea plataforma. */
create or replace function public.crear_empresa(
    razon_social text,
    nit          text default '',
    usuario      text default 'admin',
    nombre       text default 'Administrador'
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
    v_uid     uuid := auth.uid();
    v_usuario text := lower(trim(coalesce(usuario, '')));
    v_nombre  text := trim(coalesce(nombre, ''));
    v_correo  text;
    v_id      text;
begin
    if v_uid is null then
        raise exception 'Inicie sesión antes de crear la empresa';
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
    select lower(u.email) into v_correo from auth.users u where u.id = v_uid;

    insert into public.empresas (razon_social, nit, creada_por)
    values (trim(razon_social), coalesce(nit, ''), v_uid)
    returning id into v_id;

    insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol)
    values (v_uid, v_id, coalesce(v_correo, ''), v_usuario, v_nombre, 'administrador');

    return public.mi_perfil();
end
$fn$;


-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------

-- Cada quien lee siempre su propio perfil, aunque sea de plataforma.
drop policy if exists perfiles_propio on public.perfiles;
create policy perfiles_propio on public.perfiles for select to authenticated
    using (id = (select auth.uid()));

-- El super administrador audita organizaciones, perfiles e invitaciones.
-- Solo lectura: las altas y bajas pasan por las funciones saas_*.
drop policy if exists empresas_super_leer on public.empresas;
create policy empresas_super_leer on public.empresas for select to authenticated
    using ((select privado.es_super()));

drop policy if exists perfiles_super_leer on public.perfiles;
create policy perfiles_super_leer on public.perfiles for select to authenticated
    using ((select privado.es_super()));

drop policy if exists invitaciones_super_leer on public.invitaciones;
create policy invitaciones_super_leer on public.invitaciones for select to authenticated
    using ((select privado.es_super()));


-- ---------------------------------------------------------------------
-- 8. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public.saas_listar_organizaciones(),
    public.saas_crear_organizacion_con_admin(text, text, text, text),
    public.saas_cambiar_estado_organizacion(text, text) from public, anon;
grant execute on function public.saas_listar_organizaciones(),
    public.saas_crear_organizacion_con_admin(text, text, text, text),
    public.saas_cambiar_estado_organizacion(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 9. El primer super administrador
--
-- No hay forma de crearlo desde la aplicación, y es a propósito: quien
-- gobierna la plataforma solo se nombra desde aquí, con acceso a la base.
-- La persona debe haberse registrado antes en la aplicación (así existe
-- su cuenta y su contraseña); esta función la saca de su organización,
-- si tenía una, y la deja en el nivel de plataforma.
--
-- Vive en el esquema privado: no se puede llamar desde la API.
--
--   select privado.nombrar_super_administrador('correo@empresa.com');
-- ---------------------------------------------------------------------
create or replace function privado.nombrar_super_administrador(
    p_email  text,
    p_nombre text default null,
    p_forzar boolean default false
) returns text language plpgsql security definer set search_path = '' as $fn$
declare
    v_correo  text := lower(trim(coalesce(p_email, '')));
    v_cuenta  uuid;
    v_nombre  text;
    v_usuario text;
    actual    public.perfiles%rowtype;
begin
    select u.id into v_cuenta from auth.users u where lower(u.email) = v_correo limit 1;
    if v_cuenta is null then
        raise exception 'No hay ninguna cuenta con el correo %. Regístrela primero en la aplicación.', p_email;
    end if;

    -- Sacarlo de su organización no puede dejarla sin quien la administre.
    select * into actual from public.perfiles where id = v_cuenta;
    if found and actual.rol = 'administrador' and not p_forzar
       and not exists (select 1 from public.perfiles p
                        where p.empresa_id = actual.empresa_id and p.id <> v_cuenta
                          and p.rol = 'administrador' and p.activo) then
        raise exception 'Es el único administrador de su organización: nombre otro antes, o repita con p_forzar => true';
    end if;

    v_nombre := coalesce(nullif(trim(coalesce(p_nombre, '')), ''), 'Super administrador');
    v_usuario := left(regexp_replace(split_part(v_correo, '@', 1), '[^a-z0-9._-]', '', 'g'), 30);
    if length(coalesce(v_usuario, '')) < 3 then v_usuario := 'superadmin'; end if;

    insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol, activo)
    values (v_cuenta, null, v_correo, v_usuario, v_nombre, 'super_administrador', true)
    on conflict (id) do update
       set rol = 'super_administrador', empresa_id = null, activo = true, parent_id = null;

    return format('%s es ahora super administrador de la plataforma', v_correo);
end
$fn$;

revoke execute on function privado.nombrar_super_administrador(text, text, boolean) from public, anon, authenticated;
