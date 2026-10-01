-- =====================================================================
-- MINH KỲ AUTO — 0200 Danh mục xe, khách hàng, nhu cầu mua/bán
-- =====================================================================

-- ---------------------------------------------------------------------
-- Danh mục hãng / model / phiên bản
-- Nhân viên được thêm mới (không sửa/xóa) để nhập nhanh không bị chặn;
-- trùng tên được chống bằng khóa chuẩn hóa (không dấu, không phân biệt hoa thường).
-- ---------------------------------------------------------------------
create table public.vehicle_makes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index vehicle_makes_name_key on public.vehicle_makes (private.norm_text(name));

create table public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid not null references public.vehicle_makes (id),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index vehicle_models_name_key on public.vehicle_models (make_id, private.norm_text(name));

create table public.vehicle_variants (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.vehicle_models (id),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index vehicle_variants_name_key on public.vehicle_variants (model_id, private.norm_text(name));

create table public.vehicle_colors (
  name text primary key,
  sort_order integer not null default 100
);

-- Tìm hoặc tạo hãng/model/phiên bản từ tên người dùng gõ.
create or replace function public.resolve_vehicle_spec(p_make text, p_model text default null, p_variant text default null,
  out make_id uuid, out model_id uuid, out variant_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  if private.norm_text(p_make) is null then
    raise exception 'Thiếu tên hãng xe.' using errcode = '22023';
  end if;
  select m.id into make_id from public.vehicle_makes m where private.norm_text(m.name) = private.norm_text(p_make);
  if make_id is null then
    insert into public.vehicle_makes (name) values (btrim(p_make))
      on conflict do nothing returning id into make_id;
    if make_id is null then
      select m.id into make_id from public.vehicle_makes m where private.norm_text(m.name) = private.norm_text(p_make);
    end if;
  end if;

  if private.norm_text(p_model) is not null then
    select m.id into model_id from public.vehicle_models m
      where m.make_id = resolve_vehicle_spec.make_id and private.norm_text(m.name) = private.norm_text(p_model);
    if model_id is null then
      insert into public.vehicle_models (make_id, name) values (resolve_vehicle_spec.make_id, btrim(p_model))
        on conflict do nothing returning id into model_id;
      if model_id is null then
        select m.id into model_id from public.vehicle_models m
          where m.make_id = resolve_vehicle_spec.make_id and private.norm_text(m.name) = private.norm_text(p_model);
      end if;
    end if;
  end if;

  if model_id is not null and private.norm_text(p_variant) is not null then
    select v.id into variant_id from public.vehicle_variants v
      where v.model_id = resolve_vehicle_spec.model_id and private.norm_text(v.name) = private.norm_text(p_variant);
    if variant_id is null then
      insert into public.vehicle_variants (model_id, name) values (resolve_vehicle_spec.model_id, btrim(p_variant))
        on conflict do nothing returning id into variant_id;
      if variant_id is null then
        select v.id into variant_id from public.vehicle_variants v
          where v.model_id = resolve_vehicle_spec.model_id and private.norm_text(v.name) = private.norm_text(p_variant);
      end if;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Nguồn khách (cấu hình)
-- ---------------------------------------------------------------------
create table public.customer_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_self_found boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100
);
insert into public.customer_sources (code, name, is_self_found, sort_order) values
  ('self_found', 'Sales tự tìm', true, 10),
  ('referral', 'Giới thiệu', false, 20),
  ('zalo', 'Zalo', false, 30),
  ('facebook', 'Facebook', false, 40),
  ('ads', 'Quảng cáo', false, 50),
  ('walk_in', 'Khách vãng lai', false, 60),
  ('other', 'Khác', false, 90);

-- ---------------------------------------------------------------------
-- Khách hàng
-- ---------------------------------------------------------------------
create sequence public.customer_code_seq;
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('KH' || lpad(nextval('public.customer_code_seq')::text, 6, '0')),
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  phone_normalized text,
  address text,
  area text,
  source_id uuid references public.customer_sources (id),
  owner_id uuid references public.profiles (id),
  notes text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  archived_at timestamptz,
  client_request_id uuid unique
);
comment on column public.customers.phone_normalized is 'Dùng phát hiện trùng. Không unique: chỉ gợi ý, không tự gộp.';
create index customers_phone_idx on public.customers (phone_normalized);
create index customers_owner_idx on public.customers (owner_id);
create index customers_search_idx on public.customers using gin (private.norm_text(full_name || ' ' || coalesce(phone, '') || ' ' || coalesce(area, '')) extensions.gin_trgm_ops);

