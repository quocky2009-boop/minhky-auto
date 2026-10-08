-- =====================================================================
-- MINH KỲ AUTO — 2300 Chặng 6 (lát 9): hậu mãi — cam kết/bảo hành, phản ánh, nhắc chăm sóc, chi phí sau bán
--
-- CLAUDE.md §9: "Hậu mãi: cam kết, bảo hành, phản ánh, nhắc chăm sóc; chi phí sau bán quay về đúng xe." §12.13: chi phí sau bán và điều chỉnh
-- được phản ánh trong báo cáo.
--  * aftersales_commitments (CK#####): cam kết / bảo hành GẮN MỘT DÒNG ĐƠN BÁN đã ký (xe đã bán/đã giao). Quản lý ghi (D42). Không sửa: chỉ HỦY có lý do.
--    Bảo hành phải có hạn (ngày) và/hoặc giới hạn km; cam kết khác (vd. tặng bảo dưỡng) có thể không hạn nhưng mô tả bằng chữ.
--  * aftersales_cases (HM#####): phiếu phản ánh / yêu cầu bảo hành / yêu cầu dịch vụ / nhắc chăm sóc theo lịch. Luôn có người phụ trách; khi đang xử lý
--    BẮT BUỘC có việc tiếp theo + hạn (cùng nguyên tắc nhu cầu); xử lý xong cần ghi kết quả; hủy cần lý do. Có thể gắn cam kết/bảo hành: database tính GỢI Ý
--    "trong / ngoài / chưa rõ (thiếu km)" theo ngày tiếp nhận và km — quản lý vẫn là người quyết định, không tự động từ chối hay chấp nhận.
--  * aftersales_events: nhật ký liên hệ/xử lý, không sửa/xóa.
--  * Chi phí sau bán: vehicle_costs thêm loại 'after_sales' BẮT BUỘC gắn một phiếu hậu mãi cùng xe → chi phí quay về đúng xe; dùng đúng quy trình dự kiến →
--    xác nhận → thanh toán. Vì nằm trong số liệu đầu vào của quyết toán nên chi phí sau bán làm quyết toán đã duyệt trở thành "lỗi thời" → lập ĐIỀU CHỈNH
--    có lưu vết (không sửa âm thầm). Phiếu không thể xử lý xong khi còn chi phí dự kiến chưa xác nhận; không hủy khi còn chi phí chưa đảo.
--  * Quyền: quản lý ghi/hủy cam kết, đổi người phụ trách; sales tạo phiếu cho đơn của mình (tự phụ trách); người phụ trách cập nhật; kế toán đọc.
--    Kỹ thuật chỉ thấy phiếu được giao cho mình. Sales không thấy chi phí/giá vốn (chi phí vẫn ở bảng chi phí xe của tài chính).
-- =====================================================================

create sequence public.aftersales_commitment_code_seq;
create sequence public.aftersales_case_code_seq;

create table public.aftersales_commitments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('CK' || lpad(nextval('public.aftersales_commitment_code_seq')::text, 5, '0')),
  order_line_id uuid not null references public.sales_order_lines (id),
  order_id uuid not null references public.sales_orders (id),
  vehicle_id uuid not null references public.vehicles (id),
  customer_id uuid not null references public.customers (id),
  owner_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('warranty', 'commitment')),
  title text not null check (length(btrim(title)) > 0),
  details text,
  starts_on date not null,
  ends_on date,
  odo_limit integer check (odo_limit > 0),
  status text not null default 'active' check (status in ('active', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint aftersales_commitments_range check (ends_on is null or ends_on >= starts_on),
  constraint aftersales_commitments_limit check (kind = 'commitment' or ends_on is not null or odo_limit is not null),
  constraint aftersales_commitments_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_at is not null))
);
create index aftersales_commitments_line_idx on public.aftersales_commitments (order_line_id);
create index aftersales_commitments_vehicle_idx on public.aftersales_commitments (vehicle_id);

