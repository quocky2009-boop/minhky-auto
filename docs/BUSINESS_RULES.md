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

## 7. Góp vốn và chia lợi nhuận (thư viện + test; dữ liệu, điều khoản và sổ vốn xem 7g; quyết toán ở chặng sau)

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

## 7f. Ảnh và video gắn với xe (chặng 3)

- **Chỉ ảnh và video** (anh Kỳ chốt 05/10/2026: không cần tải giấy tờ lên). Ai thấy xe thì thấy (sales chỉ với xe đang bán/giữ/cọc hoặc của mình; kỹ thuật với xe chưa bán); mọi nhân viên có vai trò đều tải lên được cho xe mình thấy.
- **Loại tệp và giới hạn:** ảnh JPG/PNG/WEBP/HEIC ≤ 20 MB; video MP4/MOV ≤ 50 MB. Storage riêng tư, đường dẫn xem là URL ký hiệu lực 10 phút. PDF và các loại khác bị từ chối.
- **Không xóa:** tệp chỉ được *lưu trữ* (quản lý, bắt buộc lý do; ẩn khỏi giao diện nhưng tệp gốc và bản ghi được giữ). Không sửa tên/loại/đường dẫn tệp; tải tệp mới nếu cần.
- **Người tải lên** do database ghi; gửi lặp cùng mã yêu cầu không sinh trùng; ghi vào hồ sơ chỉ khi tệp thật sự đã có trong Storage.
- Bản scan giấy tờ (cà vẹt, hợp đồng ký gửi) **không** lưu trong app; số hợp đồng giấy ghi ở ô tham chiếu của hợp đồng ký gửi/chứng từ chi phí.

## 7g. Vốn góp, điều khoản chia lợi nhuận theo xe, cho vay (chặng 4 — lát 1)

- **Chỉ xe showroom sở hữu** (kể cả xe thu cũ đổi mới) có bên góp vốn/cho vay. Xe ký gửi có *chủ xe* (mục 7e), không phải bên góp vốn.
- **Bên góp vốn / cho vay** (mã GV…): cá nhân, tổ chức hoặc "Công ty / showroom" (phần showroom tự góp vốn, để không đếm trùng với phần vận hành). Người ngoài chưa có tài khoản. Điện thoại không ghi vào nhật ký kiểm toán.
- **Điều khoản chia lợi nhuận của từng xe, có phiên bản:** tỷ lệ dành cho công ty (c, **bắt buộc nhập, không có mặc định**; 0 là số thật nếu nhập rõ), danh sách bên góp với tỷ lệ chia (mỗi bên > 0, không trùng),
  căn cứ chi phí trừ trước khi chia, cách xử lý hòa vốn/lỗ, căn cứ phân chia, số văn bản.
  *Bản nháp* sửa được; **duyệt** (quản lý) chỉ khi tổng tỷ lệ chia **đúng 100%** và các bên còn hoạt động; *bản đã duyệt bất biến*. Mỗi xe một bản hiệu lực: duyệt bản mới thì bản cũ thành "đã thay thế". Bản nháp chỉ hủy (có lý do), không xóa.
  Sửa cấu hình chung không đổi điều khoản xe đã duyệt (không có cấu hình chung tự áp).
- **Chi phí chung (điện nước, thuê nhà, cơ sở vật chất…) KHÔNG trừ trước khi chia** — khoản C đã bù vận hành; chi phí chung vẫn vào báo cáo toàn công ty (anh Kỳ 05/10/2026 giữ quy tắc §7).
- **Căn cứ chi phí và cách xử lý hòa vốn/lỗ có thể để "chờ xác nhận":** không chặn nhập/duyệt điều khoản nhưng **chặn quyết toán**. Căn cứ chi phí: *mọi chi phí đã xác nhận của xe* / *chỉ các khoản được chọn* (chưa hỗ trợ) / *không trừ chi phí*.
- **Sổ vốn góp** (không sửa, hủy có lý do): *vốn cam kết* (chỉ quản lý), *tiền thực nhận* và *rút vốn* (kế toán hoặc quản lý) — ba số tách riêng. Bên phải có trong điều khoản (nháp hoặc đã duyệt). Rút vốn không vượt vốn thực nhận ròng (kể cả hai người rút cùng lúc: khóa).
  Hủy khoản nhận không được làm vốn ròng âm. Chưa ghi gì thì hiện "Chưa ghi", không hiện 0 như đã góp.
