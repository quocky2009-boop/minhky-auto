-- =====================================================================
-- MINH KỲ AUTO — 2000 Chặng 5 (lát 7): quyết toán xe (chia lợi nhuận góp vốn, ký gửi), hoàn vốn, chi trả
--
-- CLAUDE.md §6, §7, §9, §12: quyết toán gồm TẠM TÍNH → KIỂM TRA → PHÊ DUYỆT → THANH TOÁN; kiểm soát nghĩa vụ và tiền thực có trước chi trả;
-- tách hoàn vốn / chia lợi nhuận / đã trả / còn phải trả; không sửa âm thầm bản đã duyệt (chi phí muộn → ĐIỀU CHỈNH có lưu vết); làm tròn khớp tổng.
--  * settlements (QT#####): MỘT quyết toán cho MỘT dòng xe đã bán của đơn bán đã ký. kind = owned (xe sở hữu, chia theo điều khoản góp vốn đã duyệt)
--    hoặc consignment (xe ký gửi, trả chủ xe theo thỏa thuận đã ký). Số liệu đầu vào được CHỤP (inputs) lúc tạm tính; kết quả tính ở DATABASE.
--  * Xe sở hữu:  P = giá bán − giá mua − chi phí được thống nhất trừ trước khi chia;  C = P × tỷ lệ công ty (làm tròn nửa lên);  R = P − C;
--    lợi nhuận bên i = R × tỷ lệ góp vốn (phần dư lớn nhất → tổng luôn bằng R). Hoàn vốn = vốn thực nhận ròng của từng bên. Công ty góp vốn: phần chia theo vốn
--    và phần vận hành tách 2 dòng, không đếm trùng; dòng của chính công ty là nội bộ (không có phiếu chi).
--    Chi phí chung, hoa hồng, lãi vay KHÔNG trừ (D39, D41). Hòa vốn/lỗ KHÔNG áp công thức: cần cách xử lý đã thống nhất trong điều khoản VÀ quản lý nhập số hoàn vốn.
--  * Xe ký gửi: S = giá bán (thu hộ), F = phí showroom hưởng (cố định hoặc % trên giá bán theo thỏa thuận), K = chi phí đã xác nhận do chủ xe chịu.
--    Bên thu tiền = showroom: trả chủ xe S − F − K (âm thì chủ xe còn nợ showroom). Bên thu tiền = chủ xe: chủ xe nộp showroom F + K.
--  * Điều kiện kiểm tra/duyệt (blockers): số liệu đầu vào không đổi từ lúc tạm tính; điều khoản đủ (đã duyệt/đã ký, căn cứ chi phí đã chốt, không "cần xác nhận lại");
--    không còn chi phí dự kiến chưa xác nhận; xe hòa vốn/lỗ đã có cách xử lý; ĐƠN BÁN ĐÃ THU ĐỦ (công nợ = 0) — chưa thu đủ thì chưa duyệt (D81).
--  * Chi trả bằng phiếu thu/chi (loại mới settle_*): chỉ cho quyết toán đã duyệt, đúng dòng, không vượt phần còn lại, chi chỉ khi tài khoản đủ tiền thực có.
--  * Điều chỉnh: quyết toán đã duyệt không sửa. Chi phí muộn/sai sót → "điều chỉnh" = quyết toán mới (supersedes) tính lại; khi duyệt, bản cũ "đã thay thế";
--    số đã chi được chuyển sang bản mới; đã chi vượt phần mới thì không duyệt.
--  * Quyền: kế toán + quản lý tạm tính/kiểm tra/chi trả; chỉ quản lý/admin phê duyệt, nhập xử lý hòa vốn/lỗ, hủy, điều chỉnh. Sales/kỹ thuật không đọc.
-- =====================================================================

create sequence public.settlement_code_seq;

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('QT' || lpad(nextval('public.settlement_code_seq')::text, 5, '0')),
  kind text not null check (kind in ('owned', 'consignment')),
  vehicle_id uuid not null references public.vehicles (id),
  order_id uuid not null references public.sales_orders (id),
  order_line_id uuid not null references public.sales_order_lines (id),
  version_no integer not null default 1 check (version_no >= 1),
  supersedes_id uuid references public.settlements (id),
  adjust_reason text,
  status text not null default 'provisional' check (status in ('provisional', 'checked', 'approved', 'cancelled', 'superseded')),

  inputs jsonb not null,                                   -- ảnh chụp số liệu đầu vào lúc tạm tính (so lại khi kiểm tra/duyệt)
  sale_price numeric(18, 0) not null check (sale_price > 0),
  purchase_price numeric(18, 0),                            -- xe sở hữu
  costs_deducted numeric(18, 0) not null default 0,         -- sở hữu: chi phí trừ trước khi chia; ký gửi: chi phí chủ xe chịu (K)
  distributable numeric(18, 0),                             -- P (xe sở hữu)
  company_rate numeric(7, 4),
  company_operating numeric(18, 0),                         -- C
  remainder numeric(18, 0),                                 -- R
  fee_amount numeric(18, 0),                                -- F (ký gửi)
  result text not null check (result in ('profit', 'no_profit', 'consignment')),
  loss_decision text,                                       -- hòa vốn/lỗ: cách xử lý đã thống nhất (quản lý ghi)
  note text,

  checked_by uuid references public.profiles (id),
  checked_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  end_reason text,
  ended_by uuid references public.profiles (id),
  ended_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint settlements_revision_shape check ((supersedes_id is null and version_no = 1 and adjust_reason is null)
    or (supersedes_id is not null and version_no > 1 and length(btrim(coalesce(adjust_reason, ''))) > 0)),
  constraint settlements_checked_complete check (status not in ('checked', 'approved', 'superseded') or (checked_by is not null and checked_at is not null)),
  constraint settlements_approved_complete check (status not in ('approved', 'superseded') or (approved_by is not null and approved_at is not null)),
  constraint settlements_cancel_complete check (status <> 'cancelled' or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null))
);
-- Mỗi dòng xe: tối đa một bản đang soạn/đã kiểm tra; tối đa một bản đã duyệt hiệu lực (guard).
create unique index settlements_one_open on public.settlements (order_line_id) where status in ('provisional', 'checked');
-- (một bản đã duyệt hiệu lực mỗi dòng xe do guard kiểm dưới khóa 'settle:', vì bản điều chỉnh được duyệt trước khi bản cũ chuyển 'đã thay thế')
create index settlements_vehicle_idx on public.settlements (vehicle_id, created_at desc);
create index settlements_order_idx on public.settlements (order_id);

