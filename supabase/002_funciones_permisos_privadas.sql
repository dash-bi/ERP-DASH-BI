-- =====================================================================
-- ERP DASH-BI · Migración «funciones_permisos_privadas»
-- ESTADO: APLICADA el 2026-09-14 en «ERP Financiero» (nxilhcgjjzluywfinicd).
--
-- El asesor de seguridad de Supabase advirtió que las funciones de permisos
-- (security definer) quedaban invocables desde /rest/v1/rpc. Se mueven a un
-- esquema que la API no publica. Las políticas las referencian por su
-- identificador interno, así que siguen funcionando sin recrearlas.
-- tomar_consecutivo queda en public a propósito: la app la llama para numerar.
-- =====================================================================

create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

alter function public.empresa_actual() set schema privado;
alter function public.rol_actual() set schema privado;
alter function public.puede_modulo(text) set schema privado;

create or replace function public.tomar_consecutivo(tipo text)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_empresa text := privado.empresa_actual();
    v_valor   integer;
begin
    if v_empresa is null then
        raise exception 'El usuario no pertenece a una empresa activa';
    end if;
    if tipo = 'venta' and privado.puede_modulo('ventas') then
        update public.empresas set consecutivo_venta = consecutivo_venta + 1
         where id = v_empresa returning consecutivo_venta - 1 into v_valor;
        return 'FV-' || lpad(v_valor::text, 4, '0');
    elsif tipo = 'compra' and privado.puede_modulo('compras') then
        update public.empresas set consecutivo_compra = consecutivo_compra + 1
         where id = v_empresa returning consecutivo_compra - 1 into v_valor;
        return 'FC-' || lpad(v_valor::text, 4, '0');
    end if;
    raise exception 'Sin permiso para numerar documentos de tipo %', tipo;
end
$$;

revoke execute on function public.tomar_consecutivo(text) from public, anon;
grant execute on function public.tomar_consecutivo(text) to authenticated;
