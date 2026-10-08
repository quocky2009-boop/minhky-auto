-- =====================================================================
-- MINH KỲ AUTO — 2400 Chặng 6 (lát 10): hoa hồng nhân viên bán hàng
--
-- CHÍNH SÁCH DO CHỦ TỊCH CHỐT (08/10/2026): hoa hồng tính THEO TỪNG ĐẦU XE, bằng SỐ TIỀN quy định:
--   * XE MỚI: theo HÃNG XE và MODEL XE (quy tắc riêng cho model; có thể đặt một mức chung cho cả hãng khi không có quy tắc riêng của model).
--   * XE CŨ: theo CHÍNH XÁC XE, tức số VIN.
-- Phần mềm KHÔNG tự đặt mức: chỉ có quy tắc quản lý đã nhập. Xe chưa có quy tắc → "chưa có quy tắc" (không phải 0).
--  * commission_rules (QH#####): quy tắc số tiền, có ngày hiệu lực; KHÔNG sửa — đổi mức = thêm quy tắc mới có ngày hiệu lực mới (hoặc hủy có lý do). Quản lý ghi.
--    Áp dụng theo ngày ký hợp đồng bán: lấy quy tắc hiệu lực mới nhất có ngày hiệu lực ≤ ngày ký.
--  * commission_entries (HH#####): một khoản hoa hồng cho MỖI dòng xe của đơn bán khi đơn được XÁC NHẬN (ký hợp đồng), cho nhân viên phụ trách đơn.
--    Ảnh chụp quy tắc đã áp. Trạng thái: chưa có quy tắc → đã tính → đã duyệt (quản lý) ; hủy có lý do. Duyệt rồi không đổi số tiền.
--    Đơn bán bị hủy → khoản hoa hồng chưa chi bị hủy theo; đã chi thì phải hủy khoản chi trước.
--  * commission_payments: chi hoa hồng (kế toán/quản lý), nhiều lần, tổng không vượt khoản đã duyệt; gắn tài khoản tiền (vào sổ quỹ như D88): chi chỉ khi đủ tiền,
--    không chi cho khoản chưa duyệt; hủy có lý do (quản lý). KHÔNG tự đặt điều kiện thời điểm trả (chưa có chính sách): quản lý quyết định khi duyệt.
--  * Báo cáo: hoa hồng ĐÃ DUYỆT tính vào kết quả toàn showroom (theo ngày ký hợp đồng của xe trong kỳ); chưa duyệt / chưa có quy tắc được cảnh báo.
--    Hoa hồng KHÔNG trừ trước khi chia lợi nhuận góp vốn (D39). Chưa tính thuế thu nhập cá nhân.
--  * Quyền: quản lý ghi/hủy quy tắc, duyệt, tính lại, hủy khoản; kế toán + quản lý đọc tất cả và chi; sales chỉ đọc hoa hồng CỦA MÌNH.
-- =====================================================================

create sequence public.commission_rule_code_seq;
create sequence public.commission_entry_code_seq;

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('QH' || lpad(nextval('public.commission_rule_code_seq')::text, 5, '0')),
  scope text not null check (scope in ('model', 'vin')),
  make_id uuid references public.vehicle_makes (id),
  model_id uuid references public.vehicle_models (id),
  vin text,
  amount numeric(18, 0) not null check (amount >= 0),
  effective_from date not null,
  note text,
  status text not null default 'active' check (status in ('active', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint commission_rules_shape check (
    (scope = 'model' and make_id is not null and vin is null) or (scope = 'vin' and vin is not null and make_id is null and model_id is null)),
  constraint commission_rules_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_at is not null))
);
create unique index commission_rules_model_key on public.commission_rules (make_id, coalesce(model_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from)
  where scope = 'model' and status = 'active';
create unique index commission_rules_vin_key on public.commission_rules (upper(vin), effective_from) where scope = 'vin' and status = 'active';

create table public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('HH' || lpad(nextval('public.commission_entry_code_seq')::text, 5, '0')),
  order_line_id uuid not null unique references public.sales_order_lines (id),
  order_id uuid not null references public.sales_orders (id),
  vehicle_id uuid not null references public.vehicles (id),
  employee_id uuid not null references public.profiles (id),            -- nhân viên phụ trách đơn bán
  sold_on date not null,                                                 -- ngày ký hợp đồng bán
  rule_id uuid references public.commission_rules (id),
  rule_snapshot jsonb,
  amount numeric(18, 0) check (amount >= 0),
  status text not null default 'no_rule' check (status in ('no_rule', 'accrued', 'approved', 'cancelled')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  end_reason text,
  ended_by uuid references public.profiles (id),
  ended_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint commission_entries_rule_shape check (
    status = 'cancelled' or (status = 'no_rule' and amount is null and rule_id is null) or (status in ('accrued', 'approved') and amount is not null and rule_id is not null)),
  constraint commission_entries_approved_complete check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint commission_entries_cancel_complete check (status <> 'cancelled' or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null))
);
create index commission_entries_employee_idx on public.commission_entries (employee_id, sold_on desc);
create index commission_entries_order_idx on public.commission_entries (order_id);

create table public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.commission_entries (id),
  amount numeric(18, 0) not null check (amount > 0),
  paid_on date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  account_id uuid not null references public.money_accounts (id),
  reference text,
  note text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid unique,
  constraint commission_payments_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);