create table public.aftersales_cases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('HM' || lpad(nextval('public.aftersales_case_code_seq')::text, 5, '0')),
  order_line_id uuid not null references public.sales_order_lines (id),
  order_id uuid not null references public.sales_orders (id),
  vehicle_id uuid not null references public.vehicles (id),
  customer_id uuid not null references public.customers (id),
  owner_id uuid not null references public.profiles (id),              -- sales phụ trách đơn bán (ảnh chụp lúc tạo)
  kind text not null check (kind in ('complaint', 'warranty_claim', 'service_request', 'care_call')),
  title text not null check (length(btrim(title)) > 0),
  description text,
  received_on date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  odo_at_case integer check (odo_at_case >= 0),
  commitment_id uuid references public.aftersales_commitments (id),
  coverage text check (coverage in ('within', 'outside', 'unknown')),  -- GỢI Ý do database tính; null = không gắn cam kết
  assigned_to uuid not null references public.profiles (id),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'cancelled')),
  next_action text,
  next_due date,
  resolution text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  end_reason text,
  ended_by uuid references public.profiles (id),
  ended_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint aftersales_cases_commitment_pair check ((commitment_id is null) = (coverage is null)),
  constraint aftersales_cases_next_required check (status not in ('open', 'in_progress') or (length(btrim(coalesce(next_action, ''))) > 0 and next_due is not null)),
  constraint aftersales_cases_resolved_complete check (status <> 'resolved' or (length(btrim(coalesce(resolution, ''))) > 0 and resolved_at is not null)),
  constraint aftersales_cases_cancel_complete check (status <> 'cancelled' or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null))
);
create index aftersales_cases_assigned_idx on public.aftersales_cases (assigned_to, next_due) where status in ('open', 'in_progress');
create index aftersales_cases_vehicle_idx on public.aftersales_cases (vehicle_id);
create index aftersales_cases_due_idx on public.aftersales_cases (next_due) where status in ('open', 'in_progress');

create table public.aftersales_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.aftersales_cases (id),
  kind text not null check (kind in ('note', 'contact', 'status')),
  content text not null check (length(btrim(content)) > 0),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index aftersales_events_case_idx on public.aftersales_events (case_id, created_at);

create trigger aftersales_commitments_touch before update on public.aftersales_commitments for each row execute function private.touch_row();
create trigger aftersales_commitments_audit after insert or update on public.aftersales_commitments for each row execute function private.audit_row();
create trigger aftersales_cases_touch before update on public.aftersales_cases for each row execute function private.touch_row();
create trigger aftersales_cases_audit after insert or update on public.aftersales_cases for each row execute function private.audit_row();

-- Chi phí sau bán quay về đúng xe: loại mới + gắn phiếu hậu mãi.
alter table public.vehicle_costs add column aftersales_case_id uuid references public.aftersales_cases (id);
create index vehicle_costs_aftersales_idx on public.vehicle_costs (aftersales_case_id) where aftersales_case_id is not null;
alter table public.vehicle_costs drop constraint vehicle_costs_category_check;
alter table public.vehicle_costs add constraint vehicle_costs_category_check check (category in
  ('repair', 'detailing', 'accessories', 'paperwork', 'transport', 'inspection', 'other', 'after_sales'));

-- Đếm chi phí của một phiếu (chỉ trả số; người không đọc được bảng chi phí vẫn bị chặn đúng).
create or replace function private.aftersales_cost_count(p_case uuid, p_only_open boolean)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.vehicle_costs c
  where c.aftersales_case_id = p_case and ((p_only_open and c.status = 'estimated') or (not p_only_open and c.status <> 'void'))
$$;

-- Trạng thái bán của xe (chỉ trả chữ): sales không đọc được xe đã bán qua RLS nhưng vẫn cần biết xe đã bán để mở phiếu.
create or replace function private.vehicle_sale_status(p_vehicle uuid)
returns text language sql stable security definer set search_path = '' as $$
  select v.sale_status from public.vehicles v where v.id = p_vehicle
