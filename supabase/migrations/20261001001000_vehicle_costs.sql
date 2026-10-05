-- =====================================================================
-- MINH KỲ AUTO — 1000 Chặng 3 (lát 3): chi phí chuẩn bị xe
--
-- Ba thông tin TÁCH BIỆT (CLAUDE.md §4):
--   1. Dự kiến   : vehicle_costs.estimated_amount (dự toán; có thể được quản lý duyệt)
--   2. Đã xác nhận: vehicle_costs.confirmed_amount (số thực tế đã nghiệm thu + người xác nhận) — mới tính vào giá vốn
--   3. Đã thanh toán: vehicle_cost_payments (nhiều lần trả, mỗi lần một dòng; tổng không vượt số đã xác nhận)
-- Không xóa chứng từ: khoản đã xác nhận chỉ được HỦY (đảo) có lý do rồi tạo khoản thay thế; thanh toán sai thì hủy và ghi lại.
-- Thiếu số liệu = "chưa rõ" (null), không bao giờ là 0.
-- Phân quyền: quản lý/admin tạo, sửa dự toán, duyệt, hủy; kế toán tạo khoản, xác nhận số thực tế, ghi thanh toán; sales/kỹ thuật không thấy gì.
-- Xe ký gửi có thể có khoản do chủ xe chịu (borne_by = 'owner'); khoản đó KHÔNG cộng vào vốn của showroom.
-- =====================================================================

create table public.vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  category text not null check (category in ('repair', 'detailing', 'accessories', 'paperwork', 'transport', 'inspection', 'other')),
  description text not null check (length(btrim(description)) > 0),
  vendor text,
  borne_by text not null default 'showroom' check (borne_by in ('showroom', 'owner')),
  status text not null default 'estimated' check (status in ('estimated', 'confirmed', 'void')),

  estimated_amount numeric(18, 0) check (estimated_amount >= 0),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,

  confirmed_amount numeric(18, 0) check (confirmed_amount >= 0),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  accepted_note text,

  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  replaces_cost_id uuid references public.vehicle_costs (id),

  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,

  constraint vehicle_costs_approval_pair check ((approved_by is null) = (approved_at is null)),
  constraint vehicle_costs_confirmed_complete check (status <> 'confirmed' or (confirmed_amount is not null and confirmed_by is not null and confirmed_at is not null)),
  constraint vehicle_costs_estimated_clean check (status <> 'estimated' or (confirmed_amount is null and confirmed_by is null and confirmed_at is null)),
  constraint vehicle_costs_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null)),
  constraint vehicle_costs_no_self_replace check (replaces_cost_id is null or replaces_cost_id <> id)
);
create index vehicle_costs_vehicle_idx on public.vehicle_costs (vehicle_id, created_at);
create index vehicle_costs_open_idx on public.vehicle_costs (vehicle_id) where status = 'estimated';

create table public.vehicle_cost_payments (
  id uuid primary key default gen_random_uuid(),
  cost_id uuid not null references public.vehicle_costs (id),
  amount numeric(18, 0) not null check (amount > 0),
  paid_at date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  method text not null default 'cash' check (method in ('cash', 'transfer', 'other')),
  reference text,
  note text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  paid_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid unique,
  constraint cost_payments_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);
create index cost_payments_cost_idx on public.vehicle_cost_payments (cost_id) where status = 'posted';