create index commission_payments_entry_idx on public.commission_payments (entry_id) where status = 'posted';
create index commission_payments_account_idx on public.commission_payments (account_id) where status = 'posted';

create trigger commission_rules_touch before update on public.commission_rules for each row execute function private.touch_row();
create trigger commission_rules_audit after insert or update on public.commission_rules for each row execute function private.audit_row();
create trigger commission_entries_touch before update on public.commission_entries for each row execute function private.touch_row();
create trigger commission_entries_audit after insert or update on public.commission_entries for each row execute function private.audit_row();
create trigger commission_payments_audit after insert or update on public.commission_payments for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Tìm quy tắc áp dụng cho một xe tại một ngày. SECURITY DEFINER hẹp: chỉ trả id + số tiền + mô tả quy tắc.
-- Xe mới: quy tắc model (hãng + model) trước, rồi quy tắc cả hãng; xe cũ: quy tắc đúng số VIN. Trong cùng một khóa lấy ngày hiệu lực mới nhất ≤ ngày bán.
-- ---------------------------------------------------------------------
create or replace function private.commission_match(p_vehicle uuid, p_on date)
returns table (rule_id uuid, amount numeric, snapshot jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare v public.vehicles; r public.commission_rules;
begin
  select * into v from public.vehicles x where x.id = p_vehicle;
  if v.id is null then return; end if;
  if v.condition = 'new' then
    if v.model_id is not null then
      select * into r from public.commission_rules x where x.scope = 'model' and x.status = 'active' and x.make_id = v.make_id and x.model_id = v.model_id and x.effective_from <= p_on
        order by x.effective_from desc limit 1;
    end if;
    if r.id is null then
      select * into r from public.commission_rules x where x.scope = 'model' and x.status = 'active' and x.make_id = v.make_id and x.model_id is null and x.effective_from <= p_on
        order by x.effective_from desc limit 1;
    end if;
  else
    if v.vin is not null then
      select * into r from public.commission_rules x where x.scope = 'vin' and x.status = 'active' and upper(x.vin) = upper(btrim(v.vin)) and x.effective_from <= p_on
        order by x.effective_from desc limit 1;
    end if;
  end if;
  if r.id is null then return; end if;
  rule_id := r.id; amount := r.amount;
  snapshot := jsonb_build_object('code', r.code, 'scope', r.scope, 'make_id', r.make_id, 'model_id', r.model_id, 'vin', r.vin, 'amount', r.amount::text, 'effective_from', r.effective_from);
  return next;
end $$;

-- Tổng đã chi của một khoản hoa hồng (chỉ trả số).
create or replace function private.commission_paid(p_entry uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.amount), 0) from public.commission_payments p where p.entry_id = p_entry and p.status = 'posted'
$$;

-- Khóa và đọc trạng thái + số tiền của một khoản hoa hồng khi ghi chi (kế toán chỉ có quyền đọc bảng nên không tự khóa dòng được). Chỉ trả trạng thái và số tiền.
create or replace function private.commission_lock_entry(p_entry uuid)
returns table (status text, amount numeric)
language sql volatile security definer set search_path = '' as $$
  select e.status, e.amount from public.commission_entries e where e.id = p_entry for update
