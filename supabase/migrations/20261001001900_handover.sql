-- =====================================================================
-- MINH KỲ AUTO — 1900 Chặng 5 (lát 6): bàn giao xe và hồ sơ
--
-- CLAUDE.md §9: "Bàn giao/hồ sơ: checklist cấu hình, bản gốc, bản scan, người giữ, điều kiện giao xe, phê duyệt ngoại lệ và ảnh/biên bản."
--  * handover_templates: DANH MỤC checklist cấu hình được (quản lý sửa). Mục mặc định do đội phát triển soạn — D73 (Tạm).
--  * handovers (BN#####): MỘT bàn giao cho MỘT dòng xe của đơn bán đã ký (đơn nhiều xe → nhiều bàn giao). Đang chuẩn bị → đã giao | đã hủy.
--  * handover_items: ảnh chụp checklist lúc lập (nhãn + bắt buộc) với trạng thái từng mục, BẢN GỐC (có/không), BẢN SCAN (chỉ ghi có/không — không tải giấy tờ lên, D37) và NGƯỜI GIỮ.
--  * ĐIỀU KIỆN GIAO XE do database kiểm khi giao: (1) đơn đã ký hợp đồng — không miễn được; (2) thanh toán đủ (công nợ đơn = 0; giải ngân ngân hàng chưa về = chưa đủ);
--    (3) xe đã chuẩn bị xong; (4) hồ sơ xe đủ; (5) mọi mục bắt buộc của checklist đã "đạt" hoặc "không áp dụng". Điều kiện 2–5 chỉ qua được khi có PHÊ DUYỆT NGOẠI LỆ
--    (quản lý, có lý do, ghi lại, thu hồi được) đúng loại.
--  * Giao xe: xe → "đã giao" (kết thúc vòng sở hữu); đơn đã có bàn giao chưa hủy thì không hủy được đơn. Ảnh/video lúc giao dùng khối Ảnh và video của xe; biên bản = trang in.
--  * Quyền: sales/quản lý lập và làm bàn giao đơn của mình; quản lý phê duyệt ngoại lệ và sửa danh mục; kế toán xem. Sales chỉ thấy cờ đúng/sai của điều kiện, không thấy số tiền.
-- =====================================================================

create sequence public.handover_code_seq;

create table public.handover_templates (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  label text not null check (length(btrim(label)) > 0),
  grp text not null check (grp in ('Giấy tờ', 'Phụ kiện', 'Xác nhận')),
  sort_order integer not null default 100,
  is_required boolean not null default false,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
insert into public.handover_templates (key, grp, label, sort_order, is_required) values
  ('registration',    'Giấy tờ',   'Giấy đăng ký xe (cà vẹt)', 10, true),
  ('sale_invoice',    'Giấy tờ',   'Hóa đơn / chứng từ bán xe', 20, true),
  ('sale_contract',   'Giấy tờ',   'Bản hợp đồng bán giao khách', 30, true),
  ('inspection',      'Giấy tờ',   'Giấy đăng kiểm còn hạn', 40, false),
  ('insurance',       'Giấy tờ',   'Bảo hiểm xe', 50, false),
  ('warranty_book',   'Giấy tờ',   'Sổ bảo hành / sổ bảo dưỡng', 60, false),
  ('loan_release',    'Giấy tờ',   'Giấy giải chấp (nếu xe từng thế chấp)', 70, false),
  ('key_main',        'Phụ kiện',  'Chìa khóa chính', 110, true),
  ('key_spare',       'Phụ kiện',  'Chìa khóa phụ', 120, false),
  ('manual',          'Phụ kiện',  'Sách hướng dẫn sử dụng', 130, false),
  ('spare_tools',     'Phụ kiện',  'Lốp dự phòng, đồ nghề', 140, false),
  ('ev_charger',      'Phụ kiện',  'Dây/bộ sạc (xe điện)', 150, false),
  ('condition_confirm','Xác nhận', 'Khách xác nhận tình trạng xe lúc nhận', 210, true),
  ('odo_recorded',    'Xác nhận',  'Đã ghi số ODO lúc giao', 220, true);
create trigger handover_templates_touch before update on public.handover_templates for each row execute function private.touch_row();
create trigger handover_templates_audit after insert or update on public.handover_templates for each row execute function private.audit_row();

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('BN' || lpad(nextval('public.handover_code_seq')::text, 5, '0')),
  order_id uuid not null references public.sales_orders (id),
  order_line_id uuid not null unique references public.sales_order_lines (id),
  vehicle_id uuid not null references public.vehicles (id),
  customer_id uuid not null references public.customers (id),
  owner_id uuid not null references public.profiles (id),
  status text not null default 'preparing' check (status in ('preparing', 'delivered', 'cancelled')),
  planned_on date,
  note text,
  delivered_on date,
  received_by_name text,
  received_relation text check (received_relation in ('customer', 'proxy')),
  odo_at_handover integer check (odo_at_handover >= 0),
  keys_given integer check (keys_given >= 0),
  delivered_by uuid references public.profiles (id),
  delivered_at timestamptz,
  end_reason text,
  ended_by uuid references public.profiles (id),
  ended_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  client_request_id uuid unique,
  constraint handovers_delivered_complete check (status <> 'delivered' or (
    delivered_on is not null and length(btrim(coalesce(received_by_name, ''))) > 0 and received_relation is not null
    and odo_at_handover is not null and keys_given is not null and delivered_by is not null and delivered_at is not null)),
  constraint handovers_cancel_complete check (status <> 'cancelled' or (length(btrim(coalesce(end_reason, ''))) > 0 and ended_at is not null))
);
create index handovers_order_idx on public.handovers (order_id);
create index handovers_vehicle_idx on public.handovers (vehicle_id);
create index handovers_status_idx on public.handovers (status, created_at desc);

create table public.handover_items (
  handover_id uuid not null references public.handovers (id),
  template_key text not null references public.handover_templates (key),
  label text not null,
  grp text not null,
  sort_order integer not null,
  is_required boolean not null,
  state text not null default 'pending' check (state in ('pending', 'ok', 'na', 'missing')),
  has_original boolean not null default false,
  has_scan boolean not null default false,              -- chỉ ghi "đã có bản scan"; không tải giấy tờ lên
  holder text check (holder in ('showroom', 'customer', 'bank', 'owner', 'other')),
  note text,
  checked_by uuid references public.profiles (id),
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  primary key (handover_id, template_key),
  constraint handover_items_holder_required check (not has_original or holder is not null)
);

create table public.handover_exceptions (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers (id),
  kind text not null check (kind in ('payment', 'prep', 'paperwork', 'checklist')),
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'active' check (status in ('active', 'revoked')),
  approved_by uuid not null default auth.uid() references public.profiles (id),
  approved_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id),
  revoked_at timestamptz,
  revoke_reason text,
  client_request_id uuid unique,
  constraint handover_exceptions_revoke_complete check (
    (status = 'active' and revoked_at is null and revoked_by is null and revoke_reason is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null and length(btrim(coalesce(revoke_reason, ''))) > 0))
);
create unique index handover_exceptions_one_active on public.handover_exceptions (handover_id, kind) where status = 'active';

