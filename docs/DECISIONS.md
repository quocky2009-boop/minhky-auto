# Nhật ký quyết định

Trạng thái: **Chốt** (đã có căn cứ trong đặc tả hoặc anh Kỳ xác nhận) · **Tạm** (đội phát triển đặt, dùng được, chờ xác nhận) · **Chờ** (đang chặn một việc).

| # | Ngày | Quyết định | Lý do | Trạng thái |
|---|---|---|---|---|
| D1 | 01/10/2026 | Không dùng 2 project Supabase hiện có (`minhky-ev`, `minhky-parts-ai`); cần project riêng cho showroom | CLAUDE.md §13 cấm tự chọn project khác; tách dữ liệu kinh doanh | **Đã giải quyết 01/10/2026:** anh Kỳ tạo tổ chức riêng "Minh Kỳ Auto" + project `minhky-auto` (ap-southeast-1). Migrations đã áp và kiểm tra |
| D2 | 01/10/2026 | Repository tạo mới cục bộ; chưa có GitHub đích | Không có repo sẵn, chưa kết nối GitHub | **Đã giải quyết:** `quocky2009-boop/minhky-auto`. Chờ anh Kỳ push (xem PROGRESS) |
| D3 | 01/10/2026 | Tiền `numeric(18,0)` / `bigint`; null = Chưa rõ | §10 toàn vẹn số liệu; tránh 0 giả | Chốt |
| D4 | 01/10/2026 | Vai trò từ bảng `user_roles`, kiểm tra mỗi truy vấn; không dùng `user_metadata` | §11; thu hồi quyền có hiệu lực ngay | Chốt |
| D5 | 01/10/2026 | Tách giá chào / giá vốn-giá sàn thành bảng riêng | RLS lọc hàng, không lọc cột | Chốt |
| D6 | 01/10/2026 | Ghép nhu cầu bằng quy tắc TypeScript, không AI | §5, §14 không AI định giá; dễ giải thích, dễ test | Chốt |
| D7 | 01/10/2026 | Ngưỡng "lâu chưa cập nhật" = 14 ngày, sửa trong `app_settings` | Đặc tả yêu cầu cơ chế nhưng không nêu số ngày | **Tạm** |
| D8 | 01/10/2026 | Biên độ "gần phù hợp" của ngân sách linh hoạt = 10% (`BUDGET_TOLERANCE_PERCENT`) | Đặc tả không nêu; tránh gợi ý xe vượt xa khả năng chi | **Tạm** |
| D9 | 01/10/2026 | Tiêu chí bắt buộc mặc định khi nhập nhu cầu mua = hãng/model | Lệch model thường là gợi ý vô ích | **Tạm** |
| D10 | 01/10/2026 | Trùng SĐT chỉ gợi ý, không tự gộp; không có unique trên SĐT | Người nhà dùng chung số; tránh gộp nhầm | Chốt (theo §5) |
| D11 | 01/10/2026 | Sales tạo nhu cầu mới cho khách của đồng nghiệp thì xem được hồ sơ khách đó | Cần liên hệ để phục vụ; hồ sơ vẫn thuộc người phụ trách cũ | **Tạm** — nếu anh muốn chặn, phải đổi sang chuyển cho người phụ trách cũ |
| D12 | 01/10/2026 | Làm tròn chia lợi nhuận: phần công ty làm tròn nửa lên; phần các bên chia theo phần dư lớn nhất | §7 yêu cầu tổng luôn khớp; phương pháp cụ thể chưa nêu | **Tạm** — cần kế toán xác nhận trước chặng 4 |
| D13 | 01/10/2026 | Tài khoản do admin mời; tắt tự đăng ký; admin đầu tiên tạo bằng script bootstrap | App nội bộ | Chốt |
| D14 | 01/10/2026 | Không làm REST API riêng; dùng Server Actions + RPC có RLS | Giảm bề mặt tấn công; một nơi thực thi quyền | Chốt |
| D15 | 01/10/2026 | Đánh số chặng theo CLAUDE.md §14 (6 chặng). Báo cáo trong chat trước đó gọi nhầm là "chặng 3/4" | Thống nhất với đặc tả | Chốt — đã sửa trong mã và tài liệu |
| D16 | 01/10/2026 | Nhắc việc chỉ trong app (đèn báo, Việc hôm nay); chưa gửi Zalo/email | §14 không tích hợp Zalo khi chưa yêu cầu | Chốt cho chặng 2 |
| D17 | 01/10/2026 | Giữ 5 cảnh báo WARN của Supabase Advisor về hàm `SECURITY DEFINER` mà người đã đăng nhập gọi được: `my_roles`, `list_sellers`, `find_customers_by_phone`, `match_pool_buy_demands`, `match_pool_sell_offers` | Chủ ý thiết kế: cần vượt RLS để sales thấy "khách của đồng nghiệp cần xe này" mà không lộ liên hệ; mỗi hàm tự kiểm tra vai trò, trả tối thiểu cột. Có test | Chốt |
| D18 | 01/10/2026 | Migration đã áp lên `minhky-auto` bằng công cụ Supabase nên mã phiên bản trong lịch sử migration của Supabase khác tên file trong repo | Không ảnh hưởng nội dung. Nếu sau này dùng `supabase db push`, phải chạy `supabase migration repair` hoặc chỉ áp các migration mới | Ghi nhận |
| D19 | 01/10/2026 | Một dòng `vehicles` = một vòng sở hữu/ký gửi; VIN duy nhất giữa các hồ sơ đang hoạt động; xe quay lại tạo hồ sơ mới liên kết hồ sơ cũ | CLAUDE.md §4 "không ghi đè giao dịch cũ khi cùng xe quay lại" | Chốt |
| D20 | 01/10/2026 | Chỉ quản lý nhập kho từ nhu cầu bán; chưa có bước duyệt mua riêng (sẽ thêm cùng thẩm định ở lát 2) | Giữ lát 1 nhỏ, kiểm thử được; việc duyệt mua cần định nghĩa ngưỡng/người duyệt | **Tạm** — cần anh Kỳ cho biết ai duyệt mua và có ngưỡng giá không |
| D21 | 01/10/2026 | Xe mua đứt bắt buộc có giá mua khi nhập kho; xe ký gửi không được có giá mua | "Không coi dữ liệu thiếu là 0"; ký gửi không tăng vốn tồn sở hữu (§6) | Chốt |
