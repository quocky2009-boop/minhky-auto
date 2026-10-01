# Tiến độ

Cập nhật: 01/10/2026 · Chặng hiện tại: **chặng 3 — lát 1 (kho xe + nhập kho) và lát 2 (thẩm định + duyệt mua) đã xong, đã áp lên Supabase** · Tiếp theo: lát 3 (chi phí), lát 4 (ký gửi)

## Tổng quan theo chặng (CLAUDE.md §14)

| Chặng | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nền tảng, Auth, schema, quyền, Storage | **Có mã + test database.** Chưa chạy trên Supabase thật |
| 2 | Khách → nhu cầu → lọc → chăm sóc → ghép xe | **Có mã + test database + build.** Chưa kiểm tra trên trình duyệt với tài khoản thật |
| 3 | Kho, thu mua/thẩm định, chi phí, ký gửi | **Đang làm — lát 1, 2 xong:** kho xe, vòng sở hữu theo VIN, nhập kho; thẩm định có checklist + duyệt mua. **Còn:** chi phí (dự kiến/xác nhận/đã trả), hợp đồng ký gửi, ảnh/tệp gắn với xe, giao diện quản lý địa điểm/mẫu checklist, kỹ thuật viên tự nhập kết quả kiểm tra |
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
| `npm test` | **49/49** unit test đạt (6 file) |
| `npm run test:db` | **49/49** test đạt trên PostgreSQL 16 thật + lớp giả lập auth/storage (5 file) |
| `npm run build` | Đạt; 17 trang biên dịch (có 4 route kho xe) |
| `next start` + curl | `/dang-nhap` trả 200 và có form; `/nhu-cau`, `/nhu-cau/moi`, `/tong-quan`, `/cai-dat/nguoi-dung` chuyển hướng về đăng nhập khi chưa đăng nhập |
| `supabase/bootstrap/first_admin.sql`, `supabase/seed/demo_staging.sql` | Chạy đúng trên database test; seed tự chặn khi thiếu cờ an toàn và khi chạy lần hai |

### Đối chiếu tiêu chí §12

| § | Tiêu chí | Trạng thái | Test |
|---|---|---|---|
| 12.1 | Khách vừa mua vừa bán, không trùng khách | ✔ | `demands-rls` |
| 12.2 | Lọc kết hợp; 600–700tr khớp 650tr; thiếu dữ liệu không giả phù hợp | ✔ | `search`, `matching`, `ui-flow` |
| 12.3 | Nguồn chưa nhập không phải xe sẵn giao; lịch nhắc; trạng thái đóng | ✔ | `matching`, `ui-flow`, `demands-rls`, `search` |
| 12.4 | Hai người giữ/cọc cùng xe | Chưa — chặng 5 | |
| 12.5 | Ký gửi tách tồn, quyết toán khớp | ◐ đã tách hình thức sở hữu/ký gửi, ký gửi không có giá mua, lọc tồn riêng; hợp đồng + quyết toán chưa làm | `inventory` |
| 12.6 | P=40tr, c=20%, 60/40 → 8 / 19,2 / 12,8tr | ✔ ở thư viện | `profit-split` |
| 12.7 | Công ty vừa góp vốn vừa vận hành không đếm trùng | ✔ ở thư viện | `profit-split` |
| 12.8 | Thiếu điều khoản/lỗ không quyết toán; làm tròn khớp tổng | ◐ thư viện xong; "tỷ lệ xe không đổi theo cấu hình chung" cần bảng điều khoản (chặng 4) | `profit-split` |
| 12.9 | Thu cũ đổi mới | Chưa — chặng 5 | |
| 12.10 | Retry không sinh trùng | ◐ đã có cho tạo nhu cầu/khách và nhật ký (kể cả gửi song song); phiếu thu/chi ở chặng 5 | `demands-rls`, `ui-flow` |
| 12.11 | Sales bị chặn khi truy cập dữ liệu/tệp ngoài quyền bằng ID trực tiếp | ✔ cho phạm vi hiện có (khách, nhu cầu, giá vốn, tệp) | `demands-rls`, `ui-flow` |
| 12.12 | Đổi/thu hồi vai trò có hiệu lực, không dựa vào UI | ✔ | `demands-rls` |
| 12.13 | Báo cáo khớp giao dịch | Chưa — chặng 6 | |
| 12.14 | Dùng được trên máy tính và điện thoại | ◐ giao diện đã thiết kế responsive; **chưa kiểm tra trên trình duyệt thật** | |

