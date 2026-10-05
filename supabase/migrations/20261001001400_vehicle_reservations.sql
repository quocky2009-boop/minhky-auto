-- =====================================================================
-- MINH KỲ AUTO — 1400 Chặng 5 (lát 1): giữ xe và đặt cọc — độc quyền theo xe
--
-- CLAUDE.md §9 / §12.4: một xe KHÔNG có hai giữ/cọc hiệu lực; hai người giữ/cọc cùng xe thì chỉ một giao dịch thắng (chặn ở database).
--  * vehicle_reservations: giữ xe (có hạn, bắt buộc nhập hạn) hoặc đặt cọc (có số tiền cọc thỏa thuận), gắn NHU CẦU MUA → khách.
--  * Độc quyền: unique index một dòng `active` / xe. Người đến sau nhận lỗi rõ ràng, không ghi đè.
--  * Trạng thái xe (held/deposited/available) do trigger đồng bộ — không đặt tay.
--  * Hết hạn giữ: nhả LƯỜI khi có người giữ/cọc xe đó hoặc quản lý bấm nhả (không cần job nền); không có hạn mặc định — người giữ nhập hạn.
--  * Cọc: số tiền cọc là số THỎA THUẬN. Tiền cọc thực nhận/hoàn là chứng từ thu chi (lát sau); cọc không phải lợi nhuận.
--  * Xe ký gửi chỉ giữ/cọc được khi có hợp đồng ký gửi hiệu lực (trigger của xe, lát 4).
--  * Không xóa: kết thúc bằng nhả giữ / hủy cọc (quản lý) / chuyển giữ → cọc, đều có lý do và người thực hiện.
-- Quyền: sales giữ/cọc cho nhu cầu mình phụ trách và chỉ thấy bản ghi của mình; quản lý/kế toán thấy tất cả.
-- Sales khác chỉ biết "xe đang được giữ/cọc" + người phụ trách + hạn giữ qua hàm hẹp public_reservation_info (không lộ khách, số tiền).
-- =====================================================================

create sequence public.reservation_code_seq;

create table public.vehicle_reservations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('GC' || lpad(nextval('public.reservation_code_seq')::text, 5, '0')),
  vehicle_id uuid not null references public.vehicles (id),
  demand_id uuid not null references public.demands (id),
  customer_id uuid not null references public.customers (id),
  kind text not null check (kind in ('hold', 'deposit')),
  status text not null default 'active' check (status in ('active', 'converted', 'released', 'cancelled', 'fulfilled')),
  owner_id uuid not null references public.profiles (id),

  valid_until timestamptz,                                    -- giữ xe: bắt buộc; cọc: tùy chọn
  deposit_amount numeric(18, 0) check (deposit_amount > 0),   -- tiền cọc THỎA THUẬN (chưa phải đã thu)
  agreed_price numeric(18, 0) check (agreed_price > 0),
  note text,
  converted_from uuid references public.vehicle_reservations (id),

  end_reason text,
  ended_by uuid references public.profiles (id),              -- null = hệ thống (hết hạn giữ)
  ended_at timestamptz,

  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,

  constraint reservations_hold_shape check (
    (kind = 'hold' and valid_until is not null and deposit_amount is null)
    or (kind = 'deposit' and deposit_amount is not null)),
  constraint reservations_end_complete check (
    status not in ('released', 'cancelled', 'converted') or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null)),
  constraint reservations_no_self_convert check (converted_from is null or converted_from <> id)
);
-- ĐỘC QUYỀN: tối đa một giữ/cọc hiệu lực cho mỗi xe — chặn ở database, kể cả khi hai người bấm cùng lúc.
create unique index vehicle_reservations_one_active on public.vehicle_reservations (vehicle_id) where status = 'active';
create index vehicle_reservations_demand_idx on public.vehicle_reservations (demand_id);
create index vehicle_reservations_vehicle_idx on public.vehicle_reservations (vehicle_id, created_at desc);
create index vehicle_reservations_expiry_idx on public.vehicle_reservations (valid_until) where status = 'active' and kind = 'hold';

