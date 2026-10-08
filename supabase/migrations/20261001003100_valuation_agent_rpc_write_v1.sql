-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005154351 (tên "valuation_agent_rpc_write_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

create or replace function public.valuation_agent_save_new_car_evidence(
 p_token text,p_run_id uuid,p_demand_id uuid,p_rows jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare x jsonb; n integer:=0;
begin
 if not private.valuation_agent_authorized(p_token) then raise exception 'unauthorized' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>50 then raise exception 'invalid rows'; end if;
 if not exists(select 1 from public.appraisal_ai_runs r where r.id=p_run_id and r.demand_id=p_demand_id) then raise exception 'run mismatch'; end if;
 for x in select value from jsonb_array_elements(p_rows) loop
  insert into public.appraisal_ai_new_car_evidence(
   run_id,demand_id,source_type,source_name,source_url,observed_at,brand,model,generation,trim,model_year,
   msrp_vnd,advertised_cash_price_vnd,effective_new_price_vnd,incentives,substitution_quality,verification_status,notes
  ) values(
   p_run_id,p_demand_id,x->>'source_type',x->>'source_name',x->>'source_url',(x->>'observed_at')::timestamptz,
   x->>'brand',x->>'model',x->>'generation',x->>'trim',nullif(x->>'model_year','')::smallint,
   nullif(x->>'msrp_vnd','')::numeric,nullif(x->>'advertised_cash_price_vnd','')::numeric,
   nullif(x->>'effective_new_price_vnd','')::numeric,coalesce(x->'incentives','{}'::jsonb),
   x->>'substitution_quality',x->>'verification_status',x->>'notes'
  ); n:=n+1;
 end loop;
 return jsonb_build_object('ok',true,'count',n);
end $$;

create or replace function public.valuation_agent_save_decision(
 p_token text,p_run_id uuid,p_demand_id uuid,p_decision jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not private.valuation_agent_authorized(p_token) then raise exception 'unauthorized' using errcode='42501'; end if;
 if not exists(select 1 from public.appraisal_ai_runs r where r.id=p_run_id and r.demand_id=p_demand_id and r.status in ('collecting','ready')) then
   raise exception 'run mismatch or closed';
 end if;
 insert into public.appraisal_ai_decisions(
  run_id,demand_id,source_coverage,exact_comp_count,near_comp_count,
  used_asking_low_vnd,used_asking_median_vnd,used_asking_high_vnd,
  expected_retail_low_vnd,expected_retail_mid_vnd,expected_retail_high_vnd,
  opening_offer_vnd,target_buy_vnd,recommended_map_vnd,recon_cost_vnd,selling_cost_vnd,
  holding_cost_vnd,risk_reserve_vnd,target_gross_profit_vnd,economics_complete,missing_inputs,
  confidence,confidence_reasons,new_car_pressure_status,decision_status
 ) values(
  p_run_id,p_demand_id,p_decision->>'source_coverage',
  coalesce((p_decision->>'exact_comp_count')::int,0),coalesce((p_decision->>'near_comp_count')::int,0),
  nullif(p_decision->>'used_asking_low_vnd','')::numeric,nullif(p_decision->>'used_asking_median_vnd','')::numeric,
  nullif(p_decision->>'used_asking_high_vnd','')::numeric,nullif(p_decision->>'expected_retail_low_vnd','')::numeric,
  nullif(p_decision->>'expected_retail_mid_vnd','')::numeric,nullif(p_decision->>'expected_retail_high_vnd','')::numeric,
  nullif(p_decision->>'opening_offer_vnd','')::numeric,nullif(p_decision->>'target_buy_vnd','')::numeric,
  nullif(p_decision->>'recommended_map_vnd','')::numeric,nullif(p_decision->>'recon_cost_vnd','')::numeric,
  nullif(p_decision->>'selling_cost_vnd','')::numeric,nullif(p_decision->>'holding_cost_vnd','')::numeric,
  nullif(p_decision->>'risk_reserve_vnd','')::numeric,nullif(p_decision->>'target_gross_profit_vnd','')::numeric,
  coalesce((p_decision->>'economics_complete')::boolean,false),
  coalesce(array(select jsonb_array_elements_text(coalesce(p_decision->'missing_inputs','[]'::jsonb))),'{}'),
  p_decision->>'confidence',
  coalesce(array(select jsonb_array_elements_text(coalesce(p_decision->'confidence_reasons','[]'::jsonb))),'{}'),
  p_decision->>'new_car_pressure_status',p_decision->>'decision_status'
 ) returning id into v_id;
 update public.appraisal_ai_runs set status='completed',completed_at=now() where id=p_run_id and demand_id=p_demand_id;
 return jsonb_build_object('ok',true,'decision_id',v_id);
end $$;

create or replace function public.valuation_agent_fail_run(
 p_token text,p_run_id uuid,p_error_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.valuation_agent_authorized(p_token) then raise exception 'unauthorized' using errcode='42501'; end if;
 update public.appraisal_ai_runs set status='failed',error_note=left(coalesce(p_error_note,'unknown'),2000) where id=p_run_id and status in ('collecting','ready');
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.valuation_agent_save_new_car_evidence(text,uuid,uuid,jsonb) from public,authenticated;
revoke all on function public.valuation_agent_save_decision(text,uuid,uuid,jsonb) from public,authenticated;
revoke all on function public.valuation_agent_fail_run(text,uuid,text) from public,authenticated;
grant execute on function public.valuation_agent_save_new_car_evidence(text,uuid,uuid,jsonb) to anon;
grant execute on function public.valuation_agent_save_decision(text,uuid,uuid,jsonb) to anon;
grant execute on function public.valuation_agent_fail_run(text,uuid,text) to anon;
