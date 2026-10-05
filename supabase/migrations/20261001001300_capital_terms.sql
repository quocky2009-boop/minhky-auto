-- =====================================================================
-- MINH KỲ AUTO — 1300 Chặng 4 (lát 1): bên góp vốn, điều khoản chia lợi nhuận theo từng xe, sổ vốn góp, cho vay
--
-- Theo CLAUDE.md §7 (quy tắc đã chốt):
--  * Tỷ lệ công ty (c) thỏa thuận RIÊNG từng xe — không có mặc định; điều khoản đã duyệt không đổi theo cấu hình chung.
--  * Điều khoản có PHIÊN BẢN: bản nháp sửa được, bản đã duyệt bất biến; duyệt bản mới thì bản cũ thành "đã thay thế".
--  * Duyệt chỉ khi tổng tỷ lệ chia đúng 100%, mỗi bên > 0, không trùng bên.
--  * Vốn cam kết / thực nhận / rút vốn ghi thành sổ (không sửa, chỉ hủy có lý do). Khi vốn thay đổi sau khi duyệt,
--    hệ thống KHÔNG tự tính lại tỷ lệ: đánh dấu "cần xác nhận lại căn cứ phân chia" cho đến khi quản lý xác nhận lại hoặc duyệt bản mới.
--  * Góp vốn cùng chịu lãi/lỗ (sổ vốn góp + tỷ lệ chia) TÁCH khỏi cho vay hưởng lãi (vehicle_loans).
--  * Căn cứ chi phí trừ trước khi chia (cost_basis) và cách xử lý hòa vốn/lỗ (loss_policy) có thể để trống = "chờ xác nhận":
--    không chặn việc nhập/duyệt, nhưng chặn quyết toán (chặng sau).
--  * Chỉ áp dụng cho xe showroom sở hữu (xe ký gửi là chủ xe, không phải bên góp vốn).
--  * Chưa có quyết toán/chi trả (cần giao dịch bán — chặng 5).
-- Phân quyền: quản lý/admin ghi điều khoản, bên góp vốn, cam kết, cho vay, hủy; kế toán ghi tiền thực nhận/rút vốn/trả nợ và đọc tất cả;
-- sales và kỹ thuật không thấy gì.
-- =====================================================================

-- Nhật ký kiểm toán bỏ các cột định danh (điện thoại bên góp vốn...) khỏi old/new data.
create or replace function private.audit_row_without()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_drop text[] := tg_argv;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - v_drop end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - v_drop end;
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(to_jsonb(new)) k
    where k not in ('updated_at', 'version') and (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k);
    if v_changed is null then return new; end if;
  end if;
  insert into public.audit_logs (actor_id, table_name, record_id, action, changed_fields, old_data, new_data)
  values ((select auth.uid()), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), tg_op, v_changed, v_old, v_new);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 1. Bên góp vốn / cho vay (người ngoài chưa có tài khoản)
-- ---------------------------------------------------------------------
create sequence public.capital_party_code_seq;
create table public.capital_parties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('GV' || lpad(nextval('public.capital_party_code_seq')::text, 4, '0')),
  name text not null check (length(btrim(name)) > 0),
  kind text not null check (kind in ('company', 'individual', 'organization')),   -- company = chính showroom/công ty (không đếm trùng khi vừa vận hành vừa góp vốn)
  phone text,
  note text,
  legal_entity_id uuid references public.legal_entities (id),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique
);
create trigger capital_parties_touch before update on public.capital_parties for each row execute function private.touch_row();
create trigger capital_parties_audit after insert or update on public.capital_parties for each row execute function private.audit_row_without('phone');

-- ---------------------------------------------------------------------
-- 2. Điều khoản chia lợi nhuận theo xe (có phiên bản) + tỷ lệ từng bên
-- ---------------------------------------------------------------------
create table public.vehicle_capital_terms (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  version_no integer not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded', 'void')),

  company_rate numeric(7, 4) not null check (company_rate >= 0 and company_rate <= 100),   -- c, % dành cho công ty vận hành; KHÔNG có mặc định
  cost_basis text check (cost_basis in ('all_confirmed_costs', 'selected_costs', 'no_costs')),   -- chi phí trừ trước khi chia; null = chờ xác nhận
  loss_policy text,            -- cách xử lý hòa vốn/lỗ đã thống nhất; null/rỗng = chờ xác nhận
  basis_note text,             -- căn cứ phân chia (vốn góp, thỏa thuận...)
  agreement_ref text,          -- số văn bản thỏa thuận

  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  reconfirmed_by uuid references public.profiles (id),
  reconfirmed_at timestamptz,
  reconfirm_note text,

  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,

  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,

  constraint vehicle_capital_terms_version_key unique (vehicle_id, version_no),
  constraint vehicle_capital_terms_approved_complete check (status not in ('approved', 'superseded') or (approved_by is not null and approved_at is not null)),
  constraint vehicle_capital_terms_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);
