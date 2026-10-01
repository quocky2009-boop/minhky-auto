-- =====================================================================
-- MINH KỲ AUTO — 0300 Kho xe (nền), nguồn ghép nhu cầu, Storage riêng tư
-- Dữ liệu xe tách 3 lớp theo độ nhạy (RLS lọc hàng không tự bảo vệ cột):
--   vehicles            : thông tin xe — nhân viên được phép đều đọc
--   vehicle_listings    : giá chào — sales/quản lý/kế toán
--   vehicle_financials  : giá mua, giá sàn — quản lý/kế toán/admin
-- Chặng 4 sẽ bổ sung thu mua, thẩm định, chi phí, ký gửi.
-- =====================================================================

create sequence public.vehicle_code_seq;
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('XE' || lpad(nextval('public.vehicle_code_seq')::text, 5, '0')),
  vin text,
  make_id uuid not null references public.vehicle_makes (id),
  model_id uuid references public.vehicle_models (id),
  variant_id uuid references public.vehicle_variants (id),
  year_made smallint check (year_made between 1950 and 2100),
  year_registered smallint check (year_registered between 1950 and 2100),
  color text,
  fuel_type text check (fuel_type in ('gasoline', 'diesel', 'hybrid', 'phev', 'ev', 'other')),
  seats smallint check (seats between 1 and 60),
  odo integer check (odo >= 0),
  plate text,

  -- Các chiều tách riêng, KHÔNG gom vào một trạng thái
  condition text not null check (condition in ('new', 'used')),
  business_type text not null check (business_type in ('owned', 'consignment')),
  source_type text check (source_type in ('manufacturer', 'distributor', 'individual', 'other_dealer', 'trade_in')),
  legal_entity_id uuid references public.legal_entities (id),
  location_id uuid references public.locations (id),
  prep_status text not null default 'pending' check (prep_status in ('pending', 'in_progress', 'ready')),
  sale_status text not null default 'not_listed'
    check (sale_status in ('not_listed', 'available', 'held', 'deposited', 'sold', 'delivered', 'returned_to_owner')),
  paperwork_status text not null default 'incomplete' check (paperwork_status in ('incomplete', 'complete')),

  intake_date date,
  owner_id uuid references public.profiles (id),
  source_demand_id uuid unique references public.demands (id),
  notes text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  archived_at timestamptz,
  client_request_id uuid unique,
  constraint vehicles_consignment_not_new_purchase check (not (business_type = 'consignment' and source_type in ('manufacturer', 'distributor')))
);
comment on column public.vehicles.vin is 'Duy nhất khi đã biết; xe mới đặt hàng có thể chưa có VIN.';
create unique index vehicles_vin_key on public.vehicles (upper(vin)) where vin is not null;
create index vehicles_spec_idx on public.vehicles (make_id, model_id, variant_id);
create index vehicles_status_idx on public.vehicles (sale_status, business_type);

alter table public.sell_offers
  add constraint sell_offers_converted_vehicle_fk foreign key (converted_vehicle_id) references public.vehicles (id);

create table public.vehicle_listings (
  vehicle_id uuid primary key references public.vehicles (id),
  asking_price numeric(18, 0) check (asking_price >= 0),
  listed_at timestamptz,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.vehicle_financials (
  vehicle_id uuid primary key references public.vehicles (id),
  purchase_price numeric(18, 0) check (purchase_price >= 0),
  floor_price numeric(18, 0) check (floor_price >= 0),
  notes text,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.vehicle_location_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  location_id uuid references public.locations (id),
  moved_at timestamptz not null default now(),
  moved_by uuid default auth.uid() references public.profiles (id),
  note text
);
create index vlh_vehicle_idx on public.vehicle_location_history (vehicle_id, moved_at desc);

create trigger vehicles_touch before update on public.vehicles for each row execute function private.touch_row();
create trigger vehicle_listings_touch before update on public.vehicle_listings for each row execute function private.touch_row();
create trigger vehicle_financials_touch before update on public.vehicle_financials for each row execute function private.touch_row();
create trigger vehicles_audit after insert or update on public.vehicles for each row
  execute function private.audit_row('sale_status', 'business_type', 'owner_id', 'location_id', 'vin', 'archived_at');
create trigger vehicle_listings_audit after insert or update on public.vehicle_listings for each row execute function private.audit_row();
create trigger vehicle_financials_audit after insert or update on public.vehicle_financials for each row execute function private.audit_row();

-- Ghi lịch sử vị trí khi đổi vị trí.
create or replace function private.vehicles_location_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.location_id is distinct from old.location_id then
    insert into public.vehicle_location_history (vehicle_id, location_id, moved_by)
    values (new.id, new.location_id, (select auth.uid()));
  end if;
  return new;
end $$;
create trigger vehicles_location_history after insert or update of location_id on public.vehicles
  for each row execute function private.vehicles_location_history();

alter table public.vehicles enable row level security;
alter table public.vehicle_listings enable row level security;
alter table public.vehicle_financials enable row level security;
alter table public.vehicle_location_history enable row level security;

create policy vehicles_select on public.vehicles for select to authenticated using (
  private.is_manager() or private.can_see_finance()
  or (private.can_sell() and (sale_status in ('available', 'held', 'deposited') or owner_id = (select auth.uid())))
  or (private.has_any_role(array['technician']::public.app_role[]) and sale_status not in ('sold', 'delivered', 'returned_to_owner'))
);
create policy vehicles_write on public.vehicles for all to authenticated
  using (private.is_manager()) with check (private.is_manager());

create policy listings_select on public.vehicle_listings for select to authenticated using (
  (private.can_sell() or private.can_see_finance())
  and exists (select 1 from public.vehicles v where v.id = vehicle_id) -- kế thừa quyền thấy xe
);
create policy listings_write on public.vehicle_listings for all to authenticated
  using (private.is_manager()) with check (private.is_manager());

create policy financials_select on public.vehicle_financials for select to authenticated using (private.can_see_finance());
create policy financials_write on public.vehicle_financials for all to authenticated
  using (private.is_manager()) with check (private.is_manager());

create policy vlh_select on public.vehicle_location_history for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id));

