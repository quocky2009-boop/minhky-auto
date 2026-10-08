-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005155543 (tên "appraisal_ai_evidence_fk_hardening_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

alter table public.appraisal_ai_comparables drop constraint appraisal_ai_comparables_demand_id_fkey;
alter table public.appraisal_ai_comparables add constraint appraisal_ai_comparables_demand_id_fkey foreign key(demand_id) references public.demands(id);
alter table public.appraisal_ai_comparables drop constraint appraisal_ai_comparables_run_id_fkey;
alter table public.appraisal_ai_comparables add constraint appraisal_ai_comparables_run_id_fkey foreign key(run_id) references public.appraisal_ai_runs(id);

alter table public.appraisal_ai_new_car_evidence drop constraint appraisal_ai_new_car_evidence_demand_id_fkey;
alter table public.appraisal_ai_new_car_evidence add constraint appraisal_ai_new_car_evidence_demand_id_fkey foreign key(demand_id) references public.demands(id);
alter table public.appraisal_ai_new_car_evidence drop constraint appraisal_ai_new_car_evidence_run_id_fkey;
alter table public.appraisal_ai_new_car_evidence add constraint appraisal_ai_new_car_evidence_run_id_fkey foreign key(run_id) references public.appraisal_ai_runs(id);

alter table public.appraisal_ai_decisions drop constraint appraisal_ai_decisions_demand_id_fkey;
alter table public.appraisal_ai_decisions add constraint appraisal_ai_decisions_demand_id_fkey foreign key(demand_id) references public.demands(id);
alter table public.appraisal_ai_decisions drop constraint appraisal_ai_decisions_run_id_fkey;
alter table public.appraisal_ai_decisions add constraint appraisal_ai_decisions_run_id_fkey foreign key(run_id) references public.appraisal_ai_runs(id);
