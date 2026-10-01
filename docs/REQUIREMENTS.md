# Yêu cầu

**Nguồn gốc duy nhất:** [`CLAUDE.md`](../CLAUDE.md) ở gốc repository — đặc tả do anh Kỳ cung cấp ngày 01/10/2026, lưu nguyên văn.
File này không chép lại toàn bộ đặc tả; chỉ ghi phần làm rõ, giả định khi triển khai và yêu cầu mới đã chốt sau đó.
Khi có mâu thuẫn: yêu cầu mới đã chốt (bảng dưới) > CLAUDE.md > giả định.

## Tóm tắt phạm vi (CLAUDE.md §1–2, §14)

App nội bộ cho một showroom (không SaaS, không app native): xe mới, xe cũ, ký gửi, góp vốn theo xe, thu cũ đổi mới.
Next.js + TypeScript + Supabase + Vercel; tiếng Việt, VND, giờ Việt Nam; dùng tốt trên điện thoại.
Ưu tiên số 1: **module nhu cầu mua/bán** để không bỏ quên khách đến từ Zalo.

Thứ tự 6 chặng (CLAUDE.md §14):
1. Nền tảng, Auth, schema, quyền, Storage
2. Khách hàng → nhu cầu → tìm/lọc → lịch chăm sóc → ghép xe
3. Kho → thu mua/thẩm định → chi phí → ký gửi
4. Vốn góp/vay → công thức → quyết toán
5. Bán → thu chi → thu cũ đổi mới → bàn giao
6. Dashboard/báo cáo → hậu mãi → hoa hồng → nghiệm thu

Ngoài phạm vi khi chưa được yêu cầu: đa doanh nghiệp, app native, cổng người góp vốn, đọc nhóm Zalo, AI định giá, kết nối ngân hàng/kế toán, đồng bộ gara.

## Yêu cầu bổ sung đã chốt

| Ngày | Yêu cầu | Nguồn |
|---|---|---|
| 01/10/2026 | Cập nhật tiến độ trong repository sau mỗi chặng | Anh Kỳ, tin nhắn khởi tạo |

## Giả định khi triển khai (cần anh Kỳ xác nhận nếu sai)

Chi tiết lý do ở `DECISIONS.md`.

- Một khách có thể chỉ có một số điện thoại chính; số thứ hai ghi vào ghi chú (đủ cho chặng 2).
- Nhân viên được thêm hãng/model mới khi nhập nhanh (không phải chờ quản lý tạo danh mục).
- "Lâu chưa cập nhật" = 14 ngày không có hoạt động.
- Ngân sách linh hoạt được coi là "gần phù hợp" khi lệch tối đa 10%.
- Mặc định khi nhập nhu cầu mua, tiêu chí bắt buộc là hãng/model; người nhập bỏ chọn được.
- Sales được chia sẻ nhu cầu của mình cho đồng nghiệp để hỗ trợ (đồng nghiệp xem + ghi nhật ký, không sửa tiêu chí).
