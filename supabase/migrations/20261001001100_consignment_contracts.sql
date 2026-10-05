-- =====================================================================
-- MINH KỲ AUTO — 1100 Chặng 3 (lát 4): hợp đồng ký gửi
--
-- Quyết định đã chốt với anh Kỳ (05/10/2026):
--   * Phí showroom hưởng: SỐ TIỀN CỐ ĐỊNH hoặc PHẦN TRĂM TRÊN GIÁ BÁN (chọn riêng cho từng xe, không có mặc định).
--   * Chi phí phát sinh của xe ký gửi KHÔNG cần chủ xe duyệt (vẫn ghi bên chịu chi phí ở lát 3).
-- Thiết kế (CLAUDE.md §4, §6, §10, §11):
--   consignment_contracts : một hợp đồng cho một xe (một vòng ký gửi): chủ xe/ủy quyền, thời hạn,
--                           biên bản nhận xe, trạng thái nháp → hiệu lực → đã trả / hủy; biên bản trả xe.
--   consignment_terms     : thỏa thuận có PHIÊN BẢN, không sửa (chỉ bổ sung ngày chủ xe ký). Hiệu lực = phiên bản đã ký mới nhất.
--   Xe ký gửi chỉ được chào bán khi có hợp đồng hiệu lực; chỉ được trả chủ qua biên bản trả xe.
--   Chưa có quyết toán/tiền thu hộ (cần giao dịch bán — chặng 5). Chưa có tệp scan (chưa có Storage cho xe).
-- Phân quyền: chỉ quản lý/admin ghi; kế toán đọc; sales/kỹ thuật không thấy (có thông tin định danh chủ xe và điều khoản tiền).
-- =====================================================================

create sequence public.consignment_code_seq;

create table public.consignment_contracts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('KG' || lpad(nextval('public.consignment_code_seq')::text, 5, '0')),
  vehicle_id uuid not null references public.vehicles (id),
  status text not null default 'draft' check (status in ('draft', 'active', 'returned', 'cancelled')),

  -- Chủ xe / người được ủy quyền
  owner_name text not null check (length(btrim(owner_name)) > 0),
  owner_phone text,
  owner_id_number text,
  acts_by_proxy boolean not null default false,
  proxy_note text,

  -- Thời hạn ký gửi
  start_date date,
  end_date date,

  -- Biên bản nhận xe (chốt khi kích hoạt hợp đồng)
  received_at date,
  keys_count smallint check (keys_count >= 0),
  documents_received text,
  condition_at_receipt text,
  receipt_note text,

  activated_by uuid references public.profiles (id),
  activated_at timestamptz,

  -- Biên bản trả xe / rút xe
  return_date date,
  return_reason text,
  return_condition text,
  return_keys_count smallint check (return_keys_count >= 0),
  return_documents text,
  return_cost_note text,
  return_owner_cost_confirmed numeric(18, 0),   -- ảnh chụp lúc trả: chi phí chủ xe chịu đã xác nhận
  return_owner_cost_unpaid numeric(18, 0),      -- ảnh chụp lúc trả: phần chưa thanh toán
  returned_by uuid references public.profiles (id),
  returned_at timestamptz,

  cancel_reason text,
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,

  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,

  constraint consignment_dates_order check (end_date is null or start_date is null or end_date >= start_date),
  constraint consignment_proxy_note check (not acts_by_proxy or length(btrim(coalesce(proxy_note, ''))) > 0),
  constraint consignment_active_complete check (status not in ('active', 'returned') or (
    owner_phone is not null and length(btrim(owner_phone)) > 0
    and start_date is not null and end_date is not null and received_at is not null and keys_count is not null
    and length(btrim(coalesce(documents_received, ''))) > 0 and length(btrim(coalesce(condition_at_receipt, ''))) > 0
    and activated_by is not null and activated_at is not null)),
  constraint consignment_returned_complete check (status <> 'returned' or (
    return_date is not null and length(btrim(coalesce(return_reason, ''))) > 0 and length(btrim(coalesce(return_condition, ''))) > 0
    and return_keys_count is not null and length(btrim(coalesce(return_documents, ''))) > 0
    and return_owner_cost_confirmed is not null and return_owner_cost_unpaid is not null
    and returned_by is not null and returned_at is not null)),
  constraint consignment_cancelled_complete check (status <> 'cancelled' or (
    length(btrim(coalesce(cancel_reason, ''))) > 0 and cancelled_by is not null and cancelled_at is not null))
);
-- Một xe chỉ có một hợp đồng đang soạn/hiệu lực; hợp đồng đã trả/hủy không chặn việc lập lại (xe chưa kết thúc vòng).
create unique index consignment_one_open_per_vehicle on public.consignment_contracts (vehicle_id) where status in ('draft', 'active');
create index consignment_vehicle_idx on public.consignment_contracts (vehicle_id);

