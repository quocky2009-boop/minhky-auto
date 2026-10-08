# Tiến độ

Cập nhật: 05/10/2026 · Chặng hiện tại: **chặng 3 gần xong (còn giao diện danh mục) · chặng 4 lát 1 (vốn góp, điều khoản chia lợi nhuận, cho vay) có mã + test, CHƯA áp lên Supabase** · Tiếp theo: áp migration 1300 sau khi anh Kỳ duyệt, rồi quyết toán (cần chặng 5); quyết toán ký gửi ở chặng 5

## Tổng quan theo chặng (CLAUDE.md §14)

| Chặng | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nền tảng, Auth, schema, quyền, Storage | **Có mã + test database.** Chưa chạy trên Supabase thật |
| 2 | Khách → nhu cầu → lọc → chăm sóc → ghép xe | **Có mã + test database + build.** Chưa kiểm tra trên trình duyệt với tài khoản thật |
| 3 | Kho, thu mua/thẩm định, chi phí, ký gửi | **Đang làm — lát 1, 2, 3 xong:** kho xe, vòng sở hữu theo VIN, nhập kho; thẩm định + duyệt mua; chi phí chuẩn bị xe (dự kiến / đã xác nhận / đã thanh toán). **Lát 4 (có mã + test, đã áp lên Supabase):** hợp đồng ký gửi. **Còn:** giao diện quản lý địa điểm/mẫu checklist, kỹ thuật viên tự nhập kết quả kiểm tra |
| 4 | Vốn góp/vay, công thức, quyết toán | **Đang làm — lát 1 xong (có mã + test, đã áp lên Supabase):** bên góp vốn, điều khoản chia lợi nhuận theo xe có phiên bản, sổ vốn góp, cho vay tách riêng, ước tính chia. **Còn:** quyết toán (tạm tính → kiểm tra → phê duyệt → thanh toán), hoàn vốn/chia thực chi, chi phí muộn có điều chỉnh, xử lý hòa vốn/lỗ được duyệt — cần giao dịch bán (chặng 5) |
| 5 | Bán, thu chi, thu cũ đổi mới, bàn giao | **Đang làm — lát 1 xong (có mã + test, chưa áp lên Supabase):** giữ xe/đặt cọc độc quyền. **Còn:** báo giá có phiên bản + duyệt giảm giá, đơn bán (nhiều xe, dòng chi tiết), hợp đồng bán, thu chi (tài khoản tiền, phiếu, phân bổ, công nợ), thu cũ đổi mới đối trừ, bàn giao/hồ sơ, quyết toán chia lợi nhuận và ký gửi |
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
| `npm test` | **110/110** unit test đạt (12 file) — chạy lại 05/10/2026 sau chặng 5 lát 1 |
| `npm run test:db` | 01/10: 61/61. **05/10/2026: 100/102 đạt, 2 test cũ không chạy được do môi trường** (xem "Chưa xác minh") — test hợp đồng ký gửi, tệp xe, vốn góp và giữ/cọc đều đạt |
| `npm run build` | Đạt (chạy lại 05/10/2026); 17 trang biên dịch |
| `npm run typecheck`, `npm run lint` | Không lỗi (chạy lại 05/10/2026 sau lát 4) |
| `next start` + curl | `/dang-nhap` trả 200 và có form; `/nhu-cau`, `/nhu-cau/moi`, `/tong-quan`, `/cai-dat/nguoi-dung` chuyển hướng về đăng nhập khi chưa đăng nhập |
| `supabase/bootstrap/first_admin.sql`, `supabase/seed/demo_staging.sql` | Chạy đúng trên database test; seed tự chặn khi thiếu cờ an toàn và khi chạy lần hai |

### Đối chiếu tiêu chí §12

| § | Tiêu chí | Trạng thái | Test |
|---|---|---|---|
| 12.1 | Khách vừa mua vừa bán, không trùng khách | ✔ | `demands-rls` |
| 12.2 | Lọc kết hợp; 600–700tr khớp 650tr; thiếu dữ liệu không giả phù hợp | ✔ | `search`, `matching`, `ui-flow` |
| 12.3 | Nguồn chưa nhập không phải xe sẵn giao; lịch nhắc; trạng thái đóng | ✔ | `matching`, `ui-flow`, `demands-rls`, `search` |
| 12.4 | Hai người giữ/cọc cùng xe: chỉ một giao dịch thắng | ✔ test đồng thời thật ở database (giữ-giữ, giữ-cọc, cọc-cọc, 4 yêu cầu song song, chạy lặp 25 lần không lỗi); **mới chạy trên database test cục bộ, chưa áp lên Supabase** | `reservations` |
| 12.5 | Ký gửi tách tồn, quyết toán khớp | ◐ đã tách hình thức sở hữu/ký gửi, ký gửi không có giá mua, chi phí ký gửi tách bên chịu và không tăng vốn tồn, lọc tồn riêng; hợp đồng ký gửi đã làm (lát 4; đã áp lên Supabase); quyết toán chưa làm (chặng 5) | `inventory`, `costs`, `consignment` |
| 12.6 | P=40tr, c=20%, 60/40 → 8 / 19,2 / 12,8tr | ✔ ở thư viện | `profit-split` |
| 12.7 | Công ty vừa góp vốn vừa vận hành không đếm trùng | ✔ ở thư viện và ở ước tính trên trang xe | `profit-split`, `capital` |
| 12.8 | Thiếu điều khoản/lỗ không quyết toán; làm tròn khớp tổng; tỷ lệ xe không đổi theo cấu hình chung | ◐ thư viện + điều khoản bất biến theo xe (không có cấu hình chung tự áp) đã có; chặn quyết toán thật chờ chặng 5 | `profit-split`, `capital` |
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

## Chặng 3 — lát 3: chi phí chuẩn bị xe (01/10/2026)

- **Ba thông tin tách biệt** trong khối "Chi phí chuẩn bị xe" ở trang chi tiết xe (quản lý/kế toán): dự kiến, đã xác nhận (thực tế đã nghiệm thu), đã thanh toán; có ô "còn phải trả".
  Khoản đã xác nhận không còn tính vào dự kiến. Dự toán để trống là "chưa rõ" (đếm riêng), không phải 0.
