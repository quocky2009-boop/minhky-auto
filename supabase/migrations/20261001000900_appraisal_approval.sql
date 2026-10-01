-- =====================================================================
-- MINH KỲ AUTO — 0900 Chặng 3 (lát 2): thẩm định có checklist + duyệt mua; địa điểm showroom
--
-- Nguyên tắc (CLAUDE.md §4, §9, §10):
--  * Thông tin KHÁCH khai (sell_offers) tách khỏi kết quả showroom KIỂM TRA (appraisals/appraisal_items).
--  * Mục chưa kiểm tra KHÔNG được coi là đạt: duyệt mua bị chặn khi còn mục bắt buộc ở trạng thái "chưa kiểm tra".
--  * Mục "không đạt" phải ghi rõ tình trạng; mục pin xe điện phải ghi số đo/bằng chứng.
--  * Giá đề xuất / giá mua tối đa được duyệt là dữ liệu tài chính: bảng riêng, chỉ quản lý/kế toán đọc.
--  * Người duyệt: quản lý/admin, KHÔNG có ngưỡng giá. Giá mua thực tế khi nhập kho không được vượt giá tối đa đã duyệt.
--  * Nhập kho (acquire_from_demand) bắt buộc có thẩm định đã duyệt.
-- =====================================================================

-- Địa điểm showroom (dữ liệu tham chiếu do anh Kỳ cung cấp)
insert into public.locations (name, address, kind)
select 'Showroom Minh Kỳ Auto', '212 Trường Chinh, P. Minh Xuân, tỉnh Tuyên Quang', 'showroom'
where not exists (select 1 from public.locations l where l.address like '212 Trường Chinh%');

-- ---------------------------------------------------------------------
-- Mẫu checklist (cấu hình, admin sửa được)
-- ---------------------------------------------------------------------
create table public.appraisal_templates (
  key text primary key,
  label text not null,
  grp text not null,
  sort_order integer not null default 100,
  is_required boolean not null default true,
  requires_note_on_pass boolean not null default false,
  ev_only boolean not null default false,
  is_active boolean not null default true
);
insert into public.appraisal_templates (key, grp, label, sort_order, is_required, requires_note_on_pass, ev_only) values
  ('vin_match',          'Giấy tờ & nhận dạng', 'Số khung / số máy khớp giấy tờ', 10, true, false, false),
  ('registration_docs',  'Giấy tờ & nhận dạng', 'Giấy đăng ký xe, đăng kiểm còn hạn', 20, true, false, false),
  ('owner_identity',     'Giấy tờ & nhận dạng', 'Người bán đúng chủ xe hoặc có giấy ủy quyền hợp lệ', 30, true, false, false),
  ('loan_lien',          'Giấy tờ & nhận dạng', 'Xe không bị thế chấp, hoặc đã có xác nhận giải chấp', 40, true, false, false),
  ('odo_check',          'Tình trạng xe', 'ODO thực tế (ghi số đọc được vào ghi chú)', 110, true, true, false),
  ('exterior',           'Tình trạng xe', 'Ngoại thất: sơn, đồng, kính, đèn', 120, true, false, false),
  ('interior',           'Tình trạng xe', 'Nội thất: ghế, trần, táp-lô', 130, true, false, false),
  ('engine',             'Tình trạng xe', 'Động cơ: khởi động, tiếng ồn, rò rỉ', 140, true, false, false),
  ('transmission',       'Tình trạng xe', 'Hộp số / hệ truyền động', 150, true, false, false),
  ('suspension_brakes',  'Tình trạng xe', 'Gầm, hệ thống treo, phanh', 160, true, false, false),
  ('electrical',         'Tình trạng xe', 'Hệ thống điện, màn hình, điều hòa', 170, true, false, false),
  ('tires',              'Tình trạng xe', 'Lốp, mâm', 180, true, false, false),
  ('accident_flood',     'Tình trạng xe', 'Dấu hiệu tai nạn lớn hoặc ngập nước', 190, true, false, false),
  ('test_drive',         'Tình trạng xe', 'Chạy thử', 200, true, false, false),
  ('ev_battery_soh',     'Xe điện', 'Tình trạng pin (SoH): ghi số đo và nguồn bằng chứng', 310, true, true, true),
  ('ev_charging',        'Xe điện', 'Cổng sạc, sạc thử', 320, true, false, true),
  ('accessories_keys',   'Khác', 'Phụ kiện đi kèm, số chìa khóa', 410, false, false, false);