create unique index vehicle_capital_one_approved on public.vehicle_capital_terms (vehicle_id) where status = 'approved';
create index vehicle_capital_terms_vehicle_idx on public.vehicle_capital_terms (vehicle_id, version_no desc);

create table public.vehicle_capital_shares (
  terms_id uuid not null references public.vehicle_capital_terms (id),
  party_id uuid not null references public.capital_parties (id),
  ratio_percent numeric(7, 4) not null check (ratio_percent > 0 and ratio_percent <= 100),   -- tỷ lệ góp vốn được xác nhận (căn cứ chia)
  created_at timestamptz not null default now(),
  primary key (terms_id, party_id)
);

create trigger vehicle_capital_terms_touch before update on public.vehicle_capital_terms for each row execute function private.touch_row();
create trigger vehicle_capital_terms_audit after insert or update on public.vehicle_capital_terms for each row execute function private.audit_row();
create trigger vehicle_capital_shares_audit after insert or update or delete on public.vehicle_capital_shares for each row execute function private.audit_row_without();

-- ---------------------------------------------------------------------
-- 3. Sổ vốn góp: cam kết / thực nhận / rút vốn (không sửa, hủy có lý do)
-- ---------------------------------------------------------------------
create table public.vehicle_capital_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  party_id uuid not null references public.capital_parties (id),
  entry_type text not null check (entry_type in ('commitment', 'receipt', 'withdrawal')),
  amount numeric(18, 0) not null check (amount > 0),
  entry_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  reference text,
  note text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid unique,
  constraint vehicle_capital_entries_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);
