-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005075803 (tên "appraisal_ai_valuation_security_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

alter table public.appraisal_ai_runs enable row level security;
alter table public.appraisal_ai_comparables enable row level security;
alter table public.appraisal_ai_new_car_evidence enable row level security;
alter table public.appraisal_ai_decisions enable row level security;

create policy appraisal_ai_runs_select on public.appraisal_ai_runs
for select to authenticated using (private.can_access_demand(demand_id));
create policy appraisal_ai_comps_select on public.appraisal_ai_comparables
for select to authenticated using (private.can_access_demand(demand_id));
create policy appraisal_ai_newcar_select on public.appraisal_ai_new_car_evidence
for select to authenticated using (private.can_access_demand(demand_id));
create policy appraisal_ai_decisions_select on public.appraisal_ai_decisions
for select to authenticated using (private.can_access_demand(demand_id));

revoke all on public.appraisal_ai_runs from anon, authenticated;
revoke all on public.appraisal_ai_comparables from anon, authenticated;
revoke all on public.appraisal_ai_new_car_evidence from anon, authenticated;
revoke all on public.appraisal_ai_decisions from anon, authenticated;
grant select on public.appraisal_ai_runs, public.appraisal_ai_comparables,
  public.appraisal_ai_new_car_evidence, public.appraisal_ai_decisions to authenticated;
grant all on public.appraisal_ai_runs, public.appraisal_ai_comparables,
  public.appraisal_ai_new_car_evidence, public.appraisal_ai_decisions to service_role;

create trigger appraisal_ai_runs_audit after insert or update on public.appraisal_ai_runs
for each row execute function private.audit_row();
create trigger appraisal_ai_comps_audit after insert or update on public.appraisal_ai_comparables
for each row execute function private.audit_row();
create trigger appraisal_ai_newcar_audit after insert or update on public.appraisal_ai_new_car_evidence
for each row execute function private.audit_row();
create trigger appraisal_ai_decisions_audit after insert or update on public.appraisal_ai_decisions
for each row execute function private.audit_row();

comment on table public.appraisal_ai_runs is 'AI valuation execution records. Evidence/recommendation only.';
comment on column public.appraisal_ai_comparables.asking_price_vnd is 'Absolute VND. Legacy app money fields are million VND.';
comment on column public.appraisal_ai_decisions.recommended_map_vnd is 'AI recommendation in absolute VND. Never auto-write to appraisal_financials.approved_max_price.';
