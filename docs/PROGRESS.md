# Tiến độ

Cập nhật: 01/10/2026 · Chặng hiện tại: **kết thúc chặng 2, chờ hạ tầng để nghiệm thu thật** · Chặng tiếp theo: 3 (kho → thu mua/thẩm định → chi phí → ký gửi)

## Tổng quan theo chặng (CLAUDE.md §14)

| Chặng | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nền tảng, Auth, schema, quyền, Storage | **Có mã + test database.** Chưa chạy trên Supabase thật |
| 2 | Khách → nhu cầu → lọc → chăm sóc → ghép xe | **Có mã + test database + build.** Chưa kiểm tra trên trình duyệt với tài khoản thật |
| 3 | Kho, thu mua/thẩm định, chi phí, ký gửi | Chưa làm (đã có bảng `vehicles` nền + màn hình Kho xe chỉ xem) |
| 4 | Vốn góp/vay, công thức, quyết toán | Chưa làm (đã có thư viện công thức + unit test) |
| 5 | Bán, thu chi, thu cũ đổi mới, bàn giao | Chưa làm |
| 6 | Dashboard, báo cáo, hậu mãi, hoa hồng, nghiệm thu | Chưa làm |

Theo §12, một tính năng chỉ "hoàn thành" khi chạy thật UI → Auth → database. Vì chưa có project Supabase, chặng 1–2 hiện ở mức
**đã kiểm chứng logic và database, chưa nghiệm thu đầu-cuối**.

## Chặng 1 — đã có

- 6 migrations: hàm chuẩn hóa (không dấu, SĐT), vai trò, hồ sơ nhân viên, cấu hình, pháp nhân, địa điểm, audit log bằng trigger,
  danh mục xe, khách, nhu cầu, xe 3 lớp, lịch sử vị trí xe, bucket riêng tư, RLS toàn bộ, RPC.
- Đăng nhập, đặt mật khẩu qua liên kết mời, trang "chưa được cấp quyền", menu theo quyền từ một registry.
- Quản lý người dùng: mời qua email (khóa bí mật chỉ ở máy chủ), bật/tắt vai trò, khóa/mở tài khoản (có xác nhận).
- Script tạo admin đầu tiên; dữ liệu demo chỉ cho staging có khóa an toàn.

## Chặng 2 — đã có

- **Thêm nhu cầu nhanh** (điện thoại trước tiên): chọn Cần mua/Cần bán, SĐT kiểm tra trùng → "Dùng khách này", nhiều phương án xe
  (gợi ý từ danh mục, gõ mới được), ngân sách gõ "650tr", tiêu chí bắt buộc, chi tiết thêm thu gọn, dán tin nhắn Zalo gốc, hẹn việc tiếp theo.
  Bấm lưu nhiều lần/mạng chập chờn không sinh trùng.
- **Danh sách nhu cầu**: lọc kết hợp 15 nhóm tiêu chí, nút lọc nhanh, lưu bộ lọc riêng, đèn báo chăm sóc, bảng (máy tính) / thẻ có nút Gọi (điện thoại), phân trang.
- **Chi tiết nhu cầu**: gọi/Zalo một chạm, tiêu chí hoặc "thông tin khách cung cấp — chưa kiểm tra", ghi nhật ký kèm chuyển trạng thái
  + việc tiếp theo trong một giao dịch, lịch sử, tệp đính kèm riêng tư, chia sẻ, quản lý đổi người phụ trách (có lý do, ghi nhật ký).
- **Gợi ý ghép**: nhu cầu mua → xe sẵn bán và nguồn khách chào bán (tách nhóm, có lý do từng tiêu chí);
  nhu cầu bán → khách mua có thể quan tâm. Khách của đồng nghiệp chỉ hiện mã + người phụ trách.
- **Sửa nhu cầu** có kiểm tra phiên bản (hai người sửa cùng lúc: người sau được báo, không ghi đè).
- **Việc hôm nay**: quá hạn / hôm nay / lâu chưa cập nhật / chưa có lịch; quản lý xem toàn showroom hoặc chỉ của mình.
- **Khách hàng**: tìm không dấu theo tên/SĐT/khu vực, hồ sơ + các nhu cầu, sửa có kiểm tra phiên bản, thêm nhu cầu mua/bán cho khách có sẵn.
- **Tổng quan**: số việc quá hạn/hôm nay/lâu chưa cập nhật, số nhu cầu mở, số xe đang bán. Phần tài chính để trống có ghi chú (không hiện số 0 giả).