create index vehicle_capital_entries_idx on public.vehicle_capital_entries (vehicle_id, party_id, entry_date) where status = 'posted';
create trigger vehicle_capital_entries_audit after insert or update on public.vehicle_capital_entries for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- 4. Cho vay hưởng lãi (TÁCH khỏi góp vốn cùng chịu lãi/lỗ)
-- ---------------------------------------------------------------------
create table public.vehicle_loans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  party_id uuid not null references public.capital_parties (id),
  principal numeric(18, 0) not null check (principal > 0),
  drawn_date date not null,
  due_date date,
  interest_terms text not null check (length(btrim(interest_terms)) > 0),   -- lãi thỏa thuận (ghi nguyên văn; chưa tự tính lãi)
  reference text,
  status text not null default 'active' check (status in ('active', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid unique,
  constraint vehicle_loans_dates check (due_date is null or due_date >= drawn_date),
  constraint vehicle_loans_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);
create table public.vehicle_loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.vehicle_loans (id),
  kind text not null check (kind in ('principal', 'interest')),
  amount numeric(18, 0) not null check (amount > 0),
  paid_on date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  reference text,
  note text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid unique,
  constraint vehicle_loan_payments_void_complete check (status <> 'void' or (length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);
create index vehicle_loan_payments_idx on public.vehicle_loan_payments (loan_id) where status = 'posted';
create trigger vehicle_loans_audit after insert or update on public.vehicle_loans for each row execute function private.audit_row();
create trigger vehicle_loan_payments_audit after insert or update on public.vehicle_loan_payments for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.capital_vehicle_check(p_vehicle uuid, p_allow_sold boolean default false)
returns void language plpgsql set search_path = '' as $$
declare v public.vehicles;
begin
  select * into v from public.vehicles x where x.id = p_vehicle;
  if v.id is null then
    raise exception 'Không tìm thấy xe.' using errcode = '22023';
  end if;
  if v.business_type <> 'owned' then
    raise exception 'Chỉ xe showroom sở hữu mới có bên góp vốn/cho vay. Xe ký gửi có chủ xe, không phải bên góp vốn.' using errcode = '22023';
  end if;
  if not p_allow_sold and v.sale_status in ('sold', 'delivered', 'returned_to_owner') then
    raise exception 'Xe đã bán hoặc kết thúc vòng sở hữu: không đổi điều khoản góp vốn.' using errcode = '22023';
  end if;
end $$;

create or replace function private.vehicle_capital_terms_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_count integer; v_sum numeric; v_inactive integer;
begin
  if tg_op = 'INSERT' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được lập điều khoản góp vốn.' using errcode = '42501';
    end if;
    perform private.capital_vehicle_check(new.vehicle_id);
    if new.status <> 'draft' or new.approved_at is not null then
      raise exception 'Điều khoản mới phải ở trạng thái nháp.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtext('capital_terms:' || new.vehicle_id::text));   -- đánh số phiên bản không trùng khi hai người cùng lập
    select coalesce(max(t.version_no), 0) + 1 into new.version_no from public.vehicle_capital_terms t where t.vehicle_id = new.vehicle_id;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Không xóa điều khoản góp vốn. Hủy bản nháp (có lý do) hoặc thêm phiên bản mới.' using errcode = '22023';
  end if;

  if (new.vehicle_id, new.version_no, new.created_by, new.created_at) is distinct from (old.vehicle_id, old.version_no, old.created_by, old.created_at) then
    raise exception 'Không đổi xe hoặc số phiên bản của điều khoản.' using errcode = '22023';
  end if;
  if old.status in ('superseded', 'void') then
    raise exception 'Điều khoản này đã kết thúc (đã thay thế hoặc hủy), không sửa.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được sửa/duyệt điều khoản góp vốn.' using errcode = '42501';
  end if;

  if old.status = 'draft' and new.status = 'draft' then
    if (new.approved_by, new.approved_at, new.reconfirmed_by, new.reconfirmed_at, new.void_reason) is distinct from (old.approved_by, old.approved_at, old.reconfirmed_by, old.reconfirmed_at, old.void_reason) then
      raise exception 'Không đặt trực tiếp thông tin duyệt/xác nhận.' using errcode = '22023';
    end if;
    perform private.capital_vehicle_check(new.vehicle_id);
    return new;
  end if;

  if old.status = 'draft' and new.status = 'void' then
    if not private.is_system() then new.voided_by := (select auth.uid()); new.voided_at := now(); end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    perform private.capital_vehicle_check(new.vehicle_id);
    select count(*), coalesce(sum(s.ratio_percent), 0), count(*) filter (where not p.is_active)
      into v_count, v_sum, v_inactive
      from public.vehicle_capital_shares s join public.capital_parties p on p.id = s.party_id where s.terms_id = old.id;
    if v_count = 0 then
      raise exception 'Chưa có bên góp vốn nào trong điều khoản.' using errcode = '22023';
    end if;
    if v_sum <> 100 then
      raise exception 'Tổng tỷ lệ chia hiện là % (phần trăm), phải đúng 100 mới duyệt được.', v_sum using errcode = '22023';
    end if;
    if v_inactive > 0 then
      raise exception 'Có bên góp vốn đã ngừng hoạt động trong điều khoản.' using errcode = '22023';
    end if;
    if not private.is_system() then new.approved_by := (select auth.uid()); new.approved_at := now(); end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'superseded' then
    if coalesce(current_setting('app.capital_supersede', true), '') = '' then
      raise exception 'Điều khoản đã duyệt chỉ được thay thế bằng cách duyệt phiên bản mới.' using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'approved' then
    -- bản đã duyệt bất biến; chỉ cho ghi xác nhận lại căn cứ phân chia
    if (new.company_rate, new.cost_basis, new.loss_policy, new.basis_note, new.agreement_ref, new.approved_by, new.approved_at, new.void_reason)
       is distinct from (old.company_rate, old.cost_basis, old.loss_policy, old.basis_note, old.agreement_ref, old.approved_by, old.approved_at, old.void_reason) then
      raise exception 'Điều khoản đã duyệt không sửa. Tạo phiên bản mới.' using errcode = '22023';
    end if;
    if new.reconfirmed_at is distinct from old.reconfirmed_at then
      if not private.is_system() then new.reconfirmed_by := (select auth.uid()); new.reconfirmed_at := now(); end if;
    end if;
    return new;
  end if;

  raise exception 'Không thể chuyển điều khoản từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger vehicle_capital_terms_guard before insert or update or delete on public.vehicle_capital_terms for each row execute function private.vehicle_capital_terms_guard();

create or replace function private.vehicle_capital_shares_guard()
returns trigger language plpgsql set search_path = '' as $$
declare t public.vehicle_capital_terms; v_active boolean; v_terms uuid := coalesce(new.terms_id, old.terms_id);
begin
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được sửa tỷ lệ góp vốn.' using errcode = '42501';
  end if;
  select * into t from public.vehicle_capital_terms x where x.id = v_terms;
  if t.id is null or t.status <> 'draft' then
    raise exception 'Chỉ sửa tỷ lệ khi điều khoản còn ở bản nháp. Đã duyệt thì tạo phiên bản mới.' using errcode = '22023';
  end if;
  if tg_op <> 'DELETE' then
    select p.is_active into v_active from public.capital_parties p where p.id = new.party_id;
    if not coalesce(v_active, false) then
      raise exception 'Bên góp vốn không tồn tại hoặc đã ngừng hoạt động.' using errcode = '22023';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger vehicle_capital_shares_guard before insert or update or delete on public.vehicle_capital_shares for each row execute function private.vehicle_capital_shares_guard();

-- Số vốn thực nhận ròng của một bên cho một xe (đã trừ rút vốn), chỉ tính dòng còn hiệu lực.
create or replace function private.capital_net_received(p_vehicle uuid, p_party uuid)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(case e.entry_type when 'receipt' then e.amount when 'withdrawal' then -e.amount else 0 end), 0)
  from public.vehicle_capital_entries e where e.vehicle_id = p_vehicle and e.party_id = p_party and e.status = 'posted'
$$;

create or replace function private.vehicle_capital_entries_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_net numeric;
begin
  if tg_op = 'INSERT' then
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Anh/chị không có quyền ghi sổ vốn góp.' using errcode = '42501';
    end if;
    if new.entry_type = 'commitment' and not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được ghi vốn cam kết. Kế toán ghi tiền thực nhận và rút vốn.' using errcode = '42501';
    end if;
    if new.status <> 'posted' then
      raise exception 'Dòng mới phải ở trạng thái đã ghi.' using errcode = '22023';
    end if;
    perform private.capital_vehicle_check(new.vehicle_id, true);
    if not exists (
        select 1 from public.vehicle_capital_shares s join public.vehicle_capital_terms t on t.id = s.terms_id
        where t.vehicle_id = new.vehicle_id and t.status in ('draft', 'approved') and s.party_id = new.party_id) then
      raise exception 'Bên này chưa có trong điều khoản góp vốn của xe (bản nháp hoặc đã duyệt). Thêm bên vào điều khoản trước.' using errcode = '22023';
    end if;
    if new.entry_type = 'withdrawal' then
      perform pg_advisory_xact_lock(hashtext('capital_entries:' || new.vehicle_id::text || ':' || new.party_id::text));
      v_net := private.capital_net_received(new.vehicle_id, new.party_id);
      if new.amount > v_net then
        raise exception 'Rút vốn (%) vượt vốn thực nhận ròng của bên này (%).', new.amount::bigint, v_net::bigint using errcode = '22023';
      end if;
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if (new.vehicle_id, new.party_id, new.entry_type, new.amount, new.entry_date, new.created_by, new.created_at)
     is distinct from (old.vehicle_id, old.party_id, old.entry_type, old.amount, old.entry_date, old.created_by, old.created_at) then
    raise exception 'Dòng sổ vốn góp không sửa. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status = 'void' then
    raise exception 'Dòng đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status <> 'void' then
    if (new.reference, new.note) is distinct from (old.reference, old.note) then
      raise exception 'Dòng sổ vốn góp không sửa. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
    end if;
    return new;
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được hủy dòng sổ vốn góp.' using errcode = '42501';
  end if;
  if old.entry_type = 'receipt' then
    perform pg_advisory_xact_lock(hashtext('capital_entries:' || old.vehicle_id::text || ':' || old.party_id::text));
    v_net := private.capital_net_received(old.vehicle_id, old.party_id) - old.amount;
    if v_net < 0 then
      raise exception 'Hủy khoản nhận này sẽ làm vốn thực nhận ròng âm (đã có rút vốn). Hủy các khoản rút vốn trước.' using errcode = '22023';
    end if;
  end if;
  if not private.is_system() then new.voided_by := (select auth.uid()); new.voided_at := now(); end if;
  return new;
end $$;
create trigger vehicle_capital_entries_guard before insert or update on public.vehicle_capital_entries for each row execute function private.vehicle_capital_entries_guard();

create or replace function private.vehicle_loans_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được ghi khoản cho vay.' using errcode = '42501';
    end if;
    perform private.capital_vehicle_check(new.vehicle_id, true);
    if not exists (select 1 from public.capital_parties p where p.id = new.party_id and p.is_active) then
      raise exception 'Bên cho vay không tồn tại hoặc đã ngừng hoạt động.' using errcode = '22023';
    end if;
    if new.status <> 'active' then
      raise exception 'Khoản vay mới phải ở trạng thái đang hiệu lực.' using errcode = '22023';
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;
  if (new.vehicle_id, new.party_id, new.principal, new.drawn_date, new.due_date, new.interest_terms, new.created_by, new.created_at)
     is distinct from (old.vehicle_id, old.party_id, old.principal, old.drawn_date, old.due_date, old.interest_terms, old.created_by, old.created_at) then
    raise exception 'Khoản vay không sửa. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status = 'void' then
    raise exception 'Khoản vay đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status = 'void' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy khoản vay.' using errcode = '42501';
    end if;
    if exists (select 1 from public.vehicle_loan_payments p where p.loan_id = old.id and p.status = 'posted') then
      raise exception 'Khoản vay đã có thanh toán. Hủy các thanh toán trước.' using errcode = '22023';
    end if;
    if not private.is_system() then new.voided_by := (select auth.uid()); new.voided_at := now(); end if;
  end if;
  return new;
end $$;
create trigger vehicle_loans_guard before insert or update on public.vehicle_loans for each row execute function private.vehicle_loans_guard();

create or replace function private.vehicle_loan_payments_guard()
returns trigger language plpgsql set search_path = '' as $$
declare l public.vehicle_loans; v_paid numeric;
begin
  if tg_op = 'INSERT' then
    if not (private.can_see_finance() or private.is_system()) then
      raise exception 'Anh/chị không có quyền ghi thanh toán khoản vay.' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtext('loan:' || new.loan_id::text));
    select * into l from public.vehicle_loans x where x.id = new.loan_id;
    if l.id is null or l.status <> 'active' then
      raise exception 'Không tìm thấy khoản vay đang hiệu lực.' using errcode = '22023';
    end if;
    if new.status <> 'posted' then
      raise exception 'Thanh toán mới phải ở trạng thái đã ghi.' using errcode = '22023';
    end if;
    if new.kind = 'principal' then
      select coalesce(sum(p.amount), 0) into v_paid from public.vehicle_loan_payments p where p.loan_id = new.loan_id and p.kind = 'principal' and p.status = 'posted';
      if v_paid + new.amount > l.principal then
        raise exception 'Tổng trả gốc (%) sẽ vượt gốc vay (%).', (v_paid + new.amount)::bigint, l.principal::bigint using errcode = '22023';
      end if;
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;
  if (new.loan_id, new.kind, new.amount, new.paid_on, new.reference, new.note, new.created_by, new.created_at)
     is distinct from (old.loan_id, old.kind, old.amount, old.paid_on, old.reference, old.note, old.created_by, old.created_at) then
    raise exception 'Thanh toán không sửa. Hủy (có lý do) rồi ghi lại.' using errcode = '22023';
  end if;
  if old.status = 'void' then
    raise exception 'Thanh toán đã hủy, không sửa.' using errcode = '22023';
  end if;
  if new.status = 'void' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy thanh toán khoản vay.' using errcode = '42501';
    end if;
    if not private.is_system() then new.voided_by := (select auth.uid()); new.voided_at := now(); end if;
  end if;
  return new;
