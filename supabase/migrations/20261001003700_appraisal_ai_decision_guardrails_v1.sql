-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005155935 (tên "appraisal_ai_decision_guardrails_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

alter table public.appraisal_ai_decisions
  add constraint appraisal_ai_map_requires_complete_economics
  check (economics_complete or recommended_map_vnd is null);

alter table public.appraisal_ai_decisions
  add constraint appraisal_ai_retail_range_order
  check (
    expected_retail_low_vnd is null or expected_retail_mid_vnd is null or expected_retail_high_vnd is null
    or (expected_retail_low_vnd <= expected_retail_mid_vnd and expected_retail_mid_vnd <= expected_retail_high_vnd)
  );

alter table public.appraisal_ai_decisions
  add constraint appraisal_ai_asking_range_order
  check (
    used_asking_low_vnd is null or used_asking_median_vnd is null or used_asking_high_vnd is null
    or (used_asking_low_vnd <= used_asking_median_vnd and used_asking_median_vnd <= used_asking_high_vnd)
  );