-- ---------------------------------------------------------------------
-- Nguồn dữ liệu cho gợi ý ghép (chỉ trả tiêu chí xe — KHÔNG trả SĐT/địa chỉ khách)
-- để sales biết "khách của đồng nghiệp đang cần/đang bán xe này" mà không lộ thông tin khách.
-- ---------------------------------------------------------------------
create or replace function public.match_pool_buy_demands()
returns table (
  demand_id uuid, code text, status text, priority text, owner_id uuid, owner_name text, can_open boolean,
  last_activity_at timestamptz, budget_min numeric, budget_max numeric, year_min smallint, year_max smallint,
  odo_max integer, fuel_types text[], seats smallint[], condition_pref text,
  colors_accepted text[], colors_rejected text[], strict_criteria text[], options jsonb)
language sql stable security definer set search_path = '' as $$
  select d.id, d.code, d.status, d.priority, d.owner_id, p.full_name, private.can_access_demand(d.id),
    d.last_activity_at, d.budget_min, d.budget_max, d.year_min, d.year_max, d.odo_max, d.fuel_types, d.seats,
    d.condition_pref, d.colors_accepted, d.colors_rejected, d.strict_criteria,
    coalesce((select jsonb_agg(jsonb_build_object('make_id', o.make_id, 'model_id', o.model_id, 'variant_id', o.variant_id,
        'make', mk.name, 'model', md.name, 'variant', vr.name))
      from public.demand_vehicle_options o
      join public.vehicle_makes mk on mk.id = o.make_id
      left join public.vehicle_models md on md.id = o.model_id
      left join public.vehicle_variants vr on vr.id = o.variant_id
      where o.demand_id = d.id), '[]'::jsonb)
  from public.demands d
  left join public.profiles p on p.id = d.owner_id
  where private.can_sell()
    and d.kind = 'buy'
    and d.status in ('new', 'verified', 'searching', 'viewing', 'negotiating')
$$;

create or replace function public.match_pool_sell_offers()
returns table (
  demand_id uuid, code text, status text, owner_id uuid, owner_name text, can_open boolean, last_activity_at timestamptz,
  make_id uuid, model_id uuid, variant_id uuid, make_name text, model_name text, variant_name text,
  year_made smallint, color text, fuel_type text, seats smallint, odo integer, asking_price numeric, sale_mode text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.code, d.status, d.owner_id, p.full_name, private.can_access_demand(d.id), d.last_activity_at,
    s.make_id, s.model_id, s.variant_id, mk.name, md.name, vr.name,
    s.year_made, s.color, s.fuel_type, s.seats, s.odo, s.asking_price, s.sale_mode
  from public.demands d
  join public.sell_offers s on s.demand_id = d.id
  left join public.profiles p on p.id = d.owner_id
  left join public.vehicle_makes mk on mk.id = s.make_id
  left join public.vehicle_models md on md.id = s.model_id
  left join public.vehicle_variants vr on vr.id = s.variant_id
  where private.can_sell()
    and d.kind = 'sell'
    and d.status in ('new', 'info_collected', 'inspection_scheduled', 'appraised', 'negotiating')
    and s.converted_vehicle_id is null
$$;

-- Xe trong kho để ghép: security invoker -> tuân theo RLS của người gọi.
create or replace function public.match_pool_vehicles()
returns table (
  vehicle_id uuid, code text, condition text, business_type text, sale_status text,
  make_id uuid, model_id uuid, variant_id uuid, make_name text, model_name text, variant_name text,
  year_made smallint, color text, fuel_type text, seats smallint, odo integer, asking_price numeric)
language sql stable security invoker set search_path = '' as $$
  select v.id, v.code, v.condition, v.business_type, v.sale_status, v.make_id, v.model_id, v.variant_id,
    mk.name, md.name, vr.name, v.year_made, v.color, v.fuel_type, v.seats, v.odo, l.asking_price
  from public.vehicles v
  join public.vehicle_makes mk on mk.id = v.make_id
  left join public.vehicle_models md on md.id = v.model_id
  left join public.vehicle_variants vr on vr.id = v.variant_id
  left join public.vehicle_listings l on l.vehicle_id = v.id
  where v.archived_at is null and v.sale_status in ('available', 'held')
$$;

revoke execute on function public.match_pool_buy_demands() from public, anon;
revoke execute on function public.match_pool_sell_offers() from public, anon;
revoke execute on function public.match_pool_vehicles() from public, anon;
grant execute on function public.match_pool_buy_demands() to authenticated;
grant execute on function public.match_pool_sell_offers() to authenticated;
grant execute on function public.match_pool_vehicles() to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket riêng tư cho tệp đính kèm nhu cầu. Đường dẫn: <demand_id>/<tên tệp>
-- Giao diện chỉ dùng signed URL có thời hạn.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('demand-files', 'demand-files', false, 20971520)
on conflict (id) do nothing;

create policy demand_files_select on storage.objects for select to authenticated using (
  bucket_id = 'demand-files'
  and private.can_access_demand(private.try_uuid((storage.foldername(name))[1]))
);
create policy demand_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'demand-files'
  and private.can_access_demand(private.try_uuid((storage.foldername(name))[1]))
);
create policy demand_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'demand-files' and private.is_manager()
);

grant execute on all functions in schema private to authenticated, service_role;
