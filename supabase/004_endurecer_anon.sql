-- =====================================================================
-- ERP DASH-BI · Migración «endurecer_anon»
-- ESTADO: APLICADA el 2026-09-15 en «ERP Financiero» (nxilhcgjjzluywfinicd).
--
-- El visitante sin sesión (rol anon) no necesita ninguna tabla de este ERP.
-- RLS ya le devolvía cero filas, pero la API respondía 200 con una lista
-- vacía; sin el permiso de tabla responde 401 y no revela ni la estructura.
-- Reversible: basta volver a conceder select/insert/... a anon.
-- =====================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