create trigger vehicle_reservations_touch before update on public.vehicle_reservations for each row execute function private.touch_row();
create trigger vehicle_reservations_audit after insert or update on public.vehicle_reservations for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.vehicle_reservations_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v public.vehicles; d public.demands; v_expired boolean; v_text text;
begin
  if tg_op = 'INSERT' then
    if not (private.can_sell() or private.is_system()) then
      raise exception 'Anh/chị không có quyền giữ xe hoặc đặt cọc.' using errcode = '42501';
    end if;
    if new.status <> 'active' or new.ended_at is not null then
      raise exception 'Giữ/cọc mới phải ở trạng thái hiệu lực.' using errcode = '22023';
    end if;
    select * into d from public.demands x where x.id = new.demand_id;
    if d.id is null then
      raise exception 'Không tìm thấy nhu cầu mua hoặc anh/chị không có quyền với nhu cầu này.' using errcode = '22023';
    end if;
    if d.kind <> 'buy' then
      raise exception 'Giữ xe/đặt cọc phải gắn với nhu cầu MUA của khách.' using errcode = '22023';
    end if;
    if d.status in ('closed', 'won', 'paused') then
      raise exception 'Nhu cầu mua đã đóng/tạm dừng/đã thành công, không giữ xe cho nhu cầu này.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or private.can_edit_demand(d.id)) then
      raise exception 'Chỉ người phụ trách nhu cầu hoặc quản lý được giữ xe/đặt cọc cho nhu cầu này.' using errcode = '42501';
    end if;
    select * into v from public.vehicles x where x.id = new.vehicle_id;
    if v.id is null then
      raise exception 'Không tìm thấy xe.' using errcode = '22023';
    end if;
    if v.archived_at is not null then
      raise exception 'Xe đã lưu trữ.' using errcode = '22023';
    end if;
    if v.sale_status <> 'available' then
      v_text := case v.sale_status
        when 'held' then 'Xe đang được người khác giữ. Không thể giữ hoặc đặt cọc thêm.'
        when 'deposited' then 'Xe đã có người đặt cọc. Không thể giữ hoặc đặt cọc thêm.'
        when 'not_listed' then 'Xe chưa chào bán nên chưa giữ hoặc đặt cọc được.'
        else 'Xe không ở trạng thái sẵn bán (đã bán/đã giao/đã trả chủ).' end;
      raise exception '%', v_text using errcode = '22023';
    end if;
    if new.kind = 'hold' and new.valid_until <= now() then
      raise exception 'Hạn giữ xe phải ở tương lai.' using errcode = '22023';
    end if;
    if new.valid_until is not null and new.valid_until <= now() then
      raise exception 'Hạn hiệu lực phải ở tương lai.' using errcode = '22023';
    end if;
    new.customer_id := d.customer_id;                                   -- khách lấy từ nhu cầu, không tin dữ liệu gửi lên
    new.owner_id := coalesce(d.owner_id, (select auth.uid()));
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Không xóa giữ/cọc. Nhả giữ hoặc hủy cọc (có lý do).' using errcode = '22023';
  end if;

  if (new.vehicle_id, new.demand_id, new.customer_id, new.kind, new.deposit_amount, new.agreed_price, new.owner_id, new.converted_from, new.created_by, new.created_at, new.code)
     is distinct from (old.vehicle_id, old.demand_id, old.customer_id, old.kind, old.deposit_amount, old.agreed_price, old.owner_id, old.converted_from, old.created_by, old.created_at, old.code) then
    raise exception 'Không đổi xe, khách, loại, số tiền cọc hoặc người phụ trách của giữ/cọc. Nhả/hủy rồi lập lại.' using errcode = '22023';
  end if;
  if old.status <> 'active' then
    raise exception 'Giữ/cọc đã kết thúc, không sửa.' using errcode = '22023';
  end if;
  v_expired := old.kind = 'hold' and old.valid_until is not null and old.valid_until <= now();

  if new.status = 'active' then
    -- chỉ cho gia hạn (giữ xe) và sửa ghi chú
    if new.valid_until is distinct from old.valid_until then
      if old.kind <> 'hold' then
        raise exception 'Chỉ gia hạn được giữ xe.' using errcode = '22023';
      end if;
      if not (private.is_manager() or private.is_system() or old.owner_id = (select auth.uid())) then
        raise exception 'Chỉ người phụ trách hoặc quản lý được gia hạn giữ xe.' using errcode = '42501';
      end if;
      if v_expired then
        raise exception 'Giữ xe đã hết hạn, không gia hạn. Giữ lại nếu xe còn sẵn bán.' using errcode = '22023';
      end if;
      if new.valid_until <= old.valid_until or new.valid_until <= now() then
        raise exception 'Hạn mới phải sau hạn hiện tại và ở tương lai.' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  if (new.end_reason, new.ended_by, new.ended_at) is not distinct from (old.end_reason, old.ended_by, old.ended_at) and new.status <> 'active' then
    raise exception 'Kết thúc giữ/cọc phải ghi lý do.' using errcode = '22023';
  end if;
  if new.status = 'released' then
    if old.kind <> 'hold' then
      raise exception 'Đặt cọc không "nhả giữ": quản lý hủy cọc (có lý do) để xử lý tiền cọc.' using errcode = '22023';
    end if;
    if not (v_expired or private.is_manager() or private.is_system() or old.owner_id = (select auth.uid())) then
      raise exception 'Chỉ người phụ trách hoặc quản lý được nhả giữ xe (giữ hết hạn thì ai cũng nhả được).' using errcode = '42501';
    end if;
    if not (private.is_system() or (new.ended_by is null and v_expired and new.end_reason = 'Hết hạn giữ xe')) then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  if new.status = 'converted' then
    if old.kind <> 'hold' then
      raise exception 'Chỉ chuyển giữ xe thành đặt cọc.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or old.owner_id = (select auth.uid())) then
      raise exception 'Chỉ người phụ trách hoặc quản lý được chuyển giữ xe thành đặt cọc.' using errcode = '42501';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  if new.status = 'cancelled' then
    if old.kind <> 'deposit' then
      raise exception 'Giữ xe dùng "nhả giữ", không dùng "hủy cọc".' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy cọc (liên quan tiền cọc đã nhận).' using errcode = '42501';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  if new.status = 'fulfilled' then
    if not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được chốt giữ/cọc thành đơn bán.' using errcode = '42501';
    end if;
    new.ended_at := now();
    return new;
  end if;
  raise exception 'Không thể chuyển giữ/cọc từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger vehicle_reservations_guard before insert or update or delete on public.vehicle_reservations for each row execute function private.vehicle_reservations_guard();

