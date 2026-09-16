-- =====================================================================
-- ERP DASH-BI · Registro de usuarios con correo y contraseña (etapa 3)
-- ESTADO: APLICADA el 2026-09-15 en «ERP Financiero» (nxilhcgjjzluywfinicd),
--         migración «registro_usuarios».
--
-- Objetivo: que los usuarios de la aplicación se registren con su correo y
-- que su contraseña no quede en ningún navegador.
--
-- DÓNDE VIVEN LAS CREDENCIALES
--   auth.users (Supabase Auth) es la tabla de credenciales. Guarda el correo
--   y la contraseña cifrada con bcrypt, no se puede leer desde la API ni
--   desde el navegador, y trae confirmación de correo, recuperación de
--   contraseña y expiración de sesiones. No se crea una tabla propia de
--   contraseñas a propósito: cifrarlas a mano sería menos seguro.
--
--   public.perfiles es la tabla de los usuarios de la aplicación. Una fila
--   por persona, con el mismo id que auth.users, su correo de registro, su
--   nombre de usuario, su nombre y su rol dentro de la empresa. Nunca
--   contiene contraseñas.
--
--   public.invitaciones decide quién puede registrarse. El administrador
--   anota el correo, el rol y el nombre; cuando esa persona crea su cuenta,
--   un disparador sobre auth.users le crea el perfil y marca la invitación
--   como aceptada. Sin invitación, quien se registra no entra a ninguna
--   empresa: solo puede crear la suya.
--
-- Con esto, el navegador no guarda ninguna contraseña: solo el testigo de
-- sesión que devuelve Supabase, que caduca y se puede revocar.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Perfiles: correo de registro y rastro del último acceso
-- ---------------------------------------------------------------------
alter table public.perfiles
    add column if not exists email          text not null default '',
    add column if not exists ultimo_acceso  timestamptz;

update public.perfiles p
   set email = lower(u.email)
  from auth.users u
 where u.id = p.id and p.email = '' and u.email is not null;

-- Un mismo correo no se repite dentro de una empresa.
create unique index if not exists perfiles_email_empresa
    on public.perfiles (empresa_id, lower(email)) where email <> '';


-- ---------------------------------------------------------------------
-- 2. Invitaciones: quién puede registrarse y con qué rol
-- ---------------------------------------------------------------------
create table if not exists public.invitaciones (
    id            uuid primary key default gen_random_uuid(),
    empresa_id    text not null references public.empresas (id) on delete cascade,
    email         text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    usuario       text not null check (usuario ~ '^[a-z0-9._-]{3,30}$'),
    nombre        text not null check (length(trim(nombre)) >= 3),
    rol           text not null check (rol in ('administrador', 'contador', 'vendedor')),
    estado        text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'revocada')),
    creada_por    uuid references auth.users (id) default auth.uid(),
    creada_en     timestamptz not null default now(),
    expira_en     timestamptz not null default now() + interval '30 days',
    aceptada_en   timestamptz,
    aceptada_por  uuid references auth.users (id)
);

-- Un correo no puede tener dos invitaciones pendientes: al registrarse, el
-- disparador sabría a qué empresa mandarlo.
create unique index if not exists invitaciones_pendiente
    on public.invitaciones (lower(email)) where estado = 'pendiente';
create index if not exists invitaciones_empresa on public.invitaciones (empresa_id, estado);
create index if not exists invitaciones_creada_por on public.invitaciones (creada_por);
create index if not exists invitaciones_aceptada_por on public.invitaciones (aceptada_por);


-- ---------------------------------------------------------------------
-- 3. Al registrarse: si hay invitación, se crea el perfil
-- ---------------------------------------------------------------------
create or replace function privado.al_registrar_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    inv       public.invitaciones%rowtype;
    v_usuario text;
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

    -- El nombre de usuario es único dentro de la empresa; si ya se ocupó
    -- entre la invitación y el registro, se numera en vez de fallar.
    v_usuario := inv.usuario;
    while exists (select 1 from public.perfiles p
                   where p.empresa_id = inv.empresa_id and p.usuario = v_usuario) loop
        v_intento := v_intento + 1;
        v_usuario := left(inv.usuario, 27) || v_intento::text;
    end loop;

    insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol)
    values (new.id, inv.empresa_id, lower(new.email), v_usuario, inv.nombre, inv.rol)
    on conflict (id) do nothing;

    update public.invitaciones
       set estado = 'aceptada', aceptada_en = now(), aceptada_por = new.id
     where id = inv.id;

    return new;
end
$$;

drop trigger if exists al_registrar_usuario on auth.users;
create trigger al_registrar_usuario
    after insert on auth.users
    for each row execute function privado.al_registrar_usuario();


-- El correo del perfil sigue al de la cuenta si la persona lo cambia.
create or replace function privado.al_cambiar_correo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.email is distinct from old.email and new.email is not null then
        update public.perfiles set email = lower(new.email) where id = new.id;
    end if;
    return new;
end
$$;

drop trigger if exists al_cambiar_correo on auth.users;
create trigger al_cambiar_correo
    after update of email on auth.users
    for each row execute function privado.al_cambiar_correo();


-- ---------------------------------------------------------------------
-- 4. Gestión de usuarios desde la aplicación (solo el administrador)
-- ---------------------------------------------------------------------

/* Invita a una persona por correo. Si ya tiene cuenta en Supabase y no
   pertenece a ninguna empresa, se le crea el perfil de inmediato. */
