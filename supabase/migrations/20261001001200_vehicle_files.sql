-- =====================================================================
-- MINH KỲ AUTO — 1200 Chặng 3: ảnh / video / giấy tờ gắn với xe (Storage riêng tư)
--
-- Hai nhóm tệp theo độ nhạy (RLS lọc hàng, nên tách theo loại ở đường dẫn và ở bảng):
--   Media (photo, video)  : nhân viên thấy xe đó thì thấy; nhân viên (trừ ai không có vai trò) tải lên được.
--   Giấy tờ (registration, inspection, consignment, other_doc): chỉ quản lý/kế toán/admin xem và tải lên
--       (cà vẹt, biên bản, scan hợp đồng ký gửi có định danh chủ xe).
-- Đường dẫn Storage: <vehicle_id>/<loại>/<uuid>-<tên an toàn>. Không xóa tệp: chỉ "lưu trữ" (có lý do), tệp gốc được giữ.
-- Tải lên đi thẳng từ trình duyệt lên Storage bằng URL ký có thời hạn (Vercel giới hạn thân yêu cầu ~4,5 MB nên không đi qua máy chủ ứng dụng);
-- sau đó ứng dụng gọi register_vehicle_file để ghi vào bảng, hàm kiểm tra tệp thật sự đã có trong Storage.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-files', 'vehicle-files', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'application/pdf'])
on conflict (id) do nothing;

create table public.vehicle_files (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  category text not null check (category in ('photo', 'video', 'registration', 'inspection', 'consignment', 'other_doc')),
  storage_path text not null unique,
  file_name text not null check (length(btrim(file_name)) > 0),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  caption text,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  archive_reason text,
  client_request_id uuid unique,
  constraint vehicle_files_archive_complete check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or (archived_at is not null and archived_by is not null and length(btrim(coalesce(archive_reason, ''))) > 0)),
  constraint vehicle_files_path_prefix check (storage_path like vehicle_id::text || '/' || category || '/%')
);
create index vehicle_files_vehicle_idx on public.vehicle_files (vehicle_id, category, created_at desc) where archived_at is null;

create trigger vehicle_files_audit after insert or update on public.vehicle_files for each row execute function private.audit_row();

-- Nhóm media: ai thấy xe thì thấy. Nhóm giấy tờ: chỉ vai trò tài chính/quản lý.
create or replace function private.vehicle_file_allowed(p_vehicle uuid, p_category text)
returns boolean language sql stable set search_path = '' as $$
  select case
    when p_category in ('photo', 'video') then private.is_staff() and exists (select 1 from public.vehicles v where v.id = p_vehicle)
    when p_category in ('registration', 'inspection', 'consignment', 'other_doc') then private.can_see_finance() and exists (select 1 from public.vehicles v where v.id = p_vehicle)
    else false
  end
$$;

create or replace function private.vehicle_files_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.vehicle_file_allowed(new.vehicle_id, new.category) then
      raise exception 'Anh/chị không có quyền thêm tệp loại này cho xe.' using errcode = '42501';
    end if;
    if new.category = 'photo' and new.mime_type not like 'image/%' then
      raise exception 'Ảnh phải là tệp ảnh.' using errcode = '22023';
    end if;
    if new.category = 'video' and new.mime_type not like 'video/%' then
      raise exception 'Video phải là tệp video.' using errcode = '22023';
    end if;
    if new.category not in ('photo', 'video') and new.mime_type not like 'image/%' and new.mime_type <> 'application/pdf' then
      raise exception 'Giấy tờ chỉ nhận ảnh chụp hoặc PDF.' using errcode = '22023';
    end if;
    if new.archived_at is not null then
      raise exception 'Tệp mới không được ở trạng thái lưu trữ.' using errcode = '22023';
    end if;
    if not private.is_system() then new.uploaded_by := (select auth.uid()); end if;
    return new;
  end if;
  -- UPDATE: chỉ được lưu trữ (một lần, có lý do) hoặc sửa chú thích; không đổi tệp/xe/loại.
  if (new.vehicle_id, new.category, new.storage_path, new.file_name, new.mime_type, new.size_bytes, new.uploaded_by, new.created_at)
     is distinct from (old.vehicle_id, old.category, old.storage_path, old.file_name, old.mime_type, old.size_bytes, old.uploaded_by, old.created_at) then
    raise exception 'Không đổi thông tin tệp. Tải tệp mới nếu cần.' using errcode = '22023';
  end if;
  if old.archived_at is not null then
    raise exception 'Tệp đã lưu trữ, không sửa.' using errcode = '22023';
  end if;
  if not (private.is_manager() or private.is_system()) then
    raise exception 'Chỉ quản lý được lưu trữ tệp hoặc sửa chú thích.' using errcode = '42501';
  end if;
  if new.archived_at is not null and not private.is_system() then
    new.archived_by := (select auth.uid()); new.archived_at := now();
  end if;
  return new;