create trigger vehicle_costs_touch before update on public.vehicle_costs for each row execute function private.touch_row();
create trigger vehicle_costs_audit after insert or update on public.vehicle_costs for each row execute function private.audit_row();
create trigger cost_payments_audit after insert or update on public.vehicle_cost_payments for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database (không phụ thuộc giao diện)
-- ---------------------------------------------------------------------
create or replace function private.vehicle_costs_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_type text;
begin
  if tg_op = 'INSERT' then
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Anh/chị không có quyền ghi chi phí xe.' using errcode = '42501';
    end if;
    select v.business_type into v_type from public.vehicles v where v.id = new.vehicle_id;
    if v_type = 'owned' and new.borne_by <> 'showroom' then
      raise exception 'Xe showroom sở hữu: chi phí do showroom chịu.' using errcode = '22023';
    end if;
    if new.status <> 'estimated' or new.approved_at is not null then
      raise exception 'Khoản chi phí mới phải ở trạng thái dự kiến, chưa duyệt.' using errcode = '22023';
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;   -- không giả mạo người tạo
    return new;
  end if;

  if new.vehicle_id <> old.vehicle_id then
    raise exception 'Không đổi được xe của khoản chi phí.' using errcode = '22023';
  end if;
  if old.status = 'void' then
    raise exception 'Khoản chi phí đã hủy, không sửa. Tạo khoản mới nếu cần.' using errcode = '22023';
  end if;

  if new.status = 'void' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy khoản chi phí.' using errcode = '42501';
    end if;
    if exists (select 1 from public.vehicle_cost_payments p where p.cost_id = old.id and p.status = 'posted') then
      raise exception 'Khoản này đã có thanh toán. Hãy hủy các thanh toán trước.' using errcode = '22023';
    end if;
    if not private.is_system() then new.voided_by := (select auth.uid()); new.voided_at := now(); end if;
    return new;
  end if;

  if old.status = 'confirmed' then
    raise exception 'Chi phí đã xác nhận không sửa trực tiếp. Hãy hủy khoản này (đảo) rồi tạo khoản thay thế.' using errcode = '22023';
  end if;

  -- old.status = 'estimated'
  if new.status = 'confirmed' then
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Anh/chị không có quyền xác nhận chi phí.' using errcode = '42501';
    end if;
    if new.category is distinct from old.category or new.description is distinct from old.description or new.vendor is distinct from old.vendor
       or new.borne_by is distinct from old.borne_by or new.estimated_amount is distinct from old.estimated_amount
       or new.approved_at is distinct from old.approved_at then
      raise exception 'Không sửa dự toán khi xác nhận chi phí thực tế.' using errcode = '22023';
    end if;
    if not private.is_system() then new.confirmed_by := (select auth.uid()); new.confirmed_at := now(); end if;
    return new;
  end if;

  if new.category is distinct from old.category or new.description is distinct from old.description or new.vendor is distinct from old.vendor
     or new.borne_by is distinct from old.borne_by or new.estimated_amount is distinct from old.estimated_amount then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được sửa dự toán.' using errcode = '42501';
    end if;
    if new.borne_by <> 'showroom' and (select v.business_type from public.vehicles v where v.id = new.vehicle_id) = 'owned' then
      raise exception 'Xe showroom sở hữu: chi phí do showroom chịu.' using errcode = '22023';
    end if;
    if new.estimated_amount is distinct from old.estimated_amount then
      new.approved_by := null; new.approved_at := null;   -- đổi số tiền dự toán thì phải duyệt lại
    end if;
  end if;
  if new.approved_at is distinct from old.approved_at then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được duyệt dự toán.' using errcode = '42501';
    end if;
    if new.approved_at is not null and new.estimated_amount is null then
      raise exception 'Chưa có dự toán để duyệt.' using errcode = '22023';
    end if;
    if new.approved_at is not null and not private.is_system() then new.approved_by := (select auth.uid()); new.approved_at := now(); end if;
  end if;
  return new;
end $$;
create trigger vehicle_costs_guard before insert or update on public.vehicle_costs for each row execute function private.vehicle_costs_guard();

create or replace function private.cost_payments_guard()
returns trigger language plpgsql set search_path = '' as $$
declare c public.vehicle_costs; v_paid numeric;
begin
  if tg_op = 'INSERT' then
    select * into c from public.vehicle_costs x where x.id = new.cost_id for update;   -- khóa dòng: hai lần ghi song song không cùng vượt hạn mức
    if c.id is null then
      raise exception 'Không tìm thấy khoản chi phí.' using errcode = '22023';
    end if;
    if c.status <> 'confirmed' then
      raise exception 'Chỉ ghi thanh toán cho khoản chi phí đã xác nhận.' using errcode = '22023';
    end if;
    if new.status <> 'posted' then
      raise exception 'Thanh toán mới phải ở trạng thái đã ghi.' using errcode = '22023';
    end if;
    select coalesce(sum(p.amount), 0) into v_paid from public.vehicle_cost_payments p where p.cost_id = new.cost_id and p.status = 'posted';
    if v_paid + new.amount > c.confirmed_amount then
      raise exception 'Tổng thanh toán (%) sẽ vượt chi phí đã xác nhận (%).', (v_paid + new.amount)::bigint, c.confirmed_amount::bigint using errcode = '22023';
    end if;
    if not private.is_system() then new.paid_by := (select auth.uid()); end if;   -- không giả mạo người chi
    return new;
  end if;
  if old.status = 'void' then
    raise exception 'Thanh toán đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status <> 'void' or new.amount is distinct from old.amount or new.cost_id is distinct from old.cost_id
     or new.paid_at is distinct from old.paid_at or new.method is distinct from old.method then
    raise exception 'Thanh toán không sửa trực tiếp. Hãy hủy (đảo) rồi ghi lại.' using errcode = '22023';
  end if;
  if not private.is_system() then new.voided_by := (select auth.uid()); new.voided_at := now(); end if;
  return new;