$$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.aftersales_commitments_guard()
returns trigger language plpgsql set search_path = '' as $$
declare l public.sales_order_lines; o public.sales_orders;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa cam kết/bảo hành. Hủy (có lý do).' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được ghi cam kết/bảo hành.' using errcode = '42501';
    end if;
    select * into l from public.sales_order_lines x where x.id = new.order_line_id;
    if l.id is null or l.line_status <> 'active' then
      raise exception 'Không tìm thấy dòng xe hiệu lực của đơn bán.' using errcode = '22023';
    end if;
    select * into o from public.sales_orders x where x.id = l.order_id;
    if o.status <> 'confirmed' or private.vehicle_sale_status(l.vehicle_id) not in ('sold', 'delivered') then
      raise exception 'Chỉ ghi cam kết/bảo hành cho xe đã bán (đơn đã ký hợp đồng).' using errcode = '22023';
    end if;
    if new.status <> 'active' then
      raise exception 'Cam kết mới phải ở trạng thái hiệu lực.' using errcode = '22023';
    end if;
    new.order_id := o.id; new.vehicle_id := l.vehicle_id; new.customer_id := o.customer_id; new.owner_id := o.owner_id;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;
  if (new.code, new.order_line_id, new.order_id, new.vehicle_id, new.customer_id, new.owner_id, new.kind, new.title, new.details, new.starts_on, new.ends_on, new.odo_limit, new.created_by, new.created_at)
     is distinct from (old.code, old.order_line_id, old.order_id, old.vehicle_id, old.customer_id, old.owner_id, old.kind, old.title, old.details, old.starts_on, old.ends_on, old.odo_limit, old.created_by, old.created_at) then
    raise exception 'Không sửa cam kết/bảo hành. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status = 'void' then
    raise exception 'Cam kết đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status = 'void' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy cam kết/bảo hành.' using errcode = '42501';
    end if;
    if length(btrim(coalesce(new.void_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy cam kết/bảo hành.' using errcode = '22023';
    end if;
    if not private.is_system() then new.voided_by := (select auth.uid()); end if;
    new.voided_at := now();
  end if;
  return new;
end $$;
create trigger aftersales_commitments_guard before insert or update or delete on public.aftersales_commitments for each row execute function private.aftersales_commitments_guard();

create or replace function private.aftersales_cases_guard()
returns trigger language plpgsql set search_path = '' as $$
declare l public.sales_order_lines; o public.sales_orders; c public.aftersales_commitments; today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; n integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa phiếu hậu mãi. Hủy (có lý do).' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    select * into l from public.sales_order_lines x where x.id = new.order_line_id;
    if l.id is null or l.line_status <> 'active' then
      raise exception 'Không tìm thấy dòng xe hiệu lực của đơn bán hoặc anh/chị không có quyền.' using errcode = '22023';
    end if;
    select * into o from public.sales_orders x where x.id = l.order_id;
    if o.status <> 'confirmed' or private.vehicle_sale_status(l.vehicle_id) not in ('sold', 'delivered') then
      raise exception 'Chỉ mở phiếu hậu mãi cho xe đã bán (đơn đã ký hợp đồng).' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or (private.can_sell() and o.owner_id = (select auth.uid()))) then
      raise exception 'Chỉ quản lý hoặc sales phụ trách đơn bán được mở phiếu hậu mãi.' using errcode = '42501';
    end if;
    if new.status <> 'open' or new.resolved_at is not null or new.ended_at is not null then
      raise exception 'Phiếu mới phải ở trạng thái mở.' using errcode = '22023';
    end if;
    if new.received_on > today then
      raise exception 'Ngày tiếp nhận không được ở tương lai.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system()) then
      new.assigned_to := (select auth.uid());                                    -- sales tự phụ trách; quản lý mới giao người khác
    end if;
    if not exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id where p.id = new.assigned_to and p.is_active) then
      raise exception 'Người phụ trách phải là nhân viên đang hoạt động.' using errcode = '22023';
    end if;
    new.order_id := o.id; new.vehicle_id := l.vehicle_id; new.customer_id := o.customer_id; new.owner_id := o.owner_id;
    if new.commitment_id is not null then
      select * into c from public.aftersales_commitments x where x.id = new.commitment_id;
      if c.id is null or c.status <> 'active' or c.order_line_id <> new.order_line_id then
        raise exception 'Cam kết/bảo hành phải còn hiệu lực và thuộc đúng xe này.' using errcode = '22023';
      end if;
      -- GỢI Ý trong/ngoài: ngoài hạn ngày hoặc vượt km → ngoài; còn trong hạn nhưng thiếu km khi có giới hạn km → chưa rõ (cần xác minh)
      new.coverage := case
        when new.received_on < c.starts_on or (c.ends_on is not null and new.received_on > c.ends_on) then 'outside'
        when c.odo_limit is not null and new.odo_at_case is not null and new.odo_at_case > c.odo_limit then 'outside'
        when c.odo_limit is not null and new.odo_at_case is null then 'unknown'
        else 'within' end;
    else
      new.coverage := null;
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if (new.code, new.order_line_id, new.order_id, new.vehicle_id, new.customer_id, new.owner_id, new.kind, new.title, new.description, new.received_on, new.odo_at_case,
      new.commitment_id, new.coverage, new.created_by, new.created_at)
     is distinct from (old.code, old.order_line_id, old.order_id, old.vehicle_id, old.customer_id, old.owner_id, old.kind, old.title, old.description, old.received_on, old.odo_at_case,
      old.commitment_id, old.coverage, old.created_by, old.created_at) then
    raise exception 'Không sửa nội dung phiếu hậu mãi đã tiếp nhận. Ghi thêm vào nhật ký.' using errcode = '22023';
  end if;
  if old.status in ('cancelled') then
    raise exception 'Phiếu đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được đổi người phụ trách phiếu hậu mãi.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id where p.id = new.assigned_to and p.is_active) then
      raise exception 'Người phụ trách phải là nhân viên đang hoạt động.' using errcode = '22023';
    end if;
  end if;
  if new.status = old.status then
    if old.status = 'resolved' and (new.next_action is distinct from old.next_action or new.next_due is distinct from old.next_due or new.resolution is distinct from old.resolution) then
      raise exception 'Phiếu đã xử lý xong, không sửa. Mở lại (quản lý) nếu cần.' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.status = 'in_progress' then
    if old.status = 'open' then
      return new;
    end if;
    if old.status = 'resolved' then                                              -- mở lại: chỉ quản lý, phải có việc tiếp theo + hạn mới
      if not (private.is_manager() or private.is_system()) then
        raise exception 'Chỉ quản lý được mở lại phiếu đã xử lý xong.' using errcode = '42501';
      end if;
      if new.next_action is not distinct from old.next_action and new.next_due is not distinct from old.next_due then
        raise exception 'Mở lại phiếu phải ghi việc tiếp theo và hạn mới.' using errcode = '22023';
      end if;
      new.resolution := null; new.resolved_at := null; new.resolved_by := null;
      return new;
    end if;
  end if;
  if new.status = 'resolved' and old.status in ('open', 'in_progress') then
    if length(btrim(coalesce(new.resolution, ''))) = 0 then
      raise exception 'Ghi kết quả xử lý trước khi đóng phiếu.' using errcode = '22023';
    end if;
    n := private.aftersales_cost_count(old.id, true);
    if n > 0 then
      raise exception 'Còn % khoản chi phí sau bán dự kiến chưa xác nhận hoặc hủy: xử lý trước khi đóng phiếu.', n using errcode = '22023';
    end if;
    new.next_action := null; new.next_due := null;
    if not private.is_system() then new.resolved_by := (select auth.uid()); end if;
    new.resolved_at := now();
    return new;
  end if;
  if new.status = 'cancelled' and old.status in ('open', 'in_progress') then
    if length(btrim(coalesce(new.end_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy phiếu hậu mãi.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or old.created_by = (select auth.uid())) then
      raise exception 'Chỉ người tạo hoặc quản lý được hủy phiếu hậu mãi.' using errcode = '42501';
    end if;
    if private.aftersales_cost_count(old.id, false) > 0 then
      raise exception 'Phiếu đã có chi phí sau bán. Hủy (đảo) các khoản chi phí trước khi hủy phiếu.' using errcode = '22023';
    end if;
    new.next_action := null; new.next_due := null;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  raise exception 'Không thể chuyển phiếu hậu mãi từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger aftersales_cases_guard before insert or update or delete on public.aftersales_cases for each row execute function private.aftersales_cases_guard();

create or replace function private.aftersales_events_guard()
returns trigger language plpgsql set search_path = '' as $$
declare c public.aftersales_cases;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Nhật ký hậu mãi không sửa/xóa.' using errcode = '22023';
  end if;
  select * into c from public.aftersales_cases x where x.id = new.case_id;
  if c.id is null then
    raise exception 'Không tìm thấy phiếu hậu mãi hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
  if c.status = 'cancelled' and new.kind <> 'status' then
    raise exception 'Phiếu đã hủy, không ghi thêm nhật ký.' using errcode = '22023';
  end if;
  if not private.is_system() then new.created_by := (select auth.uid()); end if;
  return new;
end $$;
create trigger aftersales_events_guard before insert or update or delete on public.aftersales_events for each row execute function private.aftersales_events_guard();

-- Chi phí loại "sau bán" bắt buộc gắn phiếu hậu mãi cùng xe; loại khác không gắn; không đổi sau khi ghi.
create or replace function private.vehicle_costs_aftersales()
returns trigger language plpgsql set search_path = '' as $$
declare c public.aftersales_cases;
begin
  if tg_op = 'INSERT' then
    if new.category = 'after_sales' then
      if new.aftersales_case_id is null then
        raise exception 'Chi phí sau bán phải gắn một phiếu hậu mãi (để chi phí quay về đúng xe).' using errcode = '22023';
      end if;
      select * into c from public.aftersales_cases x where x.id = new.aftersales_case_id;
      if c.id is null or c.vehicle_id <> new.vehicle_id then
        raise exception 'Phiếu hậu mãi không tồn tại hoặc không thuộc xe này.' using errcode = '22023';
      end if;
      if c.status = 'cancelled' then
        raise exception 'Phiếu hậu mãi đã hủy, không ghi thêm chi phí.' using errcode = '22023';
      end if;
    elsif new.aftersales_case_id is not null then
      raise exception 'Chỉ chi phí loại "sau bán" mới gắn phiếu hậu mãi.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.aftersales_case_id is distinct from old.aftersales_case_id or (new.category = 'after_sales') is distinct from (old.category = 'after_sales') then
    raise exception 'Không đổi phiếu hậu mãi hoặc loại "sau bán" của khoản chi phí đã ghi. Hủy rồi tạo khoản thay thế.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger vehicle_costs_zaftersales before insert or update on public.vehicle_costs for each row execute function private.vehicle_costs_aftersales();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.aftersales_commitments enable row level security;
alter table public.aftersales_cases enable row level security;
alter table public.aftersales_events enable row level security;
create policy aftersales_commitments_select on public.aftersales_commitments for select to authenticated using (
  private.is_manager() or private.can_see_finance() or (private.can_sell() and owner_id = (select auth.uid())));
create policy aftersales_commitments_insert on public.aftersales_commitments for insert to authenticated with check (private.is_manager());
create policy aftersales_commitments_update on public.aftersales_commitments for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy aftersales_cases_select on public.aftersales_cases for select to authenticated using (
  private.is_manager() or private.can_see_finance() or owner_id = (select auth.uid()) or assigned_to = (select auth.uid()) or created_by = (select auth.uid()));
create policy aftersales_cases_insert on public.aftersales_cases for insert to authenticated with check (private.is_manager() or private.can_sell());
create policy aftersales_cases_update on public.aftersales_cases for update to authenticated
  using (private.is_manager() or assigned_to = (select auth.uid()) or (private.can_sell() and owner_id = (select auth.uid())))
  with check (private.is_manager() or assigned_to = (select auth.uid()) or (private.can_sell() and owner_id = (select auth.uid())));
create policy aftersales_events_select on public.aftersales_events for select to authenticated using (exists (select 1 from public.aftersales_cases c where c.id = case_id));
create policy aftersales_events_insert on public.aftersales_events for insert to authenticated with check (exists (select 1 from public.aftersales_cases c where c.id = case_id));
revoke delete, truncate on public.aftersales_commitments, public.aftersales_cases, public.aftersales_events from authenticated, anon;
revoke all on public.aftersales_commitments, public.aftersales_cases, public.aftersales_events from anon;

-- ---------------------------------------------------------------------
-- RPC (security invoker). Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_aftersales_commitment(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select c.id into v_id from public.aftersales_commitments c where c.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.aftersales_commitments (order_line_id, order_id, vehicle_id, customer_id, owner_id, kind, title, details, starts_on, ends_on, odo_limit, client_request_id)
  select l.id, l.order_id, l.vehicle_id, o.customer_id, o.owner_id, p ->> 'kind', btrim(coalesce(p ->> 'title', '')), nullif(btrim(p ->> 'details'), ''),
         (p ->> 'starts_on')::date, nullif(p ->> 'ends_on', '')::date, nullif(p ->> 'odo_limit', '')::integer, v_request
  from public.sales_order_lines l join public.sales_orders o on o.id = l.order_id where l.id = (p ->> 'order_line_id')::uuid
  returning id into v_id;
  if v_id is null then
    raise exception 'Không tìm thấy dòng xe của đơn bán hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
  return v_id;
exception when unique_violation then
  select c.id into v_id from public.aftersales_commitments c where c.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.void_aftersales_commitment(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.aftersales_commitments c set status = 'void', void_reason = btrim(coalesce(p_reason, '')) where c.id = p_id and c.version = p_version and c.status = 'active' returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Cam kết vừa được cập nhật, đã hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.create_aftersales_case(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; v_assignee uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select c.id into v_id from public.aftersales_cases c where c.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  v_assignee := coalesce(nullif(p ->> 'assigned_to', '')::uuid, (select auth.uid()));
  insert into public.aftersales_cases (order_line_id, order_id, vehicle_id, customer_id, owner_id, kind, title, description, received_on, odo_at_case, commitment_id,
                                       assigned_to, next_action, next_due, client_request_id)
  select l.id, l.order_id, l.vehicle_id, o.customer_id, o.owner_id, p ->> 'kind', btrim(coalesce(p ->> 'title', '')), nullif(btrim(p ->> 'description'), ''),
         coalesce(nullif(p ->> 'received_on', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date), nullif(p ->> 'odo_at_case', '')::integer,
         nullif(p ->> 'commitment_id', '')::uuid, v_assignee, nullif(btrim(p ->> 'next_action'), ''), nullif(p ->> 'next_due', '')::date, v_request
  from public.sales_order_lines l join public.sales_orders o on o.id = l.order_id where l.id = (p ->> 'order_line_id')::uuid
  returning id into v_id;
  if v_id is null then
    raise exception 'Không tìm thấy dòng xe của đơn bán hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
  insert into public.aftersales_events (case_id, kind, content) values (v_id, 'status', 'Tiếp nhận phiếu');
  return v_id;
exception when unique_violation then
  select c.id into v_id from public.aftersales_cases c where c.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

-- Cập nhật việc tiếp theo/hạn/người phụ trách; status tùy chọn: 'in_progress'. Ghi nhật ký tự động.
create or replace function public.update_aftersales_case(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer; o public.aftersales_cases;
begin
  select * into o from public.aftersales_cases c where c.id = p_id and c.version = p_version and c.status in ('open', 'in_progress');
  if o.id is null then
    raise exception 'Phiếu vừa được cập nhật, đã đóng hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.aftersales_cases c set
    next_action = coalesce(nullif(btrim(p ->> 'next_action'), ''), c.next_action),
    next_due = coalesce(nullif(p ->> 'next_due', '')::date, c.next_due),
    assigned_to = coalesce(nullif(p ->> 'assigned_to', '')::uuid, c.assigned_to),
    status = case when c.status = 'open' then 'in_progress' else c.status end
  where c.id = p_id returning c.version into v_ver;
  if o.status = 'open' then
    insert into public.aftersales_events (case_id, kind, content) values (p_id, 'status', 'Bắt đầu xử lý');
  end if;
  if nullif(btrim(p ->> 'next_action'), '') is not null or nullif(p ->> 'next_due', '') is not null then
    insert into public.aftersales_events (case_id, kind, content) values (p_id, 'status', 'Việc tiếp theo: ' || coalesce(nullif(btrim(p ->> 'next_action'), ''), o.next_action) || ' · hạn ' ||
      to_char(coalesce(nullif(p ->> 'next_due', '')::date, o.next_due), 'DD/MM/YYYY'));
  end if;
  return v_ver;
end $$;

create or replace function public.add_aftersales_event(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if (p ->> 'kind') not in ('note', 'contact') then
    raise exception 'Loại nhật ký không hợp lệ.' using errcode = '22023';
  end if;
  insert into public.aftersales_events (case_id, kind, content) values ((p ->> 'case_id')::uuid, p ->> 'kind', btrim(coalesce(p ->> 'content', ''))) returning id into v_id;
  return v_id;
end $$;

create or replace function public.resolve_aftersales_case(p_id uuid, p_version integer, p_resolution text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.aftersales_cases c set status = 'resolved', resolution = btrim(coalesce(p_resolution, '')) where c.id = p_id and c.version = p_version and c.status in ('open', 'in_progress') returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Phiếu vừa được cập nhật, đã đóng hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  insert into public.aftersales_events (case_id, kind, content) values (p_id, 'status', 'Đã xử lý xong: ' || btrim(p_resolution));
  return v_ver;
end $$;

create or replace function public.reopen_aftersales_case(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.aftersales_cases c set status = 'in_progress', next_action = btrim(coalesce(p ->> 'next_action', '')), next_due = nullif(p ->> 'next_due', '')::date
  where c.id = p_id and c.version = p_version and c.status = 'resolved' returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Phiếu vừa được cập nhật, chưa xử lý xong hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  insert into public.aftersales_events (case_id, kind, content) values (p_id, 'status', 'Mở lại phiếu');
  return v_ver;
end $$;

create or replace function public.cancel_aftersales_case(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.aftersales_cases c set status = 'cancelled', end_reason = btrim(coalesce(p_reason, '')) where c.id = p_id and c.version = p_version and c.status in ('open', 'in_progress') returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Phiếu vừa được cập nhật, đã đóng hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  insert into public.aftersales_events (case_id, kind, content) values (p_id, 'status', 'Hủy phiếu: ' || btrim(p_reason));
  return v_ver;
end $$;

-- Chi phí xe: nhận thêm aftersales_case_id (chi phí sau bán).
create or replace function public.create_vehicle_cost(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_request uuid := (p ->> 'request_id')::uuid;
  v_id uuid;
  v_repl uuid := nullif(p ->> 'replaces_cost_id', '')::uuid;
  v_bt text;
begin
  if not private.can_see_finance() then
    raise exception 'Anh/chị không có quyền ghi chi phí xe.' using errcode = '42501';
  end if;
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select c.id into v_id from public.vehicle_costs c where c.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  select v.business_type into v_bt from public.vehicles v where v.id = (p ->> 'vehicle_id')::uuid;
  if v_bt is null then
    raise exception 'Không tìm thấy xe.' using errcode = '22023';
  end if;
  if v_bt = 'consignment' and nullif(p ->> 'borne_by', '') is null then
    raise exception 'Xe ký gửi: chọn bên chịu chi phí (showroom hoặc chủ xe).' using errcode = '22023';
  end if;
  if v_repl is not null and not exists (
      select 1 from public.vehicle_costs o where o.id = v_repl and o.status = 'void' and o.vehicle_id = (p ->> 'vehicle_id')::uuid) then
    raise exception 'Khoản được thay thế phải là khoản đã hủy của cùng xe.' using errcode = '22023';
  end if;
  insert into public.vehicle_costs (vehicle_id, category, description, vendor, borne_by, estimated_amount, replaces_cost_id, aftersales_case_id, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, p ->> 'category', btrim(coalesce(p ->> 'description', '')), nullif(btrim(p ->> 'vendor'), ''),
          coalesce(nullif(p ->> 'borne_by', ''), 'showroom'), nullif(p ->> 'estimated_amount', '')::numeric, v_repl, nullif(p ->> 'aftersales_case_id', '')::uuid, v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select c.id into v_id from public.vehicle_costs c where c.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

-- Danh sách nhân viên đang hoạt động (kể cả kỹ thuật/kế toán) để quản lý giao phiếu hậu mãi. Chỉ id + họ tên; chỉ quản lý gọi được.
create or replace function public.list_staff()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.profiles p
  where private.is_manager() and p.is_active and exists (select 1 from public.user_roles r where r.user_id = p.id)
  order by p.full_name
$$;
revoke execute on function public.list_staff() from public, anon;
grant execute on function public.list_staff() to authenticated;

revoke execute on function public.create_aftersales_commitment(jsonb) from public, anon;
revoke execute on function public.void_aftersales_commitment(uuid, integer, text) from public, anon;
revoke execute on function public.create_aftersales_case(jsonb) from public, anon;
revoke execute on function public.update_aftersales_case(uuid, integer, jsonb) from public, anon;
revoke execute on function public.add_aftersales_event(jsonb) from public, anon;
revoke execute on function public.resolve_aftersales_case(uuid, integer, text) from public, anon;
revoke execute on function public.reopen_aftersales_case(uuid, integer, jsonb) from public, anon;
revoke execute on function public.cancel_aftersales_case(uuid, integer, text) from public, anon;
grant execute on function public.create_aftersales_commitment(jsonb) to authenticated;
grant execute on function public.void_aftersales_commitment(uuid, integer, text) to authenticated;
grant execute on function public.create_aftersales_case(jsonb) to authenticated;
grant execute on function public.update_aftersales_case(uuid, integer, jsonb) to authenticated;
grant execute on function public.add_aftersales_event(jsonb) to authenticated;
grant execute on function public.resolve_aftersales_case(uuid, integer, text) to authenticated;
grant execute on function public.reopen_aftersales_case(uuid, integer, jsonb) to authenticated;
grant execute on function public.cancel_aftersales_case(uuid, integer, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