create or replace function public.invitar_usuario(
    p_email   text,
    p_rol     text,
    p_usuario text default null,
    p_nombre  text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_empresa  text := privado.empresa_actual();
    v_correo   text := lower(trim(coalesce(p_email, '')));
    v_usuario  text := lower(trim(coalesce(p_usuario, '')));
    v_nombre   text := trim(coalesce(p_nombre, ''));
    v_cuenta   uuid;
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
    if p_rol not in ('administrador', 'contador', 'vendedor') then
        raise exception 'El rol «%» no existe', coalesce(p_rol, '');
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

    -- Nombre de usuario libre dentro de la empresa.
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

    -- Ya tiene cuenta: se le da acceso sin esperar a que se registre.
    if v_cuenta is not null then
        if exists (select 1 from public.perfiles p where p.id = v_cuenta) then
            raise exception 'Esa cuenta ya pertenece a otra empresa';
        end if;
        insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol)
        values (v_cuenta, v_empresa, v_correo, v_usuario, v_nombre, p_rol);
        return jsonb_build_object('estado', 'vinculada', 'email', v_correo, 'usuario', v_usuario);
    end if;

    insert into public.invitaciones (empresa_id, email, usuario, nombre, rol)
    values (v_empresa, v_correo, v_usuario, v_nombre, p_rol)
    returning id into v_id;

    return jsonb_build_object('estado', 'pendiente', 'id', v_id, 'email', v_correo, 'usuario', v_usuario);
end
$$;


create or replace function public.revocar_invitacion(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_empresa text := privado.empresa_actual();
begin
    if privado.rol_actual() is distinct from 'administrador' then
        raise exception 'Solo el administrador puede revocar invitaciones';
    end if;
    update public.invitaciones
       set estado = 'revocada'
     where id = p_id and empresa_id = v_empresa and estado = 'pendiente';
    if not found then
        raise exception 'La invitación no existe o ya no está pendiente';
    end if;
    return jsonb_build_object('ok', true);
end
$$;


/* Cambia nombre, rol o estado de un usuario de la empresa. Nunca deja la
   empresa sin un administrador activo: sin él nadie podría volver a
   gestionar usuarios ni configuración. */
create or replace function public.actualizar_perfil(
    p_id     uuid,
    p_nombre text default null,
    p_rol    text default null,
    p_activo boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
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
    if v_rol not in ('administrador', 'contador', 'vendedor') then
        raise exception 'El rol «%» no existe', v_rol;
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
$$;


/* Usuarios de la empresa e invitaciones pendientes, para Configuración. */
create or replace function public.usuarios_empresa()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_empresa text := privado.empresa_actual();
begin
    if v_empresa is null then
        raise exception 'El usuario no pertenece a una empresa activa';
    end if;
    return jsonb_build_object(
        'usuarios', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', p.id, 'usuario', p.usuario, 'nombre', p.nombre, 'rol', p.rol,
                'email', p.email, 'activo', p.activo, 'ultimoAcceso', p.ultimo_acceso
            ) order by p.rol, p.usuario), '[]'::jsonb)
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
$$;


-- ---------------------------------------------------------------------
-- 5. mi_perfil y crear_empresa aprenden el correo. La lista de usuarios de
--    la empresa la entrega usuarios_empresa(), no descargar_snapshot: los
--    usuarios no son datos de la operación y no se reemplazan al sincronizar.
-- ---------------------------------------------------------------------
create or replace function public.mi_perfil()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
    select jsonb_build_object(
        'id',             p.id,
        'usuario',        p.usuario,
        'nombre',         p.nombre,
        'email',          p.email,
        'rol',            p.rol,
        'activo',         p.activo,
        'empresaId',      e.id,
        'empresa',        e.razon_social,
        'nit',            e.nit,
        'rev',            e.rev,
        'sincronizadoEn', e.sincronizado_en
    ) into v
    from public.perfiles p
    join public.empresas e on e.id = p.empresa_id
    where p.id = auth.uid() and p.activo;

    if v is not null then
        update public.perfiles set ultimo_acceso = now() where id = auth.uid();
    end if;
    return v;
end
$$;


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

    insert into public.empresas (razon_social, nit)
    values (trim(razon_social), coalesce(nit, ''))
    returning id into v_id;

    insert into public.perfiles (id, empresa_id, email, usuario, nombre, rol)
    values (v_uid, v_id, coalesce(v_correo, ''), v_usuario, v_nombre, 'administrador');

    return public.mi_perfil();
end
$$;


-- ---------------------------------------------------------------------
-- 6. RLS de invitaciones: solo el administrador de la empresa
-- ---------------------------------------------------------------------
alter table public.invitaciones enable row level security;

drop policy if exists invitaciones_admin on public.invitaciones;
create policy invitaciones_admin on public.invitaciones for select to authenticated
    using (empresa_id = (select privado.empresa_actual())
           and (select privado.rol_actual()) = 'administrador');
-- Altas, cambios y bajas pasan por invitar_usuario y revocar_invitacion,
-- que además comprueban duplicados y cuentas ya existentes.


-- ---------------------------------------------------------------------
-- 7. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public.invitar_usuario(text, text, text, text),
    public.revocar_invitacion(uuid), public.actualizar_perfil(uuid, text, text, boolean),
    public.usuarios_empresa() from public, anon;
grant execute on function public.invitar_usuario(text, text, text, text),
    public.revocar_invitacion(uuid), public.actualizar_perfil(uuid, text, text, boolean),
    public.usuarios_empresa() to authenticated;
