-- =====================================================================
-- MINH KỲ AUTO — 1600 Chặng 5 (lát 3): đơn bán nhiều xe + hợp đồng bán
--
-- CLAUDE.md §9: "Đơn bán nhiều xe dùng dòng chi tiết, không ép toàn hệ thống một xe/một hợp đồng." Một xe không có hai đơn bán hiệu lực.
--  * sales_orders: một đơn bán cho MỘT khách (qua nhu cầu mua), nhiều dòng xe (sales_order_lines), mỗi dòng có GIÁ BÁN ghi trên hợp đồng.
--    Trạng thái: draft (đang soạn) → confirmed (đã ký hợp đồng bán) → cancelled (có lý do). Bàn giao/hoàn tất làm ở lát sau.
--  * Hợp đồng bán: số hợp đồng + ngày ký là bắt buộc khi xác nhận đơn (chưa sinh file hợp đồng; không tải giấy tờ lên).
--  * ĐỘC QUYỀN: unique index một dòng hiệu lực / xe trong toàn hệ thống — hai đơn cùng lúc cho một xe thì chỉ một đơn thắng (chặn ở database).
--  * Giá: dòng có thể gắn phiên bản báo giá ĐÃ CHẤP NHẬN (giá phải đúng bằng giá báo → coi như đã qua duyệt). Dòng khác báo giá mà giá thấp hơn mức cho phép
--    (cùng luật private.quote_needs_approval với báo giá) thì CHỈ quản lý/admin xác nhận được và phải ghi lý do duyệt.
--  * Xác nhận đơn: xe chuyển "đã bán" (trigger đồng bộ), giữ/cọc hiệu lực của chính nhu cầu đó chuyển "đã thành đơn bán"; nhật ký nhu cầu không ghi số tiền.
--  * Hủy: đơn nháp do người phụ trách/quản lý hủy; đơn đã xác nhận chỉ quản lý hủy, bắt buộc lý do; xe trở lại "đang bán". Lát thu chi sẽ chặn hủy khi đã nhận tiền.
--  * Tiền cọc/thanh toán/công nợ không nằm ở đây (lát thu chi). Giá bán ở đây KHÔNG phải tiền đã thu.
-- =====================================================================

create sequence public.sales_order_code_seq;

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DB' || lpad(nextval('public.sales_order_code_seq')::text, 5, '0')),
  demand_id uuid not null references public.demands (id),
  customer_id uuid not null references public.customers (id),
  owner_id uuid not null references public.profiles (id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  contract_ref text,
  contract_date date,
  note text,
  approval_reason text,                                       -- lý do quản lý duyệt khi có dòng thấp hơn mức cho phép
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
  constraint sales_orders_confirmed_complete check (status <> 'confirmed' or (
    length(btrim(coalesce(contract_ref, ''))) > 0 and contract_date is not null and confirmed_by is not null and confirmed_at is not null)),
  constraint sales_orders_cancel_complete check (status <> 'cancelled' or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null))
);
create index sales_orders_demand_idx on public.sales_orders (demand_id);
create index sales_orders_status_idx on public.sales_orders (status, created_at desc);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders (id),
  vehicle_id uuid not null references public.vehicles (id),
  sale_price numeric(18, 0) not null check (sale_price > 0),   -- giá bán ghi trên hợp đồng (chưa phải tiền đã thu)
  quote_version_id uuid references public.quote_versions (id),
  vehicle_label text not null default '',                       -- ảnh chụp mã/hãng/dòng/đời xe lúc lập (sales không đọc được xe sau khi đã bán)
  needs_approval boolean not null,                              -- database tính; true = thấp hơn mức cho phép → quản lý duyệt khi xác nhận
  line_status text not null default 'active' check (line_status in ('active', 'removed', 'cancelled')),
  note text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
-- ĐỘC QUYỀN: một xe chỉ nằm trong MỘT dòng đơn bán hiệu lực (đơn nháp hoặc đã xác nhận).
create unique index sales_order_lines_one_active_vehicle on public.sales_order_lines (vehicle_id) where line_status = 'active';
create unique index sales_order_lines_one_active_quote on public.sales_order_lines (quote_version_id) where line_status = 'active' and quote_version_id is not null;
create index sales_order_lines_order_idx on public.sales_order_lines (order_id);