create or replace function private.customers_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.phone_normalized := private.normalize_phone(new.phone);
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id
     and not (private.is_manager() or private.is_system()
              or (old.owner_id is null and new.owner_id = (select auth.uid()))) then
    raise exception 'Chỉ quản lý được đổi người phụ trách khách hàng.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger customers_before_write before insert or update on public.customers
  for each row execute function private.customers_before_write();
create trigger customers_touch before update on public.customers for each row execute function private.touch_row();
create trigger customers_audit after update on public.customers for each row
  execute function private.audit_row('owner_id', 'phone', 'full_name', 'archived_at');

-- ---------------------------------------------------------------------
-- Nhu cầu mua / bán
-- Một khách có nhiều nhu cầu. Trạng thái nhu cầu tách biệt mọi chiều khác.
-- ---------------------------------------------------------------------
create sequence public.demand_code_seq;
create table public.demands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('NC' || lpad(nextval('public.demand_code_seq')::text, 6, '0')),
  customer_id uuid not null references public.customers (id),
  kind text not null check (kind in ('buy', 'sell')),
  status text not null default 'new',
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  owner_id uuid references public.profiles (id),
  source_id uuid references public.customer_sources (id),

  next_action text,
  next_action_due timestamptz,
  last_contact_at timestamptz,
  last_activity_at timestamptz not null default now(),
  verified_at timestamptz,
  paused_reason text,
  closed_reason text,
  closed_at timestamptz,
  raw_message text,
  notes text,

  -- Tiêu chí mua (null = chưa rõ, không phải 0)
  budget_min numeric(18, 0) check (budget_min >= 0),
  budget_max numeric(18, 0) check (budget_max >= 0),
  year_min smallint check (year_min between 1950 and 2100),
  year_max smallint check (year_max between 1950 and 2100),
  odo_max integer check (odo_max >= 0),
  fuel_types text[] not null default '{}',
  seats smallint[] not null default '{}',
  condition_pref text check (condition_pref in ('new', 'used', 'any')),
  colors_accepted text[] not null default '{}',
  colors_rejected text[] not null default '{}',
  needs_loan boolean,
  wants_trade_in boolean,
  expected_timeframe text,
  expected_by date,
  strict_criteria text[] not null default '{model}',
  must_have_note text,
  flexible_note text,
  linked_demand_id uuid references public.demands (id),

  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,

  constraint demands_status_valid check (
    (kind = 'buy' and status in ('new', 'verified', 'searching', 'viewing', 'negotiating', 'won', 'paused', 'closed'))
    or (kind = 'sell' and status in ('new', 'info_collected', 'inspection_scheduled', 'appraised', 'negotiating', 'acquired', 'paused', 'closed'))
  ),
  constraint demands_owner_required check (status = 'closed' or owner_id is not null),
  constraint demands_next_action_required check (
    status in ('new', 'paused', 'closed', 'won', 'acquired')
    or (next_action is not null and length(btrim(next_action)) > 0 and next_action_due is not null)
  ),
  constraint demands_close_reason check (status <> 'closed' or length(btrim(coalesce(closed_reason, ''))) > 0),
  constraint demands_pause_reason check (status <> 'paused' or length(btrim(coalesce(paused_reason, ''))) > 0),
  constraint demands_budget_range check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint demands_year_range check (year_min is null or year_max is null or year_min <= year_max),
  constraint demands_strict_valid check (strict_criteria <@ array['model', 'year', 'budget', 'color', 'odo', 'fuel', 'seats', 'condition']),
  constraint demands_fuel_valid check (fuel_types <@ array['gasoline', 'diesel', 'hybrid', 'phev', 'ev', 'other']),
  constraint demands_no_self_link check (linked_demand_id is null or linked_demand_id <> id)
);
create index demands_customer_idx on public.demands (customer_id);
create index demands_owner_status_idx on public.demands (owner_id, status);
create index demands_status_idx on public.demands (kind, status, last_activity_at desc);
create index demands_due_idx on public.demands (next_action_due) where status not in ('closed', 'won', 'acquired', 'paused');
create index demands_budget_idx on public.demands (budget_min, budget_max) where kind = 'buy';
create index demands_colors_idx on public.demands using gin (colors_accepted);
create index demands_search_idx on public.demands using gin (private.norm_text(coalesce(raw_message, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(next_action, '')) extensions.gin_trgm_ops);

-- Phương án xe chấp nhận (nhu cầu mua): một hoặc nhiều.
create table public.demand_vehicle_options (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.demands (id) on delete cascade,
  make_id uuid not null references public.vehicle_makes (id),
  model_id uuid references public.vehicle_models (id),
  variant_id uuid references public.vehicle_variants (id),
  note text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (demand_id, make_id, model_id, variant_id)
);
create index dvo_spec_idx on public.demand_vehicle_options (make_id, model_id, variant_id);

-- Xe khách đang chào bán: nguồn xe tiềm năng, CHƯA phải xe trong kho.
-- Toàn bộ là thông tin KHÁCH CUNG CẤP; kết quả showroom kiểm tra nằm ở bảng thẩm định (chặng 4).
create table public.sell_offers (
  demand_id uuid primary key references public.demands (id) on delete cascade,
  make_id uuid references public.vehicle_makes (id),
  model_id uuid references public.vehicle_models (id),
  variant_id uuid references public.vehicle_variants (id),
  year_made smallint check (year_made between 1950 and 2100),
  year_registered smallint check (year_registered between 1950 and 2100),
  color text,
  fuel_type text check (fuel_type in ('gasoline', 'diesel', 'hybrid', 'phev', 'ev', 'other')),
  seats smallint check (seats between 1 and 60),
  odo integer check (odo >= 0),
  plate text,
  vin text,
  asking_price numeric(18, 0) check (asking_price >= 0),
  negotiable boolean,
  condition_note text,
  repair_history_note text,
  papers_note text,
  has_loan boolean,
  loan_remaining numeric(18, 0) check (loan_remaining >= 0),
  vehicle_location text,
  desired_sell_time text,
  sale_mode text not null default 'undecided' check (sale_mode in ('outright', 'consignment', 'trade_in', 'undecided')),
  inspection_at timestamptz,
  converted_vehicle_id uuid, -- FK thêm ở migration kho xe
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index sell_offers_spec_idx on public.sell_offers (make_id, model_id, variant_id);

-- Nhật ký liên hệ: chỉ thêm, không sửa/xóa.
create table public.demand_activities (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.demands (id),
  actor_id uuid not null default auth.uid() references public.profiles (id),
  occurred_at timestamptz not null default now(),
  channel text not null default 'call' check (channel in ('call', 'zalo', 'meeting', 'sms', 'other', 'system')),
  content text not null check (length(btrim(content)) > 0),
  result text,
  next_action text,
  next_action_due timestamptz,
  status_from text,
  status_to text,
  client_request_id uuid unique,
  created_at timestamptz not null default now()
);
create index demand_activities_demand_idx on public.demand_activities (demand_id, occurred_at desc);

create table public.demand_shares (
  demand_id uuid not null references public.demands (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  granted_by uuid default auth.uid() references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (demand_id, user_id)
);

create table public.demand_attachments (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.demands (id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  scope text not null default 'demands',
  name text not null check (length(btrim(name)) > 0),
  query text not null,
  created_at timestamptz not null default now(),
  unique (user_id, scope, name)
);

-- ---------------------------------------------------------------------
-- Chuyển trạng thái hợp lệ
-- ---------------------------------------------------------------------
create or replace function private.demand_stage(p_kind text, p_status text)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'buy' then array_position(array['new', 'verified', 'searching', 'viewing', 'negotiating', 'won'], p_status)
    else array_position(array['new', 'info_collected', 'inspection_scheduled', 'appraised', 'negotiating', 'acquired'], p_status)
  end
$$;

create or replace function private.demand_transition_allowed(p_kind text, p_from text, p_to text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_from = p_to then true
    when p_to = 'closed' then p_from <> 'closed'
    when p_from in ('closed', 'won', 'acquired') then p_to = 'new'          -- mở lại: phải xác minh lại từ đầu
    when p_to = 'paused' then true
    when p_to in ('won', 'acquired') then p_from in ('viewing', 'negotiating', 'appraised')
                                         and private.demand_stage(p_kind, p_to) is not null
    when p_to = 'new' then p_from = 'paused'
    else private.demand_stage(p_kind, p_to) is not null                     -- giữa các bước đang xử lý: tiến/lùi đều được
  end
$$;

create or replace function private.demands_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('new') and not private.is_system() then
      -- cho phép tạo thẳng ở trạng thái đang xử lý nếu đã có việc tiếp theo (constraint kiểm tra)
      null;
    end if;
    if new.status in ('verified', 'info_collected') then new.verified_at := coalesce(new.verified_at, now()); end if;
    return new;
  end if;

  if new.kind <> old.kind then
    raise exception 'Không đổi được loại nhu cầu (mua/bán). Hãy tạo nhu cầu mới.' using errcode = '22023';
  end if;
  if new.customer_id <> old.customer_id and not private.is_manager() then
    raise exception 'Chỉ quản lý được chuyển nhu cầu sang khách khác.' using errcode = '42501';
  end if;
  if new.owner_id is distinct from old.owner_id and not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được đổi người phụ trách nhu cầu.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not private.demand_transition_allowed(new.kind, old.status, new.status) then
      raise exception 'Không thể chuyển trạng thái từ "%" sang "%".', old.status, new.status using errcode = '22023';
    end if;
    if old.status in ('closed', 'won', 'acquired') and not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được mở lại nhu cầu đã kết thúc.' using errcode = '42501';
    end if;
    if new.status = 'closed' then
      new.closed_at := now();
    else
      new.closed_at := null;
      new.closed_reason := null;
    end if;
    if new.status <> 'paused' then new.paused_reason := null; end if;
    if new.status in ('verified', 'info_collected') then new.verified_at := now(); end if;
    if new.status = 'new' then new.verified_at := null; end if;
    new.last_activity_at := now();
  end if;

  if new.next_action is distinct from old.next_action or new.next_action_due is distinct from old.next_action_due then
    new.last_activity_at := now();
  end if;
  return new;
end $$;
create trigger demands_before_write before insert or update on public.demands
  for each row execute function private.demands_before_write();
create trigger demands_touch before update on public.demands for each row execute function private.touch_row();
create trigger demands_audit after insert or update on public.demands for each row
  execute function private.audit_row('owner_id', 'status', 'budget_min', 'budget_max', 'customer_id', 'closed_reason');
create trigger sell_offers_touch before update on public.sell_offers for each row execute function private.touch_row();
create trigger sell_offers_audit after update on public.sell_offers for each row
  execute function private.audit_row('asking_price', 'converted_vehicle_id');

-- Ghi nhật ký -> cập nhật lần liên hệ / việc tiếp theo trên nhu cầu.
create or replace function private.demand_activity_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.demands d set
    last_contact_at = case when new.channel <> 'system' then greatest(coalesce(d.last_contact_at, new.occurred_at), new.occurred_at) else d.last_contact_at end,
    last_activity_at = now(),
    next_action = coalesce(new.next_action, d.next_action),
    next_action_due = case when new.next_action is not null then new.next_action_due else d.next_action_due end
  where d.id = new.demand_id;
  return new;
end $$;
create trigger demand_activities_after_insert after insert on public.demand_activities
  for each row execute function private.demand_activity_after_insert();

-- ---------------------------------------------------------------------
-- Phân quyền truy cập nhu cầu
-- ---------------------------------------------------------------------
create or replace function private.can_access_demand(p_demand_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_manager()
    or exists (
      select 1 from public.demands d
      where d.id = p_demand_id
        and private.can_sell()
        and (d.owner_id = (select auth.uid()) or d.created_by = (select auth.uid())
             or exists (select 1 from public.demand_shares s where s.demand_id = d.id and s.user_id = (select auth.uid())))
    )
$$;

create or replace function private.can_edit_demand(p_demand_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_manager()
    or exists (select 1 from public.demands d where d.id = p_demand_id and d.owner_id = (select auth.uid()) and private.can_sell())
$$;

grant execute on all functions in schema private to authenticated, service_role;

alter table public.vehicle_makes enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.vehicle_variants enable row level security;
alter table public.vehicle_colors enable row level security;
alter table public.customer_sources enable row level security;
alter table public.customers enable row level security;
alter table public.demands enable row level security;
alter table public.demand_vehicle_options enable row level security;
alter table public.sell_offers enable row level security;
alter table public.demand_activities enable row level security;
alter table public.demand_shares enable row level security;
alter table public.demand_attachments enable row level security;
alter table public.saved_filters enable row level security;

-- Danh mục: mọi nhân viên đọc; nhân viên được thêm; quản lý được sửa.
create policy makes_select on public.vehicle_makes for select to authenticated using (private.is_staff());
create policy makes_insert on public.vehicle_makes for insert to authenticated with check (private.is_staff());
create policy makes_update on public.vehicle_makes for update to authenticated using (private.is_manager());
create policy models_select on public.vehicle_models for select to authenticated using (private.is_staff());
create policy models_insert on public.vehicle_models for insert to authenticated with check (private.is_staff());
create policy models_update on public.vehicle_models for update to authenticated using (private.is_manager());
create policy variants_select on public.vehicle_variants for select to authenticated using (private.is_staff());
create policy variants_insert on public.vehicle_variants for insert to authenticated with check (private.is_staff());
create policy variants_update on public.vehicle_variants for update to authenticated using (private.is_manager());
create policy colors_select on public.vehicle_colors for select to authenticated using (private.is_staff());
create policy colors_write on public.vehicle_colors for all to authenticated using (private.is_manager()) with check (private.is_manager());

create policy sources_select on public.customer_sources for select to authenticated using (private.is_staff());
create policy sources_write on public.customer_sources for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Khách hàng: quản lý xem hết; sales xem khách mình phụ trách/tạo hoặc có nhu cầu mình được giao/chia sẻ.
create policy customers_select on public.customers for select to authenticated using (
  private.is_manager()
  or (private.can_sell() and (
        owner_id = (select auth.uid()) or created_by = (select auth.uid())
        or exists (select 1 from public.demands d where d.customer_id = customers.id and private.can_access_demand(d.id))))
);
create policy customers_insert on public.customers for insert to authenticated with check (
  private.can_sell() and created_by = (select auth.uid())
  and (owner_id is null or owner_id = (select auth.uid()) or private.is_manager())
);
create policy customers_update on public.customers for update to authenticated
  using (private.is_manager() or (private.can_sell() and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))))
  with check (private.is_manager() or (private.can_sell() and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))));

-- Nhu cầu
-- Điều kiện chủ sở hữu viết trực tiếp (không qua hàm tra lại bảng) để INSERT ... RETURNING thấy được hàng vừa tạo.
create policy demands_select on public.demands for select to authenticated using (
  private.is_manager()
  or (private.can_sell() and (
        owner_id = (select auth.uid()) or created_by = (select auth.uid())
        or exists (select 1 from public.demand_shares s where s.demand_id = demands.id and s.user_id = (select auth.uid()))))
);
create policy demands_insert on public.demands for insert to authenticated with check (
  private.can_sell() and created_by = (select auth.uid())
  and (owner_id = (select auth.uid()) or private.is_manager())
);
create policy demands_update on public.demands for update to authenticated
  using (private.can_edit_demand(id))
  with check (private.is_manager() or owner_id = (select auth.uid()));

create policy dvo_select on public.demand_vehicle_options for select to authenticated using (private.can_access_demand(demand_id));
create policy dvo_write on public.demand_vehicle_options for all to authenticated
  using (private.can_edit_demand(demand_id)) with check (private.can_edit_demand(demand_id));

create policy sell_offers_select on public.sell_offers for select to authenticated using (private.can_access_demand(demand_id));
create policy sell_offers_write on public.sell_offers for all to authenticated
  using (private.can_edit_demand(demand_id)) with check (private.can_edit_demand(demand_id));

create policy activities_select on public.demand_activities for select to authenticated using (private.can_access_demand(demand_id));
create policy activities_insert on public.demand_activities for insert to authenticated with check (
  private.can_access_demand(demand_id) and actor_id = (select auth.uid()) and channel <> 'system'
);
revoke update, delete, truncate on public.demand_activities from authenticated, anon;

create policy shares_select on public.demand_shares for select to authenticated
  using (user_id = (select auth.uid()) or private.can_access_demand(demand_id));
create policy shares_write on public.demand_shares for all to authenticated
  using (private.can_edit_demand(demand_id)) with check (private.can_edit_demand(demand_id));

create policy attachments_select on public.demand_attachments for select to authenticated using (private.can_access_demand(demand_id));
create policy attachments_insert on public.demand_attachments for insert to authenticated
  with check (private.can_access_demand(demand_id) and uploaded_by = (select auth.uid()));
create policy attachments_delete on public.demand_attachments for delete to authenticated using (private.is_manager());

create policy saved_filters_own on public.saved_filters for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- RPC: tạo nhu cầu (kèm khách mới nếu cần) trong MỘT giao dịch, chống ghi trùng khi retry.
-- security invoker: mọi RLS vẫn áp dụng.
-- ---------------------------------------------------------------------
create or replace function public.create_demand(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_request uuid := (p ->> 'request_id')::uuid;
  v_id uuid;
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_kind text := p ->> 'kind';
  v_owner uuid := coalesce(nullif(p ->> 'owner_id', '')::uuid, (select auth.uid()));
  v_spec record;
  v_opt jsonb;
  v_offer jsonb := p -> 'sell_offer';
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select d.id into v_id from public.demands d where d.client_request_id = v_request;
  if v_id is not null then
    return v_id; -- retry: trả về bản ghi đã tạo
  end if;

  begin
    if v_customer is null then
      if p -> 'customer' is null or length(btrim(coalesce(p -> 'customer' ->> 'full_name', ''))) = 0 then
        raise exception 'Thiếu tên khách hàng.' using errcode = '22023';
      end if;
      insert into public.customers (full_name, phone, area, address, source_id, owner_id, notes, client_request_id)
      values (btrim(p -> 'customer' ->> 'full_name'), nullif(btrim(p -> 'customer' ->> 'phone'), ''),
              nullif(btrim(p -> 'customer' ->> 'area'), ''), nullif(btrim(p -> 'customer' ->> 'address'), ''),
              nullif(p ->> 'source_id', '')::uuid, v_owner, nullif(p -> 'customer' ->> 'notes', ''), v_request)
      returning id into v_customer;
    end if;

    insert into public.demands (
      customer_id, kind, status, priority, owner_id, source_id, next_action, next_action_due, raw_message, notes,
      budget_min, budget_max, year_min, year_max, odo_max, fuel_types, seats, condition_pref,
      colors_accepted, colors_rejected, needs_loan, wants_trade_in, expected_timeframe, expected_by,
      strict_criteria, must_have_note, flexible_note, client_request_id)
    values (
      v_customer, v_kind, 'new', coalesce(p ->> 'priority', 'normal'), v_owner, nullif(p ->> 'source_id', '')::uuid,
      nullif(btrim(p ->> 'next_action'), ''), nullif(p ->> 'next_action_due', '')::timestamptz,
      nullif(p ->> 'raw_message', ''), nullif(p ->> 'notes', ''),
      nullif(p ->> 'budget_min', '')::numeric, nullif(p ->> 'budget_max', '')::numeric,
      nullif(p ->> 'year_min', '')::smallint, nullif(p ->> 'year_max', '')::smallint,
      nullif(p ->> 'odo_max', '')::integer,
      coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'fuel_types') x), '{}'),
      coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(p -> 'seats') x), '{}'),
      nullif(p ->> 'condition_pref', ''),
      coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p -> 'colors_accepted') x where btrim(x) <> ''), '{}'),
      coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p -> 'colors_rejected') x where btrim(x) <> ''), '{}'),
      (p ->> 'needs_loan')::boolean, (p ->> 'wants_trade_in')::boolean,
      nullif(p ->> 'expected_timeframe', ''), nullif(p ->> 'expected_by', '')::date,
      coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'strict_criteria') x), '{model}'),
      nullif(p ->> 'must_have_note', ''), nullif(p ->> 'flexible_note', ''), v_request)
    returning id into v_id;

    if v_kind = 'buy' then
      for v_opt in select * from jsonb_array_elements(coalesce(p -> 'options', '[]'::jsonb)) loop
        if private.norm_text(v_opt ->> 'make') is not null then
          select * into v_spec from public.resolve_vehicle_spec(v_opt ->> 'make', v_opt ->> 'model', v_opt ->> 'variant');
          insert into public.demand_vehicle_options (demand_id, make_id, model_id, variant_id, note)
          values (v_id, v_spec.make_id, v_spec.model_id, v_spec.variant_id, nullif(v_opt ->> 'note', ''))
          on conflict do nothing;
        end if;
      end loop;
    elsif v_offer is not null then
      v_spec := null;
      if private.norm_text(v_offer ->> 'make') is not null then
        select * into v_spec from public.resolve_vehicle_spec(v_offer ->> 'make', v_offer ->> 'model', v_offer ->> 'variant');
      end if;
      insert into public.sell_offers (demand_id, make_id, model_id, variant_id, year_made, year_registered, color, fuel_type, seats, odo,
        plate, vin, asking_price, negotiable, condition_note, repair_history_note, papers_note, has_loan, loan_remaining,
        vehicle_location, desired_sell_time, sale_mode, inspection_at)
      values (v_id, v_spec.make_id, v_spec.model_id, v_spec.variant_id,
        nullif(v_offer ->> 'year_made', '')::smallint, nullif(v_offer ->> 'year_registered', '')::smallint,
        nullif(lower(btrim(v_offer ->> 'color')), ''), nullif(v_offer ->> 'fuel_type', ''), nullif(v_offer ->> 'seats', '')::smallint,
        nullif(v_offer ->> 'odo', '')::integer, nullif(upper(btrim(v_offer ->> 'plate')), ''), nullif(upper(btrim(v_offer ->> 'vin')), ''),
        nullif(v_offer ->> 'asking_price', '')::numeric, (v_offer ->> 'negotiable')::boolean,
        nullif(v_offer ->> 'condition_note', ''), nullif(v_offer ->> 'repair_history_note', ''), nullif(v_offer ->> 'papers_note', ''),
        (v_offer ->> 'has_loan')::boolean, nullif(v_offer ->> 'loan_remaining', '')::numeric,
        nullif(v_offer ->> 'vehicle_location', ''), nullif(v_offer ->> 'desired_sell_time', ''),
        coalesce(nullif(v_offer ->> 'sale_mode', ''), 'undecided'), nullif(v_offer ->> 'inspection_at', '')::timestamptz);
    end if;
  exception when unique_violation then
    -- Hai lần gửi trùng chạy song song: lần sau lấy lại bản ghi của lần trước.
    select d.id into v_id from public.demands d where d.client_request_id = v_request;
    if v_id is null then raise; end if;
  end;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: ghi nhật ký liên hệ + (tùy chọn) chuyển trạng thái, trong một giao dịch.