- Vòng đời: thêm khoản (dự kiến) → quản lý duyệt dự toán (tùy chọn; đổi số thì duyệt lại) → xác nhận số thực tế (nhập 0 nếu không phát sinh) → ghi thanh toán nhiều lần (không vượt số đã xác nhận).
- Không sửa chứng từ: khoản đã xác nhận không sửa, sai thì hủy (có lý do, giữ lại) rồi tạo khoản thay thế; thanh toán sai thì hủy và ghi lại.
- Xe ký gửi bắt buộc chọn bên chịu chi phí, phần chủ xe chịu tách riêng, không làm tăng vốn tồn kho. Xe sở hữu: chi phí đã xác nhận tính vào giá vốn.
- Người xác nhận/người chi/người hủy do database tự điền (không giả mạo). Hai người ghi thanh toán cùng lúc không thể cùng vượt hạn mức.
- Test: 12 test database + 7 test unit mới. Migration `1000_vehicle_costs.sql` đã áp lên `minhky-auto` và thử trong giao dịch tự hủy.
- Bản nháp migration này đã có sẵn trong thư mục làm việc (chưa commit, chưa áp, chưa có test/giao diện); đã rà, vá 2 điểm (xe ký gửi mặc định âm thầm "showroom chịu"; các cột người xác nhận/chi/hủy có thể bị ghi giả khi SQL trực tiếp) rồi dùng lại.

**Giới hạn của lát 3:** chưa có tạm ứng trước khi nghiệm thu (D26); chưa có bước chủ xe duyệt từng khoản của xe ký gửi (làm cùng hợp đồng ký gửi);
chưa có tệp/hóa đơn đính kèm cho từng khoản (hiện ghi số chứng từ vào ô "chứng từ / số tham chiếu"); chưa đưa chi phí vào báo cáo lợi nhuận (chặng 4–6).

## Chặng 3 — lát 4: hợp đồng ký gửi (05/10/2026)

Anh Kỳ chốt: phí = **số tiền cố định hoặc phần trăm trên giá bán** (D30); chi phí phát sinh xe ký gửi **không cần chủ xe duyệt** (D31).

- **Hợp đồng theo xe** (mã KG…): chủ xe/ủy quyền, thời hạn, biên bản nhận xe, trạng thái Đang soạn → Đang hiệu lực → Đã trả xe / Đã hủy. Mỗi xe một hợp đồng đang soạn/hiệu lực.
- **Thỏa thuận có phiên bản, bất biến:** giá chủ muốn nhận, giá chào, quyền giảm giá (không/tiền/%), phí (cố định hoặc % giá bán, không mặc định), bên ký hợp đồng bán và bên thu tiền.
  Chỉ phiên bản đã có ngày chủ xe ký mới có hiệu lực. Hiển thị ước tính "nếu bán đúng giá chào: phí / chủ xe nhận" kèm cảnh báo nếu thấp hơn số chủ xe muốn nhận.
- **Kích hoạt** cần thỏa thuận đã ký + điện thoại chủ xe + thời hạn + biên bản nhận xe đủ (0 chìa khóa là số thật); giao diện liệt kê rõ phần còn thiếu. Kích hoạt chốt biên bản nhận.
- **Xe ký gửi chỉ chào bán khi có hợp đồng hiệu lực** — database chặn kể cả sửa trực tiếp. **Trả xe chỉ qua biên bản trả xe** (ngày, lý do, tình trạng, chìa khóa, giấy tờ): chặn khi xe đang giữ/cọc/bán, còn chi phí dự kiến chưa xử lý,
  hoặc còn chi phí chủ xe chịu chưa thanh toán mà chưa ghi cách xử lý; ảnh chụp chi phí chủ xe chịu do database tính.
- **Quyền:** quản lý/admin ghi; kế toán đọc; sales/kỹ thuật không thấy hợp đồng. Nhật ký kiểm toán không lưu điện thoại/số giấy tờ/ủy quyền của chủ xe.
- **Test:** 14 test database (`tests/db/consignment.test.ts`: phân quyền gồm sửa/trả bằng ID trực tiếp và anon, bấm lặp song song, phiên bản thỏa thuận và đánh số khi hai người cùng thêm, không sửa/xóa thỏa thuận,
  điều kiện kích hoạt, chặn chào bán khi chưa có hợp đồng, luồng trả xe, hàm tính phí, nhật ký không lộ PII) + 21 test unit (`tests/unit/consignment.test.ts`).
  Test cũ `inventory` "xe ký gửi trả chủ" được cập nhật theo luật mới (không đặt trạng thái trả chủ trực tiếp).
- Migration `20261001001100_consignment_contracts.sql` **đã áp lên Supabase `minhky-auto` ngày 05/10/2026** (anh Kỳ đồng ý). Đã xác minh đúng project (`fawbojbquxfjxbmhwlxm`, tên minhky-auto, ap-southeast-1) và database còn trống (0 xe) trước khi áp.
  Sau khi áp: 0 bảng chưa bật RLS; 2 bảng mới có RLS + 6 policy; `anon` 0 quyền bảng; Security Advisor không có cảnh báo mới (vẫn 5 WARN có chủ ý D17 + cảnh báo cài đặt Auth "bảo vệ mật khẩu bị lộ" đang tắt);
  hàm phí 3% × 650 triệu = 19.500.000. Luồng thử trong giao dịch tự hủy (quản lý + sales giả): chặn chào bán khi chưa có hợp đồng, chặn kích hoạt khi thỏa thuận chưa ký, chào bán được sau khi hợp đồng hiệu lực,
  sales thấy 0 hợp đồng/0 thỏa thuận và bị chặn trả xe; sau thử nghiệm còn đúng 1 tài khoản admin có sẵn, 0 xe, 0 hợp đồng (không sót dữ liệu).
  Lưu ý: lịch sử migration trên Supabase có thêm 3 migration `appraisal_ai_valuation_*` (áp 05/10/2026, không có trong repo) — xem mục Trở ngại.

