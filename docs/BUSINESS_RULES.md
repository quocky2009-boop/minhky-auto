# Quy tắc nghiệp vụ

Nguồn gốc: `CLAUDE.md`. Mục nào ghi **[chờ xác nhận]** là tham số vận hành do đội phát triển đặt tạm, cần anh Kỳ chốt; xem `DECISIONS.md`.

## 1. Tiền và số liệu

- Đơn vị 1 đồng. Database `numeric(18,0)`, mã nguồn `bigint`. Không dùng số thực cho tiền.
- Ô bỏ trống nghĩa là **Chưa rõ** (null) — không bao giờ tự thành 0. Hiển thị "Chưa rõ".
- Ô nhập tiền chấp nhận: `650000000`, `650.000.000`, `650tr`, `650 triệu`, `1,2 tỷ`, `1.25 ty`, `500k`.
  Không hiểu được thì báo lỗi, không đoán. Có đơn vị thì cho phép một dấu thập phân; không đơn vị thì dấu `.` `,` là phân cách hàng nghìn.
- Ngày giờ hiển thị và tính "hôm nay" theo giờ Việt Nam (UTC+7), định dạng dd/MM/yyyy và dd/MM/yyyy HH:mm.

## 2. Khách hàng

- Một khách có nhiều nhu cầu (vừa mua vừa bán là bình thường, ví dụ đổi xe).
- Số điện thoại được chuẩn hóa (`+84 912…`, `0912 …`, `84912…` → `0912…`) để phát hiện trùng.
  Trùng chỉ **gợi ý** ("Dùng khách này"), không tự gộp; hai người có thể dùng chung số.
- Sales thấy khách trùng của đồng nghiệp ở dạng rút gọn (ví dụ "…Hùng" + người phụ trách), không thấy địa chỉ/ghi chú.
  Nếu sales tạo nhu cầu mới gắn vào khách đó, họ được xem hồ sơ khách vì đang phục vụ khách (hồ sơ khách vẫn thuộc người phụ trách cũ).

## 3. Nhu cầu mua/bán — trạng thái

| Cần mua | Cần bán |
|---|---|
| Mới → Đã xác minh → Đang tìm/đã giới thiệu xe → Hẹn xem/lái thử → Thương lượng → **Đã cọc/đã mua** | Mới → Đã lấy thông tin → Hẹn thẩm định → Đã thẩm định/báo giá → Thương lượng → **Đã mua vào/nhận ký gửi** |

Cả hai có thêm **Tạm dừng** và **Đã đóng**.

Luật chuyển (thực thi bằng trigger `private.demand_transition_allowed`, giao diện chỉ hiện các bước hợp lệ):
- Giữa các bước đang xử lý: tiến hoặc lùi đều được (thực tế khách đổi ý).
- Lên trạng thái chốt (Đã cọc / Đã mua vào) chỉ từ Hẹn xem, Thương lượng hoặc Đã thẩm định.
- Đóng: từ bất kỳ trạng thái nào, **bắt buộc ghi lý do**. Tạm dừng: **bắt buộc ghi lý do**.
- Mở lại nhu cầu đã đóng/đã chốt: **chỉ quản lý**, và quay về "Mới" để xác minh lại từ đầu.
- Không đổi được loại mua ↔ bán; tạo nhu cầu mới.

## 4. Chăm sóc — không bỏ quên khách

- Nhu cầu đang xử lý (mọi trạng thái trừ Mới, Tạm dừng, Đóng, Đã chốt) **phải có việc tiếp theo + hạn** (constraint database).
- Luôn có người phụ trách khi chưa đóng. Chỉ quản lý đổi người phụ trách; mỗi lần đổi ghi nhật ký hệ thống + audit log.
- Đèn báo:
  - đỏ nhấp nháy = **Quá hạn** (hạn trước 00:00 hôm nay);
  - hổ phách = **Đến hạn hôm nay**;
  - xám = **Lâu chưa cập nhật** — quá N ngày không có hoạt động, cần xác minh lại. N = `app_settings.demand_stale_after_days`, mặc định **14** **[chờ xác nhận]**;
  - xanh = đúng hạn;
  - vòng rỗng = chưa có lịch.
