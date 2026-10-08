-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005075811 (tên "appraisal_ai_valuation_views_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

create or replace view public.appraisal_ai_latest
with (security_invoker = true) as
select distinct on (r.demand_id)
  r.demand_id, r.id as run_id, r.status as run_status,
  r.requested_at, r.completed_at, to_jsonb(d) as decision
from public.appraisal_ai_runs r
left join public.appraisal_ai_decisions d on d.run_id = r.id
order by r.demand_id, r.requested_at desc;
revoke all on public.appraisal_ai_latest from anon;
grant select on public.appraisal_ai_latest to authenticated;

create or replace view public.appraisal_ai_input_context
with (security_invoker = true) as
select
  d.id as demand_id, d.code as demand_code, d.status as demand_status,
  so.make_id, m.name as make_name, so.model_id, mo.name as model_name,
  so.variant_id, va.name as variant_name,
  so.year_made, so.year_registered, so.color, so.fuel_type, so.seats, so.odo,
  so.condition_note, so.repair_history_note, so.papers_note,
  so.asking_price * 1000000::numeric as seller_asking_price_vnd,
  a.status as appraisal_status, a.is_ev, a.appraised_at,
  af.proposed_price * 1000000::numeric as human_proposed_price_vnd,
  af.approved_max_price * 1000000::numeric as human_approved_max_price_vnd
from public.demands d
join public.sell_offers so on so.demand_id = d.id
left join public.vehicle_makes m on m.id = so.make_id
left join public.vehicle_models mo on mo.id = so.model_id
left join public.vehicle_variants va on va.id = so.variant_id
left join public.appraisals a on a.demand_id = d.id
left join public.appraisal_financials af on af.demand_id = d.id
where d.kind = 'sell';
revoke all on public.appraisal_ai_input_context from anon;
grant select on public.appraisal_ai_input_context to authenticated, service_role;
