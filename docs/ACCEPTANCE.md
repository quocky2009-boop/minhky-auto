# Nghiệm thu (08/10/2026)

Báo cáo trung thực về những gì **đã chứng minh bằng chạy thật**, những gì **chưa**, và việc Chủ tịch cần làm để nghiệm thu đầu-cuối.
Không tuyên bố "hoàn tất" cho phần chỉ có giao diện/mã mà chưa kiểm bằng người dùng thật (CLAUDE.md §3, §12).

## 1. Kết quả kiểm tra tự động

| Kiểm tra | Kết quả (08/10/2026) |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | đạt |
| `npm test` (unit) | 21 file, 158 test đạt |
| `npm run test:db` (database PostgreSQL thật cục bộ, chạy bằng role `postgres`) | 19 file, **171/171 đạt** (gồm test đồng thời thật ở database) |
| Áp migration lên Supabase `minhky-auto` | migrations 1400 → 4200 đã áp (14 migration 2700–4000 là bản xuất từ Supabase, không áp lại), mỗi lần kiểm RLS/quyền/advisor |

## 2. Bảng đối chiếu §12 (14 mục)

| # | Yêu cầu | Bằng chứng (test chạy thật) | Tình trạng |
|---|---|---|---|
| 1 | Một khách vừa mua vừa bán, không trùng khách | `demands-rls` §12.1, `ui-flow` | đạt (database) |
| 2 | Lọc kết hợp; ngân sách 600–700 tr khớp xe 650 tr; thiếu dữ liệu không giả phù hợp | `search`, `tests/unit` (khoảng giá, ghép xe) | đạt |
| 3 | Nguồn xe chưa nhập không là xe sẵn giao; nhu cầu có lịch nhắc và trạng thái đóng | `inventory`, `demands-rls` §12.3, `reports` (tồn kho chỉ gồm xe đã nhập kho) | đạt |
| 4 | Hai người giữ/cọc cùng xe: một thắng (đồng thời thật) | `reservations` (giữ-giữ, giữ-cọc, cọc-cọc, 4 yêu cầu song song) | đạt |
| 5 | Ký gửi tách tồn sở hữu; thu hộ/phần showroom/chủ xe khớp | `consignment`, `settlement` (KÝ GỬI cả hai bên thu tiền), `reports` | đạt |
| 6 | Ví dụ P=40 tr, 20%, 60/40 → 8 / 19,2 / 12,8 tr (không phải mặc định) | `settlement` (VÍ DỤ CHỐT, khớp công thức TypeScript) | đạt |
| 7 | Công ty vừa góp vốn vừa vận hành, không đếm trùng | `settlement` (Công ty góp vốn) | đạt |
| 8 | Tỷ lệ từng xe không đổi theo cấu hình chung; thiếu điều khoản/lỗ không tự quyết toán; làm tròn khớp tổng | `capital`, `settlement` (làm tròn, hòa vốn/lỗ) | đạt |
| 9 | Thu cũ đổi mới giữ hai giao dịch; đối trừ không tạo tiền giả; trả ngân hàng không trừ hai lần; hủy xử lý đúng | `trade-in` | đạt |
| 10 | Retry phiếu thu/chi/quyết toán không trùng; chi phí và thanh toán không tính hai lần | `cashbook`, `costs`, `settlement`, `commission`, `cashbook-link` (idempotency + khóa tài khoản) | đạt |
| 11 | Sales bị từ chối truy cập API tài chính/file ngoài quyền (đọc và sửa bằng ID trực tiếp) | `demands-rls`, `costs`, `capital`, `cashbook`, `settlement`, `commission`, `aftersales`, `vehicle-files`, `security-baseline` | đạt (database); **chưa thử qua Data API của Supabase với tài khoản thật** |
| 12 | Đổi vai trò/thu hồi quyền có hiệu lực ngay, không dựa UI cache | `demands-rls` §12.12 | đạt (database) |
| 13 | Báo cáo khớp giao dịch, chi phí sau bán và điều chỉnh được phản ánh | `settlement` (BÁO CÁO, TỒN KHO, HẬU MÃI, ĐIỀU CHỈNH), `commission` (BÁO CÁO) | đạt |
| 14 | Luồng chính dùng được trên desktop và điện thoại | Chỉ kiểm được trang đăng nhập (375 px và 1280 px, không tràn ngang) và chuyển hướng của 11 route cần đăng nhập, gồm xuất CSV | **CHƯA nghiệm thu** — xem mục 4 |

## 3. Rà bảo mật toàn schema (phát hiện và đã sửa khi nghiệm thu)

Test `tests/db/security-baseline.test.ts` chạy cùng các truy vấn trên database cục bộ; cùng truy vấn đã chạy trên Supabase thật:

- Mọi bảng public bật RLS; `anon` không có quyền bảng/view/hàm nào.
- **Đã sửa (migration 4100, trước đây đánh số 2500):** 16 view còn quyền ghi mặc định → chỉ còn SELECT; mọi view `security_invoker`.
- **Đã sửa (migration 4200, trước đây đánh số 2600):** các bảng chặng 1–4 còn quyền `TRUNCATE` (bỏ qua RLS) và `DELETE` cho người đăng nhập → quản lý có thể xóa thẳng xe/giá mua/thẩm định qua Data API. Nay `TRUNCATE` không ai có; `DELETE` chỉ còn 6 bảng liên kết/cấu hình mà ứng dụng thật sự xóa (`user_roles`, `demand_shares`, `saved_filters`, `demand_vehicle_options`, `appraisal_items`, `vehicle_capital_shares`).
- Hàm `SECURITY DEFINER` công khai: 7 hàm của ứng dụng đã rà (trả dữ liệu hẹp, tự kiểm quyền; cảnh báo Advisor tương ứng là có chủ đích) + 6 hàm `valuation_agent_*` (đã xuất vào repository, `docs/EXTERNAL_MIGRATIONS.md`; không ai ngoài chủ hàm/`service_role` gọi được).
- Cảnh báo còn lại của Advisor: "Leaked password protection" tắt → **Chủ tịch bật trong Supabase Dashboard** (Authentication → Providers/Password security), việc này không làm được từ mã.

## 4. Việc Chủ tịch cần làm để nghiệm thu đầu-cuối (tôi không làm thay được: cần tài khoản thật và thiết bị)

Dùng bản deploy Vercel hoặc `npm run dev` với `.env.local`. Tạo 4 tài khoản thử: quản lý, kế toán, sales A, sales B (và kỹ thuật nếu dùng). **Dùng project staging hoặc dữ liệu thử** (DEPLOYMENT.md §1) — không nhập dữ liệu thử vào dữ liệu thật.

Mỗi bước thực hiện trên **điện thoại và máy tính**; ghi kết quả đạt/không vào PROGRESS.md:

1. Đăng nhập từng vai trò; menu đúng quyền (sales không thấy Thu chi/Quyết toán/Báo cáo; kỹ thuật chỉ thấy phần xe/hậu mãi được giao).
2. Sales A tạo khách + nhu cầu mua (ngân sách 600–700 tr) và nhu cầu bán; dán đường dẫn nhu cầu của A bằng tài khoản sales B → "không tìm thấy".
3. Quản lý nhập xe (xe mới và xe cũ có VIN), giá mua, giá sàn; sales thấy xe nhưng không thấy giá mua/giá sàn.
4. Báo giá → đơn bán → quản lý xác nhận (thử giá thấp hơn giá sàn cần duyệt) → kế toán thu tiền (thử thu vượt công nợ → bị chặn).
5. Bàn giao: checklist, thử giao khi chưa thu đủ (bị chặn), phê duyệt ngoại lệ, giao xe → xuất hiện 3 phiếu chăm sóc 7/30/90 ngày.
6. Quyết toán xe góp vốn (nhập quy tắc hoa hồng trước) và xe ký gửi: tạm tính → kiểm tra → duyệt → chi; so tay với ví dụ 40 tr / 20% / 60:40.
7. Hoa hồng: thêm quy tắc xe mới (hãng/model) và xe cũ (VIN); bán xe; kiểm khoản hoa hồng của sales A (sales B không thấy); duyệt, chi từ tài khoản tiền.
8. Hậu mãi: ghi bảo hành, mở phiếu, ghi chi phí sau bán, đóng phiếu; Báo cáo (`/bao-cao`) và xuất CSV mở được bằng Excel, tiếng Việt đúng.
9. Điện thoại: mọi form nhập tay được, không tràn ngang, nút bấm đủ lớn; thử bấm "Lưu" hai lần liên tiếp không sinh bản ghi trùng.
10. Sao lưu: thực hiện một lần theo DEPLOYMENT.md §4 trên project thật và ghi ngày.

## 5. Còn tồn đọng cần quyết định

- **Lệch giữa Supabase và repository: ĐÃ XỬ LÝ (09/10/2026).** 14 migration ngoài repository (`appraisal_ai_*`, `valuation_agent_*`, chính sách thu mua) đã xuất nguyên văn vào `supabase/migrations/2700–4000`, khớp từng ký tự với Supabase, dựng lại database cục bộ đạt 171/171 test. Chi tiết, lưu ý bảo mật (băm token đã che, đề nghị đổi token) và quy tắc từ nay: `docs/EXTERNAL_MIGRATIONS.md`.
- **Các quyết định còn "Tạm"** trong `docs/DECISIONS.md` (cột cuối): D46–D49, D51–D53, D55–D59, D62–D66, D73, D75, D76, D78 (kèm danh mục checklist bàn giao mặc định), D82, D89, D90, D96, D97. Chủ tịch xem và xác nhận hoặc sửa.
- **Chưa làm có chủ đích (CLAUDE.md §14):** cổng người góp vốn, app native, đọc nhóm Zalo, AI trích xuất/định giá trong ứng dụng, kết nối ngân hàng/kế toán, thuế TNCN trên hoa hồng.
- **Repository đang công khai** (DEPLOYMENT.md §6): lộ cấu trúc dữ liệu và quy tắc nghiệp vụ (không lộ dữ liệu). Cân nhắc chuyển Private.
