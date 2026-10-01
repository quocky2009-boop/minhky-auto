-- =====================================================================
-- MINH KỲ AUTO — 0800 Chặng 3 (lát 1): kho xe, vòng sở hữu, nhập xe từ nhu cầu bán
--
-- Quyết định thiết kế (CLAUDE.md §4):
--  * Một dòng `vehicles` = MỘT VÒNG sở hữu/ký gửi của một chiếc xe thật. Xe bán xong rồi quay lại showroom
--    => tạo dòng mới, liên kết `previous_vehicle_id`; dòng cũ giữ nguyên (không ghi đè giao dịch cũ).
--  * VIN duy nhất giữa các dòng ĐANG HOẠT ĐỘNG; dòng đã kết thúc vòng (đã bán/bàn giao/trả chủ) không chặn nhập lại.
--  * Xe khách chào bán chỉ trở thành xe trong kho qua acquire_from_demand: chống tạo trùng bằng
--    source_demand_id (unique) + client_request_id.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vòng sở hữu
-- ---------------------------------------------------------------------
alter table public.vehicles add column previous_vehicle_id uuid references public.vehicles (id);
comment on column public.vehicles.previous_vehicle_id is 'Vòng sở hữu trước của cùng chiếc xe (cùng VIN) khi xe quay lại showroom.';
create index vehicles_previous_idx on public.vehicles (previous_vehicle_id) where previous_vehicle_id is not null;
create index vehicles_vin_lookup_idx on public.vehicles (upper(vin)) where vin is not null;

drop index public.vehicles_vin_key;
create unique index vehicles_vin_key on public.vehicles (upper(vin))
  where vin is not null and archived_at is null and sale_status not in ('sold', 'delivered', 'returned_to_owner');

-- Luật chuyển trạng thái bán hàng. Xe đã kết thúc vòng thì không "sống lại".
create or replace function private.vehicle_sale_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_from = p_to then true
    when p_from = 'not_listed' then p_to in ('available', 'returned_to_owner')
    when p_from = 'available' then p_to in ('not_listed', 'held', 'deposited', 'sold', 'returned_to_owner')
    when p_from = 'held' then p_to in ('available', 'deposited', 'sold')
    when p_from = 'deposited' then p_to in ('available', 'held', 'sold')
    when p_from = 'sold' then p_to in ('delivered', 'available') -- 'available': hủy bán/hoàn xe, chỉ quản lý (kiểm tra ở nghiệp vụ chặng 5)
    else false                                                   -- delivered, returned_to_owner: kết thúc vòng
  end
$$;

create or replace function private.vehicles_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.sale_status is distinct from old.sale_status then
    if old.sale_status in ('delivered', 'returned_to_owner') and not private.is_system() then
      raise exception 'Xe đã kết thúc một vòng sở hữu. Nếu xe quay lại showroom, hãy nhập thành hồ sơ mới liên kết với xe cũ.' using errcode = '22023';
    end if;
    if not private.vehicle_sale_transition_allowed(old.sale_status, new.sale_status) then
      raise exception 'Không thể chuyển trạng thái bán hàng từ "%" sang "%".', old.sale_status, new.sale_status using errcode = '22023';
    end if;
    if new.sale_status = 'returned_to_owner' and new.business_type <> 'consignment' then
      raise exception 'Chỉ xe ký gửi mới trả lại chủ xe.' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.business_type is distinct from new.business_type then
    raise exception 'Không đổi được hình thức sở hữu/ký gửi của xe đã nhập. Hãy tạo hồ sơ mới.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger vehicles_before_write before update on public.vehicles
  for each row execute function private.vehicles_before_write();
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Tìm kiếm / lọc kho xe (security invoker: tuân RLS — sales chỉ thấy xe đang bán/giữ/cọc,
--    kỹ thuật không thấy giá chào vì bảng vehicle_listings chặn).
-- ---------------------------------------------------------------------
create or replace view public.vehicle_search with (security_invoker = true) as
select
  v.id, v.code, v.vin, v.plate, v.condition, v.business_type, v.source_type, v.sale_status, v.prep_status, v.paperwork_status,
  v.year_made, v.year_registered, v.color, v.fuel_type, v.seats, v.odo, v.intake_date, v.location_id, v.owner_id,
  v.previous_vehicle_id, v.created_at, v.updated_at, v.version,
  v.make_id, v.model_id, v.variant_id, mk.name as make_name, md.name as model_name, vr.name as variant_name,
  concat_ws(' ', mk.name, md.name, vr.name) as spec_name,
  l.asking_price, loc.name as location_name,
  case when v.intake_date is null then null else ((now() at time zone 'Asia/Ho_Chi_Minh')::date - v.intake_date) end as age_days,
  private.norm_text(concat_ws(' ', v.code, v.vin, v.plate, mk.name, md.name, vr.name, v.color, v.notes)) as search_text
