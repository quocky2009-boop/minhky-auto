-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005075753 (tên "appraisal_ai_valuation_tables_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

create table public.appraisal_ai_runs (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.appraisals(demand_id) on delete cascade,
  status text not null default 'collecting' check (status in ('collecting','ready','completed','failed','superseded')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  input_snapshot jsonb not null default '{}'::jsonb,
  source_health jsonb not null default '[]'::jsonb,
  rule_version text, skill_version text, model_name text, error_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint appraisal_ai_runs_complete_pair check ((status <> 'completed') or completed_at is not null)
);
create index appraisal_ai_runs_demand_idx on public.appraisal_ai_runs(demand_id, requested_at desc);

create table public.appraisal_ai_comparables (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.appraisal_ai_runs(id) on delete cascade,
  demand_id uuid not null references public.appraisals(demand_id) on delete cascade,
  source text not null, source_url text not null, listing_id text,
  observed_at timestamptz not null, first_seen_at timestamptz, last_seen_at timestamptz,
  brand text, model text, generation text, trim text, year_made smallint,
  odometer_km integer check (odometer_km >= 0), location text,
  asking_price_vnd numeric(18,0) not null check (asking_price_vnd >= 0),
  provenance_quality text, match_level text, raw_title text, notes text,
  created_at timestamptz not null default now()
);
create index appraisal_ai_comps_run_idx on public.appraisal_ai_comparables(run_id);
create index appraisal_ai_comps_identity_idx on public.appraisal_ai_comparables(brand, model, trim, year_made, observed_at desc);

create table public.appraisal_ai_new_car_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.appraisal_ai_runs(id) on delete cascade,
  demand_id uuid not null references public.appraisals(demand_id) on delete cascade,
  source_type text not null, source_name text, source_url text not null,
  observed_at timestamptz not null, brand text, model text, generation text, trim text, model_year smallint,
  msrp_vnd numeric(18,0) check (msrp_vnd >= 0),
  advertised_cash_price_vnd numeric(18,0) check (advertised_cash_price_vnd >= 0),
  effective_new_price_vnd numeric(18,0) check (effective_new_price_vnd >= 0),
  incentives jsonb not null default '{}'::jsonb,
  substitution_quality text, verification_status text, notes text,
  created_at timestamptz not null default now()
);
create index appraisal_ai_newcar_run_idx on public.appraisal_ai_new_car_evidence(run_id);

create table public.appraisal_ai_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.appraisal_ai_runs(id) on delete cascade,
  demand_id uuid not null references public.appraisals(demand_id) on delete cascade,
  source_coverage text,
  exact_comp_count integer not null default 0 check (exact_comp_count >= 0),
  near_comp_count integer not null default 0 check (near_comp_count >= 0),
  used_asking_low_vnd numeric(18,0) check (used_asking_low_vnd >= 0),
  used_asking_median_vnd numeric(18,0) check (used_asking_median_vnd >= 0),
  used_asking_high_vnd numeric(18,0) check (used_asking_high_vnd >= 0),
  expected_retail_low_vnd numeric(18,0) check (expected_retail_low_vnd >= 0),
  expected_retail_mid_vnd numeric(18,0) check (expected_retail_mid_vnd >= 0),
  expected_retail_high_vnd numeric(18,0) check (expected_retail_high_vnd >= 0),
  opening_offer_vnd numeric(18,0) check (opening_offer_vnd >= 0),
  target_buy_vnd numeric(18,0) check (target_buy_vnd >= 0),
  recommended_map_vnd numeric(18,0) check (recommended_map_vnd >= 0),
  recon_cost_vnd numeric(18,0) check (recon_cost_vnd >= 0),
  selling_cost_vnd numeric(18,0) check (selling_cost_vnd >= 0),
  holding_cost_vnd numeric(18,0) check (holding_cost_vnd >= 0),
  risk_reserve_vnd numeric(18,0) check (risk_reserve_vnd >= 0),
  target_gross_profit_vnd numeric(18,0) check (target_gross_profit_vnd >= 0),
  economics_complete boolean not null default false,
  missing_inputs text[] not null default '{}',
  confidence text check (confidence in ('HIGH','MEDIUM','LOW')),
  confidence_reasons text[] not null default '{}',
  new_car_pressure_status text, decision_status text not null,
  generated_at timestamptz not null default now()
);
create index appraisal_ai_decisions_demand_idx on public.appraisal_ai_decisions(demand_id, generated_at desc);
