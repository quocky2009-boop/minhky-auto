-- =====================================================================
-- MINH KỲ AUTO — 4100 Nghiệm thu (trước đây đánh số 2500; đổi số để chạy SAU các migration xuất từ Supabase, đúng thứ tự trên production): view chỉ để đọc
--
-- Supabase cấp mặc định đầy đủ quyền (INSERT/UPDATE/DELETE/TRUNCATE) trên view mới cho vai trò đăng nhập. Các view của ứng dụng đều chỉ đọc
-- (security invoker, có join/gom nhóm nên không tự ghi xuyên được vào bảng gốc), nhưng thu hồi quyền ghi để không còn dựa vào cấu trúc view:
-- phòng thủ nhiều lớp (CLAUDE.md §11). Chỉ SELECT được giữ. View mới về sau: dùng cùng quy tắc (grant select, không cấp ghi).
-- =====================================================================
do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated, anon', v.relname);
  end loop;
end $$;