$$;

-- Số dư tài khoản: thêm chi hoa hồng (cùng cách với D88).
create or replace function private.account_flow(p_account uuid, p_dir text)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(v.amount) from public.cash_vouchers v where v.account_id = p_account and v.status = 'posted' and v.direction = p_dir), 0)
    + case when p_dir = 'in' then
        coalesce((select sum(e.amount) from public.vehicle_capital_entries e where e.account_id = p_account and e.status = 'posted' and e.entry_type = 'receipt'), 0)
      + coalesce((select sum(l.principal) from public.vehicle_loans l where l.account_id = p_account and l.status = 'active'), 0)
      else
        coalesce((select sum(e.amount) from public.vehicle_capital_entries e where e.account_id = p_account and e.status = 'posted' and e.entry_type = 'withdrawal'), 0)
      + coalesce((select sum(x.amount) from public.vehicle_loan_payments x where x.account_id = p_account and x.status = 'posted'), 0)
      + coalesce((select sum(x.amount) from public.vehicle_cost_payments x where x.account_id = p_account and x.status = 'posted'), 0)
      + coalesce((select sum(x.amount) from public.commission_payments x where x.account_id = p_account and x.status = 'posted'), 0)
      end
$$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.commission_rules_guard()
returns trigger language plpgsql set search_path = '' as $$
declare mk uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa quy tắc hoa hồng. Hủy (có lý do).' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được ghi quy tắc hoa hồng.' using errcode = '42501';
    end if;
    if new.status <> 'active' then
      raise exception 'Quy tắc mới phải ở trạng thái hiệu lực.' using errcode = '22023';
    end if;
    if new.scope = 'model' then
      if new.model_id is not null then
        select m.make_id into mk from public.vehicle_models m where m.id = new.model_id;
        if mk is distinct from new.make_id then
          raise exception 'Model không thuộc hãng đã chọn.' using errcode = '22023';
        end if;
      end if;
    else
      new.vin := upper(btrim(new.vin));
      if length(new.vin) < 5 then
        raise exception 'Số VIN không hợp lệ.' using errcode = '22023';
      end if;
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;
  if (new.code, new.scope, new.make_id, new.model_id, new.vin, new.amount, new.effective_from, new.note, new.created_by, new.created_at)
     is distinct from (old.code, old.scope, old.make_id, old.model_id, old.vin, old.amount, old.effective_from, old.note, old.created_by, old.created_at) then
    raise exception 'Không sửa quy tắc hoa hồng. Thêm quy tắc mới (ngày hiệu lực mới) hoặc hủy có lý do.' using errcode = '22023';
  end if;
  if old.status = 'void' then
    raise exception 'Quy tắc đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status = 'void' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy quy tắc hoa hồng.' using errcode = '42501';
    end if;
    if length(btrim(coalesce(new.void_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy quy tắc hoa hồng.' using errcode = '22023';
    end if;
    if not private.is_system() then new.voided_by := (select auth.uid()); end if;
    new.voided_at := now();
  end if;
  return new;
end $$;
create trigger commission_rules_guard before insert or update or delete on public.commission_rules for each row execute function private.commission_rules_guard();

-- Khoản hoa hồng do trigger của đơn bán tạo (định danh nội bộ); người dùng không có quyền INSERT. Chuyển trạng thái qua RPC.
create or replace function private.commission_entries_guard()
returns trigger language plpgsql set search_path = '' as $$
declare auto boolean := coalesce(current_setting('app.commission_auto', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa khoản hoa hồng. Hủy (có lý do).' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if (new.code, new.order_line_id, new.order_id, new.vehicle_id, new.employee_id, new.sold_on, new.created_at)
     is distinct from (old.code, old.order_line_id, old.order_id, old.vehicle_id, old.employee_id, old.sold_on, old.created_at) then
    raise exception 'Không sửa thông tin gốc của khoản hoa hồng.' using errcode = '22023';
  end if;
  if old.status = 'cancelled' then
    raise exception 'Khoản hoa hồng đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status = 'cancelled' then
    if not (auto or private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy khoản hoa hồng.' using errcode = '42501';
    end if;
    if length(btrim(coalesce(new.end_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy khoản hoa hồng.' using errcode = '22023';
    end if;
    if private.commission_paid(old.id) > 0 then
      raise exception 'Khoản hoa hồng đã có chi trả. Hủy các khoản chi (quản lý) trước.' using errcode = '22023';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được tính lại/duyệt hoa hồng.' using errcode = '42501';
  end if;
  if old.status = 'approved' then
    if (new.rule_id, new.rule_snapshot, new.amount, new.status) is distinct from (old.rule_id, old.rule_snapshot, old.amount, old.status) then
      raise exception 'Khoản hoa hồng đã duyệt, không đổi số tiền. Hủy khoản (nếu chưa chi) rồi xử lý lại.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.status = 'approved' then
    if old.status <> 'accrued' or new.amount is distinct from old.amount or new.rule_id is distinct from old.rule_id then
      raise exception 'Chỉ duyệt khoản hoa hồng đã tính theo quy tắc (không đổi số tiền khi duyệt).' using errcode = '22023';
    end if;
    if not private.is_system() then new.approved_by := (select auth.uid()); end if;
    new.approved_at := now();
    return new;
  end if;
  return new;                                                                 -- tính lại: no_rule / accrued → no_rule / accrued
end $$;
create trigger commission_entries_guard before insert or update or delete on public.commission_entries for each row execute function private.commission_entries_guard();

create or replace function private.commission_payments_guard()
returns trigger language plpgsql set search_path = '' as $$
declare e record; v_paid numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa khoản chi hoa hồng. Hủy (có lý do).' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Chỉ kế toán hoặc quản lý được chi hoa hồng.' using errcode = '42501';
    end if;
    if new.status <> 'posted' then
      raise exception 'Khoản chi mới phải ở trạng thái đã ghi.' using errcode = '22023';
    end if;
    select * into e from private.commission_lock_entry(new.entry_id);
    if e.status is null then
      raise exception 'Không tìm thấy khoản hoa hồng.' using errcode = '22023';
    end if;
    if e.status <> 'approved' then
      raise exception 'Chỉ chi hoa hồng cho khoản đã được quản lý duyệt.' using errcode = '22023';
    end if;
    select coalesce(sum(p.amount), 0) into v_paid from public.commission_payments p where p.entry_id = new.entry_id and p.status = 'posted';
    if v_paid + new.amount > e.amount then
      raise exception 'Tổng chi (%) sẽ vượt khoản hoa hồng đã duyệt (%).', (v_paid + new.amount)::bigint, e.amount::bigint using errcode = '22023';
    end if;
    perform private.cash_link_in(new.account_id, false, 'out', new.amount, new.paid_on);     -- tài khoản hoạt động, ngày hợp lệ, đủ tiền thực có
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;
  if (new.entry_id, new.amount, new.paid_on, new.account_id, new.reference, new.note, new.created_by, new.created_at)
     is distinct from (old.entry_id, old.amount, old.paid_on, old.account_id, old.reference, old.note, old.created_by, old.created_at) then
    raise exception 'Không sửa khoản chi hoa hồng. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status = 'void' then
    raise exception 'Khoản chi đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status = 'void' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy khoản chi hoa hồng.' using errcode = '42501';
    end if;
    if length(btrim(coalesce(new.void_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy khoản chi hoa hồng.' using errcode = '22023';
    end if;
    if not private.is_system() then new.voided_by := (select auth.uid()); end if;
    new.voided_at := now();
  end if;
  return new;
end $$;
create trigger commission_payments_guard before insert or update or delete on public.commission_payments for each row execute function private.commission_payments_guard();

-- Đơn bán được ký → tạo khoản hoa hồng cho từng dòng xe; đơn bị hủy → hủy các khoản chưa chi. SECURITY DEFINER hẹp (đọc xe và quy tắc mà sales không đọc được).
create or replace function private.commission_on_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare l record; m record; v_on date;
begin
  if tg_op <> 'UPDATE' or new.status = old.status then return new; end if;
  perform set_config('app.commission_auto', '1', true);
  if new.status = 'confirmed' and old.status = 'draft' then
    v_on := coalesce(new.contract_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
    for l in select x.id, x.vehicle_id from public.sales_order_lines x where x.order_id = new.id and x.line_status = 'active' loop
      select * into m from private.commission_match(l.vehicle_id, v_on);
      insert into public.commission_entries (order_line_id, order_id, vehicle_id, employee_id, sold_on, rule_id, rule_snapshot, amount, status)
      values (l.id, new.id, l.vehicle_id, new.owner_id, v_on, m.rule_id, m.snapshot, m.amount, case when m.rule_id is null then 'no_rule' else 'accrued' end)
      on conflict (order_line_id) do nothing;
    end loop;
  elsif new.status = 'cancelled' and old.status = 'confirmed' then
    if exists (select 1 from public.commission_entries e where e.order_id = new.id and e.status <> 'cancelled' and private.commission_paid(e.id) > 0) then
      raise exception 'Đơn bán có hoa hồng đã chi. Hủy khoản chi hoa hồng (quản lý) trước khi hủy đơn.' using errcode = '22023';
    end if;
    update public.commission_entries e set status = 'cancelled', end_reason = 'Đơn bán bị hủy' where e.order_id = new.id and e.status <> 'cancelled';
  end if;
  perform set_config('app.commission_auto', '', true);
  return new;
end $$;
create trigger sales_orders_zcommission after update on public.sales_orders for each row execute function private.commission_on_order();

-- ---------------------------------------------------------------------
-- RLS: quản lý + tài chính đọc tất cả; sales chỉ hoa hồng của mình. Người dùng không INSERT khoản hoa hồng.
-- ---------------------------------------------------------------------
alter table public.commission_rules enable row level security;
alter table public.commission_entries enable row level security;
alter table public.commission_payments enable row level security;
create policy commission_rules_select on public.commission_rules for select to authenticated using (private.is_manager() or private.can_see_finance());
create policy commission_rules_insert on public.commission_rules for insert to authenticated with check (private.is_manager());
create policy commission_rules_update on public.commission_rules for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy commission_entries_select on public.commission_entries for select to authenticated using (
  private.is_manager() or private.can_see_finance() or employee_id = (select auth.uid()));
create policy commission_entries_update on public.commission_entries for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy commission_payments_select on public.commission_payments for select to authenticated using (exists (select 1 from public.commission_entries e where e.id = entry_id));
create policy commission_payments_insert on public.commission_payments for insert to authenticated with check (private.can_see_finance());
create policy commission_payments_update on public.commission_payments for update to authenticated using (private.is_manager()) with check (private.is_manager());
revoke insert, delete, truncate on public.commission_entries from authenticated, anon;
revoke delete, truncate on public.commission_rules, public.commission_payments from authenticated, anon;
revoke all on public.commission_rules, public.commission_entries, public.commission_payments from anon;

-- Số dư hoa hồng: đã duyệt, đã chi, còn lại (sales xem được của mình qua RLS bảng gốc).
create view public.commission_balances with (security_invoker = true) as
select e.id as entry_id, e.code, e.employee_id, e.status, e.amount,
       coalesce(sum(p.amount) filter (where p.status = 'posted'), 0) as paid,
       case when e.status = 'approved' then e.amount - coalesce(sum(p.amount) filter (where p.status = 'posted'), 0) end as remaining
from public.commission_entries e left join public.commission_payments p on p.entry_id = e.id
group by e.id;
revoke all on public.commission_balances from anon;
grant select on public.commission_balances to authenticated;

-- ---------------------------------------------------------------------
-- RPC (security invoker). Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_commission_rule(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select r.id into v_id from public.commission_rules r where r.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.commission_rules (scope, make_id, model_id, vin, amount, effective_from, note, client_request_id)
  values (p ->> 'scope', nullif(p ->> 'make_id', '')::uuid, nullif(p ->> 'model_id', '')::uuid, nullif(btrim(p ->> 'vin'), ''), (p ->> 'amount')::numeric,
          (p ->> 'effective_from')::date, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select r.id into v_id from public.commission_rules r where r.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Đã có quy tắc hiệu lực cùng đối tượng và cùng ngày hiệu lực. Chọn ngày hiệu lực khác hoặc hủy quy tắc cũ.' using errcode = '22023';
end $$;

create or replace function public.void_commission_rule(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.commission_rules r set status = 'void', void_reason = btrim(coalesce(p_reason, '')) where r.id = p_id and r.version = p_version and r.status = 'active' returning r.version into v_ver;
  if v_ver is null then
    raise exception 'Quy tắc vừa được cập nhật, đã hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

-- Tính lại theo quy tắc hiện hành tại ngày ký hợp đồng (chỉ khoản chưa duyệt).
create or replace function public.recalc_commission(p_id uuid, p_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare e public.commission_entries; m record; v_ver integer;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được tính lại hoa hồng.' using errcode = '42501';
  end if;
  select * into e from public.commission_entries x where x.id = p_id and x.version = p_version and x.status in ('no_rule', 'accrued');
  if e.id is null then
    raise exception 'Khoản hoa hồng vừa được cập nhật, đã duyệt/hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  select * into m from private.commission_match(e.vehicle_id, e.sold_on);
  update public.commission_entries x set rule_id = m.rule_id, rule_snapshot = m.snapshot, amount = m.amount, status = case when m.rule_id is null then 'no_rule' else 'accrued' end
  where x.id = p_id returning x.version into v_ver;
  return v_ver;
end $$;

create or replace function public.approve_commission(p_id uuid, p_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.commission_entries e set status = 'approved' where e.id = p_id and e.version = p_version and e.status = 'accrued' returning e.version into v_ver;
  if v_ver is null then
    raise exception 'Khoản hoa hồng vừa được cập nhật, chưa tính theo quy tắc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.cancel_commission(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.commission_entries e set status = 'cancelled', end_reason = btrim(coalesce(p_reason, '')) where e.id = p_id and e.version = p_version and e.status <> 'cancelled' returning e.version into v_ver;
  if v_ver is null then
    raise exception 'Khoản hoa hồng vừa được cập nhật, đã hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.record_commission_payment(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select x.id into v_id from public.commission_payments x where x.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.commission_payments (entry_id, amount, paid_on, account_id, reference, note, client_request_id)
  values ((p ->> 'entry_id')::uuid, (p ->> 'amount')::numeric, coalesce(nullif(p ->> 'paid_on', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
          nullif(p ->> 'account_id', '')::uuid, nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select x.id into v_id from public.commission_payments x where x.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.void_commission_payment(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.commission_payments x set status = 'void', void_reason = btrim(coalesce(p_reason, '')) where x.id = p_id and x.status = 'posted';
  if not found then
    raise exception 'Không tìm thấy khoản chi đang hiệu lực hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
end $$;

-- Báo cáo kết quả theo kỳ: thêm hoa hồng đã duyệt (theo ngày ký hợp đồng trong kỳ) vào kết quả toàn showroom; đếm khoản chưa duyệt / chưa có quy tắc.
create or replace function public.report_results_totals(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with r as (select * from public.report_vehicle_results where sold_on between p_from and p_to),
  g as (select
      coalesce(sum(v.amount) filter (where v.purpose = 'general_expense'), 0) as general_expense,
      coalesce(sum(v.amount) filter (where v.purpose = 'other_expense'), 0) as other_expense,
      coalesce(sum(v.amount) filter (where v.purpose = 'other_income'), 0) as other_income
    from public.cash_vouchers v where v.status = 'posted' and v.occurred_on between p_from and p_to
      and v.purpose in ('general_expense', 'other_expense', 'other_income')),
  a as (select coalesce(sum(c.confirmed_amount), 0) as aftersales_cost from public.vehicle_costs c
        where c.category = 'after_sales' and c.status = 'confirmed' and (c.confirmed_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to),
  h as (select
      coalesce(sum(e.amount) filter (where e.status = 'approved'), 0) as approved,
      count(*) filter (where e.status = 'accrued') as pending,
      count(*) filter (where e.status = 'no_rule') as no_rule
    from public.commission_entries e where e.sold_on between p_from and p_to)
  select case when not private.can_see_finance() then '{}'::jsonb else jsonb_build_object(
    'lines', (select count(*) from r),
    'owned_lines', (select count(*) from r where business_type = 'owned'),
    'consignment_lines', (select count(*) from r where business_type = 'consignment'),
    'sale_total_owned', (select coalesce(sum(sale_price), 0)::text from r where business_type = 'owned'),
    'gross_profit', (select coalesce(sum(gross_profit), 0)::text from r where business_type = 'owned'),
    'gross_unknown', (select count(*) from r where business_type = 'owned' and gross_profit is null),
    'result_after_costs', (select coalesce(sum(result_after_costs), 0)::text from r where business_type = 'owned'),
    'open_cost_lines', (select coalesce(sum(open_cost_lines), 0) from r),
    'distributable', (select coalesce(sum(distributable), 0)::text from r where business_type = 'owned' and settlement_id is not null),
    'company_operating', (select coalesce(sum(company_operating), 0)::text from r where business_type = 'owned' and settlement_id is not null),
    'owned_unsettled', (select count(*) from r where business_type = 'owned' and settlement_id is null),
    'consignment_fee', (select coalesce(sum(fee_amount), 0)::text from r where business_type = 'consignment' and settlement_id is not null),
    'consignment_unsettled', (select count(*) from r where business_type = 'consignment' and settlement_id is null),
    'general_expense', (select general_expense::text from g),
    'other_expense', (select other_expense::text from g),
    'other_income', (select other_income::text from g),
    'aftersales_cost', (select aftersales_cost::text from a),
    'commission_approved', (select approved::text from h),
    'commission_pending', (select pending from h),
    'commission_no_rule', (select no_rule from h),
    'showroom_result', (select (coalesce((select sum(result_after_costs) from r where business_type = 'owned'), 0)
                               + coalesce((select sum(fee_amount) from r where business_type = 'consignment' and settlement_id is not null), 0)
                               - g.general_expense - g.other_expense + g.other_income - a.aftersales_cost - h.approved)::text from g, a, h)
  ) end
$$;

revoke execute on function public.create_commission_rule(jsonb) from public, anon;
revoke execute on function public.void_commission_rule(uuid, integer, text) from public, anon;
revoke execute on function public.recalc_commission(uuid, integer) from public, anon;
revoke execute on function public.approve_commission(uuid, integer) from public, anon;
revoke execute on function public.cancel_commission(uuid, integer, text) from public, anon;
revoke execute on function public.record_commission_payment(jsonb) from public, anon;
revoke execute on function public.void_commission_payment(uuid, text) from public, anon;
grant execute on function public.create_commission_rule(jsonb) to authenticated;
grant execute on function public.void_commission_rule(uuid, integer, text) to authenticated;
grant execute on function public.recalc_commission(uuid, integer) to authenticated;
grant execute on function public.approve_commission(uuid, integer) to authenticated;
grant execute on function public.cancel_commission(uuid, integer, text) to authenticated;
grant execute on function public.record_commission_payment(jsonb) to authenticated;
grant execute on function public.void_commission_payment(uuid, text) to authenticated;

-- Đơn đã ký trước khi có quy tắc: tạo khoản hoa hồng cho các dòng xe hiệu lực (chưa có thì "chưa có quy tắc"). Chạy lại không tạo trùng.
do $$
declare l record; m record;
begin
  perform set_config('app.commission_auto', '1', true);
  for l in select x.id as line_id, x.vehicle_id, o.id as order_id, o.owner_id, coalesce(o.contract_date, (o.confirmed_at at time zone 'Asia/Ho_Chi_Minh')::date) as sold_on
           from public.sales_order_lines x join public.sales_orders o on o.id = x.order_id where o.status = 'confirmed' and x.line_status = 'active' loop
    select * into m from private.commission_match(l.vehicle_id, l.sold_on);
    insert into public.commission_entries (order_line_id, order_id, vehicle_id, employee_id, sold_on, rule_id, rule_snapshot, amount, status)
    values (l.line_id, l.order_id, l.vehicle_id, l.owner_id, l.sold_on, m.rule_id, m.snapshot, m.amount, case when m.rule_id is null then 'no_rule' else 'accrued' end)
    on conflict (order_line_id) do nothing;
  end loop;
  perform set_config('app.commission_auto', '', true);
end $$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
