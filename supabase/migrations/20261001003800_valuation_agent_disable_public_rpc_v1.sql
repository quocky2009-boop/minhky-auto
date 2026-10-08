-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005160047 (tên "valuation_agent_disable_public_rpc_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

revoke execute on function public.valuation_agent_get_case(text,uuid,text) from anon;
revoke execute on function public.valuation_agent_create_run(text,uuid,jsonb,jsonb,text,text,text) from anon;
revoke execute on function public.valuation_agent_save_comparables(text,uuid,uuid,jsonb) from anon;
revoke execute on function public.valuation_agent_save_new_car_evidence(text,uuid,uuid,jsonb) from anon;
revoke execute on function public.valuation_agent_save_decision(text,uuid,uuid,jsonb) from anon;
revoke execute on function public.valuation_agent_fail_run(text,uuid,text) from anon;