- **Khi vốn thay đổi sau khi duyệt** (ghi hoặc hủy dòng sổ), hệ thống **không tự đổi tỷ lệ** (CLAUDE.md §7): đánh dấu "cần xác nhận lại căn cứ phân chia" cho đến khi quản lý xác nhận lại (bắt buộc nêu lý do tỷ lệ vẫn đúng) hoặc duyệt phiên bản mới. Cờ này chặn quyết toán.
- **Cho vay hưởng lãi tách khỏi góp vốn:** khoản vay (bên cho vay, gốc, ngày nhận, hạn, lãi thỏa thuận ghi nguyên văn) không vào sổ vốn góp và không chia lãi/lỗ theo tỷ lệ. Trả gốc không vượt gốc (khóa); trả lãi ghi riêng. **Chưa tự tính lãi vay** — chờ định nghĩa cách tính.
- **Ước tính chia lợi nhuận** trên trang xe: "nếu bán giá X" → P = giá bán − giá mua − chi phí đã xác nhận (theo căn cứ) rồi dùng công thức mục 7. Từ chối (không đoán) khi thiếu căn cứ chi phí, thiếu giá mua, chưa có chi phí đã xác nhận, hòa vốn/lỗ, hoặc tổng tỷ lệ sai. **Đây là ước tính, không phải quyết toán.**
- **Chưa làm:** quyết toán (tạm tính → kiểm tra → phê duyệt → thanh toán), hoàn vốn/chia lợi nhuận thực chi, chi phí muộn qua điều chỉnh, xử lý hòa vốn/lỗ được duyệt, Cần giao dịch bán (chặng 5).

## 7h. Giữ xe và đặt cọc (chặng 5 — lát 1)

- **Độc quyền theo xe:** một xe chỉ có **một giữ/cọc hiệu lực**, chặn ở database (unique index) — hai người bấm cùng lúc thì chỉ một người thắng, người đến sau nhận lỗi rõ ràng "xe vừa được người khác giữ/đặt cọc", không ghi đè.
  Yêu cầu: xe đang ở trạng thái "đang bán"; xe ký gửi phải có hợp đồng ký gửi hiệu lực (luật của xe, mục 7e).
- **Gắn với nhu cầu MUA còn mở của khách** (khách lấy từ nhu cầu). Sales chỉ giữ/cọc cho nhu cầu mình phụ trách; quản lý giữ/cọc thay được. Kế toán/kỹ thuật không giữ xe.
- **Giữ xe** (có hạn): người giữ **nhập hạn, không có hạn mặc định**; hạn phải ở tương lai. Gia hạn: người phụ trách/quản lý, hạn mới phải sau hạn cũ; không gia hạn bản đã hết hạn. Nhả giữ: người phụ trách/quản lý, **bắt buộc lý do**.
- **Hết hạn:** giữ xe quá hạn được **nhả lười** (không cần job nền): khi có người giữ/cọc xe đó, hoặc quản lý bấm "nhả mọi giữ xe hết hạn"; ghi lý do "Hết hạn giữ xe", không có người thực hiện (hệ thống).
- **Đặt cọc:** có **số tiền cọc thỏa thuận** > 0 (chưa phải đã thu — tiền thực nhận/hoàn là chứng từ thu chi ở lát sau; cọc không phải lợi nhuận). Đặt cọc không "nhả": chỉ **quản lý hủy cọc, bắt buộc lý do** (vì liên quan tiền cọc đã nhận). Số tiền cọc, xe, khách, người phụ trách **không sửa** — hủy rồi lập lại.
- **Chuyển giữ → cọc** trong một giao dịch (xe không bao giờ "trống" ở giữa); bản giữ thành "đã chuyển", giá chốt kế thừa.
- **Trạng thái xe** (đang giữ / đã cọc / đang bán) do trigger đồng bộ theo giữ/cọc — không đặt tay. Mọi giữ/cọc ghi nhật ký hệ thống vào nhu cầu (không ghi số tiền); không xóa giữ/cọc.
- **Quyền xem:** sales chỉ thấy giữ/cọc của mình; quản lý/kế toán thấy tất cả. Sales khác chỉ biết "xe đang được giữ/đã cọc" + người phụ trách + hạn giữ (không lộ khách, số tiền, giá chốt).
- **Chưa làm:** đơn bán nhiều xe, hợp đồng bán, thu chi (tiền cọc thực nhận/hoàn), thu cũ đổi mới, bàn giao, quyết toán; chưa tự đổi trạng thái nhu cầu sang "Đã cọc".