- Nhu cầu "lâu chưa cập nhật" không được coi là còn hiệu lực: khi ghép xe, mức "Phù hợp" bị hạ xuống "Cần xác minh".
- Nhật ký liên hệ chỉ thêm, không sửa/xóa. Ghi nhật ký cập nhật "liên hệ gần nhất" và (nếu có) việc tiếp theo.

## 5. Lọc và tìm kiếm

- Lọc kết hợp: loại (mua/bán/đổi xe), trạng thái, hãng, model, phiên bản, đời, màu, khoảng giá, khu vực, người phụ trách, nguồn, ưu tiên, tình trạng chăm sóc, ngày cập nhật, từ khóa.
- **Khoảng giá/năm lấy giao của hai khoảng; đầu bỏ trống là khoảng mở.** Ví dụ ngân sách 600–700 triệu khớp bộ lọc 650 triệu; "chỉ trả tối đa 800 triệu" cũng khớp.
- Nhu cầu **chưa có giá/năm nào bị loại** khỏi kết quả khi lọc theo giá/năm (dữ liệu thiếu không giả là phù hợp).
- Tìm kiếm không phân biệt dấu và hoa thường ("ham yen" tìm được "Hàm Yên").

## 6. Ghép nhu cầu ↔ xe (gợi ý, không tự động gửi khách)

Kết quả mỗi cặp: **Phù hợp / Gần phù hợp / Cần xác minh / Không phù hợp** (không hiển thị).
- Tiêu chí **bắt buộc** (người nhập đánh dấu; mặc định: hãng/model) lệch → Không phù hợp. Không bao giờ bỏ qua.
- **Màu khách đã loại trừ** → luôn Không phù hợp.
- Tiêu chí linh hoạt lệch → Gần phù hợp. Riêng ngân sách linh hoạt chỉ "gần" khi lệch trong **10%** **[chờ xác nhận]**; lệch hơn → Không phù hợp.
- Thiếu dữ liệu ở bất kỳ bên nào → Cần xác minh.
- Nguồn xe chia hai nhóm tách bạch: **Xe sẵn bán** (trong kho sở hữu hoặc ký gửi, đang bán) và
  **Nguồn khách đang chào bán — chưa thu mua**. Nhóm sau **không bao giờ** được gắn "sẵn giao".
- Xe đang giữ cho khách khác vẫn hiện nhưng ghi rõ.
- Gợi ý chéo giữa các sales chỉ lộ mã nhu cầu và người phụ trách; muốn liên hệ phải qua người phụ trách.

## 7. Góp vốn và chia lợi nhuận (đã có thư viện + test; giao diện ở chặng 4)

Công thức đã chốt (CLAUDE.md §7), với P = doanh thu bán − giá mua − chi phí được thống nhất trừ trước khi chia:

```
C (công ty, cho vận hành) = P × c        c: tỷ lệ RIÊNG của từng xe, KHÔNG có mặc định
R = P − C
Lợi nhuận bên i = R × rᵢ                  Σ rᵢ phải đúng 100%
Công ty cũng góp vốn: nhận C + phần theo vốn góp (báo cáo tách 2 dòng, không đếm trùng)
```

Làm tròn (đơn vị 1 đồng): C làm tròn nửa lên; R chia theo **phần dư lớn nhất** — mỗi bên nhận phần nguyên, số đồng dư cấp cho bên có phần lẻ lớn nhất
(bằng nhau theo thứ tự nhập) → **tổng chi trả luôn đúng bằng P**. Tỷ lệ được tính bằng phân số chính xác, không làm tròn trung gian.

