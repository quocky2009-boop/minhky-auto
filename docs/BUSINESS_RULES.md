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
  Xe mua đứt bắt buộc có giá mua khi nhập kho; xe ký gửi **không có** giá mua (giá chủ xe muốn nhận thuộc hợp đồng ký gửi — chưa làm).
- **Tuổi tồn** = số ngày từ ngày nhập kho (giờ Việt Nam). Chưa có ngày nhập → hiện "Chưa rõ", không coi là 0.
- **Nhập kho từ nhu cầu bán:** quản lý, khi nhu cầu ở "Đã thẩm định"/"Thương lượng". Giá trị showroom đã kiểm tra ghi đè thông tin khách khai; thông tin khách khai giữ nguyên.
  Một nhu cầu chỉ sinh được một xe. Nguồn xe ghi "Thu cũ đổi mới" nếu khách chọn hình thức đổi xe, ngược lại "Cá nhân".

## 8. Chưa định nghĩa — sẽ bổ sung ở chặng tương ứng

Thẩm định có checklist và duyệt mua, ký gửi (phí, quyết toán chủ xe), chi phí được trừ trước khi chia, giữ/cọc xe đồng thời, thu cũ đổi mới đối trừ, hoa hồng, chỉ tiêu báo cáo.
