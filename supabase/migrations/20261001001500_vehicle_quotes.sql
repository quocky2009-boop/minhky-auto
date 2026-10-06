-- =====================================================================
-- MINH KỲ AUTO — 1500 Chặng 5 (lát 2): báo giá có phiên bản + duyệt giảm giá
--
-- CLAUDE.md §9: báo giá có phiên bản, ưu đãi, giá sàn nội bộ, duyệt giảm giá. §11: sales không đọc giá sàn/giá vốn.
--  * quotes: một báo giá của MỘT xe cho MỘT nhu cầu mua (khách lấy từ nhu cầu). Mỗi (nhu cầu, xe) chỉ một báo giá đang mở.
--  * quote_versions: các phiên bản BẤT BIẾN (giá chào báo khách, ưu đãi, hạn hiệu lực). Sửa giá = lập phiên bản mới, bản cũ "đã thay thế".
--  * Duyệt giảm giá do DATABASE quyết định (sales không tự khai, không đọc giá sàn):
--      - xe sở hữu: cần duyệt nếu giá báo < giá sàn, hoặc xe CHƯA có giá sàn (thiếu dữ liệu không coi là "đạt");
--      - xe ký gửi: cần duyệt nếu mức giảm so với giá chào trong thỏa thuận đã ký vượt quyền giảm giá của showroom, hoặc chưa có thỏa thuận đã ký.
--    Không có ngưỡng giảm giá tự đặt: ngưỡng duy nhất là giá sàn / quyền giảm giá đã thỏa thuận.
--  * Người duyệt: quản lý/admin; duyệt giá thấp phải ghi lý do; từ chối phải ghi lý do. Phiên bản chưa duyệt không được chấp nhận.
--  * Chấp nhận báo giá = khách đồng ý MỘT phiên bản còn hạn. Chưa phải đơn bán/hợp đồng/thu tiền (lát sau); không đổi trạng thái xe.
--  * Sales chỉ thấy báo giá của mình; chỉ thấy cờ "cần duyệt", không thấy giá sàn. Quản lý/kế toán thấy tất cả. Không xóa.
-- =====================================================================

create sequence public.quote_code_seq;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('BG' || lpad(nextval('public.quote_code_seq')::text, 5, '0')),
  vehicle_id uuid not null references public.vehicles (id),
  demand_id uuid not null references public.demands (id),
  customer_id uuid not null references public.customers (id),
  owner_id uuid not null references public.profiles (id),
  status text not null default 'open' check (status in ('open', 'accepted', 'cancelled')),
  end_reason text,
  ended_by uuid references public.profiles (id),
  ended_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint quotes_cancel_complete check (status <> 'cancelled' or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null))
);
create unique index quotes_one_open on public.quotes (demand_id, vehicle_id) where status = 'open';
create index quotes_vehicle_idx on public.quotes (vehicle_id, created_at desc);
create index quotes_demand_idx on public.quotes (demand_id);

create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id),
  version_no integer not null check (version_no >= 1),
  list_price numeric(18, 0) check (list_price > 0),              -- giá niêm yết tại thời điểm báo (null = xe chưa có giá niêm yết)
  offered_price numeric(18, 0) not null check (offered_price > 0), -- giá báo cho khách
  benefits text,                                                  -- ưu đãi/quà tặng/điều kiện kèm theo, ghi nguyên văn
  valid_until timestamptz not null,                               -- hạn hiệu lực: bắt buộc nhập, không có mặc định
  note text,
  needs_approval boolean not null,                                -- do database tính; sales chỉ thấy cờ này
  status text not null check (status in ('pending_approval', 'issued', 'rejected', 'superseded', 'accepted', 'cancelled')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_reason text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid unique,
  constraint quote_versions_key unique (quote_id, version_no),
  constraint quote_versions_decision_complete check (
    (decided_by is null and decided_at is null and decision_reason is null)
    or (decided_by is not null and decided_at is not null)),
  constraint quote_versions_reject_reason check (status <> 'rejected' or length(btrim(coalesce(decision_reason, ''))) > 0),
  constraint quote_versions_approved_complete check (
    not needs_approval or status in ('pending_approval', 'rejected', 'cancelled')
    or (decided_by is not null and length(btrim(coalesce(decision_reason, ''))) > 0))
);
create index quote_versions_quote_idx on public.quote_versions (quote_id, version_no desc);

