-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005155640 (tên "valuation_agent_rpc_case_run_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

create or replace function public.valuation_agent_get_case(
 p_token text,p_demand_id uuid default null,p_demand_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ctx jsonb; v_items jsonb;
begin
 if not private.valuation_agent_authorized(p_token) then raise exception 'unauthorized' using errcode='42501'; end if;
 select to_jsonb(x) into v_ctx from public.appraisal_ai_input_context x
 where (p_demand_id is not null and x.demand_id=p_demand_id)
    or (p_demand_id is null and p_demand_code is not null and x.demand_code=p_demand_code)
 order by x.demand_id limit 1;
 if v_ctx is null then return jsonb_build_object('error','not_found'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('template_key',i.template_key,'result',i.result,'note',i.note)),'[]'::jsonb)
 into v_items from public.appraisal_items i where i.demand_id=(v_ctx->>'demand_id')::uuid;
 return jsonb_build_object('context',v_ctx,'condition_items',v_items);
end $$;

create or replace function public.valuation_agent_create_run(
 p_token text,p_demand_id uuid,p_input_snapshot jsonb default '{}'::jsonb,
 p_source_health jsonb default '[]'::jsonb,p_rule_version text default null,
 p_skill_version text default null,p_model_name text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.appraisal_ai_runs;
begin
 if not private.valuation_agent_authorized(p_token) then raise exception 'unauthorized' using errcode='42501'; end if;
 if not exists(select 1 from public.demands d where d.id=p_demand_id and d.kind='sell') then raise exception 'invalid sell demand'; end if;
 insert into public.appraisal_ai_runs(demand_id,input_snapshot,source_health,rule_version,skill_version,model_name)
 values(p_demand_id,coalesce(p_input_snapshot,'{}'::jsonb),coalesce(p_source_health,'[]'::jsonb),p_rule_version,p_skill_version,p_model_name)
 returning * into v;
 return jsonb_build_object('id',v.id,'demand_id',v.demand_id,'status',v.status,'requested_at',v.requested_at);
end $$;

revoke all on function public.valuation_agent_get_case(text,uuid,text) from public,authenticated;
revoke all on function public.valuation_agent_create_run(text,uuid,jsonb,jsonb,text,text,text) from public,authenticated;
grant execute on function public.valuation_agent_get_case(text,uuid,text) to anon;
grant execute on function public.valuation_agent_create_run(text,uuid,jsonb,jsonb,text,text,text) to anon;
