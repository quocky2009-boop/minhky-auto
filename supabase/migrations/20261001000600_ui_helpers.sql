-- =====================================================================
-- MINH KỲ AUTO — 0600 RPC hỗ trợ giao diện chặng 3
-- =====================================================================

-- Danh sách nhân viên bán hàng đang hoạt động (để giao/chia sẻ nhu cầu).
-- Chỉ trả id + họ tên; sales không đọc được bảng user_roles của người khác.
create or replace function public.list_sellers()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name
  from public.profiles p
  where private.is_staff()
    and p.is_active
    and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('admin', 'manager', 'sales'))
  order by p.full_name
$$;

-- Tìm khách theo tên / SĐT / khu vực (không dấu). security invoker -> tuân RLS.
create or replace function public.search_customers(p_q text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with f as (
    select c.id, c.code, c.full_name, c.phone, c.area, c.owner_id, c.updated_at, p.full_name as owner_name,
      (select count(*) from public.demands d where d.customer_id = c.id and d.status not in ('closed', 'won', 'acquired')) as open_demands
    from public.customers c
    left join public.profiles p on p.id = c.owner_id
    where c.archived_at is null
      and (private.norm_text(p_q) is null
           or private.norm_text(c.full_name || ' ' || coalesce(c.phone, '') || ' ' || coalesce(c.area, '')) like '%' || private.norm_text(p_q) || '%'
           or (length(private.normalize_phone(p_q)) >= 6 and c.phone_normalized like '%' || private.normalize_phone(p_q) || '%'))
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from f order by updated_at desc, id
      limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) x), '[]'::jsonb))
$$;

-- Đổi người phụ trách nhu cầu (quản lý). Có kiểm tra phiên bản; ghi nhật ký hệ thống.
create or replace function public.reassign_demand(p_id uuid, p_version integer, p_owner uuid, p_note text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_version integer;
  v_old uuid;
  v_name text;
begin
  if not private.is_manager() then
    raise exception 'Chỉ quản lý được đổi người phụ trách nhu cầu.' using errcode = '42501';
  end if;
  select d.owner_id into v_old from public.demands d where d.id = p_id;
  update public.demands d set owner_id = p_owner where d.id = p_id and d.version = p_version
  returning d.version into v_version;
  if v_version is null then
    raise exception 'Nhu cầu vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất.' using errcode = '40001';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = p_owner;
  -- Nhật ký hệ thống ghi bằng quyền định nghĩa (người dùng không tự ghi kênh 'system').
  perform private.log_system_activity(p_id, 'Đổi người phụ trách sang ' || coalesce(v_name, '?')
    || case when nullif(btrim(p_note), '') is not null then ' — ' || btrim(p_note) else '' end);
  return v_version;
end $$;

create or replace function private.log_system_activity(p_demand_id uuid, p_content text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_access_demand(p_demand_id) then
    raise exception 'Không có quyền.' using errcode = '42501';
  end if;
  insert into public.demand_activities (demand_id, actor_id, channel, content)
  values (p_demand_id, (select auth.uid()), 'system', p_content);
end $$;
revoke all on function private.log_system_activity(uuid, text) from public, anon;
grant execute on function private.log_system_activity(uuid, text) to authenticated;

revoke execute on function public.list_sellers() from public, anon;
revoke execute on function public.search_customers(text, integer, integer) from public, anon;
revoke execute on function public.reassign_demand(uuid, integer, uuid, text) from public, anon;
grant execute on function public.list_sellers() to authenticated;
grant execute on function public.search_customers(text, integer, integer) to authenticated;
grant execute on function public.reassign_demand(uuid, integer, uuid, text) to authenticated;

-- Giao diện hỏi "tôi có được sửa nhu cầu này không" (chỉ để ẩn/hiện nút; quyền thật vẫn do RLS).
create or replace function public.can_edit_demand_ui(p_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_edit_demand(p_id)
$$;
revoke execute on function public.can_edit_demand_ui(uuid) from public, anon;
grant execute on function public.can_edit_demand_ui(uuid) to authenticated;

-- Danh mục màu gợi ý (dữ liệu tham chiếu, không phải số liệu nghiệp vụ). Quản lý sửa/thêm được.
insert into public.vehicle_colors (name, sort_order) values
  ('trắng', 10), ('đen', 20), ('xám', 30), ('bạc', 40), ('đỏ', 50), ('xanh dương', 60),
  ('xanh lá', 70), ('nâu', 80), ('be', 90), ('vàng', 100), ('cam', 110)
on conflict (name) do nothing;