create trigger quotes_touch before update on public.quotes for each row execute function private.touch_row();
create trigger quotes_audit after insert or update on public.quotes for each row execute function private.audit_row();
create trigger quote_versions_audit after insert or update on public.quote_versions for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Hàm hẹp đọc dữ liệu sales không được đọc (giá sàn, quyền giảm giá, giữ/cọc của người khác). Chỉ trả cờ đúng/sai.
-- ---------------------------------------------------------------------
create or replace function private.quote_needs_approval(p_vehicle uuid, p_price numeric)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v public.vehicles; v_floor numeric; t public.consignment_terms; v_discount numeric;
begin
  select * into v from public.vehicles x where x.id = p_vehicle;
  if v.id is null then return true; end if;
  if v.business_type = 'consignment' then
    select t2.* into t
    from public.consignment_contracts c join public.consignment_terms t2 on t2.contract_id = c.id
    where c.vehicle_id = p_vehicle and c.status = 'active' and t2.signed_on is not null
    order by t2.version_no desc limit 1;
    if t.id is null then return true; end if;                       -- chưa có thỏa thuận đã ký: không coi là đạt
    v_discount := t.list_price - p_price;
    if v_discount <= 0 then return false; end if;
    return case t.discount_limit_type
      when 'none' then true
      when 'amount' then v_discount > t.discount_limit_amount
      else v_discount > t.list_price * t.discount_limit_percent / 100 end;
  end if;
  select f.floor_price into v_floor from public.vehicle_financials f where f.vehicle_id = p_vehicle;
  if v_floor is null then return true; end if;                      -- chưa có giá sàn: không coi là đạt
  return p_price < v_floor;
end $$;

