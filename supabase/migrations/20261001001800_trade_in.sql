-- =====================================================================
-- MINH KỲ AUTO — 1800 Chặng 5 (lát 5): thu cũ đổi mới
--
-- CLAUDE.md §8: một hồ sơ liên kết HAI giao dịch — showroom bán xe (đơn bán) và showroom mua xe cũ của khách (xe nhập kho nguồn "thu cũ").
--  * Giữ giá trị ĐẦY ĐỦ của hai giao dịch: giá bán trên dòng đơn bán và giá mua của xe cũ KHÔNG đổi vì đối trừ → hiệu quả từng xe vẫn xác định được.
--  * trade_ins: hồ sơ thu cũ đổi mới (TC#####): đơn bán + xe cũ (nhập kho, source_type = trade_in, cùng khách) + giá trị mua (chụp từ giá mua của xe)
--    + khoản vay còn lại của xe cũ (ngân hàng, số tiền showroom trả thẳng ngân hàng). Chỉ quản lý lập/xác nhận/hủy; kế toán xem.
--  * Giá trị mua xe cũ P = L (trả ngân hàng, nếu xe còn vay) + C (phần của khách). KHÔNG khấu trừ hai lần: đối trừ và chi trả cho khách chỉ lấy từ C; L chỉ trả bằng phiếu chi cho ngân hàng.
--  * trade_in_offsets: ĐỐI TRỪ = chứng từ riêng được quản lý xác nhận, KHÔNG phải phiếu thu/chi tiền thật (không đổi số dư tài khoản).
--    Một đối trừ giảm đồng thời công nợ khách phải trả đơn bán và số tiền showroom còn phải trả cho xe cũ.
--  * Tiền còn phải trả cho xe cũ = P − đối trừ đã xác nhận − tiền đã chi (cho khách + cho ngân hàng). Công nợ đơn bán = tổng giá − thanh toán − cọc đã áp − đối trừ.
--  * Phiếu chi mới: tradein_payout (chi cho khách phần C còn lại) và tradein_loan_payoff (trả ngân hàng, tối đa L). Không chi vượt phần còn lại; không đối trừ vượt công nợ đơn / phần C.
--  * Hủy: hủy đơn bán đã ký bị chặn khi còn đối trừ hiệu lực (hủy đối trừ trước); hủy hồ sơ thu cũ chặn khi còn đối trừ hoặc đã chi tiền (hủy đối trừ/phiếu trước). Mọi thứ hủy có lý do, không xóa.
--  * Sales/kỹ thuật không đọc hồ sơ thu cũ (có giá mua xe cũ, khoản vay của khách).
-- =====================================================================

create sequence public.trade_in_code_seq;
create sequence public.trade_in_offset_code_seq;

create table public.trade_ins (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TC' || lpad(nextval('public.trade_in_code_seq')::text, 5, '0')),
  order_id uuid not null references public.sales_orders (id),
  old_vehicle_id uuid not null references public.vehicles (id),
  customer_id uuid not null references public.customers (id),
  purchase_value numeric(18, 0) not null check (purchase_value > 0),          -- giá mua xe cũ (chụp từ giá mua của xe lúc lập)
  loan_bank text,                                                              -- ngân hàng đang cho khách vay trên xe cũ (nếu có)
  loan_payoff_amount numeric(18, 0) not null default 0 check (loan_payoff_amount >= 0),   -- số showroom trả thẳng ngân hàng để giải chấp
  note text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  end_reason text,
  ended_by uuid references public.profiles (id),
  ended_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint trade_ins_loan_within_value check (loan_payoff_amount <= purchase_value),
  constraint trade_ins_loan_bank_required check (loan_payoff_amount = 0 or length(btrim(coalesce(loan_bank, ''))) > 0),
  constraint trade_ins_confirmed_complete check (status <> 'confirmed' or (confirmed_by is not null and confirmed_at is not null)),
  constraint trade_ins_cancel_complete check (status <> 'cancelled' or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null))
);
-- Một xe cũ chỉ thuộc MỘT hồ sơ thu cũ chưa hủy.
create unique index trade_ins_one_active_vehicle on public.trade_ins (old_vehicle_id) where status <> 'cancelled';
create index trade_ins_order_idx on public.trade_ins (order_id);

