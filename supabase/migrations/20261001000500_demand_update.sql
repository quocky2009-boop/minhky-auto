-- =====================================================================
-- MINH KỲ AUTO — 0500 Sửa nhu cầu có kiểm tra phiên bản (không ghi đè âm thầm)
-- =====================================================================
create or replace function public.update_demand(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_new_version integer;
  v_kind text;
  v_opt jsonb;
  v_spec record;
  v_offer jsonb := p -> 'sell_offer';
begin
  select d.kind into v_kind from public.demands d where d.id = p_id;
  if v_kind is null then
    raise exception 'Không tìm thấy nhu cầu hoặc anh/chị không có quyền.' using errcode = '42501';
  end if;

  update public.demands d set
    priority = coalesce(nullif(p ->> 'priority', ''), d.priority),
    source_id = nullif(p ->> 'source_id', '')::uuid,
    raw_message = nullif(p ->> 'raw_message', ''),
    notes = nullif(p ->> 'notes', ''),
    budget_min = nullif(p ->> 'budget_min', '')::numeric,
    budget_max = nullif(p ->> 'budget_max', '')::numeric,
    year_min = nullif(p ->> 'year_min', '')::smallint,
    year_max = nullif(p ->> 'year_max', '')::smallint,
    odo_max = nullif(p ->> 'odo_max', '')::integer,
    fuel_types = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'fuel_types') x), '{}'),
    seats = coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(p -> 'seats') x), '{}'),
    condition_pref = nullif(p ->> 'condition_pref', ''),
    colors_accepted = coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p -> 'colors_accepted') x where btrim(x) <> ''), '{}'),
    colors_rejected = coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p -> 'colors_rejected') x where btrim(x) <> ''), '{}'),
    needs_loan = (p ->> 'needs_loan')::boolean,
    wants_trade_in = (p ->> 'wants_trade_in')::boolean,
    expected_timeframe = nullif(p ->> 'expected_timeframe', ''),
    expected_by = nullif(p ->> 'expected_by', '')::date,
    strict_criteria = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'strict_criteria') x), '{}'),
    must_have_note = nullif(p ->> 'must_have_note', ''),
    flexible_note = nullif(p ->> 'flexible_note', '')
  where d.id = p_id and d.version = p_version
  returning d.version into v_new_version;

  if v_new_version is null then
    if exists (select 1 from public.demands d where d.id = p_id) then
      raise exception 'Nhu cầu vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất rồi sửa lại.' using errcode = '40001';
    end if;
    raise exception 'Anh/chị không có quyền sửa nhu cầu này.' using errcode = '42501';
  end if;

  if v_kind = 'buy' then
    delete from public.demand_vehicle_options o where o.demand_id = p_id;
    for v_opt in select * from jsonb_array_elements(coalesce(p -> 'options', '[]'::jsonb)) loop
      if private.norm_text(v_opt ->> 'make') is not null then
        select * into v_spec from public.resolve_vehicle_spec(v_opt ->> 'make', v_opt ->> 'model', v_opt ->> 'variant');
        insert into public.demand_vehicle_options (demand_id, make_id, model_id, variant_id)
        values (p_id, v_spec.make_id, v_spec.model_id, v_spec.variant_id) on conflict do nothing;
      end if;
    end loop;
  elsif v_offer is not null then
    v_spec := null;
    if private.norm_text(v_offer ->> 'make') is not null then
      select * into v_spec from public.resolve_vehicle_spec(v_offer ->> 'make', v_offer ->> 'model', v_offer ->> 'variant');
    end if;
    insert into public.sell_offers (demand_id) values (p_id) on conflict (demand_id) do nothing;
    update public.sell_offers s set
      make_id = v_spec.make_id, model_id = v_spec.model_id, variant_id = v_spec.variant_id,
      year_made = nullif(v_offer ->> 'year_made', '')::smallint,
      year_registered = nullif(v_offer ->> 'year_registered', '')::smallint,
      color = nullif(lower(btrim(v_offer ->> 'color')), ''),
      fuel_type = nullif(v_offer ->> 'fuel_type', ''),
      seats = nullif(v_offer ->> 'seats', '')::smallint,
      odo = nullif(v_offer ->> 'odo', '')::integer,
      plate = nullif(upper(btrim(v_offer ->> 'plate')), ''),
      vin = nullif(upper(btrim(v_offer ->> 'vin')), ''),
      asking_price = nullif(v_offer ->> 'asking_price', '')::numeric,
      negotiable = (v_offer ->> 'negotiable')::boolean,
      condition_note = nullif(v_offer ->> 'condition_note', ''),
      repair_history_note = nullif(v_offer ->> 'repair_history_note', ''),
      papers_note = nullif(v_offer ->> 'papers_note', ''),
      has_loan = (v_offer ->> 'has_loan')::boolean,
      loan_remaining = nullif(v_offer ->> 'loan_remaining', '')::numeric,
      vehicle_location = nullif(v_offer ->> 'vehicle_location', ''),
      desired_sell_time = nullif(v_offer ->> 'desired_sell_time', ''),
      sale_mode = coalesce(nullif(v_offer ->> 'sale_mode', ''), 'undecided'),
      inspection_at = nullif(v_offer ->> 'inspection_at', '')::timestamptz
    where s.demand_id = p_id;
  end if;
  return v_new_version;
end $$;
revoke execute on function public.update_demand(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_demand(uuid, integer, jsonb) to authenticated;