end $$;
create trigger vehicle_loan_payments_guard before insert or update on public.vehicle_loan_payments for each row execute function private.vehicle_loan_payments_guard();

-- ---------------------------------------------------------------------
-- RLS: kế toán + quản lý đọc; quản lý ghi điều khoản/bên/cam kết/vay; kế toán ghi tiền thực nhận/rút vốn/trả nợ. Không xóa.
-- ---------------------------------------------------------------------
alter table public.capital_parties enable row level security;
alter table public.vehicle_capital_terms enable row level security;
alter table public.vehicle_capital_shares enable row level security;
alter table public.vehicle_capital_entries enable row level security;
alter table public.vehicle_loans enable row level security;
alter table public.vehicle_loan_payments enable row level security;

create policy capital_parties_select on public.capital_parties for select to authenticated using (private.can_see_finance());
create policy capital_parties_insert on public.capital_parties for insert to authenticated with check (private.is_manager());
create policy capital_parties_update on public.capital_parties for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy capital_terms_select on public.vehicle_capital_terms for select to authenticated using (private.can_see_finance());
create policy capital_terms_insert on public.vehicle_capital_terms for insert to authenticated with check (private.is_manager());
create policy capital_terms_update on public.vehicle_capital_terms for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy capital_shares_select on public.vehicle_capital_shares for select to authenticated using (private.can_see_finance());
create policy capital_shares_insert on public.vehicle_capital_shares for insert to authenticated with check (private.is_manager());
create policy capital_shares_update on public.vehicle_capital_shares for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy capital_shares_delete on public.vehicle_capital_shares for delete to authenticated using (private.is_manager());
create policy capital_entries_select on public.vehicle_capital_entries for select to authenticated using (private.can_see_finance());
create policy capital_entries_insert on public.vehicle_capital_entries for insert to authenticated with check (private.can_see_finance());
create policy capital_entries_update on public.vehicle_capital_entries for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy vehicle_loans_select on public.vehicle_loans for select to authenticated using (private.can_see_finance());
create policy vehicle_loans_insert on public.vehicle_loans for insert to authenticated with check (private.is_manager());
create policy vehicle_loans_update on public.vehicle_loans for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy loan_payments_select on public.vehicle_loan_payments for select to authenticated using (private.can_see_finance());
create policy loan_payments_insert on public.vehicle_loan_payments for insert to authenticated with check (private.can_see_finance());
create policy loan_payments_update on public.vehicle_loan_payments for update to authenticated using (private.is_manager()) with check (private.is_manager());