**Giới hạn của lát 4:** chưa có quyết toán ký gửi (thu hộ, phần showroom, khấu trừ, còn phải trả chủ xe) — cần giao dịch bán (chặng 5); chưa có tệp scan hợp đồng/biên bản (chưa có Storage cho xe, ghi số hợp đồng giấy vào ô tham chiếu);
sales chưa xem được quyền giảm giá (D33); chưa có mục "Ký gửi" riêng trên menu (làm trong trang chi tiết xe); chưa kiểm tra bằng trình duyệt thật.

## Chặng 3 — ảnh và video gắn với xe (05/10/2026)

- Khối "Ảnh và video" ở trang chi tiết xe: lưới ảnh, danh sách video. Tải lên nhiều tệp một lần; lưu trữ (không xóa) có lý do — quản lý. Không có tải giấy tờ (anh Kỳ 05/10/2026).
- Tải **thẳng lên Storage bằng URL ký** (D36), rồi ghi vào hồ sơ qua `register_vehicle_file` (kiểm tra tệp đã có thật, đúng xe/loại/loại tệp, chống ghi trùng). Quyền: ai thấy xe thì thấy, mọi nhân viên có vai trò thêm được (D37) — cả bảng lẫn Storage; PDF và loại khác bị chặn ở bucket.
- Migration `20261001001200_vehicle_files.sql` (bảng `vehicle_files`, bucket riêng tư `vehicle-files`, policy Storage theo đường dẫn `<xe>/<loại>/<tệp>`) **đã áp lên Supabase `minhky-auto` ngày 05/10/2026** (anh Kỳ đồng ý). Đã xác minh đúng project và chưa có đối tượng trùng trước khi áp.
  Sau khi áp: 0 bảng chưa bật RLS; bucket riêng tư, giới hạn 50 MB, chỉ nhận ảnh/video; 3 policy bảng + 2 policy Storage; `anon` 0 quyền; Security Advisor không có cảnh báo mới (vẫn 5 WARN D17 + cảnh báo cài đặt Auth đang tắt).
  Luồng thử trong giao dịch tự hủy (quản lý, sales, kỹ thuật giả): chặn ghi khi chưa có tệp trong Storage; ghi được khi có; chặn đường dẫn loại giấy tờ; sales thấy tệp xe đang bán (1) và không thấy xe chưa chào bán (0); sales không lưu trữ/xóa được; kỹ thuật thấy tệp xe chưa bán;
  lưu trữ bởi quản lý còn nguyên tệp gốc. Sau thử nghiệm: 1 tài khoản admin có sẵn, 0 xe, 0 tệp, 0 đối tượng Storage.
- Test: 5 test database (`tests/db/vehicle-files.test.ts`) + 7 test unit (`tests/unit/vehicle-files.test.ts`).
- **Chưa kiểm tra được:** luồng tải lên thật qua trình duyệt + Supabase Storage (cấp URL ký, tải lên, xem bằng URL ký) — chỉ mới kiểm tra policy bằng SQL. Cần thử trên bản xem trước với tài khoản thật.
- Trang chi tiết xe nặng hơn (khoảng 76 kB so với 9 kB) vì thư viện Supabase chạy ở trình duyệt để tải thẳng lên Storage.

**Đã sửa rủi ro:** tệp đính kèm *nhu cầu* (`demand-files`) trước đây tải qua Server Action; Vercel giới hạn thân yêu cầu ~4,5 MB nên ảnh/video lớn hơn có thể bị từ chối trên bản đang chạy dù cấu hình ghi 20 MB (chưa từng kiểm chứng trên Vercel).
Nay tệp nhu cầu cũng tải thẳng lên Storage bằng URL ký (không đổi database/policy; bỏ cấu hình `bodySizeLimit`), 3 test unit mới (`tests/unit/attachments.test.ts`). **Chưa thử tải thật qua trình duyệt** (cần thử trên bản xem trước).

## Chặng 5 — lát 7: quyết toán xe (06/10/2026)

