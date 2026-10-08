-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005154325 (tên "valuation_agent_rpc_comparables_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

create or replace function public.valuation_agent_save_comparables(
  p_token text, p_run_id uuid, p_demand_id uuid, p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare x jsonb; n integer := 0;
begin
  if not private.valuation_agent_authorized(p_token) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'invalid rows';
  end if;
  if not exists(select 1 from public.appraisal_ai_runs r where r.id=p_run_id and r.demand_id=p_demand_id) then
    raise exception 'run mismatch';
  end if;
  for x in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.appraisal_ai_comparables(
      run_id,demand_id,source,source_url,listing_id,observed_at,first_seen_at,last_seen_at,
      brand,model,generation,trim,year_made,odometer_km,location,asking_price_vnd,
      provenance_quality,match_level,raw_title,notes
    ) values (
      p_run_id,p_demand_id,x->>'source',x->>'source_url',x->>'listing_id',
      (x->>'observed_at')::timestamptz,nullif(x->>'first_seen_at','')::timestamptz,
      nullif(x->>'last_seen_at','')::timestamptz,x->>'brand',x->>'model',
      x->>'generation',x->>'trim',nullif(x->>'year_made','')::smallint,
      nullif(x->>'odometer_km','')::integer,x->>'location',
      (x->>'asking_price_vnd')::numeric,x->>'provenance_quality',
      x->>'match_level',x->>'raw_title',x->>'notes'
    );
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'count',n);
end $$;

revoke all on function public.valuation_agent_save_comparables(text,uuid,uuid,jsonb) from public, authenticated;
grant execute on function public.valuation_agent_save_comparables(text,uuid,uuid,jsonb) to anon;