create trigger handovers_touch before update on public.handovers for each row execute function private.touch_row();
create trigger handover_items_touch before update on public.handover_items for each row execute function private.touch_row();
create trigger handovers_audit after insert or update on public.handovers for each row execute function private.audit_row();
create trigger handover_items_audit after insert or update on public.handover_items for each row execute function private.audit_row();
create trigger handover_exceptions_audit after insert or update on public.handover_exceptions for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- Điều kiện giao xe (một nguồn). SECURITY DEFINER hẹp: chỉ trả cờ đúng/sai và số mục, không trả số tiền.
-- ---------------------------------------------------------------------
create or replace function private.handover_readiness(p_id uuid)
returns table (contract_ok boolean, payment_ok boolean, prep_ok boolean, paperwork_ok boolean, checklist_ok boolean, pending_required integer, waived text[])
language plpgsql stable security definer set search_path = '' as $$
declare h public.handovers; o public.sales_orders; v public.vehicles; n integer;
begin
  select * into h from public.handovers x where x.id = p_id;
  if h.id is null then return; end if;
  select * into o from public.sales_orders x where x.id = h.order_id;
  select * into v from public.vehicles x where x.id = h.vehicle_id;
  select count(*)::integer into n from public.handover_items i where i.handover_id = h.id and i.is_required and i.state in ('pending', 'missing');
  contract_ok := o.status = 'confirmed';
  payment_ok := private.order_outstanding(o.id) <= 0;
  prep_ok := v.prep_status = 'ready';
  paperwork_ok := v.paperwork_status = 'complete';
  checklist_ok := n = 0;
  pending_required := n;
  waived := coalesce((select array_agg(e.kind order by e.kind) from public.handover_exceptions e where e.handover_id = h.id and e.status = 'active'), '{}');
  return next;