from public.vehicles v
join public.vehicle_makes mk on mk.id = v.make_id
left join public.vehicle_models md on md.id = v.model_id
left join public.vehicle_variants vr on vr.id = v.variant_id
left join public.vehicle_listings l on l.vehicle_id = v.id
left join public.locations loc on loc.id = v.location_id
where v.archived_at is null;
revoke all on public.vehicle_search from anon;
grant select on public.vehicle_search to authenticated;

-- f: { q, condition, business_type, state, prep_status, make_id, model_id, year_from, year_to, color,
--      price_from, price_to, location_id, age_min, sort }
-- state: stock (mặc định = chưa kết thúc vòng) | selling (đang bán/giữ/cọc) | ended | all | <sale_status cụ thể>
-- Lọc giá: xe chưa có giá chào bị loại (thiếu dữ liệu không giả là phù hợp).
create or replace function public.search_vehicles(f jsonb default '{}'::jsonb, p_limit integer default 25, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with params as (
    select
      nullif(f ->> 'condition', '') as condition,
      nullif(f ->> 'business_type', '') as business_type,
      coalesce(nullif(f ->> 'state', ''), 'stock') as state,
      nullif(f ->> 'prep_status', '') as prep_status,
      private.try_uuid(f ->> 'make_id') as make_id,
      private.try_uuid(f ->> 'model_id') as model_id,
      nullif(f ->> 'year_from', '')::int as year_from,
      nullif(f ->> 'year_to', '')::int as year_to,
      private.norm_text(f ->> 'color') as color,
      nullif(f ->> 'price_from', '')::numeric as price_from,
      nullif(f ->> 'price_to', '')::numeric as price_to,
      private.try_uuid(f ->> 'location_id') as location_id,
      nullif(f ->> 'age_min', '')::int as age_min,
      private.norm_text(f ->> 'q') as q,
      coalesce(nullif(f ->> 'sort', ''), 'age') as sort
  ),
  filtered as (
    select v.* from public.vehicle_search v, params p
    where (p.condition is null or v.condition = p.condition)
      and (p.business_type is null or v.business_type = p.business_type)
      and (p.state = 'all'
           or (p.state = 'stock' and v.sale_status not in ('sold', 'delivered', 'returned_to_owner'))
           or (p.state = 'selling' and v.sale_status in ('available', 'held', 'deposited'))
           or (p.state = 'ended' and v.sale_status in ('sold', 'delivered', 'returned_to_owner'))
           or (p.state not in ('all', 'stock', 'selling', 'ended') and v.sale_status = p.state))
      and (p.prep_status is null or v.prep_status = p.prep_status)
      and (p.make_id is null or v.make_id = p.make_id)
      and (p.model_id is null or v.model_id = p.model_id)
      and (p.year_from is null or v.year_made >= p.year_from)
      and (p.year_to is null or v.year_made <= p.year_to)
      and (p.color is null or private.norm_text(v.color) = p.color)
      and ((p.price_from is null and p.price_to is null)
           or (v.asking_price is not null
               and (p.price_from is null or v.asking_price >= p.price_from)
               and (p.price_to is null or v.asking_price <= p.price_to)))
      and (p.location_id is null or v.location_id = p.location_id)
      and (p.age_min is null or v.age_days >= p.age_min)
      and (p.q is null or v.search_text like '%' || p.q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) - 'search_text' order by x.rn)
      from (
        select fl.*, row_number() over (order by
            case when (select sort from params) = 'age' then fl.age_days end desc nulls last,
            case when (select sort from params) = 'price' then fl.asking_price end asc nulls last,
            case when (select sort from params) = 'created' then fl.created_at end desc,
            fl.code) as rn
        from filtered fl
        order by rn
        limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
      ) x), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- 3. Nhập xe (quản lý). Idempotent theo request_id. Giá chào / giá vốn / giá sàn ghi vào đúng bảng của chúng.