create or replace function private.quote_vehicle_reserved_by_other(p_vehicle uuid, p_demand uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicle_reservations r where r.vehicle_id = p_vehicle and r.status = 'active' and r.demand_id <> p_demand)
$$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.quotes_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v public.vehicles; d public.demands; v_text text;
begin
  if tg_op = 'INSERT' then
    if not (private.can_sell() or private.is_system()) then
      raise exception 'Anh/chị không có quyền lập báo giá.' using errcode = '42501';
    end if;
    if new.status <> 'open' or new.ended_at is not null then
      raise exception 'Báo giá mới phải ở trạng thái đang mở.' using errcode = '22023';
    end if;
    select * into d from public.demands x where x.id = new.demand_id;
    if d.id is null then
      raise exception 'Không tìm thấy nhu cầu mua hoặc anh/chị không có quyền với nhu cầu này.' using errcode = '22023';
    end if;
    if d.kind <> 'buy' then
      raise exception 'Báo giá phải gắn với nhu cầu MUA của khách.' using errcode = '22023';
    end if;
    if d.status in ('closed', 'won', 'paused') then
      raise exception 'Nhu cầu mua đã đóng/tạm dừng/đã thành công, không lập báo giá cho nhu cầu này.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or private.can_edit_demand(d.id)) then
      raise exception 'Chỉ người phụ trách nhu cầu hoặc quản lý được lập báo giá cho nhu cầu này.' using errcode = '42501';
    end if;
    select * into v from public.vehicles x where x.id = new.vehicle_id;
    if v.id is null then
      raise exception 'Không tìm thấy xe.' using errcode = '22023';
    end if;
    if v.archived_at is not null then
      raise exception 'Xe đã lưu trữ.' using errcode = '22023';
    end if;
    if v.sale_status not in ('available', 'held', 'deposited') then
      v_text := case v.sale_status
        when 'not_listed' then 'Xe chưa chào bán nên chưa báo giá được.'
        else 'Xe không còn bán (đã bán/đã giao/đã trả chủ).' end;
      raise exception '%', v_text using errcode = '22023';
    end if;
    if private.quote_vehicle_reserved_by_other(new.vehicle_id, new.demand_id) then
      raise exception 'Xe đang được giữ/đặt cọc cho khách khác. Chưa báo giá được.' using errcode = '22023';
    end if;
    new.customer_id := d.customer_id;
    new.owner_id := coalesce(d.owner_id, (select auth.uid()));
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Không xóa báo giá. Hủy báo giá (có lý do).' using errcode = '22023';
  end if;

  if (new.code, new.vehicle_id, new.demand_id, new.customer_id, new.owner_id, new.created_by, new.created_at)
     is distinct from (old.code, old.vehicle_id, old.demand_id, old.customer_id, old.owner_id, old.created_by, old.created_at) then
    raise exception 'Không đổi xe, khách hoặc người phụ trách của báo giá. Hủy rồi lập báo giá mới.' using errcode = '22023';
  end if;
  if old.status <> 'open' then
    raise exception 'Báo giá đã kết thúc, không sửa.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system() or old.owner_id = (select auth.uid())) then
    raise exception 'Chỉ người phụ trách hoặc quản lý được thao tác báo giá này.' using errcode = '42501';
  end if;
  if new.status = 'cancelled' then
    if length(btrim(coalesce(new.end_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy báo giá.' using errcode = '22023';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
  elsif new.status = 'accepted' then
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
  end if;
  return new;
end $$;
create trigger quotes_guard before insert or update or delete on public.quotes for each row execute function private.quotes_guard();

create or replace function private.quote_versions_guard()
returns trigger language plpgsql set search_path = '' as $$
declare q public.quotes; v_next integer; v_list numeric; v_text text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa phiên bản báo giá.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    select * into q from public.quotes x where x.id = new.quote_id;
    if q.id is null then
      raise exception 'Không tìm thấy báo giá hoặc anh/chị không có quyền.' using errcode = '22023';
    end if;
    if q.status <> 'open' then
      raise exception 'Báo giá đã kết thúc, không thêm phiên bản.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or q.owner_id = (select auth.uid())) then
      raise exception 'Chỉ người phụ trách hoặc quản lý được lập phiên bản báo giá.' using errcode = '42501';
    end if;
    select coalesce(max(x.version_no), 0) + 1 into v_next from public.quote_versions x where x.quote_id = new.quote_id;
    if new.version_no <> v_next then
      raise exception 'Số phiên bản không hợp lệ.' using errcode = '22023';
    end if;
    if new.valid_until <= now() then
      raise exception 'Hạn hiệu lực báo giá phải ở tương lai.' using errcode = '22023';
    end if;
    if new.decided_by is not null or new.decided_at is not null or new.decision_reason is not null then
      raise exception 'Phiên bản mới chưa được duyệt.' using errcode = '22023';
    end if;
    select l.asking_price into v_list from public.vehicle_listings l where l.vehicle_id = q.vehicle_id;
    new.list_price := v_list;                                        -- giá niêm yết lấy từ hệ thống, không tin dữ liệu gửi lên
    new.needs_approval := private.quote_needs_approval(q.vehicle_id, new.offered_price);
    new.status := case when new.needs_approval then 'pending_approval' else 'issued' end;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  -- UPDATE: nội dung bất biến; chỉ đổi trạng thái theo luật
  if (new.quote_id, new.version_no, new.list_price, new.offered_price, new.benefits, new.valid_until, new.note, new.needs_approval, new.created_by, new.created_at)
     is distinct from (old.quote_id, old.version_no, old.list_price, old.offered_price, old.benefits, old.valid_until, old.note, old.needs_approval, old.created_by, old.created_at) then
    raise exception 'Phiên bản báo giá đã lập không sửa. Lập phiên bản mới.' using errcode = '22023';
  end if;
  if new.status = old.status then
    if (new.decided_by, new.decided_at, new.decision_reason) is distinct from (old.decided_by, old.decided_at, old.decision_reason) then
      raise exception 'Không sửa quyết định duyệt đã ghi.' using errcode = '22023';
    end if;
    return new;
  end if;
  select * into q from public.quotes x where x.id = new.quote_id;

  if old.status = 'pending_approval' and new.status in ('issued', 'rejected') then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý/admin được duyệt hoặc từ chối giá báo thấp hơn mức cho phép.' using errcode = '42501';
    end if;
    if length(btrim(coalesce(new.decision_reason, ''))) = 0 then
      raise exception 'Ghi lý do duyệt hoặc từ chối.' using errcode = '22023';
    end if;
    if new.status = 'issued' and new.valid_until <= now() then
      raise exception 'Phiên bản đã hết hạn hiệu lực, không duyệt. Lập phiên bản mới.' using errcode = '22023';
    end if;
    if not private.is_system() then new.decided_by := (select auth.uid()); end if;
    new.decided_at := now();
    return new;
  end if;
  if (new.decided_by, new.decided_at, new.decision_reason) is distinct from (old.decided_by, old.decided_at, old.decision_reason) then
    raise exception 'Chỉ bước duyệt mới ghi quyết định.' using errcode = '22023';
  end if;
  if old.status = 'pending_approval' and new.status = 'cancelled' then return new; end if;   -- thay bằng phiên bản mới / hủy báo giá
  if old.status = 'issued' and new.status in ('superseded', 'cancelled') then return new; end if;
  if old.status = 'issued' and new.status = 'accepted' then
    if new.valid_until <= now() then
      raise exception 'Báo giá đã hết hạn hiệu lực, không chấp nhận. Lập phiên bản mới.' using errcode = '22023';
    end if;
    return new;
  end if;
  v_text := format('Không thể chuyển phiên bản báo giá từ "%s" sang "%s".', old.status, new.status);
  raise exception '%', v_text using errcode = '22023';
end $$;
create trigger quote_versions_guard before insert or update or delete on public.quote_versions for each row execute function private.quote_versions_guard();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.quotes enable row level security;
alter table public.quote_versions enable row level security;
create policy quotes_select on public.quotes for select to authenticated using (
  private.is_manager() or private.can_see_finance() or (private.can_sell() and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))));
create policy quotes_insert on public.quotes for insert to authenticated with check (private.can_sell());
create policy quotes_update on public.quotes for update to authenticated
  using (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())))
  with check (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())));