end $$;

-- ---------------------------------------------------------------------
-- Luật nghiệp vụ ở database
-- ---------------------------------------------------------------------
create or replace function private.handovers_guard()
returns trigger language plpgsql set search_path = '' as $$
declare l public.sales_order_lines; o public.sales_orders; v public.vehicles; r record; v_miss text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa bàn giao. Hủy bàn giao (có lý do).' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if not (private.can_sell() or private.is_system()) then
      raise exception 'Anh/chị không có quyền lập bàn giao.' using errcode = '42501';
    end if;
    if new.status <> 'preparing' or new.delivered_at is not null or new.ended_at is not null then
      raise exception 'Bàn giao mới phải ở trạng thái đang chuẩn bị.' using errcode = '22023';
    end if;
    select * into l from public.sales_order_lines x where x.id = new.order_line_id;
    if l.id is null then
      raise exception 'Không tìm thấy dòng xe của đơn bán hoặc anh/chị không có quyền.' using errcode = '22023';
    end if;
    if l.line_status <> 'active' then
      raise exception 'Dòng xe này không còn hiệu lực trong đơn bán.' using errcode = '22023';
    end if;
    select * into o from public.sales_orders x where x.id = l.order_id;
    if o.status <> 'confirmed' then
      raise exception 'Chỉ lập bàn giao cho đơn bán đã ký hợp đồng.' using errcode = '22023';
    end if;
    if not (private.is_manager() or private.is_system() or o.owner_id = (select auth.uid())) then
      raise exception 'Chỉ người phụ trách đơn bán hoặc quản lý được lập bàn giao.' using errcode = '42501';
    end if;
    new.order_id := o.id; new.vehicle_id := l.vehicle_id; new.customer_id := o.customer_id; new.owner_id := o.owner_id;
    if not private.is_system() then new.created_by := (select auth.uid()); end if;
    return new;
  end if;

  if (new.code, new.order_id, new.order_line_id, new.vehicle_id, new.customer_id, new.owner_id, new.created_by, new.created_at)
     is distinct from (old.code, old.order_id, old.order_line_id, old.vehicle_id, old.customer_id, old.owner_id, old.created_by, old.created_at) then
    raise exception 'Không đổi đơn bán, xe hoặc khách của bàn giao.' using errcode = '22023';
  end if;
  if old.status <> 'preparing' then
    raise exception 'Bàn giao đã kết thúc (đã giao hoặc đã hủy), không sửa.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system() or old.owner_id = (select auth.uid())) then
    raise exception 'Chỉ người phụ trách đơn bán hoặc quản lý được thao tác bàn giao này.' using errcode = '42501';
  end if;
  if new.status = 'preparing' then return new; end if;                  -- sửa ngày hẹn/ghi chú

  if new.status = 'cancelled' then
    if length(btrim(coalesce(new.end_reason, ''))) = 0 then
      raise exception 'Ghi lý do hủy bàn giao.' using errcode = '22023';
    end if;
    if not private.is_system() then new.ended_by := (select auth.uid()); end if;
    new.ended_at := now();
    return new;
  end if;

  if new.status = 'delivered' then
    perform pg_advisory_xact_lock(hashtextextended('order:' || old.order_id::text, 0));        -- cùng khóa với phiếu thu: không giao khi đang ghi thu dở
    select * into r from private.handover_readiness(old.id);
    if not r.contract_ok then
      raise exception 'Đơn bán chưa ký hợp đồng (hoặc đã hủy): không giao xe. Điều kiện này không miễn được.' using errcode = '22023';
    end if;
    v_miss := '';
    if not r.payment_ok and not ('payment' = any (r.waived)) then v_miss := v_miss || ' chưa thanh toán đủ;'; end if;
    if not r.prep_ok and not ('prep' = any (r.waived)) then v_miss := v_miss || ' xe chưa chuẩn bị xong;'; end if;
    if not r.paperwork_ok and not ('paperwork' = any (r.waived)) then v_miss := v_miss || ' hồ sơ xe chưa đủ;'; end if;
    if not r.checklist_ok and not ('checklist' = any (r.waived)) then v_miss := v_miss || format(' còn %s mục bắt buộc của checklist chưa đạt;', r.pending_required); end if;
    if v_miss <> '' then
      raise exception 'Chưa đủ điều kiện giao xe:%. Hoàn tất hoặc nhờ quản lý phê duyệt ngoại lệ (có lý do).', rtrim(v_miss, ';') using errcode = '22023';
    end if;
    select * into o from public.sales_orders x where x.id = old.order_id;
    if new.delivered_on is null or new.delivered_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Ngày giao xe bắt buộc và không ở tương lai.' using errcode = '22023';
    end if;
    if new.delivered_on < o.contract_date then
      raise exception 'Ngày giao xe không được trước ngày ký hợp đồng bán.' using errcode = '22023';
    end if;
    if length(btrim(coalesce(new.received_by_name, ''))) = 0 or new.received_relation is null then
      raise exception 'Ghi người nhận xe và quan hệ (chính khách hay người nhận thay).' using errcode = '22023';
    end if;
    if new.odo_at_handover is null or new.keys_given is null then
      raise exception 'Ghi số ODO và số chìa khóa giao cho khách.' using errcode = '22023';
    end if;
    if not private.is_system() then new.delivered_by := (select auth.uid()); end if;
    new.delivered_at := now();
    return new;
  end if;
  raise exception 'Không thể chuyển bàn giao từ "%" sang "%".', old.status, new.status using errcode = '22023';