revoke delete, truncate on public.capital_parties, public.vehicle_capital_terms, public.vehicle_capital_entries, public.vehicle_loans, public.vehicle_loan_payments from authenticated, anon;
revoke truncate on public.vehicle_capital_shares from authenticated, anon;
revoke all on public.capital_parties, public.vehicle_capital_terms, public.vehicle_capital_shares, public.vehicle_capital_entries, public.vehicle_loans, public.vehicle_loan_payments from anon;

-- ---------------------------------------------------------------------
-- Tổng hợp (security invoker: tuân RLS)
-- ---------------------------------------------------------------------
-- Vốn theo bên: cam kết / thực nhận / rút / thực nhận ròng — luôn là các cột riêng, thiếu = 0 rõ ràng vì có sổ (không phải "chưa rõ").
create or replace view public.vehicle_capital_summary with (security_invoker = true) as
select e.vehicle_id, e.party_id,
  coalesce(sum(e.amount) filter (where e.entry_type = 'commitment'), 0) as committed,
  coalesce(sum(e.amount) filter (where e.entry_type = 'receipt'), 0) as received,
  coalesce(sum(e.amount) filter (where e.entry_type = 'withdrawal'), 0) as withdrawn,
  coalesce(sum(case e.entry_type when 'receipt' then e.amount when 'withdrawal' then -e.amount else 0 end), 0) as net_received,
  max(e.entry_date) as last_entry_date