create policy quote_versions_select on public.quote_versions for select to authenticated using (
  exists (select 1 from public.quotes q where q.id = quote_id));
create policy quote_versions_insert on public.quote_versions for insert to authenticated with check (private.can_sell());
create policy quote_versions_update on public.quote_versions for update to authenticated
  using (private.is_manager() or exists (select 1 from public.quotes q where q.id = quote_id and q.owner_id = (select auth.uid()) and private.can_sell()))
  with check (private.is_manager() or exists (select 1 from public.quotes q where q.id = quote_id and q.owner_id = (select auth.uid()) and private.can_sell()));
revoke delete, truncate on public.quotes, public.quote_versions from authenticated, anon;
revoke all on public.quotes, public.quote_versions from anon;

-- ---------------------------------------------------------------------
-- RPC. Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_quote(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; v_ver uuid := (p ->> 'version_request_id')::uuid;
begin
  if v_request is null or v_ver is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select q.id into v_id from public.quotes q where q.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.quotes (vehicle_id, demand_id, client_request_id)
  values ((p ->> 'vehicle_id')::uuid, (p ->> 'demand_id')::uuid, v_request)
  returning id into v_id;
  insert into public.quote_versions (quote_id, version_no, offered_price, benefits, valid_until, note, needs_approval, status, client_request_id)
  values (v_id, 1, (p ->> 'offered_price')::numeric, nullif(btrim(p ->> 'benefits'), ''), (p ->> 'valid_until')::timestamptz,
          nullif(btrim(p ->> 'note'), ''), false, 'issued', v_ver);
  return v_id;
exception when unique_violation then
  select q.id into v_id from public.quotes q where q.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Đã có báo giá đang mở cho khách và xe này. Lập phiên bản mới thay vì báo giá mới.' using errcode = '22023';
end $$;

-- Lập phiên bản mới: bản đang hiệu lực/chờ duyệt trước đó bị thay thế (bản bị từ chối giữ nguyên để làm bằng chứng).
create or replace function public.revise_quote(p_id uuid, p_version integer, p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; v_next integer; v_qv integer;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select x.id into v_id from public.quote_versions x where x.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  update public.quotes q set status = q.status where q.id = p_id and q.version = p_version and q.status = 'open' returning q.version into v_qv;
  if v_qv is null then
    raise exception 'Báo giá vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.quote_versions x set status = 'superseded' where x.quote_id = p_id and x.status = 'issued';
  update public.quote_versions x set status = 'cancelled' where x.quote_id = p_id and x.status = 'pending_approval';
  select coalesce(max(x.version_no), 0) + 1 into v_next from public.quote_versions x where x.quote_id = p_id;
  insert into public.quote_versions (quote_id, version_no, offered_price, benefits, valid_until, note, needs_approval, status, client_request_id)
  values (p_id, v_next, (p ->> 'offered_price')::numeric, nullif(btrim(p ->> 'benefits'), ''), (p ->> 'valid_until')::timestamptz,
          nullif(btrim(p ->> 'note'), ''), false, 'issued', v_request)
  returning id into v_id;
  return v_id;
end $$;

-- Quản lý duyệt/từ chối phiên bản đang chờ duyệt.
create or replace function public.decide_quote_version(p_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý/admin được duyệt hoặc từ chối giá báo thấp hơn mức cho phép.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do duyệt hoặc từ chối.' using errcode = '22023';
  end if;
  update public.quote_versions x set status = case when p_approve then 'issued' else 'rejected' end, decision_reason = btrim(p_reason)
  where x.id = p_id and x.status = 'pending_approval';
  if not found then
    raise exception 'Không tìm thấy phiên bản đang chờ duyệt (có thể đã được xử lý hoặc đã thay thế). Tải lại trang.' using errcode = '40001';
  end if;
end $$;

-- Khách đồng ý MỘT phiên bản đã phát hành và còn hạn.
create or replace function public.accept_quote(p_id uuid, p_version integer, p_version_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_qv integer;
begin
  update public.quotes q set status = 'accepted' where q.id = p_id and q.version = p_version and q.status = 'open' returning q.version into v_qv;
  if v_qv is null then
    raise exception 'Báo giá vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.quote_versions x set status = 'accepted' where x.id = p_version_id and x.quote_id = p_id and x.status = 'issued';
  if not found then
    raise exception 'Chỉ chấp nhận được phiên bản đã phát hành (đã duyệt nếu cần) và còn hạn.' using errcode = '22023';
  end if;
  return v_qv;
end $$;

create or replace function public.cancel_quote(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_qv integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy báo giá.' using errcode = '22023';
  end if;
  update public.quotes q set status = 'cancelled', end_reason = btrim(p_reason) where q.id = p_id and q.version = p_version and q.status = 'open' returning q.version into v_qv;
  if v_qv is null then
    raise exception 'Báo giá vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.quote_versions x set status = 'cancelled' where x.quote_id = p_id and x.status in ('issued', 'pending_approval');
  return v_qv;
end $$;

revoke execute on function public.create_quote(jsonb) from public, anon;
revoke execute on function public.revise_quote(uuid, integer, jsonb) from public, anon;
revoke execute on function public.decide_quote_version(uuid, boolean, text) from public, anon;
revoke execute on function public.accept_quote(uuid, integer, uuid) from public, anon;
revoke execute on function public.cancel_quote(uuid, integer, text) from public, anon;
grant execute on function public.create_quote(jsonb) to authenticated;
grant execute on function public.revise_quote(uuid, integer, jsonb) to authenticated;
grant execute on function public.decide_quote_version(uuid, boolean, text) to authenticated;
grant execute on function public.accept_quote(uuid, integer, uuid) to authenticated;
grant execute on function public.cancel_quote(uuid, integer, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