-- ---------------------------------------------------------------------
-- Thẩm định (một bản cho mỗi nhu cầu bán)
-- ---------------------------------------------------------------------
create table public.appraisals (
  demand_id uuid primary key references public.demands (id),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  is_ev boolean not null default false,
  summary text,
  appraised_by uuid default auth.uid() references public.profiles (id),
  appraised_at timestamptz,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint appraisals_approved_has_decider check (status <> 'approved' or (decided_by is not null and decided_at is not null)),
  constraint appraisals_rejected_has_reason check (status <> 'rejected' or length(btrim(coalesce(reject_reason, ''))) > 0)
);

create table public.appraisal_items (
  demand_id uuid not null references public.appraisals (demand_id) on delete cascade,
  template_key text not null references public.appraisal_templates (key),
  result text not null default 'unchecked' check (result in ('unchecked', 'pass', 'fail', 'na')),
  note text,
  primary key (demand_id, template_key)
);

create table public.appraisal_financials (
  demand_id uuid primary key references public.appraisals (demand_id) on delete cascade,
  proposed_price numeric(18, 0) check (proposed_price >= 0),
  approved_max_price numeric(18, 0) check (approved_max_price >= 0),
  updated_at timestamptz not null default now()
);

create trigger appraisals_touch before update on public.appraisals for each row execute function private.touch_row();
create trigger appraisals_audit after insert or update on public.appraisals for each row
  execute function private.audit_row('status', 'decided_by', 'reject_reason', 'is_ev');
create trigger appraisal_financials_audit after insert or update on public.appraisal_financials for each row execute function private.audit_row();

-- Thẩm định đã chốt (duyệt/từ chối) thì không sửa nội dung; muốn sửa phải mở lại (có ghi nhật ký).
create or replace function private.appraisals_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and new.status = old.status
     and (new.summary is distinct from old.summary or new.is_ev is distinct from old.is_ev) then
    raise exception 'Thẩm định đã được chốt. Hãy mở lại nếu cần sửa.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger appraisals_guard before update on public.appraisals for each row execute function private.appraisals_guard();