from public.vehicle_capital_entries e where e.status = 'posted' group by e.vehicle_id, e.party_id;

-- Trạng thái căn cứ phân chia: sổ vốn có thay đổi (ghi/hủy) SAU khi duyệt hoặc xác nhận lại gần nhất → cần xác nhận lại. Không tự tính lại tỷ lệ.
create or replace view public.vehicle_capital_status with (security_invoker = true) as
select t.vehicle_id, t.id as terms_id, t.version_no, t.approved_at, t.reconfirmed_at,
  ch.last_change_at,
  (ch.last_change_at is not null and ch.last_change_at > coalesce(t.reconfirmed_at, t.approved_at)) as needs_reconfirm
from public.vehicle_capital_terms t
left join lateral (
  select max(greatest(e.created_at, e.voided_at)) as last_change_at from public.vehicle_capital_entries e where e.vehicle_id = t.vehicle_id
) ch on true
where t.status = 'approved';

create or replace view public.vehicle_loan_summary with (security_invoker = true) as
select l.id as loan_id, l.vehicle_id, l.party_id, l.principal, l.status,
  coalesce(sum(p.amount) filter (where p.kind = 'principal' and p.status = 'posted'), 0) as principal_paid,
  coalesce(sum(p.amount) filter (where p.kind = 'interest' and p.status = 'posted'), 0) as interest_paid,
  l.principal - coalesce(sum(p.amount) filter (where p.kind = 'principal' and p.status = 'posted'), 0) as principal_outstanding
from public.vehicle_loans l left join public.vehicle_loan_payments p on p.loan_id = l.id group by l.id;
revoke all on public.vehicle_capital_summary, public.vehicle_capital_status, public.vehicle_loan_summary from anon;
grant select on public.vehicle_capital_summary, public.vehicle_capital_status, public.vehicle_loan_summary to authenticated;