end $$;
create trigger handovers_guard before insert or update or delete on public.handovers for each row execute function private.handovers_guard();

create or replace function private.handover_items_guard()
returns trigger language plpgsql set search_path = '' as $$
declare h public.handovers;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa mục checklist.' using errcode = '22023';
  end if;
  select * into h from public.handovers x where x.id = new.handover_id;
  if h.id is null then
    raise exception 'Không tìm thấy bàn giao hoặc anh/chị không có quyền.' using errcode = '22023';
  end if;
  if h.status <> 'preparing' then
    raise exception 'Bàn giao đã kết thúc, không sửa checklist.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system() or h.owner_id = (select auth.uid())) then
    raise exception 'Chỉ người phụ trách đơn bán hoặc quản lý được sửa checklist bàn giao.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.state <> 'pending' then
      raise exception 'Mục checklist mới phải ở trạng thái chưa kiểm.' using errcode = '22023';
    end if;
    return new;
  end if;
  if (new.handover_id, new.template_key, new.label, new.grp, new.sort_order, new.is_required)
     is distinct from (old.handover_id, old.template_key, old.label, old.grp, old.sort_order, old.is_required) then
    raise exception 'Không đổi nội dung mục checklist đã lập.' using errcode = '22023';
  end if;
  if new.state = 'pending' and (new.has_original or new.has_scan or new.holder is not null) then
    raise exception 'Mục chưa kiểm không có bản gốc/bản scan/người giữ.' using errcode = '22023';
  end if;
  if new.state in ('na', 'missing') and new.has_original then
    raise exception 'Mục "%" không thể có bản gốc.', case new.state when 'na' then 'không áp dụng' else 'thiếu' end using errcode = '22023';
  end if;
  if new.state = 'missing' and length(btrim(coalesce(new.note, ''))) = 0 then
    raise exception 'Mục thiếu phải ghi chú lý do/hướng xử lý.' using errcode = '22023';
  end if;
  if not private.is_system() then new.checked_by := (select auth.uid()); end if;
  new.checked_at := now();
  return new;
end $$;
create trigger handover_items_guard before insert or update or delete on public.handover_items for each row execute function private.handover_items_guard();