create or replace function private.appraisal_items_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_status text;
begin
  select a.status into v_status from public.appraisals a where a.demand_id = coalesce(new.demand_id, old.demand_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Thẩm định đã được chốt. Hãy mở lại nếu cần sửa mục kiểm tra.' using errcode = '22023';
  end if;
  return coalesce(new, old);
end $$;
create trigger appraisal_items_guard before insert or update or delete on public.appraisal_items for each row execute function private.appraisal_items_guard();

alter table public.appraisal_templates enable row level security;
alter table public.appraisals enable row level security;
alter table public.appraisal_items enable row level security;
alter table public.appraisal_financials enable row level security;

create policy appraisal_templates_select on public.appraisal_templates for select to authenticated using (private.is_staff());
create policy appraisal_templates_write on public.appraisal_templates for all to authenticated using (private.is_admin()) with check (private.is_admin());
-- Người phụ trách/được chia sẻ nhu cầu xem được tình trạng thẩm định; chỉ quản lý ghi.
create policy appraisals_select on public.appraisals for select to authenticated using (private.can_access_demand(demand_id));
create policy appraisals_write on public.appraisals for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy appraisal_items_select on public.appraisal_items for select to authenticated using (private.can_access_demand(demand_id));
create policy appraisal_items_write on public.appraisal_items for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy appraisal_financials_select on public.appraisal_financials for select to authenticated using (private.can_see_finance());
create policy appraisal_financials_write on public.appraisal_financials for all to authenticated using (private.is_manager()) with check (private.is_manager());

-- ---------------------------------------------------------------------
-- Lưu thẩm định (nháp). items: { "<key>": {"result": "pass|fail|na|unchecked", "note": "..."} }
-- Khóa có mặt mới cập nhật. p_version (tùy chọn) chống ghi đè đồng thời.
-- ---------------------------------------------------------------------
create or replace function public.save_appraisal(p_demand_id uuid, p jsonb, p_version integer default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_d public.demands;
  v_o public.sell_offers;
  v_a public.appraisals;
  v_ev boolean;
  r record;
  v_ver integer;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được ghi thẩm định.' using errcode = '42501';
  end if;
  select * into v_d from public.demands d where d.id = p_demand_id;
  if v_d.id is null or v_d.kind <> 'sell' then
    raise exception 'Không tìm thấy nhu cầu bán.' using errcode = '22023';
  end if;
  select * into v_o from public.sell_offers s where s.demand_id = p_demand_id;
  if v_o.demand_id is null then
    raise exception 'Nhu cầu này chưa có thông tin xe để thẩm định.' using errcode = '22023';
  end if;
  if v_o.converted_vehicle_id is not null then
    raise exception 'Xe đã nhập kho, không sửa thẩm định.' using errcode = '22023';
  end if;

  select * into v_a from public.appraisals a where a.demand_id = p_demand_id;
  if v_a.demand_id is null then
    insert into public.appraisals (demand_id, appraised_at) values (p_demand_id, now()) returning * into v_a;
  else
    if v_a.status <> 'draft' then
      raise exception 'Thẩm định đã %. Hãy mở lại để sửa.', case v_a.status when 'approved' then 'được duyệt' else 'bị từ chối' end using errcode = '22023';
    end if;
    if p_version is not null and v_a.version <> p_version then
      raise exception 'Thẩm định vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất.' using errcode = '40001';
    end if;
  end if;

  v_ev := case when p ? 'is_ev' then coalesce((p ->> 'is_ev')::boolean, false) else v_a.is_ev end;

  insert into public.appraisal_items (demand_id, template_key)
  select p_demand_id, t.key from public.appraisal_templates t where t.is_active and (not t.ev_only or v_ev)
  on conflict do nothing;
  if not v_ev then
    delete from public.appraisal_items i using public.appraisal_templates t
    where i.demand_id = p_demand_id and t.key = i.template_key and t.ev_only;
  end if;

  for r in select e.key, e.value from jsonb_each(coalesce(p -> 'items', '{}'::jsonb)) e loop
    if not exists (select 1 from public.appraisal_templates t where t.key = r.key and t.is_active and (not t.ev_only or v_ev)) then
      raise exception 'Mục kiểm tra "%" không áp dụng cho thẩm định này.', r.key using errcode = '22023';
    end if;
    if coalesce(r.value ->> 'result', 'unchecked') not in ('unchecked', 'pass', 'fail', 'na') then
      raise exception 'Kết quả kiểm tra không hợp lệ.' using errcode = '22023';
    end if;
    update public.appraisal_items i set
      result = coalesce(r.value ->> 'result', 'unchecked'),
      note = nullif(btrim(r.value ->> 'note'), '')
    where i.demand_id = p_demand_id and i.template_key = r.key;
  end loop;

  if p ? 'proposed_price' or p ? 'approved_max_price' then
    insert into public.appraisal_financials (demand_id, proposed_price, approved_max_price)
    values (p_demand_id, nullif(p ->> 'proposed_price', '')::numeric, null)
    on conflict (demand_id) do update set
      proposed_price = case when p ? 'proposed_price' then nullif(p ->> 'proposed_price', '')::numeric else public.appraisal_financials.proposed_price end,
      updated_at = now();
  end if;

  update public.appraisals a set
    is_ev = v_ev,
    summary = case when p ? 'summary' then nullif(btrim(p ->> 'summary'), '') else a.summary end
  where a.demand_id = p_demand_id
  returning a.version into v_ver;
  return v_ver;
end $$;

-- ---------------------------------------------------------------------
-- Quyết định: approve | reject | reopen. Chỉ quản lý/admin, không có ngưỡng giá.
-- Nhật ký hệ thống KHÔNG ghi số tiền (nhân viên bán hàng đọc được nhật ký nhu cầu).
-- ---------------------------------------------------------------------
create or replace function public.decide_appraisal(p_demand_id uuid, p_decision text, p jsonb default '{}'::jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_a public.appraisals;
  v_o public.sell_offers;
  v_missing text; v_fail text; v_note text;
  v_max numeric;
  v_reason text := nullif(btrim(p ->> 'reason'), '');
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được duyệt mua.' using errcode = '42501';
  end if;
  select * into v_a from public.appraisals a where a.demand_id = p_demand_id;
  if v_a.demand_id is null then
    raise exception 'Chưa có thẩm định cho nhu cầu này.' using errcode = '22023';
  end if;
  select * into v_o from public.sell_offers s where s.demand_id = p_demand_id;
  if v_o.converted_vehicle_id is not null then
    raise exception 'Xe đã nhập kho, không đổi quyết định thẩm định.' using errcode = '22023';
  end if;

  if p_decision = 'approve' then
    if v_a.status <> 'draft' then
      raise exception 'Chỉ duyệt được thẩm định đang ở dạng nháp.' using errcode = '22023';
    end if;
    select string_agg(t.label, '; ' order by t.sort_order) into v_missing
    from public.appraisal_templates t
    left join public.appraisal_items i on i.demand_id = p_demand_id and i.template_key = t.key
    where t.is_active and t.is_required and (not t.ev_only or v_a.is_ev) and coalesce(i.result, 'unchecked') = 'unchecked';
    if v_missing is not null then
      raise exception 'Còn mục bắt buộc chưa kiểm tra: %', v_missing using errcode = '22023';
    end if;
    select string_agg(t.label, '; ' order by t.sort_order) into v_fail
    from public.appraisal_items i join public.appraisal_templates t on t.key = i.template_key
    where i.demand_id = p_demand_id and i.result = 'fail' and length(btrim(coalesce(i.note, ''))) = 0;
    if v_fail is not null then
      raise exception 'Mục không đạt phải ghi rõ tình trạng: %', v_fail using errcode = '22023';
    end if;
    select string_agg(t.label, '; ' order by t.sort_order) into v_note
    from public.appraisal_items i join public.appraisal_templates t on t.key = i.template_key
    where i.demand_id = p_demand_id and i.result = 'pass' and t.requires_note_on_pass and length(btrim(coalesce(i.note, ''))) = 0;
    if v_note is not null then
      raise exception 'Các mục sau cần ghi số đo / bằng chứng: %', v_note using errcode = '22023';
    end if;

    v_max := coalesce(nullif(p ->> 'approved_max_price', '')::numeric,
                      (select f.approved_max_price from public.appraisal_financials f where f.demand_id = p_demand_id));
    if v_o.sale_mode <> 'consignment' and v_max is null then
      raise exception 'Nhập giá mua tối đa được duyệt (không áp dụng cho xe ký gửi).' using errcode = '22023';
    end if;
    insert into public.appraisal_financials (demand_id, approved_max_price) values (p_demand_id, v_max)
    on conflict (demand_id) do update set approved_max_price = excluded.approved_max_price, updated_at = now();

    update public.appraisals a set status = 'approved', decided_by = (select auth.uid()), decided_at = now(), reject_reason = null
    where a.demand_id = p_demand_id;
    perform private.log_system_activity(p_demand_id, 'Đã duyệt mua sau thẩm định');

  elsif p_decision = 'reject' then
    if v_a.status <> 'draft' then
      raise exception 'Chỉ từ chối được thẩm định đang ở dạng nháp.' using errcode = '22023';
    end if;
    if v_reason is null then
      raise exception 'Ghi lý do không duyệt mua.' using errcode = '22023';
    end if;
    update public.appraisals a set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(), reject_reason = v_reason
    where a.demand_id = p_demand_id;
    perform private.log_system_activity(p_demand_id, 'Không duyệt mua: ' || v_reason);

  elsif p_decision = 'reopen' then
    if v_a.status = 'draft' then
      raise exception 'Thẩm định đang ở dạng nháp.' using errcode = '22023';
    end if;
    update public.appraisals a set status = 'draft', decided_by = null, decided_at = null, reject_reason = null where a.demand_id = p_demand_id;
    update public.appraisal_financials f set approved_max_price = null, updated_at = now() where f.demand_id = p_demand_id; -- phải duyệt lại giá
    perform private.log_system_activity(p_demand_id, 'Mở lại thẩm định để chỉnh sửa');
  else
    raise exception 'Quyết định không hợp lệ.' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Nhập kho bắt buộc có thẩm định đã duyệt; giá mua thực tế không vượt giá tối đa đã duyệt.
-- Thân hàm cũ giữ nguyên (đã kiểm thử) và chuyển vào schema private; hàm công khai mới kiểm tra rồi gọi.
-- ---------------------------------------------------------------------
alter function public.acquire_from_demand(uuid, uuid, jsonb) set schema private;
alter function private.acquire_from_demand(uuid, uuid, jsonb) rename to acquire_unchecked;

create or replace function public.acquire_from_demand(p_demand_id uuid, p_request_id uuid, p jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_a public.appraisals;
  v_o public.sell_offers;
  v_business text;
  v_price numeric := nullif(p ->> 'purchase_price', '')::numeric;
  v_max numeric;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được nhập kho xe từ nhu cầu bán.' using errcode = '42501';
  end if;
  select v.id into v_id from public.vehicles v where v.source_demand_id = p_demand_id;
  if v_id is not null then return v_id; end if;

  select * into v_a from public.appraisals a where a.demand_id = p_demand_id;
  if v_a.demand_id is null or v_a.status <> 'approved' then
    raise exception 'Cần thẩm định và duyệt mua trước khi nhập kho.' using errcode = '22023';
  end if;
  select * into v_o from public.sell_offers s where s.demand_id = p_demand_id;
  v_business := coalesce(nullif(p ->> 'business_type', ''), case when v_o.sale_mode = 'consignment' then 'consignment' else 'owned' end);
  if v_business = 'owned' and v_price is not null then
    select f.approved_max_price into v_max from public.appraisal_financials f where f.demand_id = p_demand_id;
    if v_max is null then
      raise exception 'Thẩm định chưa có giá mua tối đa được duyệt. Mở lại thẩm định để duyệt giá.' using errcode = '22023';
    end if;
    if v_price > v_max then
      raise exception 'Giá mua (%) vượt giá tối đa đã duyệt (%). Mở lại thẩm định để duyệt giá mới.', v_price::bigint, v_max::bigint using errcode = '22023';
    end if;
  end if;
  return private.acquire_unchecked(p_demand_id, p_request_id, p);
end $$;

revoke execute on function public.save_appraisal(uuid, jsonb, integer) from public, anon;
revoke execute on function public.decide_appraisal(uuid, text, jsonb) from public, anon;
revoke execute on function public.acquire_from_demand(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_appraisal(uuid, jsonb, integer) to authenticated;
grant execute on function public.decide_appraisal(uuid, text, jsonb) to authenticated;
grant execute on function public.acquire_from_demand(uuid, uuid, jsonb) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