-- ---------------------------------------------------------------------
-- RPC (security invoker). Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_capital_party(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được thêm bên góp vốn.' using errcode = '42501';
  end if;
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select x.id into v_id from public.capital_parties x where x.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.capital_parties (name, kind, phone, note, legal_entity_id, client_request_id)
  values (btrim(coalesce(p ->> 'name', '')), p ->> 'kind', nullif(btrim(p ->> 'phone'), ''), nullif(btrim(p ->> 'note'), ''),
          nullif(p ->> 'legal_entity_id', '')::uuid, v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select x.id into v_id from public.capital_parties x where x.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.update_capital_party(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.capital_parties c set
    name = case when p ? 'name' then btrim(p ->> 'name') else c.name end,
    phone = case when p ? 'phone' then nullif(btrim(p ->> 'phone'), '') else c.phone end,
    note = case when p ? 'note' then nullif(btrim(p ->> 'note'), '') else c.note end,
    is_active = case when p ? 'is_active' then (p ->> 'is_active')::boolean else c.is_active end
  where c.id = p_id and c.version = p_version
  returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Bên góp vốn vừa được người khác cập nhật hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

-- Lập bản nháp điều khoản kèm tỷ lệ các bên trong một giao dịch. p.shares = [{party_id, ratio_percent}, ...]
create or replace function public.create_capital_terms(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; s jsonb;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được lập điều khoản góp vốn.' using errcode = '42501';
  end if;
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select t.id into v_id from public.vehicle_capital_terms t where t.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.vehicle_capital_terms (vehicle_id, company_rate, cost_basis, loss_policy, basis_note, agreement_ref, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, (p ->> 'company_rate')::numeric, nullif(p ->> 'cost_basis', ''), nullif(btrim(p ->> 'loss_policy'), ''),
          nullif(btrim(p ->> 'basis_note'), ''), nullif(btrim(p ->> 'agreement_ref'), ''), v_request)
  returning id into v_id;
  for s in select * from jsonb_array_elements(coalesce(p -> 'shares', '[]'::jsonb)) loop
    insert into public.vehicle_capital_shares (terms_id, party_id, ratio_percent) values (v_id, (s ->> 'party_id')::uuid, (s ->> 'ratio_percent')::numeric);
  end loop;
  return v_id;
exception when unique_violation then
  select t.id into v_id from public.vehicle_capital_terms t where t.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

-- Sửa bản nháp (kèm thay toàn bộ danh sách tỷ lệ nếu có p.shares).
create or replace function public.update_capital_terms(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer; s jsonb;
begin
  update public.vehicle_capital_terms t set
    company_rate = case when p ? 'company_rate' then (p ->> 'company_rate')::numeric else t.company_rate end,
    cost_basis = case when p ? 'cost_basis' then nullif(p ->> 'cost_basis', '') else t.cost_basis end,
    loss_policy = case when p ? 'loss_policy' then nullif(btrim(p ->> 'loss_policy'), '') else t.loss_policy end,
    basis_note = case when p ? 'basis_note' then nullif(btrim(p ->> 'basis_note'), '') else t.basis_note end,
    agreement_ref = case when p ? 'agreement_ref' then nullif(btrim(p ->> 'agreement_ref'), '') else t.agreement_ref end
  where t.id = p_id and t.version = p_version and t.status = 'draft'
  returning t.version into v_ver;
  if v_ver is null then
    raise exception 'Điều khoản vừa được người khác cập nhật, không còn là bản nháp hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  if p ? 'shares' then
    delete from public.vehicle_capital_shares where terms_id = p_id;
    for s in select * from jsonb_array_elements(p -> 'shares') loop
      insert into public.vehicle_capital_shares (terms_id, party_id, ratio_percent) values (p_id, (s ->> 'party_id')::uuid, (s ->> 'ratio_percent')::numeric);
    end loop;
  end if;
  return v_ver;
end $$;

create or replace function public.approve_capital_terms(p_id uuid, p_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer; v_vehicle uuid; v_old uuid;
begin
  select t.vehicle_id into v_vehicle from public.vehicle_capital_terms t where t.id = p_id and t.version = p_version and t.status = 'draft';
  if v_vehicle is null then
    raise exception 'Điều khoản vừa được người khác cập nhật, không còn là bản nháp hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  perform pg_advisory_xact_lock(hashtext('capital_terms:' || v_vehicle::text));
  -- bản đang duyệt cũ chuyển thành "đã thay thế" trước (chỉ một bản duyệt hiệu lực/xe)
  perform set_config('app.capital_supersede', p_id::text, true);
  for v_old in select t.id from public.vehicle_capital_terms t where t.vehicle_id = v_vehicle and t.status = 'approved' loop
    update public.vehicle_capital_terms set status = 'superseded' where id = v_old;
  end loop;
  perform set_config('app.capital_supersede', '', true);
  update public.vehicle_capital_terms t set status = 'approved' where t.id = p_id and t.version = p_version
  returning t.version into v_ver;
  if v_ver is null then
    raise exception 'Không duyệt được điều khoản. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.discard_capital_terms(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy bản nháp.' using errcode = '22023';
  end if;
  update public.vehicle_capital_terms t set status = 'void', void_reason = btrim(p_reason) where t.id = p_id and t.version = p_version and t.status = 'draft'
  returning t.version into v_ver;
  if v_ver is null then
    raise exception 'Điều khoản vừa được người khác cập nhật, không còn là bản nháp hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

-- Xác nhận lại căn cứ phân chia sau khi vốn thay đổi (không tự tính lại tỷ lệ).
create or replace function public.reconfirm_capital_basis(p_id uuid, p_version integer, p_note text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Ghi nội dung xác nhận (vì sao tỷ lệ chia vẫn đúng sau khi vốn thay đổi).' using errcode = '22023';
  end if;
  update public.vehicle_capital_terms t set reconfirmed_at = now(), reconfirm_note = btrim(p_note)
  where t.id = p_id and t.version = p_version and t.status = 'approved'
  returning t.version into v_ver;
  if v_ver is null then
    raise exception 'Điều khoản vừa được người khác cập nhật, không còn hiệu lực hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.record_capital_entry(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select e.id into v_id from public.vehicle_capital_entries e where e.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.vehicle_capital_entries (vehicle_id, party_id, entry_type, amount, entry_date, reference, note, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, (p ->> 'party_id')::uuid, p ->> 'entry_type', (p ->> 'amount')::numeric,
          coalesce(nullif(p ->> 'entry_date', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
          nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select e.id into v_id from public.vehicle_capital_entries e where e.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.void_capital_entry(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy dòng sổ vốn góp.' using errcode = '22023';
  end if;
  update public.vehicle_capital_entries e set status = 'void', void_reason = btrim(p_reason) where e.id = p_id and e.status = 'posted';
  if not found then
    raise exception 'Không tìm thấy dòng đang hiệu lực hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
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
  insert into public.vehicle_loans (vehicle_id, party_id, principal, drawn_date, due_date, interest_terms, reference, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, (p ->> 'party_id')::uuid, (p ->> 'principal')::numeric, (p ->> 'drawn_date')::date,
          nullif(p ->> 'due_date', '')::date, btrim(coalesce(p ->> 'interest_terms', '')), nullif(btrim(p ->> 'reference'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select l.id into v_id from public.vehicle_loans l where l.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.void_vehicle_loan(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy khoản vay.' using errcode = '22023';
  end if;
  update public.vehicle_loans l set status = 'void', void_reason = btrim(p_reason) where l.id = p_id and l.status = 'active';
  if not found then
    raise exception 'Không tìm thấy khoản vay đang hiệu lực hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
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
  insert into public.vehicle_loan_payments (loan_id, kind, amount, paid_on, reference, note, client_request_id)
  values ((p ->> 'loan_id')::uuid, p ->> 'kind', (p ->> 'amount')::numeric,
          coalesce(nullif(p ->> 'paid_on', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
          nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select x.id into v_id from public.vehicle_loan_payments x where x.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.void_loan_payment(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy thanh toán.' using errcode = '22023';
  end if;
  update public.vehicle_loan_payments x set status = 'void', void_reason = btrim(p_reason) where x.id = p_id and x.status = 'posted';
  if not found then
    raise exception 'Không tìm thấy thanh toán đang hiệu lực hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
end $$;

revoke execute on function public.create_capital_party(jsonb) from public, anon;
revoke execute on function public.update_capital_party(uuid, integer, jsonb) from public, anon;
revoke execute on function public.create_capital_terms(jsonb) from public, anon;
revoke execute on function public.update_capital_terms(uuid, integer, jsonb) from public, anon;
revoke execute on function public.approve_capital_terms(uuid, integer) from public, anon;
revoke execute on function public.discard_capital_terms(uuid, integer, text) from public, anon;
revoke execute on function public.reconfirm_capital_basis(uuid, integer, text) from public, anon;
revoke execute on function public.record_capital_entry(jsonb) from public, anon;
revoke execute on function public.void_capital_entry(uuid, text) from public, anon;
revoke execute on function public.create_vehicle_loan(jsonb) from public, anon;
revoke execute on function public.void_vehicle_loan(uuid, text) from public, anon;
revoke execute on function public.record_loan_payment(jsonb) from public, anon;
revoke execute on function public.void_loan_payment(uuid, text) from public, anon;
grant execute on function public.create_capital_party(jsonb) to authenticated;
grant execute on function public.update_capital_party(uuid, integer, jsonb) to authenticated;
grant execute on function public.create_capital_terms(jsonb) to authenticated;
grant execute on function public.update_capital_terms(uuid, integer, jsonb) to authenticated;
grant execute on function public.approve_capital_terms(uuid, integer) to authenticated;
grant execute on function public.discard_capital_terms(uuid, integer, text) to authenticated;
grant execute on function public.reconfirm_capital_basis(uuid, integer, text) to authenticated;
grant execute on function public.record_capital_entry(jsonb) to authenticated;
grant execute on function public.void_capital_entry(uuid, text) to authenticated;
grant execute on function public.create_vehicle_loan(jsonb) to authenticated;
grant execute on function public.void_vehicle_loan(uuid, text) to authenticated;
grant execute on function public.record_loan_payment(jsonb) to authenticated;
grant execute on function public.void_loan_payment(uuid, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