## Bằng chứng kiểm thử (chạy ngày 01/10/2026)

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Không lỗi |
| `npm run lint` | Không lỗi, không cảnh báo |
| `npm test` | **37/37** unit test đạt (4 file) |
| `npm run test:db` | **28/28** test đạt trên PostgreSQL 16 thật + lớp giả lập auth/storage (3 file) |
| `npm run build` | Đạt; 16 route biên dịch |
| `next start` + curl | `/dang-nhap` trả 200 và có form; `/nhu-cau`, `/nhu-cau/moi`, `/tong-quan`, `/cai-dat/nguoi-dung` chuyển hướng về đăng nhập khi chưa đăng nhập |
| `supabase/bootstrap/first_admin.sql`, `supabase/seed/demo_staging.sql` | Chạy đúng trên database test; seed tự chặn khi thiếu cờ an toàn và khi chạy lần hai |

### Đối chiếu tiêu chí §12

| § | Tiêu chí | Trạng thái | Test |
|---|---|---|---|
| 12.1 | Khách vừa mua vừa bán, không trùng khách | ✔ | `demands-rls` |
| 12.2 | Lọc kết hợp; 600–700tr khớp 650tr; thiếu dữ liệu không giả phù hợp | ✔ | `search`, `matching`, `ui-flow` |
| 12.3 | Nguồn chưa nhập không phải xe sẵn giao; lịch nhắc; trạng thái đóng | ✔ | `matching`, `ui-flow`, `demands-rls`, `search` |
| 12.4 | Hai người giữ/cọc cùng xe | Chưa — chặng 5 | |
| 12.5 | Ký gửi tách tồn, quyết toán khớp | Chưa — chặng 3 | |
| 12.6 | P=40tr, c=20%, 60/40 → 8 / 19,2 / 12,8tr | ✔ ở thư viện | `profit-split` |
| 12.7 | Công ty vừa góp vốn vừa vận hành không đếm trùng | ✔ ở thư viện | `profit-split` |
| 12.8 | Thiếu điều khoản/lỗ không quyết toán; làm tròn khớp tổng | ◐ thư viện xong; "tỷ lệ xe không đổi theo cấu hình chung" cần bảng điều khoản (chặng 4) | `profit-split` |
| 12.9 | Thu cũ đổi mới | Chưa — chặng 5 | |
| 12.10 | Retry không sinh trùng | ◐ đã có cho tạo nhu cầu/khách và nhật ký (kể cả gửi song song); phiếu thu/chi ở chặng 5 | `demands-rls`, `ui-flow` |
| 12.11 | Sales bị chặn khi truy cập dữ liệu/tệp ngoài quyền bằng ID trực tiếp | ✔ cho phạm vi hiện có (khách, nhu cầu, giá vốn, tệp) | `demands-rls`, `ui-flow` |
| 12.12 | Đổi/thu hồi vai trò có hiệu lực, không dựa vào UI | ✔ | `demands-rls` |
| 12.13 | Báo cáo khớp giao dịch | Chưa — chặng 6 | |
| 12.14 | Dùng được trên máy tính và điện thoại | ◐ giao diện đã thiết kế responsive; **chưa kiểm tra trên trình duyệt thật** | |

## Chưa xác minh (do thiếu môi trường)

- Chưa chạy trên Supabase thật: hành vi Auth (mời, đặt mật khẩu, getClaims), Storage thật (tải lên, signed URL), Data API/PostgREST
  (cú pháp `select` lồng bảng, tên khóa ngoại), Security Advisors.
- Chưa kiểm tra trên trình duyệt có đăng nhập (desktop + điện thoại). Test database dùng SQL trực tiếp, không qua PostgREST.
- Chưa đo hiệu năng với dữ liệu lớn (bộ lọc dùng view + LIKE trên chuỗi chuẩn hóa; có chỉ mục trigram nhưng chưa đo).

## Trở ngại hiện tại (cần anh Kỳ)

1. Duyệt tạo project Supabase riêng (đề xuất `minhky-auto`, vùng Singapore; nên có thêm project staging) — D1.
2. Tên repository GitHub đích — D2. Repository hiện có lịch sử git cục bộ, sẵn sàng push.
3. Xác nhận các tham số tạm D7, D8, D9, D11, D12 (xem `DECISIONS.md`).

## Bước tiếp theo

1. Khi có project staging: áp migrations → bootstrap admin → seed demo → kiểm tra theo `DEPLOYMENT.md` §5 trên máy tính và điện thoại; sửa lỗi tích hợp nếu có.
2. Chặng 3: nhập xe (mới/cũ/ký gửi), hồ sơ thu mua + thẩm định (tách thông tin khách khai với kết quả kiểm tra), chuyển nhu cầu bán → xe trong kho
   (`converted_vehicle_id`), chi phí chuẩn bị xe, hợp đồng ký gửi, giao diện quản lý danh mục.