-- Đồng bộ trạng thái xe và ghi nhật ký vào nhu cầu. SECURITY DEFINER hẹp: chỉ đặt held/deposited/available theo giữ/cọc, không nhận tham số.
create or replace function private.vehicle_reservations_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_code text; v_msg text;
begin
  select v.code into v_code from public.vehicles v where v.id = new.vehicle_id;
  if new.status = 'active' then
    update public.vehicles v set sale_status = case new.kind when 'hold' then 'held' else 'deposited' end
    where v.id = new.vehicle_id and v.sale_status in ('available', 'held', 'deposited')
      and v.sale_status <> case new.kind when 'hold' then 'held' else 'deposited' end;
    if tg_op = 'INSERT' then
      v_msg := case new.kind
        when 'hold' then 'Đã giữ xe ' || v_code || ' đến ' || to_char(new.valid_until at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
        else 'Đã đặt cọc xe ' || v_code end;
    elsif new.valid_until is distinct from old.valid_until then
      v_msg := 'Đã gia hạn giữ xe ' || v_code || ' đến ' || to_char(new.valid_until at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI');
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status in ('released', 'cancelled', 'converted') then
    if not exists (select 1 from public.vehicle_reservations r where r.vehicle_id = new.vehicle_id and r.status = 'active') then
      update public.vehicles v set sale_status = 'available' where v.id = new.vehicle_id and v.sale_status in ('held', 'deposited');
    end if;
    v_msg := case new.status
      when 'released' then 'Đã nhả giữ xe ' || v_code
      when 'cancelled' then 'Đã hủy cọc xe ' || v_code
      else 'Đã chuyển giữ xe ' || v_code || ' thành đặt cọc' end;
  end if;
  if v_msg is not null then   -- không ghi số tiền vào nhật ký nhu cầu (sales đọc được)
    insert into public.demand_activities (demand_id, actor_id, channel, content) values (new.demand_id, (select auth.uid()), 'system', v_msg);
  end if;
  return new;
end $$;
create trigger vehicle_reservations_sync after insert or update on public.vehicle_reservations for each row execute function private.vehicle_reservations_sync();

-- Nhả LƯỜI các giữ xe đã hết hạn (một xe hoặc tất cả). Gọi trước khi giữ/cọc xe và khi quản lý bấm "nhả giữ hết hạn".
create or replace function private.release_expired_reservations(p_vehicle uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with u as (
    update public.vehicle_reservations r
       set status = 'released', end_reason = 'Hết hạn giữ xe', ended_at = now(), ended_by = null
     where r.status = 'active' and r.kind = 'hold' and r.valid_until <= now() and (p_vehicle is null or r.vehicle_id = p_vehicle)
    returning 1)
  select count(*) into n from u;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- RLS: sales chỉ thấy bản ghi của mình; quản lý/kế toán thấy tất cả. Không xóa.
-- ---------------------------------------------------------------------
alter table public.vehicle_reservations enable row level security;
create policy reservations_select on public.vehicle_reservations for select to authenticated using (
  private.is_manager() or private.can_see_finance() or (private.can_sell() and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))));
create policy reservations_insert on public.vehicle_reservations for insert to authenticated with check (private.can_sell());
create policy reservations_update on public.vehicle_reservations for update to authenticated
  using (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())))
  with check (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())));
