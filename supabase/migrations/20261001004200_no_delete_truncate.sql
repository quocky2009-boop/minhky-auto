-- =====================================================================
-- MINH KỲ AUTO — 4200 Nghiệm thu (trước đây đánh số 2600; đổi số vì cùng lý do với 4100): thu hồi quyền XÓA/TRUNCATE còn sót trên các bảng cũ (chặng 1–4)
--
-- CLAUDE.md §10–§11: không xóa âm thầm; dùng điều chỉnh/đảo/lưu trữ có lịch sử. Rà toàn schema khi nghiệm thu phát hiện các bảng tạo ở chặng đầu vẫn giữ
-- quyền DELETE/TRUNCATE mặc định của Supabase cho vai trò đăng nhập: TRUNCATE bỏ qua RLS; DELETE chỉ còn bị chính sách `*_write` (quản lý) giới hạn nên quản lý có thể
-- xóa thẳng xe/giá mua/thẩm định qua Data API. Thu hồi:
--   * TRUNCATE trên mọi bảng public (không chỗ nào của ứng dụng dùng).
--   * DELETE trên mọi bảng public TRỪ các bảng ứng dụng thật sự xóa dòng liên kết/cấu hình (theo mã nguồn và RPC):
--       user_roles (thu hồi vai trò), demand_shares (bỏ chia sẻ), saved_filters (xóa bộ lọc của chính mình), demand_vehicle_options (cập nhật phương án xe),
--       appraisal_items (đồng bộ mục thẩm định theo mẫu), vehicle_capital_shares (soạn lại điều khoản nháp).
-- Bảng mới về sau: không cấp DELETE/TRUNCATE (bài test security-baseline chặn).
-- =====================================================================
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate on public.%I from authenticated, anon', t.relname);
    if t.relname not in ('user_roles', 'demand_shares', 'saved_filters', 'demand_vehicle_options', 'appraisal_items', 'vehicle_capital_shares') then
      execute format('revoke delete on public.%I from authenticated, anon', t.relname);
    end if;
  end loop;
end $$;
