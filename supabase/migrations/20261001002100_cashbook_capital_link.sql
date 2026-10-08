-- =====================================================================
-- MINH KỲ AUTO — 2100 Nối sổ quỹ với vốn góp / khoản vay / chi phí xe (D87, D66)
--
-- Trước đây tiền thực nhận/rút vốn, khoản vay, trả nợ và thanh toán chi phí xe chỉ nằm ở sổ riêng, KHÔNG vào số dư tài khoản tiền.
-- Nay mỗi dòng có tiền thật gắn một tài khoản tiền (account_id) và số dư tài khoản tính cả các dòng đó. KHÔNG tạo phiếu thu/chi trùng:
-- dòng sổ gốc là chứng từ duy nhất (ghi một lần, §12.10). Dòng cũ chưa gắn tài khoản (account_id null) không tính vào số dư.
--  * Thu vào quỹ: vốn góp THỰC NHẬN, khoản vay nhận (gốc).   Chi ra khỏi quỹ: RÚT VỐN, trả vay (gốc/lãi), thanh toán chi phí xe.
--  * Vốn CAM KẾT không phải tiền thật: không gắn tài khoản.
--  * Bên góp vốn/cho vay là CÔNG TY: tiền công ty đã nằm trong sổ quỹ, không gắn tài khoản (tránh ghi hai lần).
--  * Dòng mới có tiền thật của bên ngoài bắt buộc chọn tài khoản; chi chỉ khi tài khoản đủ tiền thực có; tài khoản còn hoạt động; ngày không ở tương lai;
--    hủy dòng thu không được làm quỹ âm. Khóa 'acct:' chung với phiếu thu/chi → tuần tự hóa theo tài khoản.
-- =====================================================================

alter table public.vehicle_capital_entries add column account_id uuid references public.money_accounts (id);
alter table public.vehicle_loans add column account_id uuid references public.money_accounts (id);
alter table public.vehicle_loan_payments add column account_id uuid references public.money_accounts (id);
alter table public.vehicle_cost_payments add column account_id uuid references public.money_accounts (id);
create index vehicle_capital_entries_account_idx on public.vehicle_capital_entries (account_id) where account_id is not null and status = 'posted';
create index vehicle_loans_account_idx on public.vehicle_loans (account_id) where account_id is not null and status = 'active';
create index vehicle_loan_payments_account_idx on public.vehicle_loan_payments (account_id) where account_id is not null and status = 'posted';
create index vehicle_cost_payments_account_idx on public.vehicle_cost_payments (account_id) where account_id is not null and status = 'posted';

-- Tổng thu / chi của một tài khoản qua mọi nguồn có tiền thật. SECURITY DEFINER hẹp, chỉ trả số.
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
      end
$$;

create or replace function private.account_balance(p_account uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select a.opening_balance + private.account_flow(a.id, 'in') - private.account_flow(a.id, 'out')
  from public.money_accounts a where a.id = p_account
$$;

create or replace view public.money_account_balances with (security_invoker = true) as
select a.id, a.code, a.name, a.kind, a.is_active, a.opening_balance,
       private.account_flow(a.id, 'in') as total_in,
       private.account_flow(a.id, 'out') as total_out,
       private.account_balance(a.id) as balance
from public.money_accounts a
where private.can_see_finance();

-- Kiểm tra khi GHI một dòng có tiền thật.
create or replace function private.cash_link_in(p_account uuid, p_company boolean, p_dir text, p_amount numeric, p_date date)
returns void language plpgsql set search_path = '' as $$
declare a public.money_accounts;
begin
  if p_company then
    if p_account is not null then
      raise exception 'Bên là công ty: tiền của công ty đã nằm trong sổ quỹ, không gắn tài khoản tiền (tránh ghi hai lần).' using errcode = '22023';
    end if;
    return;
  end if;
  if p_account is null then
    raise exception 'Chọn tài khoản tiền nhận/chi cho khoản này để số dư tài khoản phản ánh đúng tiền thật.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('acct:' || p_account::text, 0));
  select * into a from public.money_accounts x where x.id = p_account;
  if a.id is null then
    raise exception 'Không tìm thấy tài khoản tiền.' using errcode = '22023';
  end if;
  if not a.is_active then
    raise exception 'Tài khoản tiền đã ngừng sử dụng.' using errcode = '22023';
  end if;
  if p_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày thu/chi không được ở tương lai. Chưa nhận/chưa chi tiền thì chưa ghi.' using errcode = '22023';
  end if;
  if p_dir = 'out' and p_amount > private.account_balance(p_account) then
    raise exception 'Tài khoản không đủ tiền thực có để chi (còn %).', to_char(private.account_balance(p_account), 'FM999G999G999G999G990') using errcode = '22023';
  end if;
end $$;

-- Kiểm tra khi HỦY một dòng đã thu tiền: không làm quỹ âm.
create or replace function private.cash_link_void_in(p_account uuid, p_amount numeric)
returns void language plpgsql set search_path = '' as $$
begin
  if p_account is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('acct:' || p_account::text, 0));
  if private.account_balance(p_account) - p_amount < 0 then
    raise exception 'Hủy khoản thu này làm tài khoản tiền âm (đã chi tiền này đi). Hủy các khoản chi liên quan trước.' using errcode = '22023';
  end if;