create table public.trade_in_offsets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DT' || lpad(nextval('public.trade_in_offset_code_seq')::text, 5, '0')),
  trade_in_id uuid not null references public.trade_ins (id),
  order_id uuid not null references public.sales_orders (id),
  amount numeric(18, 0) not null check (amount > 0),
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
  constraint offset_void_complete check (
    (status = 'posted' and voided_at is null and voided_by is null and void_reason is null)
    or (status = 'voided' and voided_at is not null and voided_by is not null and length(btrim(coalesce(void_reason, ''))) > 0))
);
create index trade_in_offsets_ti_idx on public.trade_in_offsets (trade_in_id) where status = 'posted';
create index trade_in_offsets_order_idx on public.trade_in_offsets (order_id) where status = 'posted';

create trigger trade_ins_touch before update on public.trade_ins for each row execute function private.touch_row();
create trigger trade_in_offsets_touch before update on public.trade_in_offsets for each row execute function private.touch_row();
create trigger trade_ins_audit after insert or update on public.trade_ins for each row execute function private.audit_row();
create trigger trade_in_offsets_audit after insert or update on public.trade_in_offsets for each row execute function private.audit_row();

-- Phiếu chi cho xe cũ gắn hồ sơ thu cũ.
alter table public.cash_vouchers add column trade_in_id uuid references public.trade_ins (id);
create index cash_vouchers_trade_in_idx on public.cash_vouchers (trade_in_id) where trade_in_id is not null;
alter table public.cash_vouchers drop constraint cash_vouchers_purpose_check;
alter table public.cash_vouchers drop constraint voucher_direction_purpose;
alter table public.cash_vouchers drop constraint voucher_links;
alter table public.cash_vouchers add constraint cash_vouchers_purpose_check check (purpose in
  ('sale_deposit', 'sale_payment', 'other_income', 'deposit_refund', 'sale_refund', 'general_expense', 'other_expense', 'tradein_payout', 'tradein_loan_payoff'));
alter table public.cash_vouchers add constraint voucher_direction_purpose check (
  (direction = 'in' and purpose in ('sale_deposit', 'sale_payment', 'other_income'))
  or (direction = 'out' and purpose in ('deposit_refund', 'sale_refund', 'general_expense', 'other_expense', 'tradein_payout', 'tradein_loan_payoff')));
alter table public.cash_vouchers add constraint voucher_links check (
  (purpose in ('sale_deposit', 'deposit_refund') and reservation_id is not null and order_id is null and trade_in_id is null)
  or (purpose in ('sale_payment', 'sale_refund') and order_id is not null and reservation_id is null and trade_in_id is null)
  or (purpose in ('tradein_payout', 'tradein_loan_payoff') and trade_in_id is not null and order_id is null and reservation_id is null)
  or (purpose in ('other_income', 'general_expense', 'other_expense') and order_id is null and reservation_id is null and trade_in_id is null));

-- ---------------------------------------------------------------------
-- Hàm tính tiền (SECURITY DEFINER hẹp, chỉ trả số)
-- ---------------------------------------------------------------------
create or replace function private.order_offsets(p_order uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(o.amount), 0) from public.trade_in_offsets o where o.order_id = p_order and o.status = 'posted'
$$;