- **Quyết toán (QT#####)** theo từng dòng xe đã bán: tạm tính → kiểm tra → phê duyệt → thanh toán — D79. **Xe sở hữu:** chia lợi nhuận theo điều khoản góp vốn đã duyệt (P, C, R, phần dư lớn nhất) và **hoàn vốn** = vốn thực nhận ròng — D80. **Xe ký gửi:** thu hộ / phí / khấu trừ / trả chủ xe hoặc chủ xe nộp — D83. **Hòa vốn/lỗ** không áp công thức, cần xử lý được duyệt — D82.
- **Điều kiện duyệt** do database kiểm (số liệu không đổi, điều khoản đủ, hết chi phí dự kiến, đơn đã thu đủ) — D81. **Điều chỉnh** khi có chi phí muộn, không sửa bản đã duyệt, số đã chi chuyển sang — D84. **Chi trả** bằng phiếu thu/chi theo nghĩa vụ, không vượt phần còn lại, quỹ đủ tiền — D85. Quyền — D86.
- Trang mới `/quyet-toan` (danh sách, chi tiết: các khoản + đã chi/còn lại, điều kiện còn thiếu, kiểm tra/duyệt/hủy/điều chỉnh, xử lý hòa vốn/lỗ), nút "Tạm tính quyết toán" ở chi tiết đơn bán, 4 loại phiếu mới ở `/thu-chi`.
- Chặng 6 lát 8 — dashboard lãnh đạo + báo cáo (migration `20261001002200_reports.sql`, D89–D91): **mới áp lên database test cục bộ, CHƯA áp lên Supabase**. Test: 2 test mới trong `settlement.test.ts` (kết quả xe, tồn kho, quyền), `reports.test.ts` 6 test unit; `npm test` 147/147; `test:db` 152/154 (2 lỗi cũ `demands-rls` do role root); typecheck/lint/build đạt. Giao diện `/tong-quan` (khối tài chính) và `/bao-cao` (kết quả xe, tồn kho, xuất CSV); chưa kiểm bằng trình duyệt thật. Còn của chặng 6: hậu mãi, hoa hồng (cần chính sách).
- Migration `20261001002100_cashbook_capital_link.sql` (D88): **đã áp lên Supabase 08/10/2026**. Test: `cashbook-link.test.ts` 7/7 (vốn nhận/rút, vay, trả vay, chi phí xe vào số dư; bắt buộc tài khoản; công ty không gắn; thiếu tiền; hủy không làm quỹ âm; chi song song một thắng), sửa test cũ gắn tài khoản; `npm test` 141/141; `test:db` 150/152 (2 lỗi cũ `demands-rls` do chạy role root); typecheck/lint/build đạt. Giao diện: chọn tài khoản ở form nhận/rút vốn, vay, trả vay, thanh toán chi phí (chưa kiểm bằng trình duyệt thật).
- Migration `20261001002000_settlements.sql`: **đã áp lên Supabase `minhky-auto` 08/10/2026** (0 bảng thiếu RLS, 6 policy, anon không có quyền bảng/hàm, không DELETE/TRUNCATE, 5 trigger; advisor không thêm cảnh báo). Chủ tịch đã chốt 08/10: D81 chặn duyệt khi chưa thu đủ; D83 giữ giá hợp đồng; D86 không bắt buộc 2 người khác nhau; D87 đồng ý nối sổ quỹ (làm tiếp). Còn **Tạm** D82.
- Test: 11 test database (`tests/db/settlement.test.ts`: ví dụ chốt 40 tr/20%/60-40 → 8 tr, 19,2/12,8 tr; làm tròn nhiều ca **khớp công thức TypeScript**; công ty góp vốn không đếm trùng; thiếu giá mua/căn cứ/điều khoản bị từ chối; quy trình và phân quyền; số liệu đổi/chi phí muộn; chi trả không vượt, quỹ không đủ, hủy phiếu mở lại nghĩa vụ; **hai phiếu chi cùng lúc vượt phần còn lại → một qua; hai người cùng duyệt → một thắng**; hòa vốn/lỗ; điều chỉnh có chuyển số đã chi và chặn chi vượt; ký gửi cả hai bên thu tiền; hủy) chạy 6 lần liên tiếp 0 lỗi; 5 test unit mới.
- Kết quả: typecheck, lint, build đạt; `npm test` 140/140; `npm run test:db` 143/145 (2 test cũ `demands-rls` lỗi do role `root` — hạn chế môi trường đã ghi). Sửa 2 test cũ dễ vỡ (regex bắt nhầm mã chứng từ).
- Giới hạn: **vốn góp thực nhận/khoản vay/chi phí xe chưa vào sổ quỹ (D87)** → có thể phải nạp quỹ trước khi chi hoàn vốn; chưa có báo cáo lợi nhuận toàn showroom, bản in quyết toán, hoa hồng; chưa kiểm tra giao diện bằng trình duyệt thật.

## Chặng 5 — lát 6: bàn giao xe và hồ sơ (06/10/2026)

- **Bàn giao (BN#####)** theo từng dòng xe của đơn bán đã ký; **checklist cấu hình được** (14 mục mặc định, D73) với bản gốc / bản scan (chỉ có-không) / người giữ — D74.
- **Điều kiện giao xe do database kiểm**: đơn đã ký, thanh toán đủ, xe chuẩn bị xong, hồ sơ xe đủ, checklist bắt buộc đạt — D75; **phê duyệt ngoại lệ** của quản lý (lý do, đúng loại, thu hồi được) — D76. Giao: xe → "đã giao"; đơn có bàn giao không hủy được — D77.
- Trang mới `/ban-giao` (danh sách, chi tiết với điều kiện/checklist/ngoại lệ/giao xe/hủy, **biên bản in** không có số tiền) và nút "Lập bàn giao" ở chi tiết đơn bán. Quyền — D78.
- Migration `20261001001900_handover.sql`: **đã áp lên Supabase `minhky-auto` ngày 06/10/2026** (anh Kỳ đồng ý). Kiểm tra sau áp: 0 bảng public thiếu RLS; 4 bảng bàn giao bật RLS với 12 policy, 11 trigger; 14 mục danh mục mặc định (6 bắt buộc); `anon` không có quyền bảng/RPC (cả hàm `private`); không ai có DELETE/TRUNCATE; hàm chặn hủy đơn đã cập nhật; Advisor không thêm cảnh báo; 0 bàn giao, 1 tài khoản admin. Chưa chạy kịch bản hành vi trực tiếp trên Supabase (chưa có dữ liệu). Mục **Tạm** D73, D75, D76, D78.
- Test: 6 test database (`tests/db/handover.test.ts`: quyền/RLS, lập bàn giao + **hai người lập cùng dòng cùng lúc → một thắng**, checklist + sửa đồng thời, từng điều kiện giao xe và ngoại lệ, giao xe/bất biến, hủy bàn giao/đơn) chạy 6 lần liên tiếp cùng 5 bộ test trước 0 lỗi; 6 test unit mới.
- Kết quả: typecheck, lint, build đạt; `npm test` 135/135; `npm run test:db` 132/134 (2 test cũ `demands-rls` lỗi do role `root` — hạn chế môi trường đã ghi).
- Giới hạn: chưa bắt buộc số ảnh tối thiểu; chưa kiểm pin xe điện lúc giao; chưa nhắc lịch giao; chưa kiểm tra giao diện bằng trình duyệt thật.

## Chặng 5 — lát 5: thu cũ đổi mới (06/10/2026)

- **Hồ sơ thu cũ (TC#####)** liên kết đơn bán và xe cũ nhập kho của khách; hai giao dịch giữ giá trị đầy đủ — D67. **Đối trừ (DT#####)** là chứng từ riêng, không phải tiền thật, chỉ lấy từ phần của khách — D68.
- **Xe cũ còn vay:** tách trả ngân hàng / phần khách / đối trừ, không khấu trừ hai lần; tiền còn phải trả = mua − đối trừ − đã chi — D69. Phiếu chi mới: chi cho khách, trả ngân hàng — D72.
- **Hủy:** đơn còn đối trừ không hủy được; hồ sơ còn đối trừ/đã chi tiền không hủy được — D70. Quyền — D71.
- Giao diện: khối "Thu cũ đổi mới" ở chi tiết đơn bán (kế toán xem, quản lý ghi) + 2 loại phiếu chi trong `/thu-chi`; công nợ đơn bán hiện thêm "đã đối trừ".
- Migration `20261001001800_trade_in.sql`: **đã áp lên Supabase `minhky-auto` ngày 06/10/2026** (anh Kỳ đồng ý). Kiểm tra sau áp: 0 bảng public thiếu RLS; `trade_ins` và `trade_in_offsets` bật RLS với 6 policy, 6 trigger; 2 view `security_invoker`; `anon` không có quyền bảng/view/RPC (cả hàm `private`); không ai có DELETE/TRUNCATE; hàm kiểm tra phiếu đã cập nhật; Advisor không thêm cảnh báo; 0 hồ sơ, 1 tài khoản admin. Chưa chạy kịch bản hành vi trực tiếp trên Supabase (chưa có dữ liệu). Đồng thời sửa lỗi của 1700 (tên đối tượng tự điền bị trống với kế toán). Mục **Tạm** D69–D71.
- Test: 6 test database (`tests/db/trade-in.test.ts`: quyền/RLS, điều kiện lập hồ sơ, luồng 800 tr bán / 200 tr xe cũ vay 50 tr đầy đủ, đối trừ không đổi quỹ, không khấu trừ hai lần, hủy, **hai đối trừ cùng lúc / đối trừ cùng thu tiền cùng lúc → một qua**) chạy 8 lần liên tiếp cùng 4 bộ test trước 0 lỗi; 7 test unit mới.
- Kết quả: typecheck, lint, build đạt; `npm test` 129/129; `npm run test:db` 126/128 (2 test cũ `demands-rls` lỗi do role `root` — hạn chế môi trường đã ghi).
- Giới hạn: chưa hỗ trợ khoản vay lớn hơn giá mua; chưa có luồng trả xe cũ khi hủy hồ sơ; chưa có biên bản/hợp đồng mua xe cũ; chưa quyết toán hiệu quả từng xe; chưa kiểm tra giao diện bằng trình duyệt thật.

## Chặng 5 — lát 4: thu chi (06/10/2026)

- **Tài khoản tiền** + **phiếu thu/chi bất biến** (hủy có lý do, chỉ quản lý) — D61. Loại phiếu: thu cọc, thu thanh toán đơn bán, thu khác; hoàn cọc, hoàn tiền đơn bán, chi phí chung, chi khác — D62.
- **Tiền cọc thực nhận/hoàn** gắn đặt cọc (không vượt số cọc thỏa thuận); cọc chốt thành đơn bán thì tính vào đã thu của đơn. **Công nợ đơn bán** (view `sales_order_balances`): không thu vượt nợ, hoàn không vượt đã thu, **hủy đơn đã ký bị chặn khi còn thanh toán chưa hoàn** — D63. Chi chỉ khi quỹ đủ tiền, khóa chống hai phiếu cùng lúc — D64.
- Trang mới `/thu-chi` (tài khoản + số dư, lập phiếu, sổ phiếu lọc theo hướng/tài khoản/ngày/trạng thái, phân trang phía server) và khối "Thu tiền và công nợ" ở chi tiết đơn bán (kế toán/quản lý). Quyền — D65.
- Migration `20261001001700_cashbook.sql`: **đã áp lên Supabase `minhky-auto` ngày 06/10/2026** (anh Kỳ đồng ý). Kiểm tra sau áp: 0 bảng public thiếu RLS; `money_accounts` và `cash_vouchers` bật RLS với 6 policy, 6 trigger; 3 view đều `security_invoker`; `anon` không có quyền bảng/view/RPC (cả hàm `private`); không ai có DELETE/TRUNCATE; Advisor không thêm cảnh báo; 0 phiếu, 1 tài khoản admin. Chưa chạy kịch bản hành vi trực tiếp trên Supabase (chưa có dữ liệu; đã kiểm bằng test cục bộ). Mục **Tạm** D62–D66.
- Test: 6 test database (`tests/db/cashbook.test.ts`: quyền/RLS (sales, kỹ thuật, anon không đọc), ngày/hình thức/ngừng dùng/gửi lặp, **hai phiếu chi cùng lúc vượt quỹ → một qua; hai phiếu thu cùng lúc vượt công nợ → một qua**, cọc → đơn bán → công nợ, hoàn tiền/hủy đơn/hoàn cọc, hủy phiếu) chạy 8 lần liên tiếp cùng sales-orders/reservations/quotes 0 lỗi; 5 test unit (`tests/unit/cashbook.test.ts`).
- Kết quả: typecheck, lint, build đạt; `npm test` 123/123; `npm run test:db` 120/122 (2 test cũ `demands-rls` lỗi do role `root` — hạn chế môi trường đã ghi).
- Giới hạn: chưa nối với chi phí xe/vốn góp/quyết toán/thu cũ đổi mới (D66); chưa có "tịch thu cọc"; chưa đối chiếu sao kê, báo cáo theo kỳ, xuất Excel; chưa kiểm tra giao diện bằng trình duyệt thật.

## Chặng 5 — lát 3: đơn bán nhiều xe + hợp đồng bán (06/10/2026)

- **Đơn bán** (DB#####) nhiều dòng xe, giá bán ghi trên hợp đồng; đang soạn → đã ký hợp đồng → đã hủy — D56. Xác nhận cần số hợp đồng + ngày ký — D57. Xe → "đã bán", giữ/cọc của nhu cầu → "đã thành đơn bán" — D59.
- **Độc quyền một xe một dòng đơn hiệu lực** (unique index), thử đồng thời thật. Giá thấp hơn mức cho phép → chỉ quản lý xác nhận kèm lý do; dòng theo báo giá đã chấp nhận thì không duyệt lại — D58.
- Trang mới `/don-ban` (danh sách có phân trang phía server, lập đơn nhiều xe, chi tiết, sửa nháp, xác nhận, hủy); menu "Đơn bán" (sales, quản lý, kế toán xem). Không xóa đơn/dòng.
- Migration `20261001001600_sales_orders.sql`: **đã áp lên Supabase `minhky-auto` ngày 06/10/2026** (anh Kỳ đồng ý). Kiểm tra sau áp: 0 bảng public thiếu RLS; `sales_orders` và `sales_order_lines` bật RLS với 6 policy, 6 trigger; `anon` không có quyền bảng/RPC; không ai có DELETE/TRUNCATE; hàm `vehicle_reservations_guard` đã cập nhật; Advisor không thêm cảnh báo; 0 dòng dữ liệu, 1 tài khoản admin. Chưa chạy kịch bản hành vi trực tiếp trên Supabase (chưa có xe/nhu cầu). Có sửa hàm `vehicle_reservations_guard` (chỉ nhánh "đã thành đơn bán": cho phép khi có đơn bán đã xác nhận cho đúng xe+nhu cầu). Mục **Tạm** D56–D59.
- Test: 7 test database (`tests/db/sales-orders.test.ts`: quyền/RLS và nhãn xe sau khi bán, xác nhận/hủy/chốt cọc, **hai đơn cùng xe đồng thời → một thắng**, giá dưới mức cho phép/báo giá đã chấp nhận, điều kiện xe/nhu cầu, sửa nháp + sửa đồng thời, xe ký gửi) — chạy 10 lần liên tiếp cùng reservations/quotes 0 lỗi; 4 test unit (`tests/unit/sales-orders.test.ts`).
- Kết quả: typecheck, lint, build đạt; `npm test` 118/118; `npm run test:db` 114/116 (2 test cũ `demands-rls` lỗi do role `root` — hạn chế môi trường đã ghi).
- Giới hạn: chưa thu tiền/cọc thực nhận/công nợ (lát sau phải chặn hủy đơn khi đã nhận tiền); chưa xuất hợp đồng theo mẫu; chưa tự đóng nhu cầu; chưa kiểm tra giao diện bằng trình duyệt thật.

## Chặng 5 — lát 2: báo giá có phiên bản + duyệt giảm giá (06/10/2026)

- **Báo giá** (BG#####) của xe cho nhu cầu mua; **phiên bản bất biến** (giá, ưu đãi, hạn hiệu lực bắt buộc nhập); sửa giá = phiên bản mới — D50.
- **Duyệt giảm giá do database quyết định**, sales không đọc giá sàn: dưới giá sàn / chưa có giá sàn (xe sở hữu) hoặc vượt quyền giảm giá trong thỏa thuận ký gửi đã ký → chờ quản lý duyệt, bắt buộc lý do — D51, D52. Chấp nhận báo giá chỉ cho bản đã phát hành và còn hạn; chưa đổi trạng thái xe/tạo đơn — D54.
- Khối "Báo giá" ở trang chi tiết xe (sales/quản lý lập và xử lý, kế toán xem). Không xóa báo giá/phiên bản.
- Migration `20261001001500_vehicle_quotes.sql`: **đã áp lên Supabase `minhky-auto` ngày 06/10/2026** (anh Kỳ đồng ý). Kiểm tra sau áp: 0 bảng public thiếu RLS; `quotes` và `quote_versions` bật RLS với 6 policy, 5 trigger; `anon` không có quyền bảng/RPC (cả hàm `private`); không ai có DELETE/TRUNCATE; 0 dòng dữ liệu, 1 tài khoản admin; Advisor không thêm cảnh báo mới. Chưa chạy kịch bản hành vi trực tiếp trên Supabase (cần dữ liệu xe/nhu cầu; đã kiểm bằng test cục bộ). Mục **Tạm** D51–D53, D55.
- Test: 7 test database (`tests/db/quotes.test.ts`: quyền/RLS và sales không đọc giá sàn, dưới giá sàn/thiếu giá sàn, duyệt/từ chối, phiên bản bất biến + gửi lặp, **sửa đồng thời cùng phiên bản và hai báo giá mở cùng lúc → một thắng**, hết hạn/hủy, xe đang giữ cho khách khác, xe ký gửi theo quyền giảm giá 1%/số tiền/không) chạy 10 lần liên tiếp 0 lỗi; 4 test unit (`tests/unit/quotes.test.ts`).
- Kết quả kiểm tra: `npm run typecheck`, `npm run lint`, `npm run build` đạt; `npm test` 114/114; `npm run test:db` 107/109 (2 test cũ của `demands-rls` lỗi do chạy dưới role `root` — hạn chế môi trường đã ghi ở trên, không liên quan báo giá).
- Giới hạn: chưa kiểm tra giao diện bằng trình duyệt thật; chưa nhắc báo giá sắp hết hạn; chưa tính giá trị ưu đãi; chưa có đơn bán/hợp đồng bán.

## Chặng 5 — lát 1: giữ xe và đặt cọc độc quyền (05/10/2026)

- **Độc quyền:** một xe một giữ/cọc hiệu lực (unique index); hai người cùng lúc → một người thắng, người kia nhận lỗi rõ ràng. Trạng thái xe (đang giữ/đã cọc/đang bán) do trigger đồng bộ — D45.
- **Giữ xe** nhập hạn (không mặc định), gia hạn, nhả (lý do); hết hạn **nhả lười** (khi có người giữ/cọc hoặc quản lý bấm) — D46. **Đặt cọc** ghi số tiền thỏa thuận (chưa phải đã thu), chỉ quản lý hủy có lý do — D47. **Chuyển giữ → cọc** trong một giao dịch.
- Gắn nhu cầu MUA của khách; sales chỉ giữ cho nhu cầu mình phụ trách và chỉ thấy bản của mình; sales khác chỉ thấy "xe đang bị giữ/cọc + người phụ trách + hạn" — D48. Nhật ký hệ thống ghi vào nhu cầu (không ghi số tiền). Xe ký gửi cần hợp đồng hiệu lực.
- Khối "Giữ xe và đặt cọc" ở trang chi tiết xe (sales, quản lý; kế toán xem). Không xóa giữ/cọc.
- Migration `20261001001400_vehicle_reservations.sql`: **đã áp lên Supabase `minhky-auto` ngày 06/10/2026** (anh Kỳ đồng ý). Kiểm tra sau áp: 0 bảng public thiếu RLS; `vehicle_reservations` bật RLS, 3 policy, 4 trigger; `anon` không có quyền bảng/RPC; `authenticated` không có DELETE/TRUNCATE; 0 dòng dữ liệu, 1 tài khoản admin. Advisor: thêm 1 WARN có chủ đích (`public_reservation_info` SECURITY DEFINER, chỉ trả loại/người phụ trách/hạn, không lộ khách/tiền). Chưa chạy kịch bản hành vi trực tiếp trên Supabase (cần dữ liệu xe/nhu cầu; hành vi đã kiểm bằng `tests/db/reservations.test.ts` trên DB cục bộ, 12 test, đồng thời thật).
- Test: 12 test database (`tests/db/reservations.test.ts`: quyền và RLS, **độc quyền đồng thời thật**, gửi lặp song song, điều kiện giữ/cọc, nhả/gia hạn/hết hạn/chuyển/hủy cọc, tin tức tối thiểu cho sales khác, xe ký gửi) + 6 test unit (`tests/unit/reservations.test.ts`).
- Giới hạn: chưa ghi nhận tiền cọc thực nhận/hoàn (thu chi), chưa đổi trạng thái nhu cầu (D49), chưa nhắc sales trước hạn giữ, chưa kiểm tra bằng trình duyệt thật.

## Chặng 4 — lát 1: vốn góp, điều khoản chia lợi nhuận, cho vay (05/10/2026)

- **Bên góp vốn/cho vay** (mã GV…); **điều khoản chia lợi nhuận theo xe có phiên bản** (nháp → duyệt → thay thế; tỷ lệ công ty bắt buộc nhập, không mặc định; duyệt chỉ khi tổng chia đúng 100%; bản duyệt bất biến) — D38.
- **Sổ vốn góp**: cam kết / thực nhận / rút vốn tách riêng, không sửa, hủy có lý do; rút không vượt thực nhận ròng (khóa chống hai người rút cùng lúc). **Vốn đổi sau khi duyệt → cờ "cần xác nhận lại căn cứ phân chia", không tự đổi tỷ lệ** (D40).
- **Cho vay** tách khỏi góp vốn: gốc, ngày, lãi thỏa thuận ghi nguyên văn, trả gốc/lãi (trả gốc không vượt gốc); **không tính và không trừ lãi vay** — D41. Chỉ xe showroom sở hữu (D43).
- **Điều kiện quyết toán** hiển thị trên xe: chưa có điều khoản duyệt / chưa chốt căn cứ chi phí / vốn đổi chưa xác nhận lại (D39). **Ước tính chia** theo giá bán giả định bằng đúng công thức `profit-split.ts` (từ chối khi thiếu dữ liệu) — D44.
- Khối "Vốn góp và chia lợi nhuận" ở trang chi tiết xe sở hữu (quản lý/kế toán). Quyền: D42.
- Migration `20261001001300_capital_terms.sql` **đã áp lên Supabase `minhky-auto` ngày 05/10/2026** (anh Kỳ đồng ý). Đã xác minh đúng project và chưa có đối tượng trùng trước khi áp.
  Sau khi áp: 0 bảng chưa bật RLS; 6 bảng mới đều bật RLS với 19 policy; `anon` 0 quyền bảng và 0 RPC; không ai có quyền xóa/truncate; 3 view `security_invoker`; 13 RPC đều `security invoker`; Security Advisor không có cảnh báo mới do migration này.
  Luồng thử trong giao dịch tự hủy (quản lý, kế toán, sales, kỹ thuật giả): chặn xe ký gửi; tỷ lệ công ty bắt buộc; chặn duyệt khi tổng 99,9999; duyệt 60/40 được và bản đã duyệt không sửa được; kế toán ghi tiền thực nhận nhưng không ghi vốn cam kết, không lập điều khoản, không rút vượt vốn;
  sales thấy 0 dòng và không ghi được; kỹ thuật thấy 0 dòng; không ai xóa được. Sau thử nghiệm: 1 tài khoản admin có sẵn, 0 xe, 0 bên góp vốn, 0 điều khoản, 0 dòng sổ, 0 nhật ký thử.
  (Cờ "cần xác nhận lại" không đo được trong một giao dịch duy nhất vì `now()` không đổi trong giao dịch; đã kiểm bằng test database với các giao dịch riêng.)
- Test: 10 test database (`tests/db/capital.test.ts`: phân quyền gồm sales/kỹ thuật/anon và không xóa, chỉ xe sở hữu, tỷ lệ không mặc định, duyệt đúng 100%, bản duyệt bất biến và thay thế, hủy nháp, gửi lặp song song + đánh số phiên bản khi hai người cùng lập, sổ vốn và rút vốn, cờ xác nhận lại, cho vay tách riêng + hạn mức trả gốc song song, nhật ký không lộ SĐT) + 17 test unit (`tests/unit/capital.test.ts`, gồm dữ liệu test của đặc tả P=40tr/c=20%/60-40 qua ước tính).
- **Chưa kiểm tra bằng trình duyệt thật.** Chưa có: sửa bản nháp trên giao diện (hủy nháp rồi lập lại; RPC `update_capital_terms` đã có), danh sách "chi phí được chọn" cho căn cứ `selected_costs`, màn hình riêng quản lý bên góp vốn (hiện thêm trong trang xe).

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
- **Test database ngày 05/10/2026 chạy bằng vai trò `root`, không phải `postgres`:** 2 test cũ của `demands-rls` (§12.3 người phụ trách bắt buộc, §12.12 khóa tài khoản) phụ thuộc hàm `private.is_system()` chỉ nhận vai trò `postgres/service_role/supabase_admin`,
  nên báo lỗi do môi trường (cùng 2 test này lỗi trên bản trước lát 4, trước khi có migration mới). Cần chạy lại `npm run test:db` bằng vai trò `postgres` (máy anh Kỳ hoặc CI) để xác nhận 102/102.
- Chưa đo hiệu năng với dữ liệu lớn (bộ lọc dùng view + LIKE trên chuỗi chuẩn hóa; có chỉ mục trigram nhưng chưa đo).

## Trở ngại hiện tại (cần anh Kỳ)

1. ~~Push lên GitHub~~ — đã xong: GitHub `main` ở `ab22682` (05/10/2026), phiên làm việc này đã push được nhánh `claude/dreamy-bell-c45ozd`. Lát 4 được đẩy lên nhánh `claude/dreamy-bell-c45ozd` (không phải `main`) để anh Kỳ xem trước khi gộp.
1b. ~~Áp migration 1100~~ — đã xong 05/10/2026.
1h. ~~Áp migration 1400~~ — đã áp 06/10/2026. Còn chờ xác nhận các mục **Tạm** D46–D49.
1p. **Áp migration `2200_reports.sql` lên Supabase `minhky-auto`?** — cần anh Kỳ đồng ý (chỉ thêm 2 view + 2 RPC đọc, không đổi bảng/dữ liệu). Mục **Tạm** D89, D90.
1o. ~~Áp migration 2100~~ — đã áp 08/10/2026 (0 bảng thiếu RLS, 4 trigger, 4 cột account_id, anon không quyền, advisor không đổi); trước đây cần anh Kỳ đồng ý (thêm cột `account_id` vào 4 bảng sổ vốn/vay/chi phí, 4 trigger, đổi cách tính số dư, thay 4 RPC; hàm `private` chỉ trả số). Chi tiết D88.
1n. ~~Áp migration 2000~~ — đã áp 08/10/2026.
1m. ~~Áp migration 1900~~ — đã áp 06/10/2026. Còn chờ rà **danh mục checklist mặc định** (D73) và điều kiện thanh toán theo cả đơn (D75).
1l. ~~Áp migration 1800~~ — đã áp 06/10/2026. D70, D71 đã chốt 06/10/2026.
1k. ~~Áp migration 1700~~ — đã áp 06/10/2026. Còn chờ xác nhận D62–D66, đặc biệt D63: tiền cọc khi khách bỏ cọc (giữ lại làm thu nhập hay hoàn).
1j. ~~Áp migration 1600~~ — đã áp 06/10/2026. Còn chờ xác nhận các mục **Tạm** D56–D59 (đặc biệt D59: có tự đóng nhu cầu khi xác nhận đơn không).
1i. ~~Áp migration 1500~~ — đã áp 06/10/2026. Còn chờ xác nhận các mục **Tạm** D51–D53, D55 (đặc biệt D51 "giá sàn là ngưỡng duy nhất", D52 ai duyệt giá dưới sàn).
1f. ~~Áp migration 1300~~ — đã xong 05/10/2026. **Đã chốt D39/D41 (05/10/2026):** chi phí chung KHÔNG trừ trước khi chia (giữ quy tắc §7); lãi vay không tính, không trừ. Còn lại: hoa hồng bán xe có trừ trước khi chia không — để chặng 6.
1g. **Bảo mật — 4 hàm `valuation_agent_*` (không do phiên này tạo, thuộc 3 migration `appraisal_ai_*`/`valuation_agent_*` ngoài repo) đang cho `anon` (chưa đăng nhập) gọi được** dù là SECURITY DEFINER và có ghi dữ liệu (`save_comparables`, `save_decision`, `save_new_car_evidence`, `fail_run`); có tham số `p_token` nên có thể đã tự kiểm tra token, nhưng chưa được rà. Cần chủ dự án xác nhận ai tạo, đưa mã vào repo và rà quyền (CLAUDE.md §11). **Cập nhật 06/10/2026:** Supabase hiện có thêm migration ngoài repo `valuation_agent_disable_public_rpc_v1` và Advisor không còn cảnh báo `anon` cho các hàm này — việc đưa mã vào repo vẫn còn mở.
1e. ~~Áp migration 1200~~ — đã xong 05/10/2026. Cần thử tải ảnh thật trên giao diện (Preview/production) rồi mới coi là nghiệm thu.
1d. **Supabase có 3 migration không có trong repo:** `appraisal_ai_valuation_tables_v1`, `_security_v1`, `_views_v1` (áp 05/10/2026 07:58, tạo các bảng `appraisal_ai_*`). Không do phiên làm việc này tạo. Cần đưa mã nguồn vào repo (CLAUDE.md §13: không để mã lệch database) và xác nhận phạm vi — CLAUDE.md §14 ghi chưa mở rộng sang "AI định giá" khi chưa được yêu cầu.
1c. Xác nhận định nghĩa "giá bán" để tính phí % (D30) và các mục **Tạm** D32, D33, D35.
2. Admin đầu tiên đã được gán (01/10/2026). Cần xác nhận đăng nhập thực tế trên `minhky-auto.vercel.app` và cấu hình Site URL/Redirect URL trong Supabase Auth.
3. Xác nhận các tham số tạm D7, D8, D9, D11, D12 (xem `DECISIONS.md`).
4. Dự án đang để gói Free; nâng gói Pro của tổ chức "Minh Kỳ Auto" trước khi nhập khách thật (để có sao lưu).

## Bước tiếp theo

0. Chuyển sang làm việc bằng Claude Code trên máy anh Kỳ để tự commit/push (hướng dẫn: `docs/CLAUDE_CODE.md`).

1. Bootstrap admin → đăng nhập app → kiểm tra theo `DEPLOYMENT.md` §5 trên máy tính và điện thoại; sửa lỗi tích hợp nếu có. (Project hiện là bản duy nhất: không nạp dữ liệu demo vào đây nếu sắp dùng thật.)
2. Chặng 3 còn lại: giao diện quản lý danh mục/địa điểm/mẫu checklist, kỹ thuật viên nhập kết quả kiểm tra.
3. Chặng 4 (vốn góp/vay, quyết toán) rồi chặng 5 (bán, thu chi, quyết toán ký gửi).