create or replace function private.handover_exceptions_guard()
returns trigger language plpgsql set search_path = '' as $$
declare h public.handovers;
begin
  if tg_op = 'DELETE' then
    raise exception 'Không xóa phê duyệt ngoại lệ. Thu hồi (có lý do).' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý/admin được phê duyệt hoặc thu hồi ngoại lệ giao xe.' using errcode = '42501';
  end if;
  select * into h from public.handovers x where x.id = new.handover_id;
  if h.id is null or h.status <> 'preparing' then
    raise exception 'Chỉ phê duyệt ngoại lệ cho bàn giao đang chuẩn bị.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.revoked_at is not null then
      raise exception 'Phê duyệt ngoại lệ mới phải ở trạng thái hiệu lực.' using errcode = '22023';
    end if;
    if not private.is_system() then new.approved_by := (select auth.uid()); end if;
    return new;
  end if;
  if (new.handover_id, new.kind, new.reason, new.approved_by, new.approved_at) is distinct from (old.handover_id, old.kind, old.reason, old.approved_by, old.approved_at) then
    raise exception 'Không sửa phê duyệt ngoại lệ. Thu hồi rồi phê duyệt lại.' using errcode = '22023';
  end if;
  if old.status <> 'active' then
    raise exception 'Phê duyệt này đã thu hồi.' using errcode = '22023';
  end if;
  if new.status = 'revoked' then
    if length(btrim(coalesce(new.revoke_reason, ''))) = 0 then
      raise exception 'Ghi lý do thu hồi phê duyệt ngoại lệ.' using errcode = '22023';
    end if;
    if not private.is_system() then new.revoked_by := (select auth.uid()); end if;
    new.revoked_at := now();
  end if;
  return new;
end $$;
create trigger handover_exceptions_guard before insert or update or delete on public.handover_exceptions for each row execute function private.handover_exceptions_guard();

-- Giao xe: xe → "đã giao" (kết thúc vòng sở hữu) và ghi nhật ký (không số tiền). SECURITY DEFINER hẹp, không nhận tham số.
create or replace function private.handovers_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_code text; v_demand uuid;
begin
  if tg_op <> 'UPDATE' or new.status = old.status then return new; end if;
  select v.code into v_code from public.vehicles v where v.id = new.vehicle_id;
  select o.demand_id into v_demand from public.sales_orders o where o.id = new.order_id;
  if new.status = 'delivered' then
    update public.vehicles v set sale_status = 'delivered' where v.id = new.vehicle_id and v.sale_status = 'sold';
    if not found then
      raise exception 'Xe % không ở trạng thái "đã bán", không giao được.', v_code using errcode = '22023';
    end if;
    insert into public.demand_activities (demand_id, actor_id, channel, content) values (v_demand, (select auth.uid()), 'system', 'Đã giao xe ' || v_code || ' (bàn giao ' || new.code || ')');
  elsif new.status = 'cancelled' then
    insert into public.demand_activities (demand_id, actor_id, channel, content) values (v_demand, (select auth.uid()), 'system', 'Đã hủy bàn giao ' || new.code || ' của xe ' || v_code);
  end if;
  return new;
end $$;
create trigger handovers_sync after update on public.handovers for each row execute function private.handovers_sync();

-- Hủy đơn bán: thêm chặn khi còn bàn giao chưa hủy (hàm cũ của lát thu chi/thu cũ giữ nguyên các chặn trước).
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
    if private.order_has_open_handover(old.id) then
      raise exception 'Đơn bán đã có bàn giao (đang chuẩn bị hoặc đã giao). Hủy bàn giao đang chuẩn bị trước; xe đã giao thì không hủy đơn.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

create or replace function private.order_has_open_handover(p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.handovers h where h.order_id = p_order and h.status <> 'cancelled')
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.handover_templates enable row level security;
alter table public.handovers enable row level security;
alter table public.handover_items enable row level security;
alter table public.handover_exceptions enable row level security;
create policy handover_templates_select on public.handover_templates for select to authenticated using (private.is_staff());
create policy handover_templates_insert on public.handover_templates for insert to authenticated with check (private.is_manager());
create policy handover_templates_update on public.handover_templates for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy handovers_select on public.handovers for select to authenticated using (
  private.is_manager() or private.can_see_finance() or (private.can_sell() and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))));