create table public.settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements (id),
  line_no integer not null,
  kind text not null check (kind in ('capital_return', 'profit_share', 'company_operating', 'sale_collected', 'fee', 'owner_cost', 'owner_payout', 'owner_receivable')),
  party_id uuid references public.capital_parties (id),
  label text not null,
  amount numeric(18, 0) not null check (amount >= 0),
  direction text not null check (direction in ('out', 'in', 'none')),     -- out: showroom chi; in: showroom thu; none: ghi nhận/nội bộ, không có phiếu
  note text,
  constraint settlement_lines_key unique (settlement_id, line_no)
);
create index settlement_lines_settlement_idx on public.settlement_lines (settlement_id);

create trigger settlements_touch before update on public.settlements for each row execute function private.touch_row();
create trigger settlements_audit after insert or update on public.settlements for each row execute function private.audit_row();
create trigger settlement_lines_audit after insert or update on public.settlement_lines for each row execute function private.audit_row();

-- Phiếu chi/thu quyết toán gắn một dòng nghĩa vụ.
alter table public.cash_vouchers add column settlement_line_id uuid references public.settlement_lines (id);
create index cash_vouchers_settlement_line_idx on public.cash_vouchers (settlement_line_id) where settlement_line_id is not null;
alter table public.cash_vouchers drop constraint cash_vouchers_purpose_check;
alter table public.cash_vouchers drop constraint voucher_direction_purpose;
alter table public.cash_vouchers drop constraint voucher_links;
alter table public.cash_vouchers add constraint cash_vouchers_purpose_check check (purpose in
  ('sale_deposit', 'sale_payment', 'other_income', 'deposit_refund', 'sale_refund', 'general_expense', 'other_expense', 'tradein_payout', 'tradein_loan_payoff',
   'settle_capital_return', 'settle_profit_payout', 'settle_owner_payout', 'settle_owner_receipt'));
alter table public.cash_vouchers add constraint voucher_direction_purpose check (
  (direction = 'in' and purpose in ('sale_deposit', 'sale_payment', 'other_income', 'settle_owner_receipt'))
  or (direction = 'out' and purpose in ('deposit_refund', 'sale_refund', 'general_expense', 'other_expense', 'tradein_payout', 'tradein_loan_payoff',
                                         'settle_capital_return', 'settle_profit_payout', 'settle_owner_payout')));
alter table public.cash_vouchers add constraint voucher_links check (
  (purpose in ('sale_deposit', 'deposit_refund') and reservation_id is not null and order_id is null and trade_in_id is null and settlement_line_id is null)
  or (purpose in ('sale_payment', 'sale_refund') and order_id is not null and reservation_id is null and trade_in_id is null and settlement_line_id is null)
  or (purpose in ('tradein_payout', 'tradein_loan_payoff') and trade_in_id is not null and order_id is null and reservation_id is null and settlement_line_id is null)
  or (purpose in ('settle_capital_return', 'settle_profit_payout', 'settle_owner_payout', 'settle_owner_receipt') and settlement_line_id is not null and order_id is null and reservation_id is null and trade_in_id is null)
  or (purpose in ('other_income', 'general_expense', 'other_expense') and order_id is null and reservation_id is null and trade_in_id is null and settlement_line_id is null));