Từ chối tính (không tự quyết toán) khi: điều khoản xe chưa duyệt; thiếu c; c ngoài 0–100%; không có bên góp vốn; tỷ lệ bên nào ≤ 0 hoặc > 100%;
tổng tỷ lệ ≠ 100%; trùng bên; **P ≤ 0 (hòa vốn/lỗ cần phương án riêng được duyệt)**.

Dữ liệu test (KHÔNG phải mặc định nghiệp vụ): P = 40 triệu, c = 20%, vốn 60/40 → công ty 8 triệu; hai bên 19,2 và 12,8 triệu.

## 7b. Kho xe và nhập kho (chặng 3 — lát 1)

- **Một chiếc xe thật có thể có nhiều vòng sở hữu.** Mỗi lần xe vào showroom là một hồ sơ (mã XE…); VIN chỉ duy nhất giữa các hồ sơ **đang hoạt động**
  (chưa bán/bàn giao/trả chủ). Xe quay lại → hồ sơ mới tự liên kết hồ sơ cũ cùng VIN; hồ sơ cũ giữ nguyên giá mua, trạng thái, lịch sử.
- Các chiều tách riêng: mới/cũ · sở hữu/ký gửi · nguồn xe · chuẩn bị bán · hồ sơ giấy tờ · bán hàng. Không gộp một trạng thái.
- Trạng thái bán hàng: Chưa chào bán → Đang bán → (giữ / cọc / đã bán — chặng 5) → Đã bàn giao; ký gửi có thể "Trả chủ xe". Đã bàn giao/trả chủ là hết vòng, không mở lại.
  Đặt tay qua form chỉ có "Chưa chào bán" và "Đang bán".
- Không đổi được hình thức sở hữu ↔ ký gửi sau khi nhập (tạo hồ sơ mới).
- **Giá:** giá chào (sales được xem) · giá mua và giá sàn (chỉ quản lý/kế toán) nằm ở bảng riêng. Giá sàn không được cao hơn giá chào khi cùng nhập.
  Xe mua đứt bắt buộc có giá mua khi nhập kho; xe ký gửi **không có** giá mua (giá chủ xe muốn nhận thuộc hợp đồng ký gửi — xem 7e).
- **Tuổi tồn** = số ngày từ ngày nhập kho (giờ Việt Nam). Chưa có ngày nhập → hiện "Chưa rõ", không coi là 0.
- **Nhập kho từ nhu cầu bán:** quản lý, khi nhu cầu ở "Đã thẩm định"/"Thương lượng". Giá trị showroom đã kiểm tra ghi đè thông tin khách khai; thông tin khách khai giữ nguyên.
  Một nhu cầu chỉ sinh được một xe. Nguồn xe ghi "Thu cũ đổi mới" nếu khách chọn hình thức đổi xe, ngược lại "Cá nhân".

## 7c. Thẩm định và duyệt mua (chặng 3 — lát 2)

- Mỗi nhu cầu bán có tối đa một bản thẩm định. **Thông tin khách khai** (ở nhu cầu) và **kết quả showroom kiểm tra** (ở thẩm định) lưu riêng.
- Mỗi mục kiểm tra: Chưa kiểm tra (mặc định) · Đạt · Không đạt · Không áp dụng. **Chưa kiểm tra không bao giờ được coi là đạt.**
- Duyệt mua chỉ được khi: mọi mục bắt buộc đã kiểm tra; mục Không đạt có ghi tình trạng; mục ODO và pin xe điện có ghi số đo/bằng chứng;
  đã nhập giá mua tối đa được duyệt (không bắt buộc với xe ký gửi).
- Người duyệt: quản lý/admin. **Không có ngưỡng giá** (anh Kỳ chốt 01/10/2026).
- Khi nhập kho (mua đứt): giá mua thực tế ≤ giá mua tối đa đã duyệt. Cần mua cao hơn → mở lại thẩm định và duyệt giá mới (có nhật ký).
- Thẩm định đã duyệt/từ chối bị khóa; mở lại được (trừ khi xe đã nhập kho), mở lại xóa giá tối đa đã duyệt.
- Giá đề xuất và giá tối đa là dữ liệu tài chính: chỉ quản lý/kế toán xem. Nhật ký nhu cầu (sales đọc được) không ghi số tiền.

