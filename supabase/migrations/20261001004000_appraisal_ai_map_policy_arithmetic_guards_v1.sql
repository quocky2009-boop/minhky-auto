-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261008085735 (tên "appraisal_ai_map_policy_arithmetic_guards_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

alter table public.appraisal_ai_decisions
 add constraint appraisal_ai_map_complete_inputs_v1
 check (
  recommended_map_vnd is null
  or (
   economics_complete = true
   and expected_retail_mid_vnd is not null
   and recon_cost_vnd is not null
   and selling_cost_vnd is not null
   and holding_cost_vnd is not null
   and risk_reserve_vnd is not null
   and target_gross_profit_vnd is not null
   and target_gross_profit_vnd >= expected_retail_mid_vnd * 0.08
   and target_gross_profit_vnd <= expected_retail_mid_vnd * 0.10
   and abs(recommended_map_vnd - (
     expected_retail_mid_vnd - recon_cost_vnd - selling_cost_vnd
     - holding_cost_vnd - risk_reserve_vnd - target_gross_profit_vnd
   )) <= 1
  )
 );

alter table public.appraisal_ai_decisions
 add constraint appraisal_ai_offer_order_v1
 check (
  (opening_offer_vnd is null or target_buy_vnd is null or opening_offer_vnd <= target_buy_vnd)
  and (target_buy_vnd is null or recommended_map_vnd is null or target_buy_vnd <= recommended_map_vnd)
 );