-- Đang xử lý mà không có việc tiếp theo + hạn -> bị chặn bởi constraint.
-- ---------------------------------------------------------------------
create or replace function public.log_demand_activity(
  p_demand_id uuid, p_request_id uuid, p_channel text, p_content text, p_result text default null,
  p_next_action text default null, p_next_due timestamptz default null,
  p_new_status text default null, p_reason text default null, p_expected_version integer default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_d public.demands;
begin
  select a.id into v_id from public.demand_activities a where a.client_request_id = p_request_id;
  if v_id is not null then return v_id; end if;

  select * into v_d from public.demands d where d.id = p_demand_id;
  if v_d.id is null then
    raise exception 'Không tìm thấy nhu cầu hoặc anh/chị không có quyền.' using errcode = '42501';
  end if;
  if p_expected_version is not null and v_d.version <> p_expected_version then
    raise exception 'Nhu cầu vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất.' using errcode = '40001';
  end if;
  if (p_next_action is null) <> (p_next_due is null) then
    raise exception 'Việc tiếp theo và hạn thực hiện phải đi cùng nhau.' using errcode = '22023';
  end if;

  insert into public.demand_activities (demand_id, channel, content, result, next_action, next_action_due, status_from, status_to, client_request_id)
  values (p_demand_id, coalesce(p_channel, 'call'), p_content, nullif(p_result, ''), nullif(btrim(p_next_action), ''), p_next_due,
          case when p_new_status is not null and p_new_status <> v_d.status then v_d.status end,
          case when p_new_status is not null and p_new_status <> v_d.status then p_new_status end,
          p_request_id)
  returning id into v_id;

  if p_new_status is not null and p_new_status <> v_d.status then
    update public.demands d set
      status = p_new_status,
      closed_reason = case when p_new_status = 'closed' then p_reason else d.closed_reason end,
      paused_reason = case when p_new_status = 'paused' then p_reason else d.paused_reason end
    where d.id = p_demand_id;
  end if;
  return v_id;
exception when unique_violation then
  select a.id into v_id from public.demand_activities a where a.client_request_id = p_request_id;
  if v_id is null then raise; end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: kiểm tra trùng số điện thoại. Sales thấy được khách đã tồn tại
-- (kể cả của người khác) nhưng chỉ tên rút gọn và người phụ trách — không lộ địa chỉ/ghi chú.
-- ---------------------------------------------------------------------
create or replace function public.find_customers_by_phone(p_phone text)
returns table (customer_id uuid, code text, display_name text, owner_name text, can_open boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.code,
    case when private.is_manager() or c.owner_id = (select auth.uid()) or c.created_by = (select auth.uid())
         then c.full_name
         else regexp_replace(c.full_name, '^(.*\s)?(\S+)$', '…\2') end,
    p.full_name,
    (private.is_manager() or c.owner_id = (select auth.uid()) or c.created_by = (select auth.uid())
      or exists (select 1 from public.demands d where d.customer_id = c.id and private.can_access_demand(d.id)))
  from public.customers c
  left join public.profiles p on p.id = c.owner_id
  where private.can_sell()
    and c.archived_at is null
    and private.normalize_phone(p_phone) is not null
    and length(private.normalize_phone(p_phone)) >= 9
    and c.phone_normalized = private.normalize_phone(p_phone)
  limit 5
$$;

revoke execute on function public.create_demand(jsonb) from public, anon;
revoke execute on function public.log_demand_activity(uuid, uuid, text, text, text, text, timestamptz, text, text, integer) from public, anon;
revoke execute on function public.find_customers_by_phone(text) from public, anon;
revoke execute on function public.resolve_vehicle_spec(text, text, text) from public, anon;
grant execute on function public.create_demand(jsonb) to authenticated;
grant execute on function public.log_demand_activity(uuid, uuid, text, text, text, text, timestamptz, text, text, integer) to authenticated;
grant execute on function public.find_customers_by_phone(text) to authenticated;
grant execute on function public.resolve_vehicle_spec(text, text, text) to authenticated;