create policy handovers_insert on public.handovers for insert to authenticated with check (private.can_sell());
create policy handovers_update on public.handovers for update to authenticated
  using (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())))
  with check (private.is_manager() or (private.can_sell() and owner_id = (select auth.uid())));
create policy handover_items_select on public.handover_items for select to authenticated using (exists (select 1 from public.handovers h where h.id = handover_id));
create policy handover_items_insert on public.handover_items for insert to authenticated with check (private.can_sell());
create policy handover_items_update on public.handover_items for update to authenticated
  using (private.is_manager() or exists (select 1 from public.handovers h where h.id = handover_id and h.owner_id = (select auth.uid()) and private.can_sell()))
  with check (private.is_manager() or exists (select 1 from public.handovers h where h.id = handover_id and h.owner_id = (select auth.uid()) and private.can_sell()));
create policy handover_exceptions_select on public.handover_exceptions for select to authenticated using (exists (select 1 from public.handovers h where h.id = handover_id));
create policy handover_exceptions_insert on public.handover_exceptions for insert to authenticated with check (private.is_manager());
create policy handover_exceptions_update on public.handover_exceptions for update to authenticated using (private.is_manager()) with check (private.is_manager());
revoke delete, truncate on public.handover_templates, public.handovers, public.handover_items, public.handover_exceptions from authenticated, anon;
revoke all on public.handover_templates, public.handovers, public.handover_items, public.handover_exceptions from anon;