end $$;
create trigger vehicle_files_guard before insert or update on public.vehicle_files for each row execute function private.vehicle_files_guard();

alter table public.vehicle_files enable row level security;
create policy vehicle_files_select on public.vehicle_files for select to authenticated using (private.vehicle_file_allowed(vehicle_id, category));
create policy vehicle_files_insert on public.vehicle_files for insert to authenticated with check (private.vehicle_file_allowed(vehicle_id, category));
create policy vehicle_files_update on public.vehicle_files for update to authenticated using (private.is_manager()) with check (private.is_manager());
revoke delete, truncate on public.vehicle_files from authenticated, anon;
revoke all on public.vehicle_files from anon;

-- Storage: chỉ đường dẫn đúng dạng <vehicle_id>/<loại>/<tệp> và đúng quyền theo loại. Không có policy xóa/sửa: tệp gốc không bị xóa.
create or replace function private.vehicle_file_path_allowed(p_name text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(
    array_length(storage.foldername(p_name), 1) = 2
    and private.try_uuid((storage.foldername(p_name))[1]) is not null
    and private.vehicle_file_allowed(private.try_uuid((storage.foldername(p_name))[1]), (storage.foldername(p_name))[2]),
    false)
$$;
create policy vehicle_files_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-files' and private.vehicle_file_path_allowed(name));
create policy vehicle_files_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-files' and private.vehicle_file_path_allowed(name));

-- Ghi tệp đã tải lên Storage vào hồ sơ xe. Idempotent theo request_id; kiểm tra tệp thật sự đã có trong Storage (RLS áp dụng).
create or replace function public.register_vehicle_file(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_request uuid := (p ->> 'request_id')::uuid;
  v_id uuid;
  v_vehicle uuid := (p ->> 'vehicle_id')::uuid;
  v_cat text := p ->> 'category';
  v_path text := p ->> 'storage_path';
begin
  if v_request is null then
    raise exception 'Thiếu mã yêu cầu (request_id).' using errcode = '22023';
  end if;
  select f.id into v_id from public.vehicle_files f where f.client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  if v_path is null or v_path not like v_vehicle::text || '/' || v_cat || '/%' then
    raise exception 'Đường dẫn tệp không khớp xe và loại tệp.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'vehicle-files' and o.name = v_path) then
    raise exception 'Chưa thấy tệp trong kho lưu trữ. Hãy tải lại tệp.' using errcode = '22023';
  end if;
  insert into public.vehicle_files (vehicle_id, category, storage_path, file_name, mime_type, size_bytes, caption, client_request_id)
  values (v_vehicle, v_cat, v_path, left(btrim(coalesce(p ->> 'file_name', '')), 200), coalesce(p ->> 'mime_type', ''),
          (p ->> 'size_bytes')::bigint, nullif(btrim(p ->> 'caption'), ''), v_request)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select f.id into v_id from public.vehicle_files f where f.client_request_id = v_request or f.storage_path = v_path;
  if v_id is null then raise; end if;
  return v_id;
end $$;

create or replace function public.archive_vehicle_file(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Ghi lý do lưu trữ tệp.' using errcode = '22023';
  end if;
  update public.vehicle_files f set archived_at = now(), archived_by = (select auth.uid()), archive_reason = btrim(p_reason)
  where f.id = p_id and f.archived_at is null;
  if not found then
    raise exception 'Không tìm thấy tệp đang dùng hoặc anh/chị không có quyền.' using errcode = '42501';
  end if;
end $$;

revoke execute on function public.register_vehicle_file(jsonb) from public, anon;
revoke execute on function public.archive_vehicle_file(uuid, text) from public, anon;
grant execute on function public.register_vehicle_file(jsonb) to authenticated;
grant execute on function public.archive_vehicle_file(uuid, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