end $$;
create trigger cost_payments_guard before insert or update on public.vehicle_cost_payments for each row execute function private.cost_payments_guard();

-- ---------------------------------------------------------------------
-- RLS: chỉ vai trò tài chính; không ai xóa được (revoke delete).
-- ---------------------------------------------------------------------
alter table public.vehicle_costs enable row level security;
alter table public.vehicle_cost_payments enable row level security;
create policy vehicle_costs_select on public.vehicle_costs for select to authenticated using (private.can_see_finance());
create policy vehicle_costs_insert on public.vehicle_costs for insert to authenticated with check (private.can_see_finance());
create policy vehicle_costs_update on public.vehicle_costs for update to authenticated using (private.can_see_finance()) with check (private.can_see_finance());
create policy cost_payments_select on public.vehicle_cost_payments for select to authenticated using (private.can_see_finance());
create policy cost_payments_insert on public.vehicle_cost_payments for insert to authenticated with check (private.can_see_finance());
create policy cost_payments_update on public.vehicle_cost_payments for update to authenticated using (private.can_see_finance()) with check (private.can_see_finance());
revoke delete, truncate on public.vehicle_costs, public.vehicle_cost_payments from authenticated, anon;

-- ---------------------------------------------------------------------
-- Tổng hợp theo xe: dự kiến / đã xác nhận / đã trả luôn là ba cột khác nhau; showroom và chủ xe tách riêng.
-- sum() không có dòng nào = null ("chưa có"), không phải 0.
-- ---------------------------------------------------------------------
create or replace view public.vehicle_cost_summary with (security_invoker = true) as
select
  c.vehicle_id,
  count(*) filter (where c.status <> 'void') as line_count,
  count(*) filter (where c.status = 'estimated') as open_lines,
  count(*) filter (where c.status = 'estimated' and c.estimated_amount is null) as open_lines_no_estimate,
  sum(c.estimated_amount) filter (where c.status = 'estimated' and c.borne_by = 'showroom') as estimated_showroom,
  sum(c.estimated_amount) filter (where c.status = 'estimated' and c.borne_by = 'owner') as estimated_owner,
  sum(c.confirmed_amount) filter (where c.status = 'confirmed' and c.borne_by = 'showroom') as confirmed_showroom,
  sum(c.confirmed_amount) filter (where c.status = 'confirmed' and c.borne_by = 'owner') as confirmed_owner,
  sum(pp.paid) filter (where c.status = 'confirmed' and c.borne_by = 'showroom') as paid_showroom,
  sum(pp.paid) filter (where c.status = 'confirmed' and c.borne_by = 'owner') as paid_owner
from public.vehicle_costs c
left join lateral (select sum(p.amount) as paid from public.vehicle_cost_payments p where p.cost_id = c.id and p.status = 'posted') pp on true
group by c.vehicle_id;
revoke all on public.vehicle_cost_summary from anon;
grant select on public.vehicle_cost_summary to authenticated;

