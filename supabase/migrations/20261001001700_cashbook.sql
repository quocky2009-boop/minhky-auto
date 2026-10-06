-- =====================================================================
-- MINH KỲ AUTO — 1700 Chặng 5 (lát 4): thu chi — tài khoản tiền, phiếu thu/chi, tiền cọc thực nhận/hoàn, công nợ đơn bán
--
-- CLAUDE.md §9: "Thu chi/công nợ: tài khoản tiền, phiếu, chứng từ, phân bổ; cọc không phải lợi nhuận; giải ngân chưa nhận không coi đã thu."
--  * money_accounts: tài khoản tiền (tiền mặt/ngân hàng). Số dư đầu kỳ nhập một lần (khóa khi đã có phiếu). Chỉ quản lý lập/sửa.
--  * cash_vouchers: PHIẾU thu/chi = tiền ĐÃ thật sự vào/ra tài khoản. Bất biến: không sửa, không xóa; sai thì HỦY (quản lý, có lý do) rồi ghi lại.
--    Chưa nhận tiền (hẹn trả, giải ngân ngân hàng chưa về) thì KHÔNG có phiếu — không bao giờ coi là đã thu.
--  * Mục đích (purpose) quyết định liên kết:
--      thu: sale_deposit (tiền cọc, gắn giữ/cọc), sale_payment (thanh toán đơn bán đã ký), other_income (thu khác)
--      chi: deposit_refund (hoàn cọc), sale_refund (hoàn tiền đơn bán), general_expense (chi phí chung), other_expense (chi khác)
--  * Tiền cọc KHÔNG phải doanh thu/lợi nhuận: ghi riêng; khi giữ/cọc thành đơn bán (fulfilled) thì tính vào "đã thu" của đơn đó.
--  * Công nợ đơn bán = Tổng giá bán các dòng hiệu lực − thanh toán đã thu (ròng hoàn) − tiền cọc đã áp vào đơn. Không thu vượt nợ.
--  * Chi: chỉ chi khi tài khoản đủ tiền thực có (khóa chống hai phiếu chi cùng lúc làm âm quỹ).
--  * Hủy đơn bán đã ký bị chặn khi còn thanh toán chưa hoàn. Tiền cọc của đơn bị hủy trở lại "cọc chưa hoàn" để hoàn bằng phiếu hoàn cọc.
--  * Chi phí chuẩn bị xe (vehicle_cost_payments) vẫn ghi ở phần chi phí xe; CHƯA nối với sổ quỹ ở lát này (tránh ghi hai lần). Vốn góp/khoản vay chưa nối.
--  * Quyền: kế toán + quản lý/admin lập phiếu và xem; chỉ quản lý hủy phiếu và lập/sửa tài khoản. Sales/kỹ thuật không đọc.
-- =====================================================================

create sequence public.money_account_code_seq;
create sequence public.voucher_in_code_seq;
create sequence public.voucher_out_code_seq;

create table public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TK' || lpad(nextval('public.money_account_code_seq')::text, 3, '0')),
  name text not null check (length(btrim(name)) > 0),
  kind text not null check (kind in ('cash', 'bank')),
  opening_balance numeric(18, 0) not null default 0 check (opening_balance >= 0),
  is_active boolean not null default true,
  note text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique
);
create unique index money_accounts_name_key on public.money_accounts (lower(btrim(name)));