end $$;

create or replace function private.capital_entries_cash()
returns trigger language plpgsql set search_path = '' as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    if new.entry_type = 'commitment' then
      if new.account_id is not null then
        raise exception 'Vốn cam kết chưa phải tiền thật: không gắn tài khoản tiền.' using errcode = '22023';
      end if;
      return new;
    end if;
    select p.kind into k from public.capital_parties p where p.id = new.party_id;
    perform private.cash_link_in(new.account_id, k = 'company', case new.entry_type when 'receipt' then 'in' else 'out' end, new.amount, new.entry_date);
    return new;
  end if;
  if new.account_id is distinct from old.account_id then
    raise exception 'Không đổi tài khoản tiền của dòng đã ghi. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status = 'posted' and new.status = 'void' and old.entry_type = 'receipt' then
    perform private.cash_link_void_in(old.account_id, old.amount);
  end if;
  return new;
end $$;
create trigger vehicle_capital_entries_zcash before insert or update on public.vehicle_capital_entries for each row execute function private.capital_entries_cash();

create or replace function private.loans_cash()
returns trigger language plpgsql set search_path = '' as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    select p.kind into k from public.capital_parties p where p.id = new.party_id;
    perform private.cash_link_in(new.account_id, k = 'company', 'in', new.principal, new.drawn_date);
    return new;
  end if;
  if new.account_id is distinct from old.account_id then
    raise exception 'Không đổi tài khoản tiền của khoản vay đã ghi. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status = 'active' and new.status = 'void' then
    perform private.cash_link_void_in(old.account_id, old.principal);
  end if;
  return new;
end $$;
create trigger vehicle_loans_zcash before insert or update on public.vehicle_loans for each row execute function private.loans_cash();

create or replace function private.loan_payments_cash()
returns trigger language plpgsql set search_path = '' as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    select p.kind into k from public.vehicle_loans l join public.capital_parties p on p.id = l.party_id where l.id = new.loan_id;
    perform private.cash_link_in(new.account_id, k = 'company', 'out', new.amount, new.paid_on);
    return new;
  end if;
  if new.account_id is distinct from old.account_id then
    raise exception 'Không đổi tài khoản tiền của khoản trả đã ghi. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger vehicle_loan_payments_zcash before insert or update on public.vehicle_loan_payments for each row execute function private.loan_payments_cash();

create or replace function private.cost_payments_cash()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.cash_link_in(new.account_id, false, 'out', new.amount, new.paid_at);
    return new;
  end if;
  if new.account_id is distinct from old.account_id then
    raise exception 'Không đổi tài khoản tiền của khoản thanh toán đã ghi. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger vehicle_cost_payments_zcash before insert or update on public.vehicle_cost_payments for each row execute function private.cost_payments_cash();

-- RPC: nhận account_id.
create or replace function public.record_capital_entry(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select e.id into v_id from public.vehicle_capital_entries e where e.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.vehicle_capital_entries (vehicle_id, party_id, entry_type, amount, entry_date, reference, note, account_id, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, (p ->> 'party_id')::uuid, p ->> 'entry_type', (p ->> 'amount')::numeric,
          coalesce(nullif(p ->> 'entry_date', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
          nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), nullif(p ->> 'account_id', '')::uuid, v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select e.id into v_id from public.vehicle_capital_entries e where e.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.create_vehicle_loan(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select l.id into v_id from public.vehicle_loans l where l.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.vehicle_loans (vehicle_id, party_id, principal, drawn_date, due_date, interest_terms, reference, account_id, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, (p ->> 'party_id')::uuid, (p ->> 'principal')::numeric, (p ->> 'drawn_date')::date,
          nullif(p ->> 'due_date', '')::date, btrim(coalesce(p ->> 'interest_terms', '')), nullif(btrim(p ->> 'reference'), ''), nullif(p ->> 'account_id', '')::uuid, v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select l.id into v_id from public.vehicle_loans l where l.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.record_loan_payment(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select x.id into v_id from public.vehicle_loan_payments x where x.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.vehicle_loan_payments (loan_id, kind, amount, paid_on, reference, note, account_id, client_request_id)
  values ((p ->> 'loan_id')::uuid, p ->> 'kind', (p ->> 'amount')::numeric,
          coalesce(nullif(p ->> 'paid_on', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
          nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), nullif(p ->> 'account_id', '')::uuid, v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select x.id into v_id from public.vehicle_loan_payments x where x.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
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
  insert into public.vehicle_cost_payments (cost_id, amount, paid_at, method, reference, note, account_id, client_request_id)
  values ((p ->> 'cost_id')::uuid, (p ->> 'amount')::numeric,
          coalesce(nullif(p ->> 'paid_at', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
          coalesce(nullif(p ->> 'method', ''), 'cash'), nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), nullif(p ->> 'account_id', '')::uuid, v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select x.id into v_id from public.vehicle_cost_payments x where x.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
