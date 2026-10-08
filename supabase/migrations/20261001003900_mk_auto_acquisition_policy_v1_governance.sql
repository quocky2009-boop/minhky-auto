-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261006060259 (tên "mk_auto_acquisition_policy_v1_governance") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================
insert into public.app_settings(key,value,description)
values
('valuation_target_gross_profit_pct','{"min":8,"preferred":10}'::jsonb,'MK Auto Acquisition Policy v1: target gross profit as % of expected realized retail. Owner approved 2026-10-06.'),
('valuation_normal_holding_days','30'::jsonb,'MK Auto Acquisition Policy v1: normal target holding period in days. Owner approved 2026-10-06.'),
('valuation_material_risk_auto_discount','false'::jsonb,'Do not auto-apply percentage deductions for flood/structural/powertrain material risks; require inspection/economic normalization. Owner approved 2026-10-06.')
on conflict (key) do update set value=excluded.value,description=excluded.description,updated_at=now();