create table public.cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default '',
  direction text not null check (direction in ('in', 'out')),
  purpose text not null check (purpose in ('sale_deposit', 'sale_payment', 'other_income', 'deposit_refund', 'sale_refund', 'general_expense', 'other_expense')),
  account_id uuid not null references public.money_accounts (id),
  amount numeric(18, 0) not null check (amount > 0),
  occurred_on date not null,                                    -- ngày tiền thực sự vào/ra
  method text not null check (method in ('cash', 'bank_transfer')),
  payer_kind text check (payer_kind in ('customer', 'bank', 'other')),   -- thu: ai trả (ngân hàng giải ngân = 'bank')
  counterparty text not null default '',                        -- người nộp/nhận (tên); để trống thì lấy tên khách của đơn/cọc
  reference text,                                               -- mã giao dịch/số chứng từ
  order_id uuid references public.sales_orders (id),
  reservation_id uuid references public.vehicle_reservations (id),
  note text,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  void_reason text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint voucher_direction_purpose check (
    (direction = 'in' and purpose in ('sale_deposit', 'sale_payment', 'other_income'))
    or (direction = 'out' and purpose in ('deposit_refund', 'sale_refund', 'general_expense', 'other_expense'))),
  constraint voucher_links check (
    (purpose in ('sale_deposit', 'deposit_refund') and reservation_id is not null and order_id is null)
    or (purpose in ('sale_payment', 'sale_refund') and order_id is not null and reservation_id is null)
    or (purpose in ('other_income', 'general_expense', 'other_expense') and order_id is null and reservation_id is null)),
  constraint voucher_payer check ((direction = 'in') = (payer_kind is not null)),
  constraint voucher_void_complete check (
    (status = 'posted' and voided_at is null and voided_by is null and void_reason is null)
    or (status = 'voided' and voided_at is not null and voided_by is not null and length(btrim(coalesce(void_reason, ''))) > 0))
);
create index cash_vouchers_account_idx on public.cash_vouchers (account_id, occurred_on desc, created_at desc);
create index cash_vouchers_order_idx on public.cash_vouchers (order_id) where order_id is not null;
create index cash_vouchers_reservation_idx on public.cash_vouchers (reservation_id) where reservation_id is not null;
create index cash_vouchers_date_idx on public.cash_vouchers (occurred_on desc, created_at desc);

create trigger money_accounts_touch before update on public.money_accounts for each row execute function private.touch_row();
create trigger cash_vouchers_touch before update on public.cash_vouchers for each row execute function private.touch_row();
create trigger money_accounts_audit after insert or update on public.money_accounts for each row execute function private.audit_row();
create trigger cash_vouchers_audit after insert or update on public.cash_vouchers for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Hàm tính tiền (một nguồn cho database, giao diện và báo cáo). SECURITY DEFINER hẹp, chỉ trả số, dùng cho cả guard chạy dưới quyền sales.
-- ---------------------------------------------------------------------
create or replace function private.account_balance(p_account uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select a.opening_balance + coalesce((select sum(case v.direction when 'in' then v.amount else -v.amount end)
                                       from public.cash_vouchers v where v.account_id = a.id and v.status = 'posted'), 0)
  from public.money_accounts a where a.id = p_account
$$;

create or replace function private.order_total(p_order uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.sale_price), 0) from public.sales_order_lines l where l.order_id = p_order and l.line_status = 'active'
$$;

-- Thanh toán trực tiếp của đơn, ròng hoàn tiền (không gồm tiền cọc).
create or replace function private.order_direct_net(p_order uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case v.purpose when 'sale_payment' then v.amount else -v.amount end), 0)
  from public.cash_vouchers v where v.order_id = p_order and v.status = 'posted' and v.purpose in ('sale_payment', 'sale_refund')
$$;

-- Tiền cọc đã thu (ròng hoàn) của một giữ/cọc.
create or replace function private.reservation_net_deposit(p_res uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case v.purpose when 'sale_deposit' then v.amount else -v.amount end), 0)
  from public.cash_vouchers v where v.reservation_id = p_res and v.status = 'posted' and v.purpose in ('sale_deposit', 'deposit_refund')
$$;

