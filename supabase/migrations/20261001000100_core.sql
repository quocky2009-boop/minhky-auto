-- =====================================================================
-- MINH KỲ AUTO — 0100 Nền tảng: vai trò, phân quyền, audit, pháp nhân
-- Quy ước:
--   * Tiền: numeric(18,0) (VND, không dùng số thực).
--   * Thời gian: timestamptz (lưu UTC, hiển thị Asia/Ho_Chi_Minh).
--   * Quyền: lấy từ bảng public.user_roles, KHÔNG lấy từ user_metadata.
--   * Hàm trợ giúp phân quyền nằm trong schema private (không lộ qua Data API).
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Ứng dụng nội bộ: khách chưa đăng nhập không được đụng bảng nào.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------------------------------------------------------------------
-- Tiện ích chung
-- ---------------------------------------------------------------------
create or replace function private.norm_text(t text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(lower(regexp_replace(extensions.unaccent('extensions.unaccent'::regdictionary, btrim(coalesce(t, ''))), '\s+', ' ', 'g')), '')
$$;

-- Chuẩn hóa số điện thoại VN: chỉ giữ chữ số, đổi 84xxxxxxxxx -> 0xxxxxxxxx.
-- Bản TypeScript tương ứng: src/lib/phone.ts (phải giữ khớp).
create or replace function private.normalize_phone(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case
    when d is null or d = '' then null
    when d like '84%' and length(d) in (11, 12) then '0' || substr(d, 3)
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;

create or replace function private.try_uuid(t text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- Tự cập nhật updated_at và tăng version (khóa lạc quan: client cập nhật kèm điều kiện version).
create or replace function private.touch_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Người dùng & vai trò
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager', 'accountant', 'sales', 'technician');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
comment on table public.profiles is 'Hồ sơ nhân viên nội bộ. Tài khoản do quản trị viên mời/tạo.';

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Nguồn duy nhất để cấp quyền. Không dùng user_metadata.';

create or replace function private.has_any_role(roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.is_active
      and ur.role = any (roles)
  )
$$;

create or replace function private.is_manager()
returns boolean language sql stable set search_path = '' as $$
  select private.has_any_role(array['admin', 'manager']::public.app_role[])
$$;

create or replace function private.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select private.has_any_role(array['admin']::public.app_role[])
$$;

create or replace function private.is_staff()
returns boolean language sql stable set search_path = '' as $$
  select private.has_any_role(array['admin', 'manager', 'accountant', 'sales', 'technician']::public.app_role[])
$$;

create or replace function private.can_sell()
returns boolean language sql stable set search_path = '' as $$
  select private.has_any_role(array['admin', 'manager', 'sales']::public.app_role[])
$$;

create or replace function private.can_see_finance()
returns boolean language sql stable set search_path = '' as $$
  select private.has_any_role(array['admin', 'manager', 'accountant']::public.app_role[])
$$;

-- Thao tác hệ thống (migration, seed, service role phía máy chủ) không có auth.uid().
create or replace function private.is_system()
returns boolean language sql stable set search_path = '' as $$
  select (select auth.uid()) is null and current_user in ('postgres', 'service_role', 'supabase_admin')
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- RPC cho giao diện: vai trò của chính mình.
create or replace function public.my_roles()
returns public.app_role[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(ur.role order by ur.role), '{}')
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = (select auth.uid()) and p.is_active
$$;
revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;

-- ---------------------------------------------------------------------
-- Cấu hình vận hành (không chứa tỷ lệ tài chính)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value, description) values
  ('demand_stale_after_days', '14'::jsonb, 'Số ngày không có cập nhật thì nhu cầu bị đánh dấu cần xác minh lại. Quản trị có thể đổi.');

-- ---------------------------------------------------------------------
-- Pháp nhân & địa điểm
-- ---------------------------------------------------------------------
create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_code text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  kind text not null default 'showroom'
    check (kind in ('showroom', 'workshop', 'detailing', 'warehouse', 'other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

-- ---------------------------------------------------------------------
-- Audit log: chỉ ghi bằng trigger, người dùng không sửa/xóa được.
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[],
  old_data jsonb,
  new_data jsonb
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, occurred_at desc);

create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed text[];
  v_watch text[] := tg_argv; -- nếu truyền danh sách cột: chỉ ghi khi các cột đó đổi
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at', 'version')
      and (v_old -> k) is distinct from (v_new -> k);
    if v_changed is null then
      return new;
    end if;
    if array_length(v_watch, 1) > 0 and not (v_changed && v_watch) then
      return new;
    end if;
  end if;

  insert into public.audit_logs (actor_id, table_name, record_id, action, changed_fields, old_data, new_data)
  values ((select auth.uid()), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'demand_id', v_old ->> 'demand_id', v_new ->> 'vehicle_id', v_old ->> 'vehicle_id'),
          tg_op, v_changed, v_old, v_new);
  return coalesce(new, old);
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_row();
create trigger legal_entities_touch before update on public.legal_entities for each row execute function private.touch_row();
create trigger locations_touch before update on public.locations for each row execute function private.touch_row();
create trigger user_roles_audit after insert or update or delete on public.user_roles for each row execute function private.audit_row();
create trigger profiles_audit after update on public.profiles for each row execute function private.audit_row('is_active', 'full_name');
create trigger app_settings_audit after insert or update or delete on public.app_settings for each row execute function private.audit_row();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.app_settings enable row level security;
alter table public.legal_entities enable row level security;
alter table public.locations enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (private.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_admin())
  with check (id = (select auth.uid()) or private.is_admin());
-- Tạo profile: chỉ admin (qua máy chủ khi mời người dùng) hoặc service role.
create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (private.is_admin());

-- Nhân viên tự sửa hồ sơ không được tự khóa/mở tài khoản.
create or replace function private.guard_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_active is distinct from old.is_active and not (private.is_admin() or private.is_system()) then
    raise exception 'Chỉ quản trị viên được khóa hoặc mở tài khoản.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile_update();

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.is_manager());
create policy user_roles_admin_write on public.user_roles for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy app_settings_select on public.app_settings for select to authenticated using (private.is_staff());
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy legal_entities_select on public.legal_entities for select to authenticated using (private.is_staff());
create policy legal_entities_write on public.legal_entities for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy locations_select on public.locations for select to authenticated using (private.is_staff());
create policy locations_write on public.locations for all to authenticated
  using (private.is_manager()) with check (private.is_manager());

create policy audit_logs_select on public.audit_logs for select to authenticated using (private.is_manager());
revoke insert, update, delete, truncate on public.audit_logs from authenticated, anon;