create table public.consignment_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.consignment_contracts (id),
  version_no integer not null,

  owner_expected_amount numeric(18, 0) not null check (owner_expected_amount >= 0),   -- giá chủ xe muốn nhận (thực nhận)
  list_price numeric(18, 0) not null check (list_price > 0),                           -- giá chào theo thỏa thuận

  -- Quyền giảm giá của showroom mà không cần hỏi lại chủ xe
  discount_limit_type text not null check (discount_limit_type in ('none', 'amount', 'percent')),
  discount_limit_amount numeric(18, 0) check (discount_limit_amount >= 0),
  discount_limit_percent numeric(7, 4) check (discount_limit_percent >= 0 and discount_limit_percent <= 100),

  -- Phí ký gửi showroom hưởng: cố định hoặc phần trăm trên GIÁ BÁN
  fee_type text not null check (fee_type in ('fixed', 'percent_of_sale_price')),
  fee_fixed_amount numeric(18, 0) check (fee_fixed_amount >= 0),
  fee_percent numeric(7, 4) check (fee_percent >= 0 and fee_percent <= 100),

  buyer_contract_party text not null check (buyer_contract_party in ('showroom', 'owner')),   -- bên ký hợp đồng với người mua
  payment_collector text not null check (payment_collector in ('showroom', 'owner')),        -- bên thu tiền từ người mua
  other_terms text,

  signed_on date,            -- ngày chủ xe ký/đồng ý; null = chưa xác nhận → chưa có hiệu lực
  agreement_ref text,        -- số hợp đồng giấy / tham chiếu
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid unique,

  constraint consignment_terms_version_key unique (contract_id, version_no),
  constraint consignment_terms_discount_shape check (
    (discount_limit_type = 'none' and discount_limit_amount is null and discount_limit_percent is null)
    or (discount_limit_type = 'amount' and discount_limit_amount is not null and discount_limit_percent is null)
    or (discount_limit_type = 'percent' and discount_limit_percent is not null and discount_limit_amount is null)),
  constraint consignment_terms_fee_shape check (
    (fee_type = 'fixed' and fee_fixed_amount is not null and fee_percent is null)
    or (fee_type = 'percent_of_sale_price' and fee_percent is not null and fee_fixed_amount is null))
);
create index consignment_terms_contract_idx on public.consignment_terms (contract_id, version_no desc);

create trigger consignment_contracts_touch before update on public.consignment_contracts for each row execute function private.touch_row();
create trigger consignment_terms_audit after insert or update on public.consignment_terms for each row execute function private.audit_row();

-- Nhật ký kiểm toán của hợp đồng KHÔNG lưu số điện thoại, số giấy tờ, ghi chú ủy quyền của chủ xe (không log dữ liệu định danh đầy đủ).
create or replace function private.audit_consignment_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'owner_phone' - 'owner_id_number' - 'proxy_note' end;
  v_new jsonb := to_jsonb(new) - 'owner_phone' - 'owner_id_number' - 'proxy_note';
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(to_jsonb(new)) k
    where k not in ('updated_at', 'version') and (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k);
    if v_changed is null then return new; end if;
  end if;
  insert into public.audit_logs (actor_id, table_name, record_id, action, changed_fields, old_data, new_data)
  values ((select auth.uid()), tg_table_name, new.id::text, tg_op, v_changed, v_old, v_new);
  return new;
end $$;
create trigger consignment_contracts_audit after insert or update on public.consignment_contracts for each row execute function private.audit_consignment_contract();