-- Tiền cọc đã ÁP vào đơn: cọc (đã chốt "thành đơn bán") của đúng nhu cầu + xe trong dòng hiệu lực của đơn đã ký.
create or replace function private.order_applied_deposits(p_order uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(private.reservation_net_deposit(r.id)), 0)
  from public.sales_orders o
  join public.sales_order_lines l on l.order_id = o.id and l.line_status = 'active'
  join public.vehicle_reservations r on r.vehicle_id = l.vehicle_id and r.demand_id = o.demand_id and r.status = 'fulfilled' and r.kind = 'deposit'
  where o.id = p_order and o.status = 'confirmed'
$$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.money_accounts_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được lập tài khoản tiền.' using errcode = '42501';
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Không xóa tài khoản tiền. Ngừng sử dụng nếu không dùng nữa.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được sửa tài khoản tiền.' using errcode = '42501';
  end if;
  if (new.code, new.kind, new.created_by, new.created_at) is distinct from (old.code, old.kind, old.created_by, old.created_at) then
    raise exception 'Không đổi mã hoặc loại của tài khoản tiền.' using errcode = '22023';
  end if;
  if new.opening_balance <> old.opening_balance and exists (select 1 from public.cash_vouchers v where v.account_id = old.id) then
    raise exception 'Tài khoản đã có phiếu, không sửa số dư đầu kỳ.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger money_accounts_guard before insert or update or delete on public.money_accounts for each row execute function private.money_accounts_guard();