-- ---------------------------------------------------------------------
-- RPC (security invoker: RLS + trigger vẫn áp dụng). Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
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
  insert into public.vehicle_costs (vehicle_id, category, description, vendor, borne_by, estimated_amount, replaces_cost_id, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, p ->> 'category', btrim(coalesce(p ->> 'description', '')), nullif(btrim(p ->> 'vendor'), ''),
          coalesce(nullif(p ->> 'borne_by', ''), 'showroom'), nullif(p ->> 'estimated_amount', '')::numeric, v_repl, v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select c.id into v_id from public.vehicle_costs c where c.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.update_vehicle_cost(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.vehicle_costs c set
    category = coalesce(nullif(p ->> 'category', ''), c.category),
    description = case when p ? 'description' then btrim(p ->> 'description') else c.description end,
    vendor = case when p ? 'vendor' then nullif(btrim(p ->> 'vendor'), '') else c.vendor end,
    borne_by = coalesce(nullif(p ->> 'borne_by', ''), c.borne_by),
    estimated_amount = case when p ? 'estimated_amount' then nullif(p ->> 'estimated_amount', '')::numeric else c.estimated_amount end
  where c.id = p_id and c.version = p_version
  returning c.version into v_ver;
  if v_ver is null then
    if exists (select 1 from public.vehicle_costs c where c.id = p_id) then
      raise exception 'Khoản chi phí vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất.' using errcode = '40001';
    end if;
    raise exception 'Không tìm thấy khoản chi phí hoặc anh/chị không có quyền.' using errcode = '42501';
  end if;
  return v_ver;
end $$;

create or replace function public.approve_vehicle_cost(p_id uuid, p_version integer, p_approve boolean default true)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.vehicle_costs c set
    approved_by = case when p_approve then (select auth.uid()) end,
    approved_at = case when p_approve then now() end
  where c.id = p_id and c.version = p_version
  returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Khoản chi phí vừa được người khác cập nhật hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.confirm_vehicle_cost(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer; v_amount numeric := nullif(p ->> 'confirmed_amount', '')::numeric;
begin
  if v_amount is null then
    raise exception 'Nhập số tiền thực tế để xác nhận chi phí.' using errcode = '22023';
  end if;
  update public.vehicle_costs c set
    status = 'confirmed', confirmed_amount = v_amount, confirmed_by = (select auth.uid()), confirmed_at = now(),
    accepted_note = nullif(btrim(p ->> 'accepted_note'), '')
  where c.id = p_id and c.version = p_version
  returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Khoản chi phí vừa được người khác cập nhật hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.void_vehicle_cost(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy khoản chi phí.' using errcode = '22023';
  end if;
  update public.vehicle_costs c set status = 'void', void_reason = btrim(p_reason), voided_by = (select auth.uid()), voided_at = now()
  where c.id = p_id and c.version = p_version
  returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Khoản chi phí vừa được người khác cập nhật hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.record_cost_payment(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select x.id into v_id from public.vehicle_cost_payments x where x.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.vehicle_cost_payments (cost_id, amount, paid_at, method, reference, note, client_request_id)
  values ((p ->> 'cost_id')::uuid, (p ->> 'amount')::numeric,
          coalesce(nullif(p ->> 'paid_at', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
          coalesce(nullif(p ->> 'method', ''), 'cash'), nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select x.id into v_id from public.vehicle_cost_payments x where x.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.void_cost_payment(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy thanh toán.' using errcode = '22023';
  end if;
  update public.vehicle_cost_payments x set status = 'void', void_reason = btrim(p_reason), voided_by = (select auth.uid()), voided_at = now()
  where x.id = p_id and x.status = 'posted';
  if not found then
    raise exception 'Không tìm thấy thanh toán đang hiệu lực hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
end $$;

revoke execute on function public.create_vehicle_cost(jsonb) from public, anon;
revoke execute on function public.update_vehicle_cost(uuid, integer, jsonb) from public, anon;
revoke execute on function public.approve_vehicle_cost(uuid, integer, boolean) from public, anon;
revoke execute on function public.confirm_vehicle_cost(uuid, integer, jsonb) from public, anon;
revoke execute on function public.void_vehicle_cost(uuid, integer, text) from public, anon;
revoke execute on function public.record_cost_payment(jsonb) from public, anon;
revoke execute on function public.void_cost_payment(uuid, text) from public, anon;
grant execute on function public.create_vehicle_cost(jsonb) to authenticated;
grant execute on function public.update_vehicle_cost(uuid, integer, jsonb) to authenticated;
grant execute on function public.approve_vehicle_cost(uuid, integer, boolean) to authenticated;
grant execute on function public.confirm_vehicle_cost(uuid, integer, jsonb) to authenticated;
grant execute on function public.void_vehicle_cost(uuid, integer, text) to authenticated;
grant execute on function public.record_cost_payment(jsonb) to authenticated;
grant execute on function public.void_cost_payment(uuid, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