-- ---------------------------------------------------------------------
-- RPC. Idempotent theo request_id; khóa phiên bản chống ghi đè.
-- ---------------------------------------------------------------------
create or replace function public.create_handover(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid; t record;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select h.id into v_id from public.handovers h where h.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.handovers (order_line_id, order_id, vehicle_id, customer_id, owner_id, planned_on, note, client_request_id)
  values ((p ->> 'order_line_id')::uuid, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
          nullif(p ->> 'planned_on', '')::date, nullif(btrim(p ->> 'note'), ''), v_request)
  returning id into v_id;
  for t in select * from public.handover_templates x where x.is_active order by x.sort_order, x.key loop
    insert into public.handover_items (handover_id, template_key, label, grp, sort_order, is_required) values (v_id, t.key, t.label, t.grp, t.sort_order, t.is_required);
  end loop;
  return v_id;
exception when unique_violation then
  select h.id into v_id from public.handovers h where h.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Dòng xe này đã có bàn giao.' using errcode = '22023';
end $$;

create or replace function public.update_handover_plan(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.handovers h set planned_on = nullif(p ->> 'planned_on', '')::date, note = nullif(btrim(p ->> 'note'), '')
  where h.id = p_id and h.version = p_version and h.status = 'preparing' returning h.version into v_ver;
  if v_ver is null then
    raise exception 'Bàn giao vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.update_handover_item(p_handover uuid, p_key text, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.handover_items i set state = p ->> 'state', has_original = coalesce((p ->> 'has_original')::boolean, false), has_scan = coalesce((p ->> 'has_scan')::boolean, false),
    holder = nullif(p ->> 'holder', ''), note = nullif(btrim(p ->> 'note'), '')
  where i.handover_id = p_handover and i.template_key = p_key and i.version = p_version returning i.version into v_ver;
  if v_ver is null then
    raise exception 'Mục checklist vừa được cập nhật hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.deliver_handover(p_id uuid, p_version integer, p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  update public.handovers h set status = 'delivered', delivered_on = nullif(p ->> 'delivered_on', '')::date, received_by_name = nullif(btrim(p ->> 'received_by_name'), ''),
    received_relation = nullif(p ->> 'received_relation', ''), odo_at_handover = nullif(p ->> 'odo', '')::integer, keys_given = nullif(p ->> 'keys_given', '')::integer,
    note = coalesce(nullif(btrim(p ->> 'note'), ''), h.note)
  where h.id = p_id and h.version = p_version and h.status = 'preparing' returning h.version into v_ver;
  if v_ver is null then
    raise exception 'Bàn giao vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.cancel_handover(p_id uuid, p_version integer, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_ver integer;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do hủy bàn giao.' using errcode = '22023';
  end if;
  update public.handovers h set status = 'cancelled', end_reason = btrim(p_reason) where h.id = p_id and h.version = p_version and h.status = 'preparing' returning h.version into v_ver;
  if v_ver is null then
    raise exception 'Bàn giao vừa được cập nhật, đã kết thúc hoặc anh/chị không có quyền. Tải lại trang.' using errcode = '40001';
  end if;
  return v_ver;
end $$;

create or replace function public.grant_handover_exception(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_request uuid := (p ->> 'request_id')::uuid; v_id uuid;
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select e.id into v_id from public.handover_exceptions e where e.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.handover_exceptions (handover_id, kind, reason, client_request_id)
  values ((p ->> 'handover_id')::uuid, p ->> 'kind', btrim(coalesce(p ->> 'reason', '')), v_request) returning id into v_id;
  return v_id;
exception when unique_violation then
  select e.id into v_id from public.handover_exceptions e where e.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  raise exception 'Đã có phê duyệt ngoại lệ hiệu lực cùng loại cho bàn giao này.' using errcode = '22023';
end $$;

create or replace function public.revoke_handover_exception(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do thu hồi phê duyệt ngoại lệ.' using errcode = '22023';
  end if;
  update public.handover_exceptions e set status = 'revoked', revoke_reason = btrim(p_reason) where e.id = p_id and e.status = 'active';
  if not found then
    raise exception 'Không tìm thấy phê duyệt đang hiệu lực hoặc anh/chị không có quyền.' using errcode = '40001';
  end if;
end $$;

-- Điều kiện giao xe cho giao diện: chỉ cờ đúng/sai và số mục còn thiếu (người gọi phải thấy được bàn giao theo RLS).
create or replace function public.handover_readiness(p_id uuid)
returns table (contract_ok boolean, payment_ok boolean, prep_ok boolean, paperwork_ok boolean, checklist_ok boolean, pending_required integer, waived text[])
language sql stable security invoker set search_path = '' as $$
  select r.* from public.handovers h, lateral private.handover_readiness(h.id) r where h.id = p_id
$$;

create or replace function public.upsert_handover_template(p jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_key text := lower(btrim(coalesce(p ->> 'key', '')));
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được sửa danh mục checklist bàn giao.' using errcode = '42501';
  end if;
  insert into public.handover_templates (key, label, grp, sort_order, is_required, is_active)
  values (v_key, btrim(p ->> 'label'), p ->> 'grp', coalesce(nullif(p ->> 'sort_order', '')::integer, 100), coalesce((p ->> 'is_required')::boolean, false), coalesce((p ->> 'is_active')::boolean, true))
  on conflict (key) do update set label = excluded.label, grp = excluded.grp, sort_order = excluded.sort_order, is_required = excluded.is_required, is_active = excluded.is_active;
  return v_key;
end $$;

revoke execute on function public.create_handover(jsonb) from public, anon;
revoke execute on function public.update_handover_plan(uuid, integer, jsonb) from public, anon;
revoke execute on function public.update_handover_item(uuid, text, integer, jsonb) from public, anon;
revoke execute on function public.deliver_handover(uuid, integer, jsonb) from public, anon;
revoke execute on function public.cancel_handover(uuid, integer, text) from public, anon;
revoke execute on function public.grant_handover_exception(jsonb) from public, anon;
revoke execute on function public.revoke_handover_exception(uuid, text) from public, anon;
revoke execute on function public.handover_readiness(uuid) from public, anon;
revoke execute on function public.upsert_handover_template(jsonb) from public, anon;
grant execute on function public.create_handover(jsonb) to authenticated;
grant execute on function public.update_handover_plan(uuid, integer, jsonb) to authenticated;
grant execute on function public.update_handover_item(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.deliver_handover(uuid, integer, jsonb) to authenticated;
grant execute on function public.cancel_handover(uuid, integer, text) to authenticated;
grant execute on function public.grant_handover_exception(jsonb) to authenticated;
grant execute on function public.revoke_handover_exception(uuid, text) to authenticated;
grant execute on function public.handover_readiness(uuid) to authenticated;
grant execute on function public.upsert_handover_template(jsonb) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
