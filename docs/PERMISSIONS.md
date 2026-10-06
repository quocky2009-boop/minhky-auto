# Phân quyền

## Cách thực thi

1. **Vai trò** lưu ở bảng `user_roles` (một người có thể nhiều vai trò). Chỉ admin ghi được bảng này. **Không** dùng `user_metadata`
   (người dùng tự sửa được) — có test chứng minh đặt `role: admin` trong metadata không cấp quyền gì.
2. **Kiểm tra quyền ở database:** các hàm `private.has_any_role`, `is_manager`, `can_sell`, `can_see_finance`, `can_access_demand`, `can_edit_demand`
   đọc vai trò từ bảng **mỗi lần truy vấn** và yêu cầu `profiles.is_active = true`.
   → Khóa tài khoản hoặc gỡ vai trò có hiệu lực **ngay ở truy vấn tiếp theo**, kể cả khi phiên đăng nhập (JWT) chưa hết hạn (test §12.12).
3. **RLS bật trên mọi bảng**; vai trò `anon` (chưa đăng nhập) bị thu hồi mọi quyền. Schema `private` không lộ qua Data API.
4. **Giao diện** chỉ ẩn/hiện menu theo registry `src/lib/modules.ts` để dễ dùng; đây không phải lớp bảo mật.
   Dán thẳng đường dẫn nhu cầu của người khác → database không trả dữ liệu → trang "không tìm thấy".
5. **Khóa bí mật** (`SUPABASE_SECRET_KEY`) chỉ dùng phía máy chủ cho chức năng mời nhân viên.

## Vai trò

| Mã | Tên | Phạm vi |
|---|---|---|
| `admin` | Chủ tịch / Quản trị | Toàn quyền quản lý + quản lý người dùng, cấu hình |
| `manager` | Quản lý showroom | Xem/sửa toàn bộ khách, nhu cầu, xe, tài chính xe; giao việc |
| `accountant` | Kế toán | Tài chính xe (giá vốn, giá sàn), kho xe; không xem khách/nhu cầu |
| `sales` | Sales | Khách và nhu cầu của mình hoặc được chia sẻ; xe đang bán; giá chào |
| `technician` | Thẩm định / chuẩn bị xe | Thông tin xe chưa bán; không giá, không khách |

## Ma trận (đã triển khai — chặng 1–2)

Ký hiệu: ✔ toàn bộ · ◐ một phần (ghi chú) · — không có quyền.