create or replace function private.cash_vouchers_guard()
returns trigger language plpgsql set search_path = '' as $$
declare a public.money_accounts; o public.sales_orders; r public.vehicle_reservations; v_have numeric; v_name text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa phiếu thu/chi. Hủy phiếu (có lý do) rồi ghi lại nếu sai.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Chỉ kế toán hoặc quản lý được lập phiếu thu/chi.' using errcode = '42501';
    end if;
    if new.status <> 'posted' or new.voided_at is not null then
      raise exception 'Phiếu mới phải ở trạng thái đã ghi.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('acct:' || new.account_id::text, 0));      -- tuần tự hóa theo tài khoản
    select * into a from public.money_accounts x where x.id = new.account_id;
    if a.id is null then
      raise exception 'Không tìm thấy tài khoản tiền.' using errcode = '22023';
    end if;
    if not a.is_active then
      raise exception 'Tài khoản tiền đã ngừng sử dụng.' using errcode = '22023';
    end if;
    if new.occurred_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Ngày thu/chi không được ở tương lai. Chưa nhận/chưa chi tiền thì chưa lập phiếu.' using errcode = '22023';
    end if;
    if new.method = 'cash' and a.kind <> 'cash' or new.method = 'bank_transfer' and a.kind <> 'bank' then
      raise exception 'Hình thức (tiền mặt/chuyển khoản) không khớp loại tài khoản tiền.' using errcode = '22023';
    end if;
    new.reference := nullif(btrim(coalesce(new.reference, '')), '');
    new.counterparty := btrim(coalesce(new.counterparty, ''));

    if new.purpose in ('sale_deposit', 'deposit_refund') then
      perform pg_advisory_xact_lock(hashtextextended('resv:' || new.reservation_id::text, 0));
      select * into r from public.vehicle_reservations x where x.id = new.reservation_id;
      if r.id is null then
        raise exception 'Không tìm thấy giữ/cọc.' using errcode = '22023';
      end if;
      if r.kind <> 'deposit' then
        raise exception 'Chỉ ghi tiền cọc cho đặt cọc (không phải giữ xe).' using errcode = '22023';
      end if;
      select c.full_name into v_name from public.customers c where c.id = r.customer_id;
      if new.counterparty = '' then new.counterparty := coalesce(v_name, ''); end if;
      v_have := private.reservation_net_deposit(r.id);
      if new.purpose = 'sale_deposit' then
        if r.status not in ('active', 'fulfilled') then
          raise exception 'Đặt cọc đã kết thúc (hủy/chuyển), không nhận thêm tiền cọc.' using errcode = '22023';
        end if;
        if v_have + new.amount > r.deposit_amount then
          raise exception 'Tổng tiền cọc đã thu vượt số tiền cọc thỏa thuận.' using errcode = '22023';
        end if;
      else
        if not (r.status = 'cancelled'
                or (r.status = 'fulfilled' and not exists (
                      select 1 from public.sales_orders so join public.sales_order_lines l on l.order_id = so.id and l.line_status = 'active'
                      where so.demand_id = r.demand_id and l.vehicle_id = r.vehicle_id and so.status = 'confirmed'))) then
          raise exception 'Chỉ hoàn cọc khi cọc đã hủy hoặc đơn bán dùng cọc đã bị hủy. Cọc đang áp vào đơn bán thì hoàn qua đơn bán.' using errcode = '22023';
        end if;
        if new.amount > v_have then
          raise exception 'Số tiền hoàn cọc vượt số cọc đã thu và chưa hoàn.' using errcode = '22023';
        end if;
      end if;
    elsif new.purpose in ('sale_payment', 'sale_refund') then
      perform pg_advisory_xact_lock(hashtextextended('order:' || new.order_id::text, 0));
      select * into o from public.sales_orders x where x.id = new.order_id;
      if o.id is null then
        raise exception 'Không tìm thấy đơn bán.' using errcode = '22023';
      end if;
      select c.full_name into v_name from public.customers c where c.id = o.customer_id;
      if new.counterparty = '' then new.counterparty := coalesce(v_name, ''); end if;
      if new.purpose = 'sale_payment' then
        if o.status <> 'confirmed' then
          raise exception 'Chỉ nhận thanh toán cho đơn bán đã ký hợp đồng.' using errcode = '22023';
        end if;
        if new.amount > private.order_total(o.id) - private.order_direct_net(o.id) - private.order_applied_deposits(o.id) then
          raise exception 'Số tiền thu vượt công nợ còn lại của đơn bán.' using errcode = '22023';
        end if;
      else
        if o.status = 'draft' then
          raise exception 'Đơn bán đang soạn chưa có thanh toán để hoàn.' using errcode = '22023';
        end if;
        if new.amount > private.order_direct_net(o.id) then
          raise exception 'Số tiền hoàn vượt số thanh toán đã thu và chưa hoàn của đơn.' using errcode = '22023';
        end if;
      end if;
    else
      if new.counterparty = '' then
        raise exception 'Ghi người nộp/người nhận tiền.' using errcode = '22023';
      end if;
    end if;

    if new.direction = 'out' and new.amount > private.account_balance(new.account_id) then
      raise exception 'Tài khoản không đủ tiền thực có để chi (còn %).', to_char(private.account_balance(new.account_id), 'FM999G999G999G999G990') using errcode = '22023';
    end if;
    new.code := case new.direction when 'in' then 'PT' || lpad(nextval('public.voucher_in_code_seq')::text, 5, '0') else 'PC' || lpad(nextval('public.voucher_out_code_seq')::text, 5, '0') end;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  -- UPDATE: chỉ HỦY phiếu
  if (new.code, new.direction, new.purpose, new.account_id, new.amount, new.occurred_on, new.method, new.payer_kind, new.counterparty, new.reference,
      new.order_id, new.reservation_id, new.note, new.created_by, new.created_at)
     is distinct from (old.code, old.direction, old.purpose, old.account_id, old.amount, old.occurred_on, old.method, old.payer_kind, old.counterparty, old.reference,
      old.order_id, old.reservation_id, old.note, old.created_by, old.created_at) then
    raise exception 'Không sửa phiếu thu/chi đã ghi. Hủy phiếu (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status <> 'posted' then
    raise exception 'Phiếu đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status <> 'voided' then
    return new;
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được hủy phiếu thu/chi.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(new.void_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy phiếu.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('acct:' || old.account_id::text, 0));
  if old.order_id is not null then perform pg_advisory_xact_lock(hashtextextended('order:' || old.order_id::text, 0)); end if;
  if old.reservation_id is not null then perform pg_advisory_xact_lock(hashtextextended('resv:' || old.reservation_id::text, 0)); end if;
  if old.direction = 'in' then
    -- hủy phiếu thu không được làm quỹ âm, hay làm khoản hoàn lớn hơn số đã thu
    if old.purpose = 'sale_payment' and private.order_direct_net(old.order_id) - old.amount < 0 then
      raise exception 'Đơn bán đã có phiếu hoàn tiền: hủy phiếu hoàn trước khi hủy phiếu thu này.' using errcode = '22023';
    end if;
    if old.purpose = 'sale_deposit' and private.reservation_net_deposit(old.reservation_id) - old.amount < 0 then
      raise exception 'Cọc đã có phiếu hoàn: hủy phiếu hoàn trước khi hủy phiếu thu này.' using errcode = '22023';
    end if;
    if private.account_balance(old.account_id) - old.amount < 0 then
      raise exception 'Hủy phiếu thu này làm tài khoản tiền âm (đã chi tiền này đi). Hủy các phiếu chi liên quan trước.' using errcode = '22023';
    end if;
  end if;
  if not private.is_system() then new.voided_by := (select auth.uid()); end if;
  new.voided_at := now();
  new.reference := old.reference;
  return new;