## 7d. Chi phí chuẩn bị xe (chặng 3 — lát 3)

- **Ba thông tin tách biệt, không cộng dồn:** (1) **Dự kiến** = dự toán, kế hoạch; (2) **Đã xác nhận** = số thực tế đã nghiệm thu, có người xác nhận và thời điểm; (3) **Đã thanh toán** = tiền đã chi, nhiều lần, mỗi lần một dòng.
  Khoản đã xác nhận không còn tính vào "dự kiến". Còn phải trả = đã xác nhận − đã thanh toán.
- Vòng đời một khoản: **Dự kiến** (quản lý duyệt dự toán — tùy chọn, đổi số dự toán thì phải duyệt lại) → **Đã xác nhận** (nhập số thực tế; nhập 0 nếu không phát sinh; để trống bị chặn) → ghi thanh toán. **Đã hủy** (cần lý do).
- Thanh toán chỉ ghi cho khoản đã xác nhận; tổng không vượt số đã xác nhận (hai người ghi cùng lúc cũng không vượt: khóa dòng).
- **Không sửa chứng từ:** khoản đã xác nhận không sửa; sai thì hủy (giữ lại) rồi tạo khoản thay thế liên kết với khoản đã hủy. Khoản đang có thanh toán phải hủy thanh toán trước khi hủy khoản. Thanh toán sai thì hủy (có lý do, dòng được giữ) và ghi lại.
- Người xác nhận / người chi / người hủy do **database tự điền** bằng người đang đăng nhập, không giả mạo được.
- **Đơn vị thực hiện** ghi tự do (ví dụ gara nội bộ, spa, bên ngoài). **Dự toán để trống = "chưa rõ"**; tổng hợp đếm riêng số khoản chưa có dự toán.
- **Xe showroom sở hữu:** showroom chịu; chi phí đã xác nhận tính vào giá vốn xe.
  **Xe ký gửi:** bắt buộc chọn bên chịu (showroom hoặc chủ xe); không làm tăng giá trị vốn tồn kho sở hữu; phần chủ xe chịu tách riêng. **Chi phí phát sinh của xe ký gửi không cần chủ xe duyệt** (anh Kỳ chốt 05/10/2026).
- Chỉ quản lý/kế toán xem chi phí; sales và kỹ thuật không thấy.

## 7e. Hợp đồng ký gửi (chặng 3 — lát 4)

- **Một hợp đồng cho một xe (một vòng ký gửi).** Một xe chỉ có một hợp đồng đang soạn/hiệu lực; hợp đồng đã trả/hủy không chặn lập lại khi xe chưa kết thúc vòng.
  Xe đã bán/bàn giao/trả chủ thì không lập hợp đồng mới; xe quay lại showroom nhập thành hồ sơ xe mới (mục 7b).
- **Vòng đời:** Đang soạn → Đang hiệu lực → Đã trả xe; hoặc Đang soạn → Đã hủy (cần lý do). Hợp đồng đã hiệu lực không hủy: kết thúc bằng biên bản trả xe. Không xóa hồ sơ.
- **Chủ xe / ủy quyền:** họ tên (bắt buộc), điện thoại, số giấy tờ; nếu người ký gửi là người được ủy quyền thì bắt buộc ghi thông tin ủy quyền.
- **Thỏa thuận có phiên bản, không sửa:** mỗi phiên bản gồm giá chủ xe muốn nhận (thực nhận), giá chào, quyền giảm giá, phí ký gửi, bên ký hợp đồng mua bán với người mua, bên thu tiền, điều khoản khác.
  Thay đổi = thêm phiên bản mới. Chỉ **phiên bản đã có ngày chủ xe ký** mới có hiệu lực; hiệu lực = phiên bản đã ký mới nhất. Bản chưa ký chỉ là đề xuất.