## Chặng 3 — lát 1: kho xe và nhập kho (01/10/2026)

- **Vòng sở hữu:** mỗi dòng `vehicles` là một vòng của một chiếc xe thật. VIN chỉ duy nhất giữa các hồ sơ đang hoạt động; xe bán xong rồi quay lại tạo hồ sơ mới
  liên kết `previous_vehicle_id`, hồ sơ cũ (giá mua cũ, trạng thái đã giao) giữ nguyên. Hồ sơ đã kết thúc không "sống lại".
- **Luật trạng thái bán hàng** ở database (trigger); không đặt tay giữ/cọc/bán/giao qua form (thuộc chặng 5); không đổi hình thức sở hữu/ký gửi sau khi nhập.
- **Kho xe:** danh sách lọc kết hợp (mới/cũ, hình thức, trạng thái, hãng/model, đời, màu, giá chào, vị trí, tuổi tồn), phân trang, sắp xếp tồn lâu trước;
  chi tiết xe; nhập xe; sửa xe có kiểm tra phiên bản. Sales chỉ thấy xe đang bán + giá chào; kỹ thuật không thấy giá; giá mua/giá sàn chỉ quản lý/kế toán.
- **Nhập kho từ nhu cầu bán** (chỉ quản lý): chỉ khi nhu cầu ở "Đã thẩm định"/"Thương lượng"; mua đứt bắt buộc giá mua, ký gửi cấm giá mua;
  giá trị đã kiểm tra ghi đè thông tin khách khai (thông tin khách khai giữ nguyên ở nhu cầu); liên kết nguồn gốc hai chiều; bấm lặp/thử lại không tạo trùng xe;
  nhu cầu chuyển "đã mua vào/nhận ký gửi" + nhật ký hệ thống; VIN trùng xe đang hoạt động thì chặn.
- Test: 12 test database + 8 test unit mới (xem bảng kiểm thử). Migration `0800_inventory.sql` đã áp lên `minhky-auto` và thử trong giao dịch tự hủy.

**Giới hạn hiện biết của lát 1:** chưa có giao diện thêm địa điểm (hiện có 1 địa điểm, thêm qua SQL); chưa có ảnh/video/tệp gắn với xe; chưa có chi phí và hợp đồng ký gửi.

## Chặng 3 — lát 2: thẩm định và duyệt mua (01/10/2026)

- **Thẩm định có checklist** trong trang nhu cầu bán (quản lý): 17 mục theo nhóm (giấy tờ & nhận dạng, tình trạng xe, xe điện, khác); mỗi mục Đạt / Không đạt / Không áp dụng / Chưa kiểm tra.
  Lưu nháp; có chống ghi đè đồng thời.
- **Mục chưa kiểm tra không được coi là đạt:** không duyệt được khi còn mục bắt buộc chưa kiểm tra. Mục không đạt phải ghi tình trạng. ODO và pin xe điện phải ghi số đo/bằng chứng.
  Đánh dấu xe điện thì thêm mục pin (SoH) và sạc bắt buộc.
- **Duyệt mua:** quản lý/admin, không ngưỡng giá. Phải nhập **giá mua tối đa được duyệt** (trừ xe ký gửi). Từ chối bắt buộc lý do. Đã chốt thì khóa; mở lại có nhật ký và xóa giá đã duyệt (phải duyệt lại).
- **Nhập kho bắt buộc thẩm định đã duyệt;** giá mua thực tế không vượt giá tối đa đã duyệt; sau khi nhập kho không đổi quyết định.
- **Tách quyền:** sales phụ trách thấy tình trạng thẩm định + checklist nhưng KHÔNG thấy giá đề xuất/giá duyệt; nhật ký hệ thống không ghi số tiền; kế toán xem được giá.
- **Địa điểm** Showroom Minh Kỳ Auto (212 Trường Chinh, P. Minh Xuân, tỉnh Tuyên Quang) đã có trong hệ thống.
- Test: 9 test database + 4 test unit mới. Migration `0900_appraisal_approval.sql` đã áp lên `minhky-auto` và thử trong giao dịch tự hủy.