| Đối tượng / thao tác | admin | manager | accountant | sales | technician |
|---|---|---|---|---|---|
| Khách hàng — xem | ✔ | ✔ | — | ◐ ¹ | — |
| Khách hàng — tạo / sửa | ✔ | ✔ | — | ◐ ¹ | — |
| Kiểm tra trùng SĐT | ✔ | ✔ | — | ◐ ² | — |
| Nhu cầu — xem, ghi nhật ký | ✔ | ✔ | — | ◐ ³ | — |
| Nhu cầu — sửa tiêu chí, chuyển trạng thái | ✔ | ✔ | — | ◐ người phụ trách | — |
| Nhu cầu — đổi người phụ trách, mở lại đã đóng | ✔ | ✔ | — | — | — |
| Nhu cầu — chia sẻ cho đồng nghiệp | ✔ | ✔ | — | ◐ người phụ trách | — |
| Tệp đính kèm — xem / tải lên | ✔ | ✔ | — | ◐ như nhu cầu | — |
| Tệp đính kèm — xóa | ✔ | ✔ | — | — | — |
| Nguồn ghép (tiêu chí, không liên hệ) | ✔ | ✔ | — | ✔ | — |
| Xe — xem | ✔ | ✔ | ✔ | ◐ đang bán/giữ/cọc | ◐ chưa bán |
| Xe — giá chào | ✔ | ✔ | ✔ | ✔ | — |
| Xe — giá vốn, giá sàn | ✔ | ✔ | ✔ | — | — |
| Xe — thêm / sửa / nhập kho từ nhu cầu bán | ✔ | ✔ | — | — | — |
| Thẩm định — xem tình trạng + checklist | ✔ | ✔ | — | ◐ nhu cầu của mình | — |
| Thẩm định — ghi, duyệt mua, mở lại | ✔ | ✔ | — | — | — |
| Giá đề xuất / giá mua tối đa được duyệt | ✔ | ✔ | ✔ (xem) | — | — |
| Chi phí xe — xem | ✔ | ✔ | ✔ | — | — |
| Chi phí xe — thêm khoản, xác nhận số thực tế, ghi/hủy thanh toán | ✔ | ✔ | ✔ | — | — |
| Chi phí xe — duyệt/sửa dự toán, hủy khoản | ✔ | ✔ | — | — | — |
| Giữ xe / đặt cọc — tạo, gia hạn, nhả, chuyển giữ → cọc | ✔ | ✔ | — | ◐ nhu cầu mình phụ trách | — |
| Giữ xe / đặt cọc — xem chi tiết (khách, tiền cọc) | ✔ | ✔ | ✔ (xem) | ◐ của mình | — |
| Đặt cọc — hủy | ✔ | ✔ | — | — | — |
| Báo giá — lập, sửa giá (phiên bản mới), khách chấp nhận, hủy | ✔ | ✔ | — | ◐ nhu cầu mình phụ trách | — |
| Báo giá — xem | ✔ | ✔ | ✔ (xem) | ◐ của mình (chỉ cờ "cần duyệt", không giá sàn) | — |
| Báo giá — duyệt / từ chối giá thấp hơn mức cho phép | ✔ | ✔ | — | — | — |
| Đơn bán — lập, sửa nháp, xác nhận (giá đạt mức cho phép), hủy nháp | ✔ | ✔ | — | ◐ nhu cầu/đơn mình phụ trách | — |
| Đơn bán — xác nhận khi có dòng thấp hơn mức cho phép (kèm lý do) | ✔ | ✔ | — | — | — |
| Đơn bán — hủy đơn đã xác nhận | ✔ | ✔ | — | — | — |
| Đơn bán — xem | ✔ | ✔ | ✔ (xem) | ◐ của mình | — |
| Tài khoản tiền, phiếu thu/chi, số dư, công nợ đơn bán — xem | ✔ | ✔ | ✔ | — | — |
| Phiếu thu/chi — lập | ✔ | ✔ | ✔ | — | — |
| Thu cũ đổi mới — xem hồ sơ, đối trừ, số liệu | ✔ | ✔ | ✔ | — | — |
| Thu cũ đổi mới — lập/xác nhận/hủy hồ sơ; xác nhận/hủy đối trừ | ✔ | ✔ | — | — | — |
| Phiếu chi xe cũ (chi cho khách, trả ngân hàng) — lập | ✔ | ✔ | ✔ | — | — |
| Bàn giao — lập, làm checklist, giao xe, hủy (bàn giao của đơn mình phụ trách) | ✔ | ✔ | — | ◐ | — |
| Bàn giao — xem (sales: chỉ cờ điều kiện, không số tiền) | ✔ | ✔ | ✔ | ◐ của mình | — |
| Bàn giao — phê duyệt/thu hồi ngoại lệ; sửa danh mục checklist | ✔ | ✔ | — | — | — |
| Quyết toán — xem, tạm tính, kiểm tra, lập phiếu chi/thu theo nghĩa vụ | ✔ | ✔ | ✔ | — | — |
| Quyết toán — phê duyệt; ghi xử lý hòa vốn/lỗ; lập điều chỉnh; hủy bản đã duyệt | ✔ | ✔ | — | — | — |
| Phiếu thu/chi — hủy; tài khoản tiền — lập/sửa/ngừng dùng | ✔ | ✔ | — | — | — |
| Bên góp vốn, điều khoản chia lợi nhuận, vốn cam kết, khoản cho vay — xem | ✔ | ✔ | ✔ | — | — |
| Bên góp vốn, điều khoản (lập/duyệt/hủy nháp/xác nhận lại), vốn cam kết, khoản vay, hủy dòng sổ | ✔ | ✔ | — | — | — |
| Tiền thực nhận, rút vốn, thanh toán khoản vay — ghi | ✔ | ✔ | ✔ | — | — |
| Ảnh/video xe — xem, tải lên | ✔ | ✔ | ✔ | ◐ xe mình thấy | ◐ xe chưa bán |
| Ảnh/video xe — lưu trữ (không xóa) | ✔ | ✔ | — | — | — |
| Hợp đồng ký gửi — xem (chủ xe, thỏa thuận, biên bản) | ✔ | ✔ | ✔ | — | — |
| Hợp đồng ký gửi — lập, thêm thỏa thuận, kích hoạt, hủy nháp, trả xe | ✔ | ✔ | — | — | — |
| Mẫu checklist thẩm định — sửa | ✔ | — | — | — | — |
| Danh mục hãng/model — thêm | ✔ | ✔ | ✔ | ✔ | ✔ |
| Danh mục — sửa | ✔ | ✔ | — | — | — |
| Cấu hình `app_settings`, nguồn khách — sửa | ✔ | — | — | — | — |
| Người dùng & vai trò | ✔ | ◐ xem vai trò | — | — | — |
| Audit log — xem | ✔ | ✔ | — | — | — |
| Audit log, nhật ký liên hệ — sửa/xóa | — | — | — | — | — |

¹ Khách do mình phụ trách hoặc tạo, hoặc có nhu cầu mình phụ trách/tạo/được chia sẻ.
² Thấy khách trùng của người khác dưới dạng tên rút gọn + người phụ trách; không thấy địa chỉ, ghi chú.
³ Nhu cầu mình phụ trách, tạo, hoặc được chia sẻ. Người được chia sẻ xem và ghi nhật ký, không sửa tiêu chí.

Quyền chặng 3–6 (thu mua, ký gửi, vốn góp, quyết toán, thu chi, bán hàng, báo cáo) sẽ bổ sung vào bảng này khi triển khai;
nguyên tắc định hướng theo CLAUDE.md §11: sales không xem giá vốn, lợi nhuận, vốn góp; kế toán duyệt thu chi; quản lý duyệt quyết toán.

## Bằng chứng kiểm thử

`tests/db/demands-rls.test.ts` và `tests/db/ui-flow.test.ts` chạy SQL trực tiếp dưới vai trò `authenticated` với từng người dùng:
sales B không đọc/sửa/ghi nhật ký nhu cầu của A; kế toán và kỹ thuật không đọc được nhu cầu; sales và kỹ thuật không đọc giá vốn;
kỹ thuật không đọc giá chào; người ngoài quyền không đọc/ghi được tệp; sales không đổi người phụ trách; khóa tài khoản/gỡ vai trò mất quyền ngay;
người dùng không tự ghi được nhật ký hệ thống; `anon` bị chặn mọi bảng và RPC.