revoke delete, truncate on public.vehicle_reservations from authenticated, anon;
revoke all on public.vehicle_reservations from anon;

-- ---------------------------------------------------------------------
-- RPC. Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.reserve_vehicle(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; v_vehicle uuid := (p ->> 'vehicle_id')::uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select r.id into v_id from public.vehicle_reservations r where r.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  perform private.release_expired_reservations(v_vehicle);   -- nhả giữ đã hết hạn của xe này trước khi giữ mới
  insert into public.vehicle_reservations (vehicle_id, demand_id, kind, valid_until, deposit_amount, agreed_price, note, client_request_id)
  values (v_vehicle, (p ->> 'demand_id')::uuid, p ->> 'kind', nullif(p ->> 'valid_until', '')::timestamptz,
          nullif(p ->> 'deposit_amount', '')::numeric, nullif(p ->> 'agreed_price', '')::numeric, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select r.id into v_id from public.vehicle_reservations r where r.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Xe vừa được người khác giữ hoặc đặt cọc. Không thể giữ/cọc thêm.' using errcode = '22023';
end $$;

create or replace function public.release_reservation(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do nhả giữ xe.' using errcode = '22023';
  end if;
  update public.vehicle_reservations r set status = 'released', end_reason = btrim(p_reason)
  where r.id = p_id and r.version = p_version and r.status = 'active'
  returning r.version into v_ver;
  if v_ver is null then
    raise exception 'Giữ xe vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.cancel_deposit(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy cọc.' using errcode = '22023';
  end if;
  update public.vehicle_reservations r set status = 'cancelled', end_reason = btrim(p_reason)
  where r.id = p_id and r.version = p_version and r.status = 'active'
  returning r.version into v_ver;
  if v_ver is null then
    raise exception 'Đặt cọc vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.extend_hold(p_id uuid, p_version integer, p_valid_until timestamptz)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.vehicle_reservations r set valid_until = p_valid_until
  where r.id = p_id and r.version = p_version and r.status = 'active' and r.kind = 'hold'
  returning r.version into v_ver;
  if v_ver is null then
    raise exception 'Giữ xe vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

-- Chuyển giữ xe thành đặt cọc trong MỘT giao dịch (xe không bao giờ "trống" giữa hai bước).
create or replace function public.convert_hold_to_deposit(p_id uuid, p_version integer, p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; h public.vehicle_reservations;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select r.id into v_id from public.vehicle_reservations r where r.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  select * into h from public.vehicle_reservations r where r.id = p_id and r.version = p_version and r.status = 'active' and r.kind = 'hold';
  if h.id is null then
    raise exception 'Giữ xe vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.vehicle_reservations r set status = 'converted', end_reason = 'Chuyển thành đặt cọc' where r.id = p_id;
  insert into public.vehicle_reservations (vehicle_id, demand_id, kind, valid_until, deposit_amount, agreed_price, note, converted_from, client_request_id)
  values (h.vehicle_id, h.demand_id, 'deposit', nullif(p ->> 'valid_until', '')::timestamptz, (p ->> 'deposit_amount')::numeric,
          coalesce(nullif(p ->> 'agreed_price', '')::numeric, h.agreed_price), coalesce(nullif(btrim(p ->> 'note'), ''), h.note), p_id, v_request)
  returning id into v_id;
  return v_id;
end $$;

-- Quản lý nhả mọi giữ xe đã hết hạn.
create or replace function public.release_expired_holds()
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được nhả giữ xe hết hạn hàng loạt.' using errcode = '42501';
  end if;
  return private.release_expired_reservations(null);
end $$;

-- Thông tin tối thiểu cho sales KHÁC xem một xe đang bị giữ/cọc: loại, người phụ trách, hạn giữ. Không lộ khách, số tiền, giá chốt.
create or replace function public.public_reservation_info(p_vehicle uuid)
returns table (kind text, owner_name text, valid_until timestamptz, is_mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.kind, p.full_name, case when r.kind = 'hold' then r.valid_until end, r.owner_id = (select auth.uid())
  from public.vehicle_reservations r join public.profiles p on p.id = r.owner_id
  where r.vehicle_id = p_vehicle and r.status = 'active' and private.is_staff()
$$;

revoke execute on function public.reserve_vehicle(jsonb) from public, anon;
revoke execute on function public.release_reservation(uuid, integer, text) from public, anon;
revoke execute on function public.cancel_deposit(uuid, integer, text) from public, anon;
revoke execute on function public.extend_hold(uuid, integer, timestamptz) from public, anon;
revoke execute on function public.convert_hold_to_deposit(uuid, integer, jsonb) from public, anon;
revoke execute on function public.release_expired_holds() from public, anon;
revoke execute on function public.public_reservation_info(uuid) from public, anon;
grant execute on function public.reserve_vehicle(jsonb) to authenticated;
grant execute on function public.release_reservation(uuid, integer, text) to authenticated;
grant execute on function public.cancel_deposit(uuid, integer, text) to authenticated;
grant execute on function public.extend_hold(uuid, integer, timestamptz) to authenticated;
grant execute on function public.convert_hold_to_deposit(uuid, integer, jsonb) to authenticated;
grant execute on function public.release_expired_holds() to authenticated;
grant execute on function public.public_reservation_info(uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