**Giới hạn của lát 2:** ảnh/video bằng chứng chưa gắn trực tiếp vào từng mục (hiện dùng "Tệp đính kèm" của nhu cầu và ghi tên tệp vào ghi chú); kỹ thuật viên chưa tự nhập được kết quả kiểm tra;
chưa có giao diện sửa mẫu checklist (sửa qua SQL bảng `appraisal_templates`); chưa có hợp đồng mua.

## Kiểm tra trên Supabase thật — project `minhky-auto` (01/10/2026)

Đã xác minh đúng project (tổ chức "Minh Kỳ Auto", ap-southeast-1, ban đầu hoàn toàn trống) trước khi áp.

| Việc | Kết quả |
|---|---|
| Áp 7 migrations (0100–0700) | Thành công |
| Số bảng / bảng chưa bật RLS / policy | 23 / **0** / 50 |
| Quyền bảng của `anon` | **0** |
| Bucket `demand-files` | Riêng tư, 3 policy |
| Dữ liệu tham chiếu | 7 nguồn khách, 11 màu, `demand_stale_after_days = 14` |
| Security Advisor | 0 ERROR; 5 WARN có chủ ý (xem D17) |
| Luồng thử trong giao dịch tự hủy (3 nhân viên giả) | Lọc giá 650tr khớp ngân sách 600–700tr (1), không khớp ngưỡng 800tr (0); lọc màu+hãng (1); nhận ra trùng SĐT dạng +84 (1); sales B thấy 0 nhu cầu/0 khách/0 giá vốn của sales A và bị chặn đổi người phụ trách; quản lý thấy nhu cầu và audit log; gửi lại cùng mã yêu cầu 2 lần chỉ tạo 1 nhu cầu; `anon` bị chặn |
| Sau thử nghiệm | 0 người dùng, 0 khách, 0 nhu cầu (không để sót dữ liệu) |

Phát hiện qua kiểm tra thật: hàm tạo sau câu REVOKE ở migration 0100 vẫn mang quyền EXECUTE mặc định của PUBLIC → đã siết ở migration 0700
(trước đó `anon` vẫn chưa gọi được vì schema `private` đã thu hồi quyền truy cập).

## Chưa xác minh (do thiếu môi trường)

- Database đã chạy trên Supabase thật (bảng trên). **Chưa kiểm tra:** hành vi Auth (mời, đặt mật khẩu, getClaims), Storage thật (tải lên, signed URL),
  Data API/PostgREST từ ứng dụng (cú pháp `select` lồng bảng, tên khóa ngoại), Security Advisors mức Performance.
- Chưa kiểm tra trên trình duyệt có đăng nhập (desktop + điện thoại). Test database dùng SQL trực tiếp, không qua PostgREST.
- Chưa đo hiệu năng với dữ liệu lớn (bộ lọc dùng view + LIKE trên chuỗi chuẩn hóa; có chỉ mục trigram nhưng chưa đo).

## Trở ngại hiện tại (cần anh Kỳ)

1. Push các commit mới lên `quocky2009-boop/minhky-auto` — môi trường làm việc không có quyền ghi GitHub (GitHub đang ở commit `cd3088a`, thiếu chặng 3 lát 1–2).
2. Admin đầu tiên đã được gán (01/10/2026). Cần xác nhận đăng nhập thực tế trên `minhky-auto.vercel.app` và cấu hình Site URL/Redirect URL trong Supabase Auth.
3. Xác nhận các tham số tạm D7, D8, D9, D11, D12 (xem `DECISIONS.md`).
4. Dự án đang để gói Free; nâng gói Pro của tổ chức "Minh Kỳ Auto" trước khi nhập khách thật (để có sao lưu).

## Bước tiếp theo

1. Bootstrap admin → đăng nhập app → kiểm tra theo `DEPLOYMENT.md` §5 trên máy tính và điện thoại; sửa lỗi tích hợp nếu có. (Project hiện là bản duy nhất: không nạp dữ liệu demo vào đây nếu sắp dùng thật.)
2. Chặng 3: nhập xe (mới/cũ/ký gửi), hồ sơ thu mua + thẩm định (tách thông tin khách khai với kết quả kiểm tra), chuyển nhu cầu bán → xe trong kho
   (`converted_vehicle_id`), chi phí chuẩn bị xe, hợp đồng ký gửi, giao diện quản lý danh mục.
