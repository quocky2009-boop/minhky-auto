-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005155553 (tên "appraisal_ai_append_only_privileges_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

revoke delete, truncate on public.appraisal_ai_runs from service_role;
revoke delete, truncate, update on public.appraisal_ai_comparables from service_role;
revoke delete, truncate, update on public.appraisal_ai_new_car_evidence from service_role;
revoke delete, truncate, update on public.appraisal_ai_decisions from service_role;
