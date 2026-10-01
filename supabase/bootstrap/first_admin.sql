-- =====================================================================
-- Tạo quản trị viên ĐẦU TIÊN (chạy MỘT lần, trong SQL Editor của project showroom).
-- Bước 1: Supabase Dashboard → Authentication → Users → "Add user" (email + mật khẩu tạm).
-- Bước 2: sửa email bên dưới thành email vừa tạo rồi chạy toàn bộ khối này.
-- Các nhân viên sau đó do admin mời ngay trong app (Cài đặt → Người dùng & vai trò).
-- =====================================================================
do $$
declare
  v_email text := 'admin@example.com';   -- <<< SỬA
  v_name  text := 'Chủ tịch';            -- <<< SỬA
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email);
  if v_id is null then
    raise exception 'Chưa có tài khoản % trong Authentication → Users', v_email;
  end if;
  insert into public.profiles (id, full_name, is_active) values (v_id, v_name, true)
    on conflict (id) do update set full_name = excluded.full_name, is_active = true;
  insert into public.user_roles (user_id, role) values (v_id, 'admin') on conflict do nothing;
  raise notice 'Đã cấp quyền admin cho %', v_email;
end $$;