create or replace function private.order_outstanding(p_order uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select private.order_total(p_order) - private.order_direct_net(p_order) - private.order_applied_deposits(p_order) - private.order_offsets(p_order)
$$;

create or replace function private.trade_in_offsets_total(p_ti uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(o.amount), 0) from public.trade_in_offsets o where o.trade_in_id = p_ti and o.status = 'posted'
$$;

create or replace function private.trade_in_paid(p_ti uuid, p_purpose text)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(v.amount), 0) from public.cash_vouchers v where v.trade_in_id = p_ti and v.status = 'posted' and v.purpose = p_purpose
$$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.trade_ins_guard()
returns trigger language plpgsql set search_path = '' as $$
declare o public.sales_orders; v public.vehicles; v_price numeric; v_cust uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa hồ sơ thu cũ đổi mới. Hủy hồ sơ (có lý do).' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được lập, xác nhận hoặc hủy hồ sơ thu cũ đổi mới.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.confirmed_at is not null or new.ended_at is not null then
      raise exception 'Hồ sơ thu cũ mới phải ở trạng thái đang soạn.' using errcode = '22023';
    end if;
    select * into o from public.sales_orders x where x.id = new.order_id;
    if o.id is null then
      raise exception 'Không tìm thấy đơn bán.' using errcode = '22023';
    end if;
    if o.status = 'cancelled' then
      raise exception 'Đơn bán đã hủy, không lập hồ sơ thu cũ đổi mới.' using errcode = '22023';
    end if;
    select * into v from public.vehicles x where x.id = new.old_vehicle_id;
    if v.id is null then
      raise exception 'Không tìm thấy xe cũ. Nhập kho xe cũ của khách (nguồn "thu cũ đổi mới") trước.' using errcode = '22023';
    end if;
    if v.source_type is distinct from 'trade_in' or v.business_type <> 'owned' or v.archived_at is not null then
      raise exception 'Xe cũ phải là xe showroom sở hữu, nhập kho với nguồn "thu cũ đổi mới".' using errcode = '22023';
    end if;
    select d.customer_id into v_cust from public.demands d where d.id = v.source_demand_id;
    if v_cust is distinct from o.customer_id then
      raise exception 'Xe cũ không thuộc khách của đơn bán này (nhu cầu bán của xe cũ phải cùng khách).' using errcode = '22023';
    end if;
    select f.purchase_price into v_price from public.vehicle_financials f where f.vehicle_id = v.id;
    if v_price is null or v_price <= 0 then
      raise exception 'Xe cũ chưa có giá mua. Nhập giá mua thực tế khi nhập kho trước khi lập hồ sơ.' using errcode = '22023';
    end if;
    new.customer_id := o.customer_id;
    new.purchase_value := v_price;                                   -- giá trị mua đầy đủ, lấy từ hệ thống
    new.loan_bank := nullif(btrim(coalesce(new.loan_bank, '')), '');
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if (new.code, new.order_id, new.old_vehicle_id, new.customer_id, new.purchase_value, new.created_by, new.created_at)
     is distinct from (old.code, old.order_id, old.old_vehicle_id, old.customer_id, old.purchase_value, old.created_by, old.created_at) then
    raise exception 'Không đổi đơn bán, xe cũ hoặc giá trị mua của hồ sơ thu cũ. Hủy rồi lập hồ sơ mới.' using errcode = '22023';
  end if;
  if old.status = 'cancelled' then
    raise exception 'Hồ sơ thu cũ đã hủy, không sửa.' using errcode = '22023';
  end if;
  if old.status = 'confirmed' and new.status = 'confirmed' then
    if (new.loan_bank, new.loan_payoff_amount, new.note) is distinct from (old.loan_bank, old.loan_payoff_amount, old.note) then
      raise exception 'Hồ sơ đã xác nhận không sửa khoản vay/ghi chú. Hủy rồi lập hồ sơ mới nếu sai.' using errcode = '22023';
    end if;
    return new;
  end if;
  new.loan_bank := nullif(btrim(coalesce(new.loan_bank, '')), '');
  if new.status = 'draft' then return new; end if;
  if new.status = 'confirmed' then
    select * into o from public.sales_orders x where x.id = old.order_id;
    if o.status = 'cancelled' then
      raise exception 'Đơn bán đã hủy, không xác nhận hồ sơ thu cũ.' using errcode = '22023';
    end if;
    if not private.is_system() then new.confirmed_by := (select auth.uid()); end if;
    new.confirmed_at := now();
    return new;
  end if;
  if new.status = 'cancelled' then
    if length(btrim(coalesce(new.end_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy hồ sơ thu cũ đổi mới.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('order:' || old.order_id::text, 0));
    if private.trade_in_offsets_total(old.id) > 0 then
      raise exception 'Hồ sơ còn khoản đối trừ hiệu lực. Hủy các khoản đối trừ trước khi hủy hồ sơ.' using errcode = '22023';
    end if;
    if private.trade_in_paid(old.id, 'tradein_payout') + private.trade_in_paid(old.id, 'tradein_loan_payoff') > 0 then
      raise exception 'Đã chi tiền cho xe cũ (khách/ngân hàng). Hủy các phiếu chi liên quan trước khi hủy hồ sơ.' using errcode = '22023';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  raise exception 'Không thể chuyển hồ sơ thu cũ từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger trade_ins_guard before insert or update or delete on public.trade_ins for each row execute function private.trade_ins_guard();

create or replace function private.trade_in_offsets_guard()
returns trigger language plpgsql set search_path = '' as $$
declare t public.trade_ins; o public.sales_orders; v_cap numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa khoản đối trừ. Hủy (có lý do).' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được xác nhận hoặc hủy khoản đối trừ thu cũ đổi mới.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'posted' or new.voided_at is not null then
      raise exception 'Khoản đối trừ mới phải ở trạng thái đã xác nhận.' using errcode = '22023';
    end if;
    select * into t from public.trade_ins x where x.id = new.trade_in_id;
    if t.id is null then
      raise exception 'Không tìm thấy hồ sơ thu cũ đổi mới.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('order:' || t.order_id::text, 0));         -- cùng khóa với phiếu thu của đơn
    perform pg_advisory_xact_lock(hashtextextended('tradein:' || t.id::text, 0));
    select * into t from public.trade_ins x where x.id = new.trade_in_id;
    if t.status <> 'confirmed' then
      raise exception 'Hồ sơ thu cũ chưa được xác nhận (hoặc đã hủy), chưa đối trừ được.' using errcode = '22023';
    end if;
    select * into o from public.sales_orders x where x.id = t.order_id;
    if o.status <> 'confirmed' then
      raise exception 'Chỉ đối trừ vào đơn bán đã ký hợp đồng.' using errcode = '22023';
    end if;
    new.order_id := t.order_id;
    -- chỉ đối trừ từ PHẦN CỦA KHÁCH (giá trị mua − khoản trả ngân hàng), trừ đối trừ và tiền đã chi cho khách
    v_cap := t.purchase_value - t.loan_payoff_amount - private.trade_in_offsets_total(t.id) - private.trade_in_paid(t.id, 'tradein_payout');
    if new.amount > v_cap then
      raise exception 'Đối trừ vượt phần của khách còn lại trong giá mua xe cũ (đã trừ khoản trả ngân hàng, đối trừ và tiền đã chi).' using errcode = '22023';
    end if;
    if new.amount > private.order_outstanding(o.id) then
      raise exception 'Đối trừ vượt công nợ còn lại của đơn bán.' using errcode = '22023';
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if (new.code, new.trade_in_id, new.order_id, new.amount, new.note, new.created_by, new.created_at)
     is distinct from (old.code, old.trade_in_id, old.order_id, old.amount, old.note, old.created_by, old.created_at) then
    raise exception 'Không sửa khoản đối trừ đã xác nhận. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status <> 'posted' then
    raise exception 'Khoản đối trừ đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status <> 'voided' then return new; end if;
  if length(btrim(coalesce(new.void_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy khoản đối trừ.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:' || old.order_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('tradein:' || old.trade_in_id::text, 0));
  if not private.is_system() then new.voided_by := (select auth.uid()); end if;
  new.voided_at := now();
  return new;
end $$;
create trigger trade_in_offsets_guard before insert or update or delete on public.trade_in_offsets for each row execute function private.trade_in_offsets_guard();

-- Hủy đơn bán đã ký: chặn khi còn thanh toán chưa hoàn HOẶC còn đối trừ thu cũ đổi mới hiệu lực.
create or replace function private.sales_orders_money_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'cancelled' then
    if private.order_direct_net(old.id) > 0 then
      raise exception 'Đơn bán đã nhận thanh toán chưa hoàn. Lập phiếu hoàn tiền (chi) cho khách trước khi hủy đơn.' using errcode = '22023';
    end if;
    if private.order_offsets(old.id) > 0 then
      raise exception 'Đơn bán còn khoản đối trừ thu cũ đổi mới hiệu lực. Hủy khoản đối trừ (quản lý) trước khi hủy đơn.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

-- Tên khách cho phiếu thu/chi (kế toán không đọc được bảng khách): SECURITY DEFINER hẹp, chỉ trả họ tên.
create or replace function private.customer_name(p_customer uuid)
returns text language sql stable security definer set search_path = '' as $$
  select c.full_name from public.customers c where c.id = p_customer
$$;

-- Phiếu thu/chi: thêm 2 loại chi cho xe cũ và dùng công nợ đã trừ đối trừ. Hàm cũ giữ nguyên, chỉ thêm nhánh thu cũ và đổi công thức công nợ.
create or replace function private.cash_vouchers_guard()
returns trigger language plpgsql set search_path = '' as $$
declare a public.money_accounts; o public.sales_orders; r public.vehicle_reservations; t public.trade_ins; v_have numeric; v_name text;
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
      v_name := private.customer_name(r.customer_id);
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
      v_name := private.customer_name(o.customer_id);
      if new.counterparty = '' then new.counterparty := coalesce(v_name, ''); end if;
      if new.purpose = 'sale_payment' then
        if o.status <> 'confirmed' then
          raise exception 'Chỉ nhận thanh toán cho đơn bán đã ký hợp đồng.' using errcode = '22023';
        end if;
        if new.amount > private.order_outstanding(o.id) then
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
    elsif new.purpose in ('tradein_payout', 'tradein_loan_payoff') then
      select * into t from public.trade_ins x where x.id = new.trade_in_id;
      if t.id is null then
        raise exception 'Không tìm thấy hồ sơ thu cũ đổi mới.' using errcode = '22023';
      end if;
      perform pg_advisory_xact_lock(hashtextextended('order:' || t.order_id::text, 0));
      perform pg_advisory_xact_lock(hashtextextended('tradein:' || t.id::text, 0));
      select * into t from public.trade_ins x where x.id = new.trade_in_id;
      if t.status <> 'confirmed' then
        raise exception 'Hồ sơ thu cũ chưa được xác nhận (hoặc đã hủy), chưa chi tiền được.' using errcode = '22023';
      end if;
      if new.purpose = 'tradein_payout' then
        v_name := private.customer_name(t.customer_id);
        if new.counterparty = '' then new.counterparty := coalesce(v_name, ''); end if;
        if new.amount > t.purchase_value - t.loan_payoff_amount - private.trade_in_offsets_total(t.id) - private.trade_in_paid(t.id, 'tradein_payout') then
          raise exception 'Chi cho khách vượt phần của khách còn lại trong giá mua xe cũ (đã trừ khoản trả ngân hàng, đối trừ và tiền đã chi).' using errcode = '22023';
        end if;
      else
        if t.loan_payoff_amount = 0 then
          raise exception 'Xe cũ này không có khoản vay cần trả ngân hàng.' using errcode = '22023';
        end if;
        if new.counterparty = '' then new.counterparty := coalesce(t.loan_bank, ''); end if;
        if new.amount > t.loan_payoff_amount - private.trade_in_paid(t.id, 'tradein_loan_payoff') then
          raise exception 'Trả ngân hàng vượt khoản vay cần giải chấp còn lại.' using errcode = '22023';
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
      new.order_id, new.reservation_id, new.trade_in_id, new.note, new.created_by, new.created_at)
     is distinct from (old.code, old.direction, old.purpose, old.account_id, old.amount, old.occurred_on, old.method, old.payer_kind, old.counterparty, old.reference,
      old.order_id, old.reservation_id, old.trade_in_id, old.note, old.created_by, old.created_at) then
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

-- ---------------------------------------------------------------------
-- RLS: kế toán + quản lý xem; chỉ quản lý ghi. Sales/kỹ thuật không đọc. Không xóa.
-- ---------------------------------------------------------------------
alter table public.trade_ins enable row level security;
alter table public.trade_in_offsets enable row level security;
create policy trade_ins_select on public.trade_ins for select to authenticated using (private.can_see_finance());
create policy trade_ins_insert on public.trade_ins for insert to authenticated with check (private.is_manager());
create policy trade_ins_update on public.trade_ins for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy trade_in_offsets_select on public.trade_in_offsets for select to authenticated using (private.can_see_finance());
create policy trade_in_offsets_insert on public.trade_in_offsets for insert to authenticated with check (private.is_manager());
create policy trade_in_offsets_update on public.trade_in_offsets for update to authenticated using (private.is_manager()) with check (private.is_manager());
revoke delete, truncate on public.trade_ins, public.trade_in_offsets from authenticated, anon;
revoke all on public.trade_ins, public.trade_in_offsets from anon;

-- Công nợ đơn bán nay trừ cả đối trừ thu cũ đổi mới (cột cũ giữ nguyên thứ tự; thêm cột cuối).
create or replace view public.sales_order_balances with (security_invoker = true) as
select o.id as order_id, o.code, o.status,
       private.order_total(o.id) as total,
       private.order_direct_net(o.id) as paid_direct,
       private.order_applied_deposits(o.id) as applied_deposit,
       case when o.status = 'confirmed' then private.order_outstanding(o.id) end as outstanding,
       private.order_offsets(o.id) as trade_in_offset
from public.sales_orders o
where private.can_see_finance();

-- Số liệu từng hồ sơ thu cũ: tiền còn phải trả = giá mua − đối trừ − đã chi (khách + ngân hàng).
create view public.trade_in_balances with (security_invoker = true) as
select t.id as trade_in_id, t.code, t.status, t.order_id, t.old_vehicle_id,
       t.purchase_value, t.loan_payoff_amount,
       t.purchase_value - t.loan_payoff_amount as customer_portion,
       private.trade_in_offsets_total(t.id) as offsets,
       private.trade_in_paid(t.id, 'tradein_payout') as paid_customer,
       private.trade_in_paid(t.id, 'tradein_loan_payoff') as paid_bank,
       t.purchase_value - private.trade_in_offsets_total(t.id) - private.trade_in_paid(t.id, 'tradein_payout') - private.trade_in_paid(t.id, 'tradein_loan_payoff') as payable_total,
       t.purchase_value - t.loan_payoff_amount - private.trade_in_offsets_total(t.id) - private.trade_in_paid(t.id, 'tradein_payout') as customer_remaining,
       t.loan_payoff_amount - private.trade_in_paid(t.id, 'tradein_loan_payoff') as bank_remaining
from public.trade_ins t
where private.can_see_finance();

revoke all on public.trade_in_balances from anon;
grant select on public.trade_in_balances to authenticated;

-- ---------------------------------------------------------------------
-- RPC. Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_trade_in(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select t.id into v_id from public.trade_ins t where t.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.trade_ins (order_id, old_vehicle_id, customer_id, purchase_value, loan_bank, loan_payoff_amount, note, client_request_id)
  values ((p ->> 'order_id')::uuid, (p ->> 'old_vehicle_id')::uuid, gen_random_uuid(), 1, nullif(btrim(p ->> 'loan_bank'), ''),
          coalesce(nullif(p ->> 'loan_payoff_amount', '')::numeric, 0), nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select t.id into v_id from public.trade_ins t where t.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Xe cũ này đã nằm trong một hồ sơ thu cũ đổi mới khác chưa hủy.' using errcode = '22023';
end $$;

create or replace function public.update_trade_in_draft(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.trade_ins t set loan_bank = nullif(btrim(p ->> 'loan_bank'), ''), loan_payoff_amount = coalesce(nullif(p ->> 'loan_payoff_amount', '')::numeric, 0), note = nullif(btrim(p ->> 'note'), '')
  where t.id = p_id and t.version = p_version and t.status = 'draft'
  returning t.version into v_ver;
  if v_ver is null then
    raise exception 'Hồ sơ vừa được cập nhật, không còn đang soạn hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.confirm_trade_in(p_id uuid, p_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.trade_ins t set status = 'confirmed' where t.id = p_id and t.version = p_version and t.status = 'draft' returning t.version into v_ver;
  if v_ver is null then
    raise exception 'Hồ sơ vừa được cập nhật, không còn đang soạn hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.cancel_trade_in(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy hồ sơ thu cũ đổi mới.' using errcode = '22023';
  end if;
  update public.trade_ins t set status = 'cancelled', end_reason = btrim(p_reason) where t.id = p_id and t.version = p_version and t.status in ('draft', 'confirmed') returning t.version into v_ver;
  if v_ver is null then
    raise exception 'Hồ sơ vừa được cập nhật, đã hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.post_trade_in_offset(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select o.id into v_id from public.trade_in_offsets o where o.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.trade_in_offsets (trade_in_id, order_id, amount, note, client_request_id)
  values ((p ->> 'trade_in_id')::uuid, gen_random_uuid(), (p ->> 'amount')::numeric, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select o.id into v_id from public.trade_in_offsets o where o.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise;
end $$;

create or replace function public.void_trade_in_offset(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy khoản đối trừ.' using errcode = '22023';
  end if;
  update public.trade_in_offsets o set status = 'voided', void_reason = btrim(p_reason) where o.id = p_id and o.version = p_version and o.status = 'posted' returning o.version into v_ver;
  if v_ver is null then
    raise exception 'Khoản đối trừ vừa được cập nhật, đã hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

-- post_voucher: thêm trade_in_id cho phiếu chi xe cũ.
create or replace function public.post_voucher(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select v.id into v_id from public.cash_vouchers v where v.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.cash_vouchers (direction, purpose, account_id, amount, occurred_on, method, payer_kind, counterparty, reference, order_id, reservation_id, trade_in_id, note, client_request_id)
  values (p ->> 'direction', p ->> 'purpose', (p ->> 'account_id')::uuid, (p ->> 'amount')::numeric, (p ->> 'occurred_on')::date, p ->> 'method',
          nullif(p ->> 'payer_kind', ''), coalesce(p ->> 'counterparty', ''), nullif(btrim(p ->> 'reference'), ''), nullif(p ->> 'order_id', '')::uuid,
          nullif(p ->> 'reservation_id', '')::uuid, nullif(p ->> 'trade_in_id', '')::uuid, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select v.id into v_id from public.cash_vouchers v where v.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise;
end $$;

revoke execute on function public.create_trade_in(jsonb) from public, anon;
revoke execute on function public.update_trade_in_draft(uuid, integer, jsonb) from public, anon;
revoke execute on function public.confirm_trade_in(uuid, integer) from public, anon;
revoke execute on function public.cancel_trade_in(uuid, integer, text) from public, anon;
revoke execute on function public.post_trade_in_offset(jsonb) from public, anon;
revoke execute on function public.void_trade_in_offset(uuid, integer, text) from public, anon;
grant execute on function public.create_trade_in(jsonb) to authenticated;
grant execute on function public.update_trade_in_draft(uuid, integer, jsonb) to authenticated;
grant execute on function public.confirm_trade_in(uuid, integer) to authenticated;
grant execute on function public.cancel_trade_in(uuid, integer, text) to authenticated;
grant execute on function public.post_trade_in_offset(jsonb) to authenticated;
grant execute on function public.void_trade_in_offset(uuid, integer, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
