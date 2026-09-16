-- =====================================================================
-- ERP DASH-BI · Migración «indice_sincronizado_por»
-- ESTADO: APLICADA el 2026-09-15 en «ERP Financiero» (nxilhcgjjzluywfinicd).
--
-- empresas.sincronizado_por (añadida en 003) es una clave foránea sin
-- índice, lo que el asesor de rendimiento marca como INFO.
-- =====================================================================

create index if not exists empresas_sincronizado_por on public.empresas (sincronizado_por);