end $$;
create trigger cash_vouchers_guard before insert or update or delete on public.cash_vouchers for each row execute function private.cash_vouchers_guard();

-- Hủy đơn bán đã ký khi còn thanh toán chưa hoàn: chặn (hoàn tiền trước). Trigger riêng, không đụng guard của đơn.
create or replace function private.sales_orders_money_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'cancelled' and private.order_direct_net(old.id) > 0 then
    raise exception 'Đơn bán đã nhận thanh toán chưa hoàn. Lập phiếu hoàn tiền (chi) cho khách trước khi hủy đơn.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger sales_orders_money_guard before update on public.sales_orders for each row execute function private.sales_orders_money_guard();

-- ---------------------------------------------------------------------
-- RLS: chỉ kế toán/quản lý/admin đọc; sales/kỹ thuật không đọc. Không xóa.
-- ---------------------------------------------------------------------
alter table public.money_accounts enable row level security;
alter table public.cash_vouchers enable row level security;
create policy money_accounts_select on public.money_accounts for select to authenticated using (private.can_see_finance());
create policy money_accounts_insert on public.money_accounts for insert to authenticated with check (private.is_manager());
create policy money_accounts_update on public.money_accounts for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy cash_vouchers_select on public.cash_vouchers for select to authenticated using (private.can_see_finance());
create policy cash_vouchers_insert on public.cash_vouchers for insert to authenticated with check (private.can_see_finance());
create policy cash_vouchers_update on public.cash_vouchers for update to authenticated using (private.is_manager()) with check (private.is_manager());
revoke delete, truncate on public.money_accounts, public.cash_vouchers from authenticated, anon;
revoke all on public.money_accounts, public.cash_vouchers from anon;

-- Số dư tài khoản và công nợ đơn bán: chỉ tài chính thấy (view security invoker + lọc quyền).
create view public.money_account_balances with (security_invoker = true) as
select a.id, a.code, a.name, a.kind, a.is_active, a.opening_balance,
       coalesce(sum(v.amount) filter (where v.status = 'posted' and v.direction = 'in'), 0) as total_in,
       coalesce(sum(v.amount) filter (where v.status = 'posted' and v.direction = 'out'), 0) as total_out,
       private.account_balance(a.id) as balance
from public.money_accounts a left join public.cash_vouchers v on v.account_id = a.id
where private.can_see_finance()
group by a.id;