## 7i. Báo giá có phiên bản và duyệt giảm giá (chặng 5 — lát 2)

- **Báo giá** của một xe cho một nhu cầu MUA (khách lấy từ nhu cầu); mã BG#####; mỗi (nhu cầu, xe) chỉ một báo giá đang mở. Xe phải đang bán (sẵn bán/đang giữ/đã cọc), không đang giữ/cọc cho khách khác (D55).
- **Phiên bản bất biến:** giá báo, ưu đãi (ghi nguyên văn, không tính tiền), hạn hiệu lực (bắt buộc nhập, tương lai), ghi chú. Giá niêm yết lấy từ hệ thống lúc lập. Sửa = lập phiên bản mới: bản đã phát hành → "đã thay thế"; bản chờ duyệt → "đã hủy"; bản bị từ chối giữ nguyên (D50).
- **Cần duyệt (database quyết định, D51):** xe sở hữu: giá báo < giá sàn hoặc chưa có giá sàn. Xe ký gửi: mức giảm so với giá chào trong thỏa thuận đã ký vượt quyền giảm giá (không / số tiền / %), hoặc chưa có thỏa thuận đã ký. Giá cao hơn giá chào/giá sàn, hoặc đúng bằng ngưỡng, không cần duyệt.
- **Duyệt:** quản lý/admin; duyệt hoặc từ chối đều phải ghi lý do; người duyệt và giờ duyệt được lưu; đã quyết thì không đổi (D52). Phiên bản chờ duyệt hoặc bị từ chối **không** chấp nhận được và không được báo cho khách.
- **Khách chấp nhận:** chỉ phiên bản đã phát hành và còn hạn; báo giá chuyển "khách đã chấp nhận". Chưa phải đơn bán/giữ/cọc/thu tiền (D54). Hủy báo giá phải có lý do; các phiên bản giữ lại; hủy xong lập lại được.
- **Quyền xem:** sales chỉ thấy báo giá của mình (và cờ "cần duyệt", không thấy giá sàn — D53); quản lý/kế toán thấy tất cả; kỹ thuật không thấy. Không xóa.
- **Chưa làm:** thu chi, thu cũ đổi mới, bàn giao, quyết toán; tính giá trị ưu đãi; nhắc báo giá sắp hết hạn.

## 7j. Đơn bán nhiều xe và hợp đồng bán (chặng 5 — lát 3)