-- ---------------------------------------------------------------------
-- Phí ký gửi: MỘT nguồn tính cho database (làm tròn nửa lên đến 1 VND). Quyết toán chặng 5 sẽ dùng hàm này.
-- ---------------------------------------------------------------------
create or replace function private.consignment_fee(p_type text, p_fixed numeric, p_percent numeric, p_sale_price numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case p_type
    when 'fixed' then p_fixed
    when 'percent_of_sale_price' then round(p_sale_price * p_percent / 100, 0)
  end
$$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.consignment_contracts_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v public.vehicles;
  v_terms_signed integer;
  v_open integer;
  v_conf numeric;
  v_paid numeric;
begin
  if tg_op = 'INSERT' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được lập hợp đồng ký gửi.' using errcode = '42501';
    end if;
    select * into v from public.vehicles x where x.id = new.vehicle_id;
    if v.id is null then
      raise exception 'Không tìm thấy xe.' using errcode = '22023';
    end if;
    if v.business_type <> 'consignment' then
      raise exception 'Chỉ lập hợp đồng ký gửi cho xe ký gửi.' using errcode = '22023';
    end if;
    if v.sale_status in ('sold', 'delivered', 'returned_to_owner') then
      raise exception 'Xe đã kết thúc vòng ký gửi, không lập hợp đồng mới. Nếu xe quay lại, nhập thành hồ sơ xe mới.' using errcode = '22023';
    end if;
    if new.status <> 'draft' or new.activated_at is not null or new.returned_at is not null or new.cancelled_at is not null then
      raise exception 'Hợp đồng mới phải ở trạng thái nháp.' using errcode = '22023';
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if new.vehicle_id <> old.vehicle_id or new.code <> old.code then
    raise exception 'Không đổi xe hoặc mã của hợp đồng ký gửi.' using errcode = '22023';
  end if;
  if old.status in ('returned', 'cancelled') then
    raise exception 'Hợp đồng ký gửi đã kết thúc, không sửa.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được sửa hợp đồng ký gửi.' using errcode = '42501';
  end if;
  select * into v from public.vehicles x where x.id = new.vehicle_id;

  if new.status = old.status then
    if (new.activated_by, new.activated_at, new.return_date, new.return_reason, new.return_condition, new.return_keys_count, new.return_documents,
        new.return_cost_note, new.return_owner_cost_confirmed, new.return_owner_cost_unpaid, new.returned_by, new.returned_at,
        new.cancel_reason, new.cancelled_by, new.cancelled_at)
       is distinct from
       (old.activated_by, old.activated_at, old.return_date, old.return_reason, old.return_condition, old.return_keys_count, old.return_documents,
        old.return_cost_note, old.return_owner_cost_confirmed, old.return_owner_cost_unpaid, old.returned_by, old.returned_at,
        old.cancel_reason, old.cancelled_by, old.cancelled_at) then
      raise exception 'Không sửa trực tiếp thông tin kích hoạt/trả xe/hủy. Dùng đúng thao tác nghiệp vụ.' using errcode = '22023';
    end if;
    if old.status = 'active' and (new.received_at is distinct from old.received_at or new.keys_count is distinct from old.keys_count
        or new.documents_received is distinct from old.documents_received or new.condition_at_receipt is distinct from old.condition_at_receipt
        or new.start_date is distinct from old.start_date) then
      raise exception 'Biên bản nhận xe và ngày bắt đầu đã chốt khi hợp đồng có hiệu lực, không sửa.' using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'cancelled' then
    if not private.is_system() then new.cancelled_by := (select auth.uid()); new.cancelled_at := now(); end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'active' then
    if v.sale_status in ('sold', 'delivered', 'returned_to_owner') then
      raise exception 'Xe đã kết thúc vòng ký gửi.' using errcode = '22023';
    end if;
    select count(*) into v_terms_signed from public.consignment_terms t where t.contract_id = old.id and t.signed_on is not null;
    if v_terms_signed = 0 then
      raise exception 'Chưa có thỏa thuận (giá, phí ký gửi, quyền giảm giá) được chủ xe ký xác nhận. Nhập ngày chủ xe ký trước khi kích hoạt.' using errcode = '22023';
    end if;
    -- các cột bắt buộc còn thiếu sẽ bị constraint consignment_active_complete chặn; báo lỗi dễ hiểu trước
    if new.owner_phone is null or length(btrim(new.owner_phone)) = 0 or new.start_date is null or new.end_date is null
       or new.received_at is null or new.keys_count is null
       or length(btrim(coalesce(new.documents_received, ''))) = 0 or length(btrim(coalesce(new.condition_at_receipt, ''))) = 0 then
      raise exception 'Chưa đủ thông tin kích hoạt: cần số điện thoại chủ xe, thời hạn (từ–đến), biên bản nhận xe (ngày nhận, số chìa khóa, giấy tờ nhận, tình trạng xe khi nhận).' using errcode = '22023';
    end if;
    if not private.is_system() then new.activated_by := (select auth.uid()); new.activated_at := now(); end if;
    return new;
  end if;

  if old.status = 'active' and new.status = 'returned' then
    if v.sale_status not in ('not_listed', 'available') then
      raise exception 'Xe đang giữ/cọc/đã bán nên chưa thể trả chủ xe. Xử lý giao dịch bán trước.' using errcode = '22023';
    end if;
    select count(*) into v_open from public.vehicle_costs c where c.vehicle_id = old.vehicle_id and c.status = 'estimated';
    if v_open > 0 then
      raise exception 'Còn % khoản chi phí chưa xác nhận hoặc hủy. Xử lý chi phí trước khi trả xe.', v_open using errcode = '22023';
    end if;
    select coalesce(sum(c.confirmed_amount), 0) into v_conf from public.vehicle_costs c
      where c.vehicle_id = old.vehicle_id and c.status = 'confirmed' and c.borne_by = 'owner';
    select coalesce(sum(p.amount), 0) into v_paid from public.vehicle_cost_payments p join public.vehicle_costs c on c.id = p.cost_id
      where c.vehicle_id = old.vehicle_id and c.status = 'confirmed' and c.borne_by = 'owner' and p.status = 'posted';
    if v_conf - v_paid > 0 and length(btrim(coalesce(new.return_cost_note, ''))) = 0 then
      raise exception 'Còn % đ chi phí chủ xe chịu chưa thanh toán. Ghi cách xử lý (chủ xe hoàn trả, trừ vào đâu...) vào ô xử lý chi phí.', (v_conf - v_paid)::bigint using errcode = '22023';
    end if;
    if new.return_date is null or length(btrim(coalesce(new.return_reason, ''))) = 0 or length(btrim(coalesce(new.return_condition, ''))) = 0
       or new.return_keys_count is null or length(btrim(coalesce(new.return_documents, ''))) = 0 then
      raise exception 'Biên bản trả xe cần: ngày trả, lý do, tình trạng xe khi trả, số chìa khóa và giấy tờ trả lại.' using errcode = '22023';
    end if;
    new.return_owner_cost_confirmed := v_conf;     -- ảnh chụp do database tính, không tin dữ liệu gửi lên
    new.return_owner_cost_unpaid := v_conf - v_paid;
    if not private.is_system() then new.returned_by := (select auth.uid()); new.returned_at := now(); end if;
    return new;
  end if;

  raise exception 'Không thể chuyển hợp đồng ký gửi từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger consignment_contracts_guard before insert or update on public.consignment_contracts for each row execute function private.consignment_contracts_guard();

create or replace function private.consignment_terms_guard()
returns trigger language plpgsql set search_path = '' as $$
declare c public.consignment_contracts; v_next integer;
begin
  if tg_op = 'INSERT' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được lập thỏa thuận ký gửi.' using errcode = '42501';
    end if;
    select * into c from public.consignment_contracts x where x.id = new.contract_id for update;   -- khóa hợp đồng: đánh số phiên bản không trùng khi hai người cùng thêm
    if c.id is null then
      raise exception 'Không tìm thấy hợp đồng ký gửi.' using errcode = '22023';
    end if;
    if c.status not in ('draft', 'active') then
      raise exception 'Hợp đồng đã kết thúc, không thêm thỏa thuận.' using errcode = '22023';
    end if;
    if new.signed_on is not null and new.signed_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Ngày chủ xe ký không được ở tương lai.' using errcode = '22023';
    end if;
    select coalesce(max(t.version_no), 0) + 1 into v_next from public.consignment_terms t where t.contract_id = new.contract_id;
    new.version_no := v_next;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Không xóa thỏa thuận ký gửi. Thêm phiên bản mới nếu cần thay đổi.' using errcode = '22023';
  end if;

  -- UPDATE: thỏa thuận không sửa; chỉ được bổ sung ngày chủ xe ký (và số hợp đồng) một lần khi chưa có ngày ký.
  if old.signed_on is not null then
    raise exception 'Thỏa thuận đã được ký xác nhận, không sửa. Thêm phiên bản mới nếu có thay đổi.' using errcode = '22023';
  end if;
  if (new.contract_id, new.version_no, new.owner_expected_amount, new.list_price, new.discount_limit_type, new.discount_limit_amount,
      new.discount_limit_percent, new.fee_type, new.fee_fixed_amount, new.fee_percent, new.buyer_contract_party, new.payment_collector,
      new.other_terms, new.created_at, new.created_by)
     is distinct from
     (old.contract_id, old.version_no, old.owner_expected_amount, old.list_price, old.discount_limit_type, old.discount_limit_amount,
      old.discount_limit_percent, old.fee_type, old.fee_fixed_amount, old.fee_percent, old.buyer_contract_party, old.payment_collector,
      old.other_terms, old.created_at, old.created_by) then
    raise exception 'Thỏa thuận không sửa nội dung. Thêm phiên bản mới.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được xác nhận ngày chủ xe ký.' using errcode = '42501';
  end if;
  if new.signed_on is null then
    raise exception 'Nhập ngày chủ xe ký.' using errcode = '22023';
  end if;
  if new.signed_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày chủ xe ký không được ở tương lai.' using errcode = '22023';
  end if;
  select * into c from public.consignment_contracts x where x.id = new.contract_id;
  if c.status not in ('draft', 'active') then
    raise exception 'Hợp đồng đã kết thúc.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger consignment_terms_guard before insert or update or delete on public.consignment_terms for each row execute function private.consignment_terms_guard();

-- Xe ký gửi: chỉ chào bán khi có hợp đồng hiệu lực; chỉ trả chủ qua biên bản trả xe. (Thao tác hệ thống/migration không bị chặn.)
create or replace function private.vehicles_consignment_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.business_type = 'consignment' and new.sale_status is distinct from old.sale_status and not private.is_system() then
    if new.sale_status in ('available', 'held', 'deposited', 'sold', 'delivered')
       and not exists (select 1 from public.consignment_contracts c where c.vehicle_id = new.id and c.status = 'active') then
      raise exception 'Xe ký gửi cần có hợp đồng ký gửi đang hiệu lực (đã ký, đã lập biên bản nhận xe) trước khi chào bán.' using errcode = '22023';
    end if;
    if new.sale_status = 'returned_to_owner'
       and not exists (select 1 from public.consignment_contracts c where c.vehicle_id = new.id and c.status = 'returned') then
      raise exception 'Trả xe cho chủ xe phải lập biên bản trả xe trong hợp đồng ký gửi.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger vehicles_consignment_guard before update on public.vehicles for each row execute function private.vehicles_consignment_guard();

-- ---------------------------------------------------------------------
-- RLS: kế toán đọc; quản lý/admin ghi; không ai xóa.
-- ---------------------------------------------------------------------
alter table public.consignment_contracts enable row level security;
alter table public.consignment_terms enable row level security;
create policy consignment_contracts_select on public.consignment_contracts for select to authenticated using (private.can_see_finance());
create policy consignment_contracts_insert on public.consignment_contracts for insert to authenticated with check (private.is_manager());
create policy consignment_contracts_update on public.consignment_contracts for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy consignment_terms_select on public.consignment_terms for select to authenticated using (private.can_see_finance());
create policy consignment_terms_insert on public.consignment_terms for insert to authenticated with check (private.is_manager());
create policy consignment_terms_update on public.consignment_terms for update to authenticated using (private.is_manager()) with check (private.is_manager());
revoke delete, truncate on public.consignment_contracts, public.consignment_terms from authenticated, anon;
revoke all on public.consignment_contracts, public.consignment_terms from anon;

-- ---------------------------------------------------------------------
-- RPC (security invoker: RLS + trigger vẫn áp dụng). Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_consignment_contract(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được lập hợp đồng ký gửi.' using errcode = '42501';
  end if;
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select c.id into v_id from public.consignment_contracts c where c.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.consignment_contracts (
    vehicle_id, owner_name, owner_phone, owner_id_number, acts_by_proxy, proxy_note, start_date, end_date,
    received_at, keys_count, documents_received, condition_at_receipt, receipt_note, client_request_id)
  values (
    (p ->> 'vehicle_id')::uuid, btrim(coalesce(p ->> 'owner_name', '')), nullif(btrim(p ->> 'owner_phone'), ''), nullif(btrim(p ->> 'owner_id_number'), ''),
    coalesce((p ->> 'acts_by_proxy')::boolean, false), nullif(btrim(p ->> 'proxy_note'), ''),
    nullif(p ->> 'start_date', '')::date, nullif(p ->> 'end_date', '')::date,
    nullif(p ->> 'received_at', '')::date, nullif(p ->> 'keys_count', '')::smallint,
    nullif(btrim(p ->> 'documents_received'), ''), nullif(btrim(p ->> 'condition_at_receipt'), ''), nullif(btrim(p ->> 'receipt_note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select c.id into v_id from public.consignment_contracts c where c.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Xe này đã có hợp đồng ký gửi đang soạn hoặc đang hiệu lực.' using errcode = '22023';
end $$;

create or replace function public.update_consignment_contract(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.consignment_contracts c set
    owner_name = case when p ? 'owner_name' then btrim(p ->> 'owner_name') else c.owner_name end,
    owner_phone = case when p ? 'owner_phone' then nullif(btrim(p ->> 'owner_phone'), '') else c.owner_phone end,
    owner_id_number = case when p ? 'owner_id_number' then nullif(btrim(p ->> 'owner_id_number'), '') else c.owner_id_number end,
    acts_by_proxy = case when p ? 'acts_by_proxy' then coalesce((p ->> 'acts_by_proxy')::boolean, false) else c.acts_by_proxy end,
    proxy_note = case when p ? 'proxy_note' then nullif(btrim(p ->> 'proxy_note'), '') else c.proxy_note end,
    start_date = case when p ? 'start_date' then nullif(p ->> 'start_date', '')::date else c.start_date end,
    end_date = case when p ? 'end_date' then nullif(p ->> 'end_date', '')::date else c.end_date end,
    received_at = case when p ? 'received_at' then nullif(p ->> 'received_at', '')::date else c.received_at end,
    keys_count = case when p ? 'keys_count' then nullif(p ->> 'keys_count', '')::smallint else c.keys_count end,
    documents_received = case when p ? 'documents_received' then nullif(btrim(p ->> 'documents_received'), '') else c.documents_received end,
    condition_at_receipt = case when p ? 'condition_at_receipt' then nullif(btrim(p ->> 'condition_at_receipt'), '') else c.condition_at_receipt end,
    receipt_note = case when p ? 'receipt_note' then nullif(btrim(p ->> 'receipt_note'), '') else c.receipt_note end
  where c.id = p_id and c.version = p_version
  returning c.version into v_ver;
  if v_ver is null then
    if exists (select 1 from public.consignment_contracts c where c.id = p_id) then
      raise exception 'Hợp đồng vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất.' using errcode = '40001';
    end if;
    raise exception 'Không tìm thấy hợp đồng ký gửi hoặc anh/chị không có quyền.' using errcode = '42501';
  end if;
  return v_ver;
end $$;

create or replace function public.add_consignment_terms(p_contract_id uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select t.id into v_id from public.consignment_terms t where t.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.consignment_terms (
    contract_id, owner_expected_amount, list_price, discount_limit_type, discount_limit_amount, discount_limit_percent,
    fee_type, fee_fixed_amount, fee_percent, buyer_contract_party, payment_collector, other_terms, signed_on, agreement_ref, client_request_id)
  values (
    p_contract_id, (p ->> 'owner_expected_amount')::numeric, (p ->> 'list_price')::numeric, p ->> 'discount_limit_type',
    nullif(p ->> 'discount_limit_amount', '')::numeric, nullif(p ->> 'discount_limit_percent', '')::numeric,
    p ->> 'fee_type', nullif(p ->> 'fee_fixed_amount', '')::numeric, nullif(p ->> 'fee_percent', '')::numeric,
    p ->> 'buyer_contract_party', p ->> 'payment_collector', nullif(btrim(p ->> 'other_terms'), ''),
    nullif(p ->> 'signed_on', '')::date, nullif(btrim(p ->> 'agreement_ref'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select t.id into v_id from public.consignment_terms t where t.client_request_id = v_request;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.confirm_consignment_terms(p_terms_id uuid, p_signed_on date, p_agreement_ref text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.consignment_terms t set signed_on = p_signed_on, agreement_ref = coalesce(nullif(btrim(p_agreement_ref), ''), t.agreement_ref)
  where t.id = p_terms_id;
  if not found then
    raise exception 'Không tìm thấy thỏa thuận ký gửi hoặc anh/chị không có quyền.' using errcode = '42501';
  end if;
end $$;

create or replace function public.activate_consignment_contract(p_id uuid, p_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.consignment_contracts c set status = 'active' where c.id = p_id and c.version = p_version and c.status = 'draft'
  returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Hợp đồng vừa được người khác cập nhật, đã kích hoạt hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.cancel_consignment_contract(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy hợp đồng.' using errcode = '22023';
  end if;
  update public.consignment_contracts c set status = 'cancelled', cancel_reason = btrim(p_reason)
  where c.id = p_id and c.version = p_version and c.status = 'draft'
  returning c.version into v_ver;
  if v_ver is null then
    raise exception 'Hợp đồng vừa được người khác cập nhật, không còn ở trạng thái nháp hoặc anh/chị không có quyền. Chỉ hợp đồng nháp mới hủy; hợp đồng đã hiệu lực kết thúc bằng biên bản trả xe.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

-- Trả/rút xe: một giao dịch — chốt biên bản trả trong hợp đồng rồi chuyển xe sang "đã trả chủ xe". Hồ sơ không bị xóa.
create or replace function public.return_consignment_vehicle(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer; v_vehicle uuid;
begin
  update public.consignment_contracts c set
    status = 'returned',
    return_date = nullif(p ->> 'return_date', '')::date,
    return_reason = nullif(btrim(p ->> 'return_reason'), ''),
    return_condition = nullif(btrim(p ->> 'return_condition'), ''),
    return_keys_count = nullif(p ->> 'return_keys_count', '')::smallint,
    return_documents = nullif(btrim(p ->> 'return_documents'), ''),
    return_cost_note = nullif(btrim(p ->> 'return_cost_note'), '')
  where c.id = p_id and c.version = p_version and c.status = 'active'
  returning c.version, c.vehicle_id into v_ver, v_vehicle;
  if v_ver is null then
    raise exception 'Hợp đồng vừa được người khác cập nhật, chưa hiệu lực hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.vehicles v set sale_status = 'returned_to_owner' where v.id = v_vehicle;
  return v_ver;
end $$;

revoke execute on function public.create_consignment_contract(jsonb) from public, anon;
revoke execute on function public.update_consignment_contract(uuid, integer, jsonb) from public, anon;
revoke execute on function public.add_consignment_terms(uuid, jsonb) from public, anon;
revoke execute on function public.confirm_consignment_terms(uuid, date, text) from public, anon;
revoke execute on function public.activate_consignment_contract(uuid, integer) from public, anon;
revoke execute on function public.cancel_consignment_contract(uuid, integer, text) from public, anon;
revoke execute on function public.return_consignment_vehicle(uuid, integer, jsonb) from public, anon;
grant execute on function public.create_consignment_contract(jsonb) to authenticated;
grant execute on function public.update_consignment_contract(uuid, integer, jsonb) to authenticated;
grant execute on function public.add_consignment_terms(uuid, jsonb) to authenticated;
grant execute on function public.confirm_consignment_terms(uuid, date, text) to authenticated;
grant execute on function public.activate_consignment_contract(uuid, integer) to authenticated;
grant execute on function public.cancel_consignment_contract(uuid, integer, text) to authenticated;
grant execute on function public.return_consignment_vehicle(uuid, integer, jsonb) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