-- ---------------------------------------------------------------------
create or replace function private.vehicle_from_payload_check(p_vin text, p_exclude uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  select v.code into v_code from public.vehicles v
  where upper(v.vin) = upper(p_vin) and v.archived_at is null
    and v.sale_status not in ('sold', 'delivered', 'returned_to_owner')
    and (p_exclude is null or v.id <> p_exclude)
  limit 1;
  if v_code is not null then
    raise exception 'Số VIN % đang có trong kho (mã %). Mỗi xe chỉ có một hồ sơ đang hoạt động.', upper(p_vin), v_code using errcode = '22023';
  end if;
end $$;

create or replace function private.previous_cycle(p_vin text)
returns uuid language sql stable security definer set search_path = '' as $$
  select v.id from public.vehicles v
  where p_vin is not null and upper(v.vin) = upper(p_vin)
    and (v.sale_status in ('sold', 'delivered', 'returned_to_owner'))
  order by v.created_at desc limit 1
$$;

create or replace function public.create_vehicle(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_request uuid := (p ->> 'request_id')::uuid;
  v_id uuid;
  v_spec record;
  v_vin text := nullif(upper(btrim(p ->> 'vin')), '');
  v_business text := coalesce(nullif(p ->> 'business_type', ''), 'owned');
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được nhập xe vào kho.' using errcode = '42501';
  end if;
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select v.id into v_id from public.vehicles v where v.client_request_id = v_request;
  if v_id is not null then return v_id; end if;

  if coalesce(p ->> 'condition', '') not in ('new', 'used') then
    raise exception 'Chọn xe mới hoặc xe đã qua sử dụng.' using errcode = '22023';
  end if;
  if v_business not in ('owned', 'consignment') then
    raise exception 'Hình thức không hợp lệ.' using errcode = '22023';
  end if;
  if v_business = 'consignment' and nullif(p ->> 'purchase_price', '') is not null then
    raise exception 'Xe ký gửi không có giá mua của showroom. Giá chủ xe muốn nhận ghi trong hợp đồng ký gửi.' using errcode = '22023';
  end if;

  select * into v_spec from public.resolve_vehicle_spec(p ->> 'make', p ->> 'model', p ->> 'variant');
  if v_vin is not null then perform private.vehicle_from_payload_check(v_vin); end if;

  insert into public.vehicles (
    vin, make_id, model_id, variant_id, year_made, year_registered, color, fuel_type, seats, odo, plate,
    condition, business_type, source_type, location_id, prep_status, paperwork_status, intake_date, owner_id,
    notes, previous_vehicle_id, client_request_id)
  values (
    v_vin, v_spec.make_id, v_spec.model_id, v_spec.variant_id,
    nullif(p ->> 'year_made', '')::smallint, nullif(p ->> 'year_registered', '')::smallint,
    nullif(lower(btrim(p ->> 'color')), ''), nullif(p ->> 'fuel_type', ''), nullif(p ->> 'seats', '')::smallint,
    nullif(p ->> 'odo', '')::integer, nullif(upper(btrim(p ->> 'plate')), ''),
    p ->> 'condition', v_business, nullif(p ->> 'source_type', ''), nullif(p ->> 'location_id', '')::uuid,
    coalesce(nullif(p ->> 'prep_status', ''), 'pending'), coalesce(nullif(p ->> 'paperwork_status', ''), 'incomplete'),
    nullif(p ->> 'intake_date', '')::date, nullif(p ->> 'owner_id', '')::uuid,
    nullif(p ->> 'notes', ''), private.previous_cycle(v_vin), v_request)
  returning id into v_id;

  if nullif(p ->> 'asking_price', '') is not null then
    insert into public.vehicle_listings (vehicle_id, asking_price) values (v_id, (p ->> 'asking_price')::numeric);
  end if;
  if nullif(p ->> 'purchase_price', '') is not null or nullif(p ->> 'floor_price', '') is not null then
    insert into public.vehicle_financials (vehicle_id, purchase_price, floor_price)
    values (v_id, nullif(p ->> 'purchase_price', '')::numeric, nullif(p ->> 'floor_price', '')::numeric);
  end if;
  return v_id;
exception when unique_violation then
  select v.id into v_id from public.vehicles v where v.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 4. Sửa xe có kiểm tra phiên bản. Khóa trong payload nào có mặt thì mới cập nhật (có mặt + rỗng = xóa về "chưa rõ").
-- Trạng thái "giữ/cọc/đã bán/đã giao" không đặt tay ở đây: do nghiệp vụ giữ xe/cọc/bán (chặng 5).
-- ---------------------------------------------------------------------
create or replace function public.update_vehicle(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_new_version integer;
  v_make uuid; v_model uuid; v_variant uuid;
  v_vin text;
  v_cur public.vehicles;
  v_status text := nullif(p ->> 'sale_status', '');
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được sửa hồ sơ xe.' using errcode = '42501';
  end if;
  select * into v_cur from public.vehicles v where v.id = p_id;
  if v_cur.id is null then
    raise exception 'Không tìm thấy xe.' using errcode = '42501';
  end if;
  if v_status is not null and v_status not in ('not_listed', 'available', 'returned_to_owner') and v_status <> v_cur.sale_status then
    raise exception 'Trạng thái "%" chỉ được đặt qua nghiệp vụ giữ xe/cọc/bán hàng (chưa triển khai).', v_status using errcode = '22023';
  end if;

  if p ? 'make' then
    select s.make_id, s.model_id, s.variant_id into v_make, v_model, v_variant
    from public.resolve_vehicle_spec(p ->> 'make', p ->> 'model', p ->> 'variant') s;
  else
    v_make := v_cur.make_id; v_model := v_cur.model_id; v_variant := v_cur.variant_id;
  end if;
  if p ? 'vin' then
    v_vin := nullif(upper(btrim(p ->> 'vin')), '');
    if v_vin is not null then perform private.vehicle_from_payload_check(v_vin, p_id); end if;
  else
    v_vin := v_cur.vin;
  end if;

  update public.vehicles v set
    make_id = v_make, model_id = v_model, variant_id = v_variant, vin = v_vin,
    year_made = case when p ? 'year_made' then nullif(p ->> 'year_made', '')::smallint else v.year_made end,
    year_registered = case when p ? 'year_registered' then nullif(p ->> 'year_registered', '')::smallint else v.year_registered end,
    color = case when p ? 'color' then nullif(lower(btrim(p ->> 'color')), '') else v.color end,
    fuel_type = case when p ? 'fuel_type' then nullif(p ->> 'fuel_type', '') else v.fuel_type end,
    seats = case when p ? 'seats' then nullif(p ->> 'seats', '')::smallint else v.seats end,
    odo = case when p ? 'odo' then nullif(p ->> 'odo', '')::integer else v.odo end,
    plate = case when p ? 'plate' then nullif(upper(btrim(p ->> 'plate')), '') else v.plate end,
    condition = coalesce(nullif(p ->> 'condition', ''), v.condition),
    source_type = case when p ? 'source_type' then nullif(p ->> 'source_type', '') else v.source_type end,
    location_id = case when p ? 'location_id' then nullif(p ->> 'location_id', '')::uuid else v.location_id end,
    prep_status = coalesce(nullif(p ->> 'prep_status', ''), v.prep_status),
    paperwork_status = coalesce(nullif(p ->> 'paperwork_status', ''), v.paperwork_status),
    sale_status = coalesce(v_status, v.sale_status),
    intake_date = case when p ? 'intake_date' then nullif(p ->> 'intake_date', '')::date else v.intake_date end,
    notes = case when p ? 'notes' then nullif(p ->> 'notes', '') else v.notes end
  where v.id = p_id and v.version = p_version
  returning v.version into v_new_version;

  if v_new_version is null then
    raise exception 'Xe vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất rồi sửa lại.' using errcode = '40001';
  end if;

  if p ? 'asking_price' then
    insert into public.vehicle_listings (vehicle_id, asking_price, listed_at)
    values (p_id, nullif(p ->> 'asking_price', '')::numeric, case when v_status = 'available' then now() end)
    on conflict (vehicle_id) do update set asking_price = excluded.asking_price,
      listed_at = coalesce(public.vehicle_listings.listed_at, excluded.listed_at);
  end if;
  if (p ? 'purchase_price' or p ? 'floor_price') then
    if v_cur.business_type = 'consignment' and nullif(p ->> 'purchase_price', '') is not null then
      raise exception 'Xe ký gửi không có giá mua của showroom.' using errcode = '22023';
    end if;
    insert into public.vehicle_financials (vehicle_id, purchase_price, floor_price)
    values (p_id, nullif(p ->> 'purchase_price', '')::numeric, nullif(p ->> 'floor_price', '')::numeric)
    on conflict (vehicle_id) do update set
      purchase_price = case when p ? 'purchase_price' then excluded.purchase_price else public.vehicle_financials.purchase_price end,
      floor_price = case when p ? 'floor_price' then excluded.floor_price else public.vehicle_financials.floor_price end;
  end if;
  return v_new_version;
end $$;

-- ---------------------------------------------------------------------
-- 5. Nhập kho từ nhu cầu bán (xe khách chào bán -> xe trong kho). Chỉ quản lý.
-- Giá trị showroom đã kiểm tra (p) ghi đè thông tin khách khai; thông tin khách khai vẫn giữ nguyên ở sell_offers.
-- ---------------------------------------------------------------------
create or replace function public.acquire_from_demand(p_demand_id uuid, p_request_id uuid, p jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_d public.demands;
  v_o public.sell_offers;
  v_make uuid; v_model uuid; v_variant uuid;
  v_business text;
  v_source text;
  v_vin text;
  v_price numeric := nullif(p ->> 'purchase_price', '')::numeric;
  v_code text;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được nhập kho xe từ nhu cầu bán.' using errcode = '42501';
  end if;
  select v.id into v_id from public.vehicles v where v.source_demand_id = p_demand_id;
  if v_id is not null then return v_id; end if;   -- đã nhập: trả lại xe cũ, không tạo trùng

  select * into v_d from public.demands d where d.id = p_demand_id;
  if v_d.id is null or v_d.kind <> 'sell' then
    raise exception 'Không tìm thấy nhu cầu bán.' using errcode = '22023';
  end if;
  if v_d.status not in ('appraised', 'negotiating') then
    raise exception 'Chỉ nhập kho khi nhu cầu bán đã ở trạng thái "Đã thẩm định" hoặc "Thương lượng".' using errcode = '22023';
  end if;
  select * into v_o from public.sell_offers s where s.demand_id = p_demand_id;
  if v_o.demand_id is null then
    raise exception 'Nhu cầu này chưa có thông tin xe.' using errcode = '22023';
  end if;

  if v_o.sale_mode = 'undecided' and nullif(p ->> 'business_type', '') is null then
    raise exception 'Chọn hình thức (mua đứt, ký gửi hoặc thu cũ đổi mới) trước khi nhập kho.' using errcode = '22023';
  end if;
  v_business := coalesce(nullif(p ->> 'business_type', ''), case when v_o.sale_mode = 'consignment' then 'consignment' else 'owned' end);
  v_source := case when v_o.sale_mode = 'trade_in' or p ->> 'source_type' = 'trade_in' then 'trade_in' else 'individual' end;
  if v_business = 'owned' and v_price is null then
    raise exception 'Nhập giá mua thực tế khi showroom mua đứt xe.' using errcode = '22023';
  end if;
  if v_business = 'consignment' and v_price is not null then
    raise exception 'Xe ký gửi không có giá mua của showroom.' using errcode = '22023';
  end if;

  if nullif(btrim(p ->> 'make'), '') is not null then
    select s.make_id, s.model_id, s.variant_id into v_make, v_model, v_variant
    from public.resolve_vehicle_spec(p ->> 'make', p ->> 'model', p ->> 'variant') s;
  elsif v_o.make_id is not null then
    v_make := v_o.make_id; v_model := v_o.model_id; v_variant := v_o.variant_id;
  else
    raise exception 'Thiếu hãng xe. Nhập hãng/model đã thẩm định.' using errcode = '22023';
  end if;

  v_vin := coalesce(nullif(upper(btrim(p ->> 'vin')), ''), nullif(upper(btrim(v_o.vin)), ''));
  if v_vin is not null then perform private.vehicle_from_payload_check(v_vin); end if;

  insert into public.vehicles (
    vin, make_id, model_id, variant_id, year_made, year_registered, color, fuel_type, seats, odo, plate,
    condition, business_type, source_type, location_id, intake_date, owner_id, source_demand_id,
    previous_vehicle_id, notes, client_request_id)
  values (
    v_vin, v_make, v_model, v_variant,
    coalesce(nullif(p ->> 'year_made', '')::smallint, v_o.year_made),
    coalesce(nullif(p ->> 'year_registered', '')::smallint, v_o.year_registered),
    coalesce(nullif(lower(btrim(p ->> 'color')), ''), v_o.color),
    coalesce(nullif(p ->> 'fuel_type', ''), v_o.fuel_type),
    coalesce(nullif(p ->> 'seats', '')::smallint, v_o.seats),
    coalesce(nullif(p ->> 'odo', '')::integer, v_o.odo),
    coalesce(nullif(upper(btrim(p ->> 'plate')), ''), nullif(upper(btrim(v_o.plate)), '')),
    'used', v_business, v_source, nullif(p ->> 'location_id', '')::uuid,
    coalesce(nullif(p ->> 'intake_date', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
    v_d.owner_id, p_demand_id, private.previous_cycle(v_vin), nullif(p ->> 'notes', ''), p_request_id)
  returning id, code into v_id, v_code;

  if v_price is not null then
    insert into public.vehicle_financials (vehicle_id, purchase_price) values (v_id, v_price);
  end if;
  if nullif(p ->> 'asking_price', '') is not null then
    insert into public.vehicle_listings (vehicle_id, asking_price) values (v_id, (p ->> 'asking_price')::numeric);
  end if;

  update public.sell_offers s set converted_vehicle_id = v_id where s.demand_id = p_demand_id;
  update public.demands d set status = 'acquired' where d.id = p_demand_id;
  perform private.log_system_activity(p_demand_id, 'Đã nhập kho thành xe ' || v_code
    || case when v_business = 'consignment' then ' (ký gửi)' else '' end);
  return v_id;
exception when unique_violation then
  select v.id into v_id from public.vehicles v where v.source_demand_id = p_demand_id or v.client_request_id = p_request_id;
  if v_id is null then raise; end if;
  return v_id;
end $$;

-- Vòng sở hữu trước của một xe (cùng VIN), để hiển thị lịch sử khi xe quay lại.
create or replace function public.vehicle_history(p_id uuid)
returns table (id uuid, code text, sale_status text, business_type text, intake_date date, depth integer)
language sql stable security invoker set search_path = '' as $$
  with recursive chain as (
    select v.id, v.code, v.sale_status, v.business_type, v.intake_date, v.previous_vehicle_id, 0 as depth
    from public.vehicles v where v.id = p_id
    union all
    select v.id, v.code, v.sale_status, v.business_type, v.intake_date, v.previous_vehicle_id, c.depth + 1
    from public.vehicles v join chain c on v.id = c.previous_vehicle_id
  )
  select c.id, c.code, c.sale_status, c.business_type, c.intake_date, c.depth from chain c order by c.depth
$$;

revoke execute on function public.search_vehicles(jsonb, integer, integer) from public, anon;
revoke execute on function public.create_vehicle(jsonb) from public, anon;
revoke execute on function public.update_vehicle(uuid, integer, jsonb) from public, anon;
revoke execute on function public.acquire_from_demand(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.vehicle_history(uuid) from public, anon;
grant execute on function public.search_vehicles(jsonb, integer, integer) to authenticated;
grant execute on function public.create_vehicle(jsonb) to authenticated;
grant execute on function public.update_vehicle(uuid, integer, jsonb) to authenticated;
grant execute on function public.acquire_from_demand(uuid, uuid, jsonb) to authenticated;
grant execute on function public.vehicle_history(uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