- **Đơn bán** (mã DB#####) của một khách (qua nhu cầu mua còn mở), nhiều **dòng xe**; mỗi dòng có **giá bán ghi trên hợp đồng** (VND nguyên, tổng bằng BigInt). Giá bán KHÔNG phải tiền đã thu; cọc/thanh toán/công nợ ở lát thu chi.
- **Trạng thái:** đang soạn → đã ký hợp đồng (xác nhận) → đã hủy. Đơn nháp sửa được (thay danh sách xe; dòng cũ "đã bỏ" vẫn lưu); đơn đã xác nhận không sửa hợp đồng/dòng (D56).
- **Độc quyền:** một xe chỉ nằm trong một dòng đơn hiệu lực (kể cả đơn nháp); hai người lập cùng lúc → một đơn thắng, đơn thua không để lại dòng nào. Xe phải đang bán (sẵn bán/giữ/cọc), không giữ/cọc cho khách khác; xe ký gửi cần hợp đồng ký gửi hiệu lực.
- **Duyệt giá (D58):** dòng thấp hơn mức cho phép → chỉ quản lý/admin xác nhận, kèm lý do. Dòng gắn phiên bản báo giá khách đã chấp nhận (cùng xe, cùng nhu cầu, giá bằng giá báo, mỗi báo giá chỉ một đơn) thì không cần duyệt lại.
- **Xác nhận (D57, D59):** cần số hợp đồng + ngày ký (không tương lai) và ít nhất một xe; xe → "đã bán"; giữ/cọc của đúng nhu cầu → "đã thành đơn bán"; nhật ký nhu cầu không ghi số tiền. **Hủy:** đơn nháp do người phụ trách/quản lý; đơn đã xác nhận chỉ quản lý; bắt buộc lý do; xe đã bán về "đang bán".
- **Quyền xem:** sales chỉ thấy đơn của mình; quản lý/kế toán thấy tất cả; kỹ thuật không thấy; không xóa.
- **Chưa làm:** thu cũ đổi mới, bàn giao, quyết toán chia lợi nhuận/phí ký gửi, tự đóng nhu cầu, xuất hợp đồng theo mẫu.

## 7k. Thu chi, tiền cọc thực nhận/hoàn và công nợ đơn bán (chặng 5 — lát 4)

- **Tài khoản tiền** (TK###, tiền mặt/ngân hàng): số dư đầu kỳ nhập một lần (khóa khi đã có phiếu); không xóa, chỉ ngừng dùng. Số dư = đầu kỳ + thu − chi (chỉ phiếu đã ghi).
- **Phiếu** (PT#####/PC#####) = tiền **đã thật sự** vào/ra; ngày không ở tương lai; hình thức khớp loại tài khoản; bất biến; sai thì quản lý hủy có lý do (D61). Chưa nhận tiền/ngân hàng chưa giải ngân → chưa có phiếu.
- **Loại phiếu (D62):** thu cọc (gắn đặt cọc, tổng không vượt số cọc thỏa thuận), thu thanh toán đơn bán (đơn đã ký), thu khác; chi hoàn cọc, hoàn tiền đơn bán, chi phí chung, chi khác. Thu ghi "ai trả" (khách/ngân hàng giải ngân/khác).
- **Công nợ đơn bán (D63):** tổng giá − thanh toán ròng hoàn − cọc đã áp. Không thu vượt nợ; hoàn không vượt đã thu; hủy đơn đã ký bị chặn khi còn thanh toán chưa hoàn. Cọc: hoàn khi cọc đã hủy, hoặc đơn dùng cọc đã bị hủy; cọc đang áp vào đơn thì không hoàn trực tiếp.
- **Chi (D64):** chỉ khi tài khoản đủ tiền thực có; khóa theo tài khoản/đơn/cọc chống hai phiếu cùng lúc. Không hủy phiếu thu nếu làm quỹ âm hoặc đã có phiếu hoàn dựa trên nó.
- **Quyền (D65):** kế toán/quản lý lập phiếu và xem; chỉ quản lý hủy phiếu và lập tài khoản; sales/kỹ thuật không đọc.
- **Chưa làm (D66):** nối sổ quỹ với chi phí xe, vốn góp/khoản vay, quyết toán chia lợi nhuận/phí ký gửi, thu cũ đổi mới; "tịch thu cọc"; đối chiếu sao kê; báo cáo thu chi theo kỳ/xuất Excel.

## 7l. Thu cũ đổi mới (chặng 5 — lát 5)

- **Hồ sơ thu cũ (TC#####)** liên kết đơn bán (chưa hủy) với một xe cũ của khách đã nhập kho (nguồn "thu cũ đổi mới", showroom sở hữu, nhu cầu bán của xe cùng khách với đơn, đã có giá mua). Mỗi xe cũ một hồ sơ chưa hủy. Giá trị mua lấy từ giá mua của xe. Nháp → xác nhận → hủy (D67).
- **Hai giao dịch giữ giá trị đầy đủ:** giá bán dòng đơn và giá mua xe cũ không đổi vì đối trừ.
- **Xe cũ còn vay (D69):** P = L (trả ngân hàng) + C (phần khách). Đối trừ và chi cho khách chỉ từ C; L chỉ chi cho ngân hàng (tối đa L). Không khấu trừ hai lần.
- **Đối trừ (D68):** chứng từ riêng do quản lý xác nhận (DT#####), hủy có lý do, không đổi số dư tài khoản; giảm công nợ đơn và số phải trả cho xe cũ cùng số tiền; không vượt C còn lại hay công nợ đơn.
- **Tiền còn phải trả cho xe cũ** = P − đối trừ − đã chi cho khách − đã trả ngân hàng. **Công nợ đơn bán** = tổng giá − thanh toán − cọc đã áp − đối trừ.
- **Hủy (D70):** đơn đã ký còn đối trừ không hủy được; hồ sơ còn đối trừ hoặc đã chi tiền không hủy được; hủy đơn không tự hủy hồ sơ mua xe cũ.
- **Quyền (D71):** quản lý ghi; kế toán xem + lập phiếu chi xe cũ; sales/kỹ thuật không đọc.
- **Chưa làm:** khoản vay lớn hơn giá mua (khách bù), trả lại xe cũ khi hủy hồ sơ, tự điền biên bản/hợp đồng mua xe cũ, quyết toán hiệu quả từng xe (lát quyết toán).

## 7m. Bàn giao xe và hồ sơ (chặng 5 — lát 6)

- **Bàn giao (BN#####)** gắn một dòng xe của đơn bán đã ký; người phụ trách đơn hoặc quản lý lập (D73). Checklist chụp từ danh mục cấu hình lúc lập; mỗi mục có trạng thái, bản gốc, bản scan (chỉ có/không), người giữ (D74).
- **Điều kiện giao (D75):** đơn đã ký (không miễn được); thanh toán đủ; xe chuẩn bị xong; hồ sơ xe đủ; checklist bắt buộc đạt. Ngoại lệ do quản lý, có lý do, đúng loại, thu hồi được (D76). Giao cần ngày, người nhận + quan hệ, ODO, chìa khóa.
- **Sau khi giao (D77):** xe "đã giao"; bàn giao bất biến; đơn không hủy được. Hủy bàn giao đang chuẩn bị có lý do; mỗi dòng một bàn giao.
- **Quyền (D78):** sales/quản lý làm bàn giao đơn của mình; quản lý phê duyệt ngoại lệ và sửa danh mục; kế toán xem; sales chỉ thấy cờ điều kiện. Biên bản in không có số tiền.
- **Chưa làm:** bắt buộc số ảnh tối thiểu khi giao, xe điện kiểm tra pin lúc giao, nhắc lịch giao, giao một phần/trả xe sau giao (hậu mãi), đối chiếu bản gốc giấy tờ với kho hồ sơ.

## 7n. Quyết toán xe (chặng 5 — lát 7)

- **Quy trình (D79):** tạm tính → kiểm tra → phê duyệt → thanh toán; mỗi dòng xe một quyết toán đang hiệu lực; số liệu đầu vào chụp lúc tạm tính.
- **Xe sở hữu (D80):** P = giá bán − giá mua − chi phí được trừ; C = P × tỷ lệ công ty (nửa lên); R = P − C; lợi nhuận bên i = R × tỷ lệ (phần dư lớn nhất). Hoàn vốn = vốn thực nhận ròng. Dòng của công ty là nội bộ. Ví dụ kiểm: P = 40 tr, 20%, vốn 60/40 → công ty 8 tr, hai bên 19,2 / 12,8 tr.
- **Hòa vốn/lỗ (D82):** không áp công thức; cần cách xử lý trong điều khoản + quản lý ghi số hoàn vốn.
- **Xe ký gửi (D83):** trả chủ xe S − F − K (showroom thu tiền) hoặc chủ xe nộp F + K (chủ xe thu tiền); âm thì chủ xe còn nợ.
- **Điều kiện duyệt (D81):** số liệu không đổi, điều khoản đủ, hết chi phí dự kiến, xử lý hòa vốn/lỗ, **đơn đã thu đủ**.
- **Chi trả (D85):** phiếu thu/chi theo dòng nghĩa vụ của quyết toán đã duyệt; không vượt phần còn lại; quỹ đủ tiền; hủy phiếu mở lại nghĩa vụ.
- **Điều chỉnh (D84):** bản đã duyệt không sửa; chi phí muộn → điều chỉnh có lý do (quản lý); số đã chi chuyển sang bản mới; chi vượt nghĩa vụ mới thì không duyệt.
- **Quyền (D86):** kế toán + quản lý tạm tính/kiểm tra/chi; quản lý/admin duyệt, xử lý hòa vốn/lỗ, điều chỉnh.
- **Chưa làm (D87):** nối vốn góp thực nhận/khoản vay/chi phí xe vào sổ quỹ; hoa hồng (chặng 6); báo cáo lợi nhuận toàn showroom; bản in quyết toán; chia lỗ tự động.

## 8. Chưa định nghĩa — sẽ bổ sung ở chặng tương ứng

Hợp đồng mua, quyết toán chủ xe xe ký gửi (thu hộ, phần showroom, khấu trừ, còn phải trả; định nghĩa chính xác "giá bán" để tính phần trăm — giá ghi trên hợp đồng bán, đã/chưa trừ giảm giá, thuế, lệ phí), việc chi phí nào được trừ trước khi chia lợi nhuận, giữ/cọc xe đồng thời, thu cũ đổi mới đối trừ, hoa hồng, chỉ tiêu báo cáo.

## 7o. Sổ quỹ nối vốn góp, khoản vay, chi phí xe (D88)

- **Số dư tài khoản tiền** = số dư đầu + phiếu thu − phiếu chi + vốn góp thực nhận + gốc vay nhận − rút vốn − trả vay (gốc, lãi) − thanh toán chi phí xe. Mỗi khoản chỉ ghi **một lần** ở sổ gốc của nó, kèm tài khoản; không tạo phiếu thu/chi trùng.
- Vốn **cam kết** không phải tiền thật: không gắn tài khoản. Bên góp vốn/cho vay là **công ty**: không gắn tài khoản (tiền công ty đã nằm trong sổ quỹ, gắn thêm sẽ đếm hai lần).
- Dòng mới có tiền thật của bên ngoài **bắt buộc chọn tài khoản**; chi chỉ khi tài khoản đủ tiền thực có (kiểm dưới khóa theo tài khoản, chung với phiếu thu/chi → hai khoản chi song song cùng vượt số dư chỉ một thành công); tài khoản đang hoạt động; ngày không ở tương lai.
- Hủy dòng đã thu tiền (vốn nhận, khoản vay) không được làm tài khoản âm. Không đổi tài khoản của dòng đã ghi: hủy (có lý do) rồi ghi lại.
- Dòng cũ chưa có tài khoản không tính vào số dư (database thật hiện chưa có dữ liệu).
- Hệ quả cho quyết toán: chi hoàn vốn/chia lợi nhuận dựa trên số dư phản ánh cả tiền góp thực nhận.

## 7p. Dashboard và báo cáo kết quả (chặng 6 — lát 8, D89–D91)

- **Chỉ đọc**, tổng hợp ở database (view + RPC security invoker); chỉ quản lý/kế toán/admin có dữ liệu, sales/kỹ thuật nhận rỗng.
- **Tồn kho:** xe đã nhập kho và chưa bán xong; sở hữu và ký gửi tách riêng; vốn hàng tồn sở hữu = giá mua + chi phí xác nhận do showroom chịu; thiếu giá mua đếm riêng. Nguồn xe chưa nhập kho đếm riêng.
- **Vốn theo nguồn:** vốn góp ngoài (ròng) và dư nợ vay trên xe tồn sở hữu; tiền thực có = tổng số dư tài khoản đang hoạt động (đã gồm vốn góp/vay/chi phí xe — D88).
- **Công nợ:** đơn bán đã ký còn phải thu; còn phải thu từ chủ xe; còn phải chi theo quyết toán đã duyệt; còn phải trả thu cũ đổi mới.
- **Kết quả xe theo kỳ ký hợp đồng:** lãi gộp = giá bán − giá mua; sau chi phí = lãi gộp − chi phí đã xác nhận do showroom chịu; P và C từ quyết toán đã duyệt; xe ký gửi: showroom hưởng phí ký gửi (giá bán là thu hộ). Toàn showroom (tạm tính) = sau chi phí + phí ký gửi đã quyết toán − chi phí chung/chi khác + thu khác. **Không cộng P/C thành doanh thu mới.**
- Mỗi dòng truy ngược được: đơn bán → xe → quyết toán. Cảnh báo khi còn xe thiếu giá mua, chi phí chưa xác nhận, chưa quyết toán.

## 7q. Hậu mãi (chặng 6 — lát 9, D92–D94)

- **Cam kết/bảo hành** gắn dòng xe của đơn bán đã ký; quản lý ghi; không sửa (hủy có lý do). Bảo hành có hạn ngày và/hoặc giới hạn km.
- **Phiếu hậu mãi**: phản ánh, yêu cầu bảo hành, yêu cầu dịch vụ, nhắc chăm sóc. Luôn có người phụ trách; đang xử lý phải có việc tiếp theo + hạn; đóng cần kết quả; hủy cần lý do; mở lại chỉ quản lý và phải có việc mới. Nhật ký không sửa.
- **Gợi ý bảo hành** theo ngày tiếp nhận và km; thiếu km khi có giới hạn km → "chưa rõ". Quản lý quyết định.
- **Chi phí sau bán** gắn đúng phiếu và đúng xe (theo dõi), luôn do showroom chịu và là **chi phí chung của showroom**: không trừ vào lợi nhuận chia/quyết toán/kết quả từng xe, nhưng trừ ở kết quả toàn showroom.
- **Lịch chăm sóc tự động:** khi giao xe, tự mở 3 phiếu nhắc chăm sóc hạn sau 7, 30, 90 ngày kể từ ngày giao, giao cho sales phụ trách đơn.
- **Nhắc việc:** danh sách `/hau-mai` (quá hạn, hôm nay, đang xử lý, của tôi) và thẻ ở Tổng quan.