create trigger sales_orders_touch before update on public.sales_orders for each row execute function private.touch_row();
create trigger sales_orders_audit after insert or update on public.sales_orders for each row execute function private.audit_row();
create trigger sales_order_lines_audit after insert or update on public.sales_order_lines for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.sales_orders_guard()
returns trigger language plpgsql set search_path = '' as $$
declare d public.demands; v_lines integer; v_need integer;
begin
  if tg_op = 'INSERT' then
    if not (private.can_sell() or private.is_system()) then
      raise exception 'Anh/chị không có quyền lập đơn bán.' using errcode = '42501';
    end if;
    if new.status <> 'draft' or new.confirmed_at is not null or new.ended_at is not null then
      raise exception 'Đơn bán mới phải ở trạng thái đang soạn.' using errcode = '22023';
    end if;
    select * into d from public.demands x where x.id = new.demand_id;
    if d.id is null then
      raise exception 'Không tìm thấy nhu cầu mua hoặc anh/chị không có quyền với nhu cầu này.' using errcode = '22023';
    end if;
    if d.kind <> 'buy' then
      raise exception 'Đơn bán phải gắn với nhu cầu MUA của khách.' using errcode = '22023';
    end if;
    if d.status in ('closed', 'paused') then
      raise exception 'Nhu cầu mua đã đóng hoặc tạm dừng, không lập đơn bán.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or private.can_edit_demand(d.id)) then
      raise exception 'Chỉ người phụ trách nhu cầu hoặc quản lý được lập đơn bán cho nhu cầu này.' using errcode = '42501';
    end if;
    new.customer_id := d.customer_id;
    new.owner_id := coalesce(d.owner_id, (select auth.uid()));
    new.approval_reason := null;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Không xóa đơn bán. Hủy đơn bán (có lý do).' using errcode = '22023';
  end if;

  if (new.code, new.demand_id, new.customer_id, new.owner_id, new.created_by, new.created_at)
     is distinct from (old.code, old.demand_id, old.customer_id, old.owner_id, old.created_by, old.created_at) then
    raise exception 'Không đổi khách, nhu cầu hoặc người phụ trách của đơn bán. Hủy rồi lập đơn mới.' using errcode = '22023';
  end if;
  if old.status = 'cancelled' then
    raise exception 'Đơn bán đã hủy, không sửa.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system() or (old.status = 'draft' and old.owner_id = (select auth.uid()))) then
    raise exception 'Chỉ người phụ trách (khi đang soạn) hoặc quản lý được thao tác đơn bán này.' using errcode = '42501';
  end if;

  if old.status = 'confirmed' and new.status = 'confirmed' then
    if (new.contract_ref, new.contract_date, new.note, new.approval_reason, new.confirmed_by, new.confirmed_at)
       is distinct from (old.contract_ref, old.contract_date, old.note, old.approval_reason, old.confirmed_by, old.confirmed_at) then
      raise exception 'Đơn bán đã xác nhận không sửa hợp đồng/ghi chú. Hủy rồi lập đơn mới nếu sai.' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.status = 'draft' then
    return new;                                                      -- sửa số hợp đồng/ghi chú khi đang soạn
  end if;

  if new.status = 'confirmed' then
    if old.status <> 'draft' then
      raise exception 'Chỉ xác nhận được đơn đang soạn.' using errcode = '22023';
    end if;
    if length(btrim(coalesce(new.contract_ref, ''))) = 0 or new.contract_date is null then
      raise exception 'Xác nhận đơn bán cần số hợp đồng bán và ngày ký.' using errcode = '22023';
    end if;
    if new.contract_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Ngày ký hợp đồng không được ở tương lai.' using errcode = '22023';
    end if;
    select count(*), count(*) filter (where l.needs_approval) into v_lines, v_need
    from public.sales_order_lines l where l.order_id = old.id and l.line_status = 'active';
    if v_lines = 0 then
      raise exception 'Đơn bán chưa có xe nào.' using errcode = '22023';
    end if;
    if v_need > 0 then
      if not (private.is_manager() or private.is_system()) then
        raise exception 'Có xe bán thấp hơn mức cho phép: chỉ quản lý/admin được xác nhận đơn này.' using errcode = '42501';
      end if;
      if length(btrim(coalesce(new.approval_reason, ''))) = 0 then
        raise exception 'Ghi lý do duyệt giá bán thấp hơn mức cho phép.' using errcode = '22023';
      end if;
    else
      new.approval_reason := null;
    end if;
    if not private.is_system() then new.confirmed_by := (select auth.uid()); end if;
    new.confirmed_at := now();
    return new;
  end if;

  if new.status = 'cancelled' then
    if length(btrim(coalesce(new.end_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy đơn bán.' using errcode = '22023';
    end if;
    if old.status = 'confirmed' and not (private.is_manager() or private.is_system()) then
      raise exception 'Chỉ quản lý được hủy đơn bán đã xác nhận.' using errcode = '42501';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;
  raise exception 'Không thể chuyển đơn bán từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger sales_orders_guard before insert or update or delete on public.sales_orders for each row execute function private.sales_orders_guard();

create or replace function private.sales_order_lines_guard()
returns trigger language plpgsql set search_path = '' as $$
declare o public.sales_orders; v public.vehicles; qv public.quote_versions; q public.quotes; v_text text; v_make text; v_model text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa dòng đơn bán.' using errcode = '22023';
  end if;
  select * into o from public.sales_orders x where x.id = new.order_id;
  if o.id is null then
    raise exception 'Không tìm thấy đơn bán hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if o.status <> 'draft' then
      raise exception 'Chỉ thêm xe vào đơn đang soạn.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or o.owner_id = (select auth.uid())) then
      raise exception 'Chỉ người phụ trách hoặc quản lý được sửa đơn bán này.' using errcode = '42501';
    end if;
    if new.line_status <> 'active' then
      raise exception 'Dòng mới phải ở trạng thái hiệu lực.' using errcode = '22023';
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
        when 'not_listed' then 'Xe chưa chào bán nên chưa lập đơn bán được.'
        else 'Xe không còn bán (đã bán/đã giao/đã trả chủ).' end;
      raise exception '%', v_text using errcode = '22023';
    end if;
    if private.quote_vehicle_reserved_by_other(new.vehicle_id, o.demand_id) then
      raise exception 'Xe đang được giữ/đặt cọc cho khách khác. Không lập đơn bán.' using errcode = '22023';
    end if;
    select mk.name, md.name into v_make, v_model from public.vehicle_makes mk, public.vehicle_models md where mk.id = v.make_id and md.id = v.model_id;
    new.vehicle_label := concat_ws(' ', v.code, v_make, v_model, v.year_made);
    if new.quote_version_id is not null then
      select * into qv from public.quote_versions x where x.id = new.quote_version_id;
      select * into q from public.quotes x where x.id = qv.quote_id;
      if qv.id is null or q.id is null then
        raise exception 'Không tìm thấy báo giá hoặc anh/chị không có quyền.' using errcode = '22023';
      end if;
      if qv.status <> 'accepted' or q.vehicle_id <> new.vehicle_id or q.demand_id <> o.demand_id then
        raise exception 'Báo giá gắn vào đơn phải là phiên bản khách đã chấp nhận, đúng xe và đúng nhu cầu của đơn.' using errcode = '22023';
      end if;
      if new.sale_price <> qv.offered_price then
        raise exception 'Giá bán khác giá trong báo giá đã chấp nhận. Bỏ liên kết báo giá nếu thực sự đổi giá (sẽ kiểm tra lại mức cho phép).' using errcode = '22023';
      end if;
      new.needs_approval := false;                                   -- giá đã đi qua duyệt giảm giá của báo giá
    else
      new.needs_approval := private.quote_needs_approval(new.vehicle_id, new.sale_price);
    end if;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if (new.order_id, new.vehicle_id, new.vehicle_label, new.sale_price, new.quote_version_id, new.needs_approval, new.note, new.created_by, new.created_at)
     is distinct from (old.order_id, old.vehicle_id, old.vehicle_label, old.sale_price, old.quote_version_id, old.needs_approval, old.note, old.created_by, old.created_at) then
    raise exception 'Dòng đơn bán không sửa. Bỏ dòng cũ và thêm dòng mới khi đơn còn đang soạn.' using errcode = '22023';
  end if;
  if new.line_status = old.line_status then return new; end if;
  if old.line_status = 'active' and new.line_status = 'removed' and o.status = 'draft'
     and (private.is_manager() or private.is_system() or o.owner_id = (select auth.uid())) then
    return new;
  end if;
  if old.line_status = 'active' and new.line_status = 'cancelled' and o.status = 'cancelled' then return new; end if;
  raise exception 'Không thể đổi trạng thái dòng đơn bán từ "%" sang "%".', old.line_status, new.line_status using errcode = '22023';
end $$;
create trigger sales_order_lines_guard before insert or update or delete on public.sales_order_lines for each row execute function private.sales_order_lines_guard();

-- Đồng bộ khi xác nhận/hủy đơn. SECURITY DEFINER hẹp: không nhận tham số, chỉ làm xe "đã bán" ↔ "đang bán" và chốt giữ/cọc của đúng nhu cầu này.
create or replace function private.sales_orders_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare l record; v_code text; v_msg text; n integer;
begin
  if tg_op <> 'UPDATE' or new.status = old.status then return new; end if;
  if new.status = 'confirmed' then
    for l in select x.vehicle_id from public.sales_order_lines x where x.order_id = new.id and x.line_status = 'active' order by x.vehicle_id loop
      select v.code into v_code from public.vehicles v where v.id = l.vehicle_id for update;
      if private.quote_vehicle_reserved_by_other(l.vehicle_id, new.demand_id) then
        raise exception 'Xe % đang được giữ/đặt cọc cho khách khác. Không xác nhận đơn bán.', v_code using errcode = '22023';
      end if;
      update public.vehicles v set sale_status = 'sold' where v.id = l.vehicle_id and v.sale_status in ('available', 'held', 'deposited');
      get diagnostics n = row_count;
      if n = 0 then
        raise exception 'Xe % không còn ở trạng thái đang bán. Không xác nhận đơn bán.', v_code using errcode = '22023';
      end if;
      update public.vehicle_reservations r set status = 'fulfilled', end_reason = 'Đã thành đơn bán ' || new.code where r.vehicle_id = l.vehicle_id and r.demand_id = new.demand_id and r.status = 'active';
    end loop;
    v_msg := 'Đã xác nhận đơn bán ' || new.code || ' (hợp đồng ' || new.contract_ref || ')';
  elsif new.status = 'cancelled' then
    if old.status = 'confirmed' then
      update public.vehicles v set sale_status = 'available'
      where v.sale_status = 'sold' and v.id in (select x.vehicle_id from public.sales_order_lines x where x.order_id = new.id and x.line_status = 'active');
    end if;
    v_msg := 'Đã hủy đơn bán ' || new.code;
  end if;
  if v_msg is not null then   -- không ghi số tiền vào nhật ký nhu cầu (sales đọc được)
    insert into public.demand_activities (demand_id, actor_id, channel, content) values (new.demand_id, (select auth.uid()), 'system', v_msg);
  end if;
  return new;
end $$;
create trigger sales_orders_sync after update on public.sales_orders for each row execute function private.sales_orders_sync();

-- Giữ/cọc chỉ được chốt "đã thành đơn bán" khi có đơn bán đã xác nhận (hoặc quản lý). Hàm cũ giữ nguyên, chỉ đổi nhánh 'fulfilled'.
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
    -- chỉ khi có đơn bán ĐÃ XÁC NHẬN cho đúng xe + nhu cầu này (lát 3 chốt qua trigger đồng bộ của đơn bán)
    if not (private.is_manager() or private.is_system() or exists (
         select 1 from public.sales_order_lines l join public.sales_orders o on o.id = l.order_id
         where l.vehicle_id = old.vehicle_id and o.demand_id = old.demand_id and o.status = 'confirmed' and l.line_status = 'active')) then
      raise exception 'Chỉ quản lý được chốt giữ/cọc thành đơn bán (hoặc đơn bán đã được xác nhận).' using errcode = '42501';
    end if;
    new.ended_at := now();
    return new;
  end if;
  raise exception 'Không thể chuyển giữ/cọc từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;

-- ---------------------------------------------------------------------
-- RLS: sales chỉ thấy đơn của mình; quản lý/kế toán thấy tất cả. Không xóa.
-- ---------------------------------------------------------------------
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
create policy sales_orders_select on public.sales_orders for select to authenticated using (
  private.is_manager() or private.can_see_finance() or (private.can_sell() and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))));
create policy sales_orders_insert on public.sales_orders for insert to authenticated with check (private.can_sell());
create policy sales_orders_update on public.sales_orders for update to authenticated
  using (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())))
  with check (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())));