- **Phí ký gửi showroom hưởng (anh Kỳ chốt 05/10/2026):** **số tiền cố định** HOẶC **phần trăm trên giá bán** — chọn riêng từng xe, **không có mặc định** (mức 2–4% chỉ là ví dụ thường gặp, không tự áp).
  Phần trăm có tối đa 4 chữ số thập phân, từ 0 đến 100; làm tròn nửa lên đến 1 VND (hàm `private.consignment_fee`). Không chọn "chênh lệch" ở bản này.
- **Quyền giảm giá** (showroom giảm mà không cần hỏi chủ xe): không được giảm / tối đa một số tiền / tối đa một tỷ lệ % giá chào. Việc duyệt giảm giá khi bán thuộc chặng 5.
- **Điều kiện kích hoạt:** có thỏa thuận đã ký; điện thoại chủ xe; thời hạn (từ–đến); biên bản nhận xe (ngày nhận, số chìa khóa — 0 là số thật, giấy tờ nhận, tình trạng khi nhận).
  Kích hoạt chốt biên bản nhận xe và ngày bắt đầu (không sửa nữa); vẫn gia hạn ngày kết thúc và sửa thông tin liên hệ được (có nhật ký).
- **Xe ký gửi chỉ được chào bán/giữ/cọc/bán khi có hợp đồng đang hiệu lực** (database chặn kể cả khi sửa trực tiếp). Xe sở hữu không bị ảnh hưởng.
- **Trả/rút xe:** biên bản bắt buộc có ngày, lý do, tình trạng khi trả, số chìa khóa và giấy tờ trả lại. Chỉ trả khi xe chưa giữ/cọc/bán. Không còn khoản chi phí "dự kiến" chưa xác nhận/hủy.
  Chi phí chủ xe chịu đã xác nhận mà chưa thanh toán → bắt buộc ghi cách xử lý (chủ xe hoàn trả, trừ vào đâu…). Ảnh chụp "chủ xe chịu đã xác nhận / còn chưa thanh toán" do database tính lúc trả, không tin dữ liệu gửi lên.
  Trả xe chuyển xe sang "Đã trả chủ xe" (hết vòng, không mở lại); trạng thái này chỉ đặt được qua biên bản trả xe.
- **Tách tiền (§6):** hợp đồng chỉ ghi điều khoản. Tiền thu hộ, phần showroom hưởng, khoản khấu trừ, đã trả và còn phải trả chủ xe làm ở quyết toán (chặng 5, cần giao dịch bán).
  Màn hình chỉ có **ước tính** "nếu bán đúng giá chào thì phí = …, chủ xe nhận = …" kèm cảnh báo khi thấp hơn số chủ xe muốn nhận; đây không phải quyết toán.
- Xe ký gửi không tăng giá trị vốn tồn kho sở hữu (không giá mua; chi phí tách bên chịu — mục 7d).
- Chỉ quản lý/admin ghi; kế toán đọc; sales và kỹ thuật không thấy (có định danh chủ xe và điều khoản tiền). Nhật ký kiểm toán của hợp đồng không lưu điện thoại/số giấy tờ/ghi chú ủy quyền của chủ xe.

## 8. Chưa định nghĩa — sẽ bổ sung ở chặng tương ứng

Hợp đồng mua, quyết toán chủ xe xe ký gửi (thu hộ, phần showroom, khấu trừ, còn phải trả; định nghĩa chính xác "giá bán" để tính phần trăm — giá ghi trên hợp đồng bán, đã/chưa trừ giảm giá, thuế, lệ phí), việc chi phí nào được trừ trước khi chia lợi nhuận, giữ/cọc xe đồng thời, thu cũ đổi mới đối trừ, hoa hồng, chỉ tiêu báo cáo.