create view public.sales_order_balances with (security_invoker = true) as
select o.id as order_id, o.code, o.status,
       private.order_total(o.id) as total,
       private.order_direct_net(o.id) as paid_direct,
       private.order_applied_deposits(o.id) as applied_deposit,
       case when o.status = 'confirmed' then private.order_total(o.id) - private.order_direct_net(o.id) - private.order_applied_deposits(o.id) end as outstanding
from public.sales_orders o
where private.can_see_finance();

-- Tiền cọc đã thu (ròng hoàn) theo từng giữ/cọc: dùng chọn đối tượng khi ghi thu/hoàn cọc.
create view public.reservation_deposit_balances with (security_invoker = true) as
select r.id as reservation_id, r.code, r.status, r.deposit_amount, r.demand_id, r.vehicle_id,
       private.reservation_net_deposit(r.id) as net_deposit
from public.vehicle_reservations r
where r.kind = 'deposit' and private.can_see_finance();

revoke all on public.money_account_balances, public.sales_order_balances, public.reservation_deposit_balances from anon;
grant select on public.money_account_balances, public.sales_order_balances, public.reservation_deposit_balances to authenticated;

-- ---------------------------------------------------------------------
-- RPC. Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_money_account(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select a.id into v_id from public.money_accounts a where a.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.money_accounts (name, kind, opening_balance, note, client_request_id)
  values (btrim(p ->> 'name'), p ->> 'kind', coalesce(nullif(p ->> 'opening_balance', '')::numeric, 0), nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select a.id into v_id from public.money_accounts a where a.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Đã có tài khoản tiền trùng tên.' using errcode = '22023';
end $$;

create or replace function public.update_money_account(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.money_accounts a set name = coalesce(nullif(btrim(p ->> 'name'), ''), a.name), note = nullif(btrim(p ->> 'note'), ''),
    is_active = coalesce((p ->> 'is_active')::boolean, a.is_active),
    opening_balance = coalesce(nullif(p ->> 'opening_balance', '')::numeric, a.opening_balance)
  where a.id = p_id and a.version = p_version
  returning a.version into v_ver;
  if v_ver is null then
    raise exception 'Tài khoản vừa được cập nhật hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
exception when unique_violation then
  raise exception 'Đã có tài khoản tiền trùng tên.' using errcode = '22023';
end $$;

create or replace function public.post_voucher(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select v.id into v_id from public.cash_vouchers v where v.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.cash_vouchers (direction, purpose, account_id, amount, occurred_on, method, payer_kind, counterparty, reference, order_id, reservation_id, note, client_request_id)
  values (p ->> 'direction', p ->> 'purpose', (p ->> 'account_id')::uuid, (p ->> 'amount')::numeric, (p ->> 'occurred_on')::date, p ->> 'method',
          nullif(p ->> 'payer_kind', ''), coalesce(p ->> 'counterparty', ''), nullif(btrim(p ->> 'reference'), ''), nullif(p ->> 'order_id', '')::uuid,
          nullif(p ->> 'reservation_id', '')::uuid, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select v.id into v_id from public.cash_vouchers v where v.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise;
end $$;

create or replace function public.void_voucher(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy phiếu.' using errcode = '22023';
  end if;
  update public.cash_vouchers v set status = 'voided', void_reason = btrim(p_reason)
  where v.id = p_id and v.version = p_version and v.status = 'posted'
  returning v.version into v_ver;
  if v_ver is null then
    raise exception 'Phiếu vừa được cập nhật, đã hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

revoke execute on function public.create_money_account(jsonb) from public, anon;
revoke execute on function public.update_money_account(uuid, integer, jsonb) from public, anon;
revoke execute on function public.post_voucher(jsonb) from public, anon;
revoke execute on function public.void_voucher(uuid, integer, text) from public, anon;
grant execute on function public.create_money_account(jsonb) to authenticated;
grant execute on function public.update_money_account(uuid, integer, jsonb) to authenticated;
grant execute on function public.post_voucher(jsonb) to authenticated;
grant execute on function public.void_voucher(uuid, integer, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