create policy sales_order_lines_select on public.sales_order_lines for select to authenticated using (
  exists (select 1 from public.sales_orders o where o.id = order_id));
create policy sales_order_lines_insert on public.sales_order_lines for insert to authenticated with check (private.can_sell());
create policy sales_order_lines_update on public.sales_order_lines for update to authenticated
  using (private.is_manager() or exists (select 1 from public.sales_orders o where o.id = order_id and o.owner_id = (select auth.uid()) and private.can_sell()))
  with check (private.is_manager() or exists (select 1 from public.sales_orders o where o.id = order_id and o.owner_id = (select auth.uid()) and private.can_sell()));
revoke delete, truncate on public.sales_orders, public.sales_order_lines from authenticated, anon;
revoke all on public.sales_orders, public.sales_order_lines from anon;

-- ---------------------------------------------------------------------
-- RPC. Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- p.lines = [{vehicle_id, sale_price, quote_version_id?, note?}]
-- ---------------------------------------------------------------------
create or replace function public.create_sales_order(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; l jsonb;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select o.id into v_id from public.sales_orders o where o.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  if jsonb_typeof(p -> 'lines') is distinct from 'array' or jsonb_array_length(p -> 'lines') = 0 then
    raise exception 'Đơn bán cần ít nhất một xe.' using errcode = '22023';
  end if;
  insert into public.sales_orders (demand_id, contract_ref, contract_date, note, client_request_id)
  values ((p ->> 'demand_id')::uuid, nullif(btrim(p ->> 'contract_ref'), ''), nullif(p ->> 'contract_date', '')::date, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    insert into public.sales_order_lines (order_id, vehicle_id, sale_price, quote_version_id, note)
    values (v_id, (l ->> 'vehicle_id')::uuid, (l ->> 'sale_price')::numeric, nullif(l ->> 'quote_version_id', '')::uuid, nullif(btrim(l ->> 'note'), ''));
  end loop;
  return v_id;
exception when unique_violation then
  select o.id into v_id from public.sales_orders o where o.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Một trong các xe đã nằm trong đơn bán khác đang hiệu lực (hoặc báo giá đã được dùng cho đơn khác).' using errcode = '22023';
end $$;

-- Sửa đơn đang soạn: cập nhật hợp đồng/ghi chú và THAY danh sách xe (dòng cũ chuyển "đã bỏ", vẫn lưu).
create or replace function public.update_sales_order_draft(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer; l jsonb;
begin
  if jsonb_typeof(p -> 'lines') is distinct from 'array' or jsonb_array_length(p -> 'lines') = 0 then
    raise exception 'Đơn bán cần ít nhất một xe.' using errcode = '22023';
  end if;
  update public.sales_orders o set contract_ref = nullif(btrim(p ->> 'contract_ref'), ''), contract_date = nullif(p ->> 'contract_date', '')::date, note = nullif(btrim(p ->> 'note'), '')
  where o.id = p_id and o.version = p_version and o.status = 'draft'
  returning o.version into v_ver;
  if v_ver is null then
    raise exception 'Đơn bán vừa được cập nhật, không còn ở trạng thái đang soạn hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.sales_order_lines x set line_status = 'removed' where x.order_id = p_id and x.line_status = 'active';
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    insert into public.sales_order_lines (order_id, vehicle_id, sale_price, quote_version_id, note)
    values (p_id, (l ->> 'vehicle_id')::uuid, (l ->> 'sale_price')::numeric, nullif(l ->> 'quote_version_id', '')::uuid, nullif(btrim(l ->> 'note'), ''));
  end loop;
  return v_ver;
exception when unique_violation then
  raise exception 'Một trong các xe đã nằm trong đơn bán khác đang hiệu lực (hoặc báo giá đã được dùng cho đơn khác).' using errcode = '22023';
end $$;

-- Xác nhận đơn = đã ký hợp đồng bán: bắt buộc số hợp đồng + ngày ký; có dòng thấp hơn mức cho phép thì chỉ quản lý, kèm lý do.
create or replace function public.confirm_sales_order(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.sales_orders o set status = 'confirmed',
    contract_ref = coalesce(nullif(btrim(p ->> 'contract_ref'), ''), o.contract_ref),
    contract_date = coalesce(nullif(p ->> 'contract_date', '')::date, o.contract_date),
    approval_reason = nullif(btrim(p ->> 'approval_reason'), '')
  where o.id = p_id and o.version = p_version and o.status = 'draft'
  returning o.version into v_ver;
  if v_ver is null then
    raise exception 'Đơn bán vừa được cập nhật, không còn ở trạng thái đang soạn hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.cancel_sales_order(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy đơn bán.' using errcode = '22023';
  end if;
  update public.sales_orders o set status = 'cancelled', end_reason = btrim(p_reason)
  where o.id = p_id and o.version = p_version and o.status in ('draft', 'confirmed')
  returning o.version into v_ver;
  if v_ver is null then
    raise exception 'Đơn bán vừa được cập nhật, đã hủy hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  update public.sales_order_lines x set line_status = 'cancelled' where x.order_id = p_id and x.line_status = 'active';
  return v_ver;
end $$;

revoke execute on function public.create_sales_order(jsonb) from public, anon;
revoke execute on function public.update_sales_order_draft(uuid, integer, jsonb) from public, anon;
revoke execute on function public.confirm_sales_order(uuid, integer, jsonb) from public, anon;
revoke execute on function public.cancel_sales_order(uuid, integer, text) from public, anon;
grant execute on function public.create_sales_order(jsonb) to authenticated;
grant execute on function public.update_sales_order_draft(uuid, integer, jsonb) to authenticated;
grant execute on function public.confirm_sales_order(uuid, integer, jsonb) to authenticated;
grant execute on function public.cancel_sales_order(uuid, integer, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