-- ---------------------------------------------------------------------
-- Số liệu đầu vào của quyết toán (ảnh chụp) và tiền đã chi theo nghĩa vụ
-- ---------------------------------------------------------------------
create or replace function private.settlement_inputs(p_line uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare l public.sales_order_lines; v public.vehicles; t public.vehicle_capital_terms; ct public.consignment_terms; k public.consignment_contracts;
        v_price numeric; v_confirmed numeric; v_confirmed_n integer; v_open integer; v_shares jsonb; v_reconfirm boolean;
begin
  select * into l from public.sales_order_lines x where x.id = p_line;
  if l.id is null then
    raise exception 'Không tìm thấy dòng xe của đơn bán hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
  select * into v from public.vehicles x where x.id = l.vehicle_id;
  if v.business_type = 'owned' then
    select * into t from public.vehicle_capital_terms x where x.vehicle_id = v.id and x.status = 'approved';
    if t.id is null then
      raise exception 'Xe chưa có điều khoản chia lợi nhuận được duyệt: chưa tạm tính quyết toán được.' using errcode = '22023';
    end if;
    select f.purchase_price into v_price from public.vehicle_financials f where f.vehicle_id = v.id;
    select coalesce(sum(c.confirmed_amount) filter (where c.status = 'confirmed'), 0), count(*) filter (where c.status = 'confirmed')::integer, count(*) filter (where c.status = 'estimated')::integer
      into v_confirmed, v_confirmed_n, v_open from public.vehicle_costs c where c.vehicle_id = v.id and c.borne_by = 'showroom';
    select coalesce(s.needs_reconfirm, false) into v_reconfirm from public.vehicle_capital_status s where s.vehicle_id = v.id;
    select coalesce(jsonb_agg(jsonb_build_object('party_id', sh.party_id, 'name', p.name, 'kind', p.kind, 'ratio', sh.ratio_percent::text,
             'net_received', coalesce(sm.net_received, 0)::text) order by p.code, sh.party_id), '[]'::jsonb)
      into v_shares
      from public.vehicle_capital_shares sh join public.capital_parties p on p.id = sh.party_id
      left join public.vehicle_capital_summary sm on sm.vehicle_id = v.id and sm.party_id = sh.party_id
      where sh.terms_id = t.id;
    return jsonb_build_object('kind', 'owned', 'sale_price', l.sale_price::text, 'purchase_price', v_price::text, 'terms_id', t.id, 'company_rate', t.company_rate::text,
      'cost_basis', t.cost_basis, 'loss_policy_set', length(btrim(coalesce(t.loss_policy, ''))) > 0, 'needs_reconfirm', coalesce(v_reconfirm, false),
      'shares', v_shares, 'costs_confirmed', v_confirmed::text, 'confirmed_lines', v_confirmed_n, 'open_lines', v_open);
  elsif v.business_type = 'consignment' then
    select * into k from public.consignment_contracts c where c.vehicle_id = v.id and c.status = 'active';
    if k.id is null then
      raise exception 'Xe ký gửi chưa có hợp đồng ký gửi hiệu lực: chưa tạm tính quyết toán được.' using errcode = '22023';
    end if;
    select x.* into ct from public.consignment_terms x where x.contract_id = k.id and x.signed_on is not null order by x.version_no desc limit 1;
    if ct.id is null then
      raise exception 'Xe ký gửi chưa có thỏa thuận đã ký: chưa tạm tính quyết toán được.' using errcode = '22023';
    end if;
    select coalesce(sum(c.confirmed_amount) filter (where c.status = 'confirmed'), 0), count(*) filter (where c.status = 'confirmed')::integer, count(*) filter (where c.status = 'estimated')::integer
      into v_confirmed, v_confirmed_n, v_open from public.vehicle_costs c where c.vehicle_id = v.id and c.borne_by = 'owner';
    return jsonb_build_object('kind', 'consignment', 'sale_price', l.sale_price::text, 'terms_id', ct.id, 'fee_type', ct.fee_type, 'fee_fixed', ct.fee_fixed_amount::text,
      'fee_percent', ct.fee_percent::text, 'collector', ct.payment_collector, 'owner_name', k.owner_name, 'costs_confirmed', v_confirmed::text,
      'confirmed_lines', v_confirmed_n, 'open_lines', v_open);
  end if;
  raise exception 'Loại xe không hỗ trợ quyết toán.' using errcode = '22023';
end $$;

-- Tiền đã chi/thu của một nghĩa vụ (gom theo dòng xe + loại + bên, qua các bản điều chỉnh). SECURITY DEFINER hẹp, chỉ trả số.
create or replace function private.settlement_line_paid(p_line uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(v.amount), 0)
  from public.settlement_lines l join public.settlements s on s.id = l.settlement_id
  join public.settlements vs on vs.order_line_id = s.order_line_id
  join public.settlement_lines vl on vl.settlement_id = vs.id and vl.kind = l.kind and vl.party_id is not distinct from l.party_id
  join public.cash_vouchers v on v.settlement_line_id = vl.id and v.status = 'posted'
  where l.id = p_line
$$;

-- Điều kiện còn thiếu trước khi KIỂM TRA / PHÊ DUYỆT. Rỗng = đủ điều kiện.
create or replace function private.settlement_blockers(p_id uuid, p_for_approval boolean)
returns text[] language plpgsql stable set search_path = '' as $$
declare s public.settlements; cur jsonb; out text[] := '{}';
begin
  select * into s from public.settlements x where x.id = p_id;
  if s.id is null then return out; end if;
  cur := private.settlement_inputs(s.order_line_id);
  if cur is distinct from s.inputs then
    out := array_append(out, 'Số liệu đầu vào đã thay đổi từ lúc tạm tính (giá bán, giá mua, chi phí, vốn góp hoặc điều khoản). Hủy và tạm tính lại; nếu đã duyệt thì lập điều chỉnh.');
  end if;
  if s.kind = 'owned' then
    if cur ->> 'cost_basis' is null then out := array_append(out, 'Chưa chốt căn cứ chi phí được trừ trước khi chia.'); end if;
    if cur ->> 'cost_basis' = 'selected_costs' then out := array_append(out, 'Căn cứ “chỉ các khoản được chọn” chưa hỗ trợ.'); end if;
    if (cur ->> 'needs_reconfirm')::boolean then out := array_append(out, 'Vốn góp thay đổi sau khi duyệt: cần xác nhận lại căn cứ phân chia hoặc duyệt phiên bản mới.'); end if;
    if s.result = 'no_profit' then
      if not (cur ->> 'loss_policy_set')::boolean then out := array_append(out, 'Xe hòa vốn/lỗ: điều khoản chưa có cách xử lý được thống nhất.'); end if;
      if length(btrim(coalesce(s.loss_decision, ''))) = 0 then out := array_append(out, 'Xe hòa vốn/lỗ: quản lý chưa ghi cách xử lý và số hoàn vốn cho từng bên.'); end if;
    end if;
  end if;
  if (cur ->> 'open_lines')::integer > 0 then
    out := array_append(out, format('Còn %s khoản chi phí dự kiến chưa xác nhận hoặc hủy.', cur ->> 'open_lines'));
  end if;
  if p_for_approval and private.order_outstanding(s.order_id) > 0 then
    out := array_append(out, 'Đơn bán chưa thu đủ tiền: chưa phê duyệt quyết toán.');
  end if;
  return out;
end $$;

-- ---------------------------------------------------------------------
-- Tạm tính (một nguồn tính tiền ở database)
-- ---------------------------------------------------------------------
create or replace function private.settlement_create(p_line uuid, p_request uuid, p_supersedes uuid, p_reason text, p_note text)
returns uuid language plpgsql set search_path = '' as $$
declare
  l public.sales_order_lines; o public.sales_orders; v public.vehicles; old public.settlements; inp jsonb; v_id uuid; v_no integer := 1;
  sale numeric; purchase numeric; costs numeric := 0; p numeric; c numeric; r numeric; rate numeric; basis text; n integer; i integer; ordn integer;
  shares jsonb; sh jsonb; exact numeric[]; flo numeric[]; fra numeric[]; amt numeric[]; leftover numeric; total_ratio numeric := 0; k integer; ln integer := 0;
  fee numeric; owner_net numeric; collector text; ownername text; v_kind text;
begin
  if not (private.can_see_finance() or private.is_system()) then
    raise exception 'Chỉ kế toán hoặc quản lý được tạm tính quyết toán.' using errcode = '42501';
  end if;
  select * into l from public.sales_order_lines x where x.id = p_line;
  if l.id is null then
    raise exception 'Không tìm thấy dòng xe của đơn bán hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('settle:' || l.id::text, 0));
  if l.line_status <> 'active' then
    raise exception 'Dòng xe này không còn hiệu lực trong đơn bán.' using errcode = '22023';
  end if;
  select * into o from public.sales_orders x where x.id = l.order_id;
  select * into v from public.vehicles x where x.id = l.vehicle_id;
  if o.status <> 'confirmed' then
    raise exception 'Chỉ quyết toán cho đơn bán đã ký hợp đồng.' using errcode = '22023';
  end if;
  if v.sale_status not in ('sold', 'delivered') then
    raise exception 'Xe chưa ở trạng thái đã bán/đã giao.' using errcode = '22023';
  end if;
  if p_supersedes is null then
    if exists (select 1 from public.settlements s where s.order_line_id = l.id and s.status in ('approved', 'superseded')) then
      raise exception 'Xe này đã có quyết toán đã duyệt. Dùng "điều chỉnh" (ghi lý do) thay vì tạo mới.' using errcode = '22023';
    end if;
  else
    select * into old from public.settlements s where s.id = p_supersedes;
    if old.id is null or old.order_line_id <> l.id or old.status <> 'approved' then
      raise exception 'Chỉ điều chỉnh quyết toán ĐÃ DUYỆT còn hiệu lực của đúng dòng xe này.' using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_reason, ''))) = 0 then
      raise exception 'Ghi lý do điều chỉnh quyết toán (ví dụ chi phí phát sinh muộn).' using errcode = '22023';
    end if;
    v_no := old.version_no + 1;
  end if;

  inp := private.settlement_inputs(l.id);
  sale := l.sale_price;
  v_kind := inp ->> 'kind';

  if v_kind = 'owned' then
    purchase := nullif(inp ->> 'purchase_price', '')::numeric;
    basis := inp ->> 'cost_basis';
    rate := (inp ->> 'company_rate')::numeric;
    if purchase is null then
      raise exception 'Xe chưa có giá mua: chưa tạm tính được (không coi thiếu là 0).' using errcode = '22023';
    end if;
    if basis is null then
      raise exception 'Chưa chốt căn cứ chi phí được trừ trước khi chia: chưa tạm tính được.' using errcode = '22023';
    end if;
    if basis = 'selected_costs' then
      raise exception 'Căn cứ “chỉ các khoản được chọn” chưa hỗ trợ: chưa tạm tính được.' using errcode = '22023';
    end if;
    if basis = 'all_confirmed_costs' then
      if (inp ->> 'confirmed_lines')::integer = 0 then
        raise exception 'Chưa có chi phí đã xác nhận của xe: chưa tạm tính được. Nếu xe không phát sinh chi phí, ghi một khoản chi phí xác nhận 0 đồng.' using errcode = '22023';
      end if;
      costs := (inp ->> 'costs_confirmed')::numeric;
    end if;
    p := sale - purchase - costs;
    shares := inp -> 'shares';
    n := jsonb_array_length(shares);
    if n = 0 then
      raise exception 'Điều khoản chưa có bên chia lợi nhuận.' using errcode = '22023';
    end if;
    for i in 0 .. n - 1 loop total_ratio := total_ratio + (shares -> i ->> 'ratio')::numeric; end loop;
    if total_ratio <> 100 then
      raise exception 'Tổng tỷ lệ chia của điều khoản không bằng 100%%.' using errcode = '22023';
    end if;

    if p > 0 then
      c := round(p * rate / 100, 0);                                  -- nửa lên (P > 0)
      r := p - c;
      exact := '{}'; flo := '{}'; fra := '{}'; amt := '{}';
      for i in 0 .. n - 1 loop
        exact := exact || (r * ((shares -> i ->> 'ratio')::numeric * 10000));
        flo := flo || trunc(exact[i + 1] / 1000000);
        fra := fra || (exact[i + 1] - flo[i + 1] * 1000000);
        amt := amt || flo[i + 1];
      end loop;
      leftover := r - (select coalesce(sum(x), 0) from unnest(flo) x);
      -- phần dư lớn nhất: phần lẻ lớn nhất trước; bằng nhau thì theo thứ tự bên (mã bên góp vốn GV####, tức thứ tự tạo)
      for k in select ord from (select ord::integer from generate_series(1, n) ord) g order by fra[g.ord] desc, g.ord limit leftover::integer loop
        amt[k] := amt[k] + 1;
      end loop;
    end if;
    insert into public.settlements (kind, vehicle_id, order_id, order_line_id, version_no, supersedes_id, adjust_reason, inputs, sale_price, purchase_price, costs_deducted,
                                    distributable, company_rate, company_operating, remainder, result, note, client_request_id)
    values ('owned', v.id, o.id, l.id, v_no, p_supersedes, nullif(btrim(p_reason), ''), inp, sale, purchase, costs, p, rate, case when p > 0 then c end, case when p > 0 then r end, case when p > 0 then 'profit' else 'no_profit' end, nullif(btrim(p_note), ''), p_request)
    returning id into v_id;


    if p > 0 then
      ln := ln + 1;
      insert into public.settlement_lines (settlement_id, line_no, kind, party_id, label, amount, direction, note)
      values (v_id, ln, 'company_operating', null, 'Phần công ty cho vận hành', c, 'none', 'Bù vận hành; không trừ thêm chi phí chung trước khi chia');
      for i in 0 .. n - 1 loop
        sh := shares -> i;
        ln := ln + 1;
        insert into public.settlement_lines (settlement_id, line_no, kind, party_id, label, amount, direction)
        values (v_id, ln, 'profit_share', (sh ->> 'party_id')::uuid, sh ->> 'name', amt[i + 1],
                case when sh ->> 'kind' <> 'company' and amt[i + 1] > 0 then 'out' else 'none' end);
      end loop;
      for i in 0 .. n - 1 loop
        sh := shares -> i;
        if (sh ->> 'net_received')::numeric > 0 then
          ln := ln + 1;
          insert into public.settlement_lines (settlement_id, line_no, kind, party_id, label, amount, direction)
          values (v_id, ln, 'capital_return', (sh ->> 'party_id')::uuid, sh ->> 'name', (sh ->> 'net_received')::numeric, case when sh ->> 'kind' <> 'company' then 'out' else 'none' end);
        end if;
      end loop;
    else
      -- hòa vốn/lỗ: KHÔNG áp công thức; dòng hoàn vốn để 0 chờ quản lý nhập theo cách xử lý đã thống nhất
      for i in 0 .. n - 1 loop
        sh := shares -> i;
        if (sh ->> 'net_received')::numeric > 0 then
          ln := ln + 1;
          insert into public.settlement_lines (settlement_id, line_no, kind, party_id, label, amount, direction, note)
          values (v_id, ln, 'capital_return', (sh ->> 'party_id')::uuid, sh ->> 'name', 0, 'none', 'Chờ quản lý nhập số hoàn vốn theo cách xử lý hòa vốn/lỗ');
        end if;
      end loop;
    end if;
    return v_id;
  end if;

  -- ký gửi
  collector := inp ->> 'collector';
  ownername := inp ->> 'owner_name';
  fee := private.consignment_fee(inp ->> 'fee_type', nullif(inp ->> 'fee_fixed', '')::numeric, nullif(inp ->> 'fee_percent', '')::numeric, sale);
  costs := (inp ->> 'costs_confirmed')::numeric;
  if fee > sale then
    raise exception 'Phí ký gửi lớn hơn giá bán: kiểm tra lại thỏa thuận.' using errcode = '22023';
  end if;
  insert into public.settlements (kind, vehicle_id, order_id, order_line_id, version_no, supersedes_id, adjust_reason, inputs, sale_price, costs_deducted, fee_amount, result, note, client_request_id)
  values ('consignment', v.id, o.id, l.id, v_no, p_supersedes, nullif(btrim(p_reason), ''), inp, sale, costs, fee, 'consignment', nullif(btrim(p_note), ''), p_request)
  returning id into v_id;
  insert into public.settlement_lines (settlement_id, line_no, kind, party_id, label, amount, direction, note) values
    (v_id, 1, 'sale_collected', null, 'Giá bán (thu hộ chủ xe)', sale, 'none', case when collector = 'owner' then 'Chủ xe thu tiền từ người mua' else 'Showroom thu tiền từ người mua' end),
    (v_id, 2, 'fee', null, 'Phí ký gửi showroom hưởng', fee, 'none', null),
    (v_id, 3, 'owner_cost', null, 'Chi phí đã xác nhận do chủ xe chịu (khấu trừ)', costs, 'none', null);
  if collector = 'showroom' then
    owner_net := sale - fee - costs;
    if owner_net > 0 then
      insert into public.settlement_lines (settlement_id, line_no, kind, label, amount, direction, note) values (v_id, 4, 'owner_payout', ownername, owner_net, 'out', 'Trả chủ xe = giá bán − phí − chi phí chủ xe chịu');
    elsif owner_net < 0 then
      insert into public.settlement_lines (settlement_id, line_no, kind, label, amount, direction, note) values (v_id, 4, 'owner_receivable', ownername, -owner_net, 'in', 'Chủ xe còn nợ showroom (chi phí chủ xe chịu lớn hơn phần còn lại)');
    end if;
  else
    insert into public.settlement_lines (settlement_id, line_no, kind, label, amount, direction, note) values (v_id, 4, 'owner_receivable', ownername, fee + costs, 'in', 'Chủ xe nộp showroom: phí ký gửi + chi phí chủ xe chịu');
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.settlements_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_blockers text[]; v_bad text; r record; v_new numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa quyết toán. Hủy (có lý do) hoặc điều chỉnh.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Chỉ kế toán hoặc quản lý được tạm tính quyết toán.' using errcode = '42501';
    end if;
    if new.status <> 'provisional' or new.checked_at is not null or new.approved_at is not null then
      raise exception 'Quyết toán mới phải ở trạng thái tạm tính.' using errcode = '22023';
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if (new.code, new.kind, new.vehicle_id, new.order_id, new.order_line_id, new.version_no, new.supersedes_id, new.adjust_reason, new.inputs, new.sale_price, new.purchase_price,
      new.costs_deducted, new.distributable, new.company_rate, new.company_operating, new.remainder, new.fee_amount, new.result, new.created_by, new.created_at)
     is distinct from (old.code, old.kind, old.vehicle_id, old.order_id, old.order_line_id, old.version_no, old.supersedes_id, old.adjust_reason, old.inputs, old.sale_price, old.purchase_price,
      old.costs_deducted, old.distributable, old.company_rate, old.company_operating, old.remainder, old.fee_amount, old.result, old.created_by, old.created_at) then
    raise exception 'Không sửa số liệu quyết toán đã tính. Hủy và tạm tính lại, hoặc lập điều chỉnh nếu đã duyệt.' using errcode = '22023';
  end if;
  if old.status in ('cancelled', 'superseded') then
    raise exception 'Quyết toán đã kết thúc (đã hủy/đã thay thế), không sửa.' using errcode = '22023';
  end if;
  if new.loss_decision is distinct from old.loss_decision then
    if old.status <> 'provisional' or not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý ghi cách xử lý hòa vốn/lỗ, khi quyết toán còn tạm tính.' using errcode = '42501';
    end if;
  end if;
  if new.status = old.status then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('settle:' || old.order_line_id::text, 0));
  if new.status = 'checked' then
    if old.status <> 'provisional' then
      raise exception 'Chỉ kiểm tra được quyết toán đang tạm tính.' using errcode = '22023';
    end if;
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Chỉ kế toán hoặc quản lý được kiểm tra quyết toán.' using errcode = '42501';
    end if;
    v_blockers := private.settlement_blockers(old.id, false);
    if array_length(v_blockers, 1) > 0 then
      raise exception 'Chưa kiểm tra được quyết toán: %', array_to_string(v_blockers, ' ') using errcode = '22023';
    end if;
    if not private.is_system() then new.checked_by := (select auth.uid()); end if;
    new.checked_at := now();
    return new;
  end if;
  if new.status = 'approved' then
    if old.status <> 'checked' then
      raise exception 'Chỉ phê duyệt quyết toán đã được kiểm tra.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý/admin được phê duyệt quyết toán.' using errcode = '42501';
    end if;
    v_blockers := private.settlement_blockers(old.id, true);
    if array_length(v_blockers, 1) > 0 then
      raise exception 'Chưa phê duyệt được quyết toán: %', array_to_string(v_blockers, ' ') using errcode = '22023';
    end if;
    if exists (select 1 from public.settlements s where s.order_line_id = old.order_line_id and s.status = 'approved' and s.id is distinct from old.supersedes_id) then
      raise exception 'Dòng xe này đã có quyết toán đã duyệt còn hiệu lực. Dùng điều chỉnh.' using errcode = '22023';
    end if;
    if old.supersedes_id is not null then
      -- điều chỉnh: số đã chi theo bản cũ không được vượt nghĩa vụ mới của cùng bên/loại
      for r in select l.id as old_line, l.kind, l.party_id, l.label from public.settlement_lines l where l.settlement_id = old.supersedes_id and l.direction <> 'none' loop
        select coalesce(sum(n.amount), 0) into v_new from public.settlement_lines n where n.settlement_id = old.id and n.kind = r.kind and n.party_id is not distinct from r.party_id and n.direction <> 'none';
        if private.settlement_line_paid(r.old_line) > v_new then
          v_bad := coalesce(v_bad || ', ', '') || r.label;
        end if;
      end loop;
      if v_bad is not null then
        raise exception 'Đã chi vượt nghĩa vụ mới theo bản điều chỉnh (%). Hủy các phiếu liên quan hoặc xử lý trước khi duyệt.', v_bad using errcode = '22023';
      end if;
    end if;
    if not private.is_system() then new.approved_by := (select auth.uid()); end if;
    new.approved_at := now();
    return new;
  end if;
  if new.status = 'superseded' then
    if old.status <> 'approved' or not exists (select 1 from public.settlements s where s.supersedes_id = old.id and s.status = 'approved') then
      raise exception 'Quyết toán chỉ được thay thế khi bản điều chỉnh đã duyệt.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.status = 'cancelled' then
    if length(btrim(coalesce(new.end_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy quyết toán.' using errcode = '22023';
    end if;
    if old.status = 'approved' then
      if not (private.is_manager() or private.is_system()) then
        raise exception 'Chỉ quản lý được hủy quyết toán đã duyệt.' using errcode = '42501';
      end if;
      if exists (select 1 from public.settlement_lines l join public.cash_vouchers v on v.settlement_line_id = l.id and v.status = 'posted' where l.settlement_id = old.id) then
        raise exception 'Quyết toán đã có phiếu chi/thu. Hủy các phiếu liên quan trước, hoặc lập điều chỉnh.' using errcode = '22023';
      end if;
    elsif not (private.is_manager() or private.is_system() or old.created_by = (select auth.uid())) then
      raise exception 'Chỉ người tạo hoặc quản lý được hủy quyết toán đang soạn.' using errcode = '42501';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  raise exception 'Không thể chuyển quyết toán từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger settlements_guard before insert or update or delete on public.settlements for each row execute function private.settlements_guard();

create or replace function private.settlement_lines_guard()
returns trigger language plpgsql set search_path = '' as $$
declare s public.settlements;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa dòng quyết toán.' using errcode = '22023';
  end if;
  select * into s from public.settlements x where x.id = new.settlement_id;
  if s.id is null then
    raise exception 'Không tìm thấy quyết toán hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if s.status <> 'provisional' then
      raise exception 'Chỉ thêm dòng vào quyết toán đang tạm tính.' using errcode = '22023';
    end if;
    return new;
  end if;
  if (new.settlement_id, new.line_no, new.kind, new.party_id, new.label) is distinct from (old.settlement_id, old.line_no, old.kind, old.party_id, old.label) then
    raise exception 'Không đổi dòng quyết toán đã tính.' using errcode = '22023';
  end if;
  if (new.amount, new.direction, new.note) is not distinct from (old.amount, old.direction, old.note) then return new; end if;
  -- chỉ số hoàn vốn của xe hòa vốn/lỗ do QUẢN LÝ nhập khi còn tạm tính
  if not (s.status = 'provisional' and s.result = 'no_profit' and old.kind = 'capital_return' and (private.is_manager() or private.is_system())) then
    raise exception 'Không sửa số tiền của dòng quyết toán. Hủy và tạm tính lại, hoặc lập điều chỉnh.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger settlement_lines_guard before insert or update or delete on public.settlement_lines for each row execute function private.settlement_lines_guard();

-- Phiếu thu/chi: thêm 4 loại phiếu quyết toán. Hàm cũ giữ nguyên, chỉ thêm nhánh quyết toán.
create or replace function private.cash_vouchers_guard()
returns trigger language plpgsql set search_path = '' as $$
declare a public.money_accounts; o public.sales_orders; r public.vehicle_reservations; t public.trade_ins; sl public.settlement_lines; st public.settlements; v_have numeric; v_name text;
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
    elsif new.purpose in ('settle_capital_return', 'settle_profit_payout', 'settle_owner_payout', 'settle_owner_receipt') then
      select * into sl from public.settlement_lines x where x.id = new.settlement_line_id;
      if sl.id is null then
        raise exception 'Không tìm thấy dòng nghĩa vụ quyết toán.' using errcode = '22023';
      end if;
      select * into st from public.settlements x where x.id = sl.settlement_id;
      perform pg_advisory_xact_lock(hashtextextended('settle:' || st.order_line_id::text, 0));
      select * into st from public.settlements x where x.id = sl.settlement_id;
      if st.status <> 'approved' then
        raise exception 'Chỉ chi/thu theo quyết toán đã được phê duyệt còn hiệu lực.' using errcode = '22023';
      end if;
      if (new.purpose = 'settle_capital_return' and sl.kind <> 'capital_return') or (new.purpose = 'settle_profit_payout' and sl.kind <> 'profit_share')
         or (new.purpose = 'settle_owner_payout' and sl.kind <> 'owner_payout') or (new.purpose = 'settle_owner_receipt' and sl.kind <> 'owner_receivable') then
        raise exception 'Loại phiếu không khớp dòng nghĩa vụ của quyết toán.' using errcode = '22023';
      end if;
      if sl.direction = 'none' or sl.direction <> new.direction then
        raise exception 'Dòng này không có tiền thật phải chi/thu (hoặc sai hướng thu/chi).' using errcode = '22023';
      end if;
      if new.counterparty = '' then new.counterparty := sl.label; end if;
      if new.amount > sl.amount - private.settlement_line_paid(sl.id) then
        raise exception 'Số tiền vượt phần còn lại của nghĩa vụ quyết toán (đã trừ số đã chi/thu).' using errcode = '22023';
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
      new.order_id, new.reservation_id, new.trade_in_id, new.settlement_line_id, new.note, new.created_by, new.created_at)
     is distinct from (old.code, old.direction, old.purpose, old.account_id, old.amount, old.occurred_on, old.method, old.payer_kind, old.counterparty, old.reference,
      old.order_id, old.reservation_id, old.trade_in_id, old.settlement_line_id, old.note, old.created_by, old.created_at) then
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
-- RLS: kế toán + quản lý; sales/kỹ thuật không đọc. Không xóa.
-- ---------------------------------------------------------------------
alter table public.settlements enable row level security;
alter table public.settlement_lines enable row level security;
create policy settlements_select on public.settlements for select to authenticated using (private.can_see_finance());
create policy settlements_insert on public.settlements for insert to authenticated with check (private.can_see_finance());
create policy settlements_update on public.settlements for update to authenticated using (private.can_see_finance()) with check (private.can_see_finance());
create policy settlement_lines_select on public.settlement_lines for select to authenticated using (private.can_see_finance());
create policy settlement_lines_insert on public.settlement_lines for insert to authenticated with check (private.can_see_finance());
create policy settlement_lines_update on public.settlement_lines for update to authenticated using (private.is_manager()) with check (private.is_manager());
revoke delete, truncate on public.settlements, public.settlement_lines from authenticated, anon;
revoke all on public.settlements, public.settlement_lines from anon;

-- Nghĩa vụ chi/thu của quyết toán đã duyệt: số tiền, đã chi/thu, còn lại.
create view public.settlement_balances with (security_invoker = true) as
select s.id as settlement_id, s.code, s.kind, s.vehicle_id, l.id as line_id, l.line_no, l.kind as line_kind, l.party_id, l.label, l.direction, l.amount,
       private.settlement_line_paid(l.id) as paid, l.amount - private.settlement_line_paid(l.id) as remaining
from public.settlements s join public.settlement_lines l on l.settlement_id = s.id
where s.status = 'approved' and l.direction <> 'none' and private.can_see_finance();
revoke all on public.settlement_balances from anon;
grant select on public.settlement_balances to authenticated;

-- ---------------------------------------------------------------------
-- RPC. Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_settlement(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select s.id into v_id from public.settlements s where s.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  return private.settlement_create((p ->> 'order_line_id')::uuid, v_request, null, null, p ->> 'note');
exception when unique_violation then
  select s.id into v_id from public.settlements s where s.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Dòng xe này đang có một quyết toán tạm tính/đã kiểm tra. Hủy bản đó nếu muốn tính lại.' using errcode = '22023';
end $$;

create or replace function public.revise_settlement(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; old public.settlements;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được lập điều chỉnh quyết toán.' using errcode = '42501';
  end if;
  select s.id into v_id from public.settlements s where s.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  select * into old from public.settlements s where s.id = (p ->> 'settlement_id')::uuid;
  if old.id is null then
    raise exception 'Không tìm thấy quyết toán.' using errcode = '22023';
  end if;
  return private.settlement_create(old.order_line_id, v_request, old.id, p ->> 'reason', p ->> 'note');
exception when unique_violation then
  select s.id into v_id from public.settlements s where s.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Đã có một bản điều chỉnh đang soạn cho quyết toán này.' using errcode = '22023';
end $$;

-- Xe hòa vốn/lỗ: quản lý ghi cách xử lý đã thống nhất + số hoàn vốn từng bên (0 .. vốn thực nhận ròng). Không áp công thức chia lãi.
create or replace function public.set_settlement_loss(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare s public.settlements; e jsonb; v_ver integer; v_net numeric; v_amt numeric; l public.settlement_lines;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý ghi cách xử lý hòa vốn/lỗ.' using errcode = '42501';
  end if;
  select * into s from public.settlements x where x.id = p_id and x.version = p_version and x.status = 'provisional' and x.result = 'no_profit';
  if s.id is null then
    raise exception 'Quyết toán vừa được cập nhật, không phải hòa vốn/lỗ đang tạm tính hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  if length(btrim(coalesce(p ->> 'decision', ''))) = 0 then
    raise exception 'Ghi cách xử lý hòa vốn/lỗ đã thống nhất.' using errcode = '22023';
  end if;
  for l in select * from public.settlement_lines x where x.settlement_id = p_id and x.kind = 'capital_return' loop
    v_amt := 0;
    for e in select * from jsonb_array_elements(coalesce(p -> 'returns', '[]'::jsonb)) loop
      if (e ->> 'party_id')::uuid = l.party_id then v_amt := (e ->> 'amount')::numeric; end if;
    end loop;
    select (x ->> 'net_received')::numeric into v_net from jsonb_array_elements(s.inputs -> 'shares') x where (x ->> 'party_id')::uuid = l.party_id;
    if v_amt < 0 or v_amt > coalesce(v_net, 0) then
      raise exception 'Số hoàn vốn của % phải từ 0 đến vốn thực nhận ròng (%).', l.label, coalesce(v_net, 0)::bigint using errcode = '22023';
    end if;
    update public.settlement_lines x set amount = v_amt, note = 'Hoàn vốn theo cách xử lý hòa vốn/lỗ do quản lý ghi',
      direction = case when v_amt > 0 and exists (select 1 from public.capital_parties cp where cp.id = l.party_id and cp.kind <> 'company') then 'out' else 'none' end
    where x.id = l.id;
  end loop;
  update public.settlements x set loss_decision = btrim(p ->> 'decision') where x.id = p_id returning x.version into v_ver;
  return v_ver;
end $$;

create or replace function public.check_settlement(p_id uuid, p_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.settlements s set status = 'checked' where s.id = p_id and s.version = p_version and s.status = 'provisional' returning s.version into v_ver;
  if v_ver is null then
    raise exception 'Quyết toán vừa được cập nhật, không còn đang tạm tính hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.approve_settlement(p_id uuid, p_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer; v_sup uuid;
begin
  update public.settlements s set status = 'approved' where s.id = p_id and s.version = p_version and s.status = 'checked' returning s.version, s.supersedes_id into v_ver, v_sup;
  if v_ver is null then
    raise exception 'Quyết toán vừa được cập nhật, chưa được kiểm tra hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  if v_sup is not null then
    update public.settlements s set status = 'superseded' where s.id = v_sup and s.status = 'approved';
  end if;
  return v_ver;
end $$;

create or replace function public.cancel_settlement(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy quyết toán.' using errcode = '22023';
  end if;
  update public.settlements s set status = 'cancelled', end_reason = btrim(p_reason) where s.id = p_id and s.version = p_version and s.status in ('provisional', 'checked', 'approved') returning s.version into v_ver;
  if v_ver is null then
    raise exception 'Quyết toán vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

-- Điều kiện còn thiếu (cho giao diện): chỉ tài chính gọi được.
create or replace function public.settlement_blockers(p_id uuid, p_for_approval boolean default true)
returns text[] language sql stable security invoker set search_path = '' as $$
  select case when private.can_see_finance() then private.settlement_blockers(p_id, p_for_approval) else '{}'::text[] end
$$;

-- Quyết toán đã duyệt có lỗi thời không (số liệu đầu vào thay đổi sau khi duyệt, ví dụ chi phí muộn) → cần điều chỉnh.
create or replace function public.settlement_is_stale(p_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when private.can_see_finance() then (select private.settlement_inputs(s.order_line_id) is distinct from s.inputs from public.settlements s where s.id = p_id) else false end
$$;

-- post_voucher: thêm settlement_line_id.
create or replace function public.post_voucher(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select v.id into v_id from public.cash_vouchers v where v.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.cash_vouchers (direction, purpose, account_id, amount, occurred_on, method, payer_kind, counterparty, reference, order_id, reservation_id, trade_in_id, settlement_line_id, note, client_request_id)
  values (p ->> 'direction', p ->> 'purpose', (p ->> 'account_id')::uuid, (p ->> 'amount')::numeric, (p ->> 'occurred_on')::date, p ->> 'method',
          nullif(p ->> 'payer_kind', ''), coalesce(p ->> 'counterparty', ''), nullif(btrim(p ->> 'reference'), ''), nullif(p ->> 'order_id', '')::uuid,
          nullif(p ->> 'reservation_id', '')::uuid, nullif(p ->> 'trade_in_id', '')::uuid, nullif(p ->> 'settlement_line_id', '')::uuid, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select v.id into v_id from public.cash_vouchers v where v.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise;
end $$;

revoke execute on function public.create_settlement(jsonb) from public, anon;
revoke execute on function public.revise_settlement(jsonb) from public, anon;
revoke execute on function public.set_settlement_loss(uuid, integer, jsonb) from public, anon;
revoke execute on function public.check_settlement(uuid, integer) from public, anon;
revoke execute on function public.approve_settlement(uuid, integer) from public, anon;
revoke execute on function public.cancel_settlement(uuid, integer, text) from public, anon;
revoke execute on function public.settlement_blockers(uuid, boolean) from public, anon;
revoke execute on function public.settlement_is_stale(uuid) from public, anon;
grant execute on function public.create_settlement(jsonb) to authenticated;
grant execute on function public.revise_settlement(jsonb) to authenticated;
grant execute on function public.set_settlement_loss(uuid, integer, jsonb) to authenticated;
grant execute on function public.check_settlement(uuid, integer) to authenticated;
grant execute on function public.approve_settlement(uuid, integer) to authenticated;
grant execute on function public.cancel_settlement(uuid, integer, text) to authenticated;
grant execute on function public.settlement_blockers(uuid, boolean) to authenticated;
grant execute on function public.settlement_is_stale(uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
