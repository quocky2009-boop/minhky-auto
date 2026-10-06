# MINH KỲ AUTO — App quản lý nội bộ showroom ô tô

Quản lý khách, nhu cầu mua/bán xe, kho xe, ký gửi, góp vốn theo xe, thu cũ đổi mới cho Showroom Minh Kỳ Auto (TP Tuyên Quang).
Đặc tả gốc: [`CLAUDE.md`](CLAUDE.md). Tiến độ hiện tại: [`docs/PROGRESS.md`](docs/PROGRESS.md).
**Làm việc với Claude Code** (cài đặt, bàn giao bối cảnh, quy tắc an toàn khi tự chủ push/migrate): [`docs/CLAUDE_CODE.md`](docs/CLAUDE_CODE.md).

**Trạng thái (05/10/2026):** chặng 1–2 và chặng 3 (lát 1–3: kho xe, thẩm định + duyệt mua, chi phí chuẩn bị xe) đã có mã, test và đã áp lên Supabase `minhky-auto`; app chạy trên Vercel.
Lát 4 (hợp đồng ký gửi) đã có mã, test và đã áp lên Supabase. Ảnh/video gắn với xe có mã, test và đã áp lên Supabase (chưa thử tải thật qua trình duyệt). Chặng 4 lát 1 (vốn góp, điều khoản chia lợi nhuận, cho vay) có mã, test và đã áp lên Supabase. Chặng 5 lát 1 (giữ xe/đặt cọc độc quyền) có mã và test, migration 1400 đã áp lên Supabase (06/10/2026). Chặng 5 lát 2 (báo giá có phiên bản + duyệt giảm giá) có mã và test, migration 1500 đã áp lên Supabase (06/10/2026). Chặng 5 lát 4 (thu chi: tài khoản tiền, phiếu thu/chi, cọc thực nhận/hoàn, công nợ đơn bán, trang `/thu-chi`) có mã và test, migration 1700 đã áp lên Supabase (06/10/2026). Chặng 5 lát 5 (thu cũ đổi mới: hồ sơ liên kết đơn bán + xe cũ, đối trừ, xe cũ còn vay) có mã và test, migration 1800 đã áp lên Supabase (06/10/2026). Chặng 5 lát 3 (đơn bán nhiều xe + hợp đồng bán, trang `/don-ban`) có mã và test, migration 1600 đã áp lên Supabase (06/10/2026). Chặng 5 lát 6 (bàn giao xe và hồ sơ, trang `/ban-giao`) có mã và test, migration 1900 chưa áp lên Supabase. Còn lại: quyết toán chia lợi nhuận/phí ký gửi, quyết toán, chặng 6. Menu của phân hệ chưa làm hiện mờ, không có nút giả. Chi tiết: `docs/PROGRESS.md`.

## Công nghệ

Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage, RLS) · Vercel.
Tiền VND lưu `numeric(18,0)`, xử lý bằng `bigint` — không dùng số thực. Múi giờ nghiệp vụ Asia/Ho_Chi_Minh, ngày dd/MM/yyyy.

## Chạy trên máy dev

```bash
npm install
cp .env.example .env.local      # điền URL + publishable key của project Supabase THỬ NGHIỆM
npm run dev                     # http://localhost:3000
```

Cấu hình Supabase (migration, tài khoản admin đầu tiên, mẫu email mời): xem [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Lệnh kiểm tra

| Lệnh | Việc |
|---|---|
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit test nghiệp vụ (tiền, SĐT, ghép xe, chia lợi nhuận, trạng thái) |
| `npm run test:db` | Tạo lại database test cục bộ rồi chạy test RLS/constraint/RPC trên PostgreSQL thật |
| `npm run build` | Build production |

`test:db` cần PostgreSQL 16 cục bộ và biến `PGHOST/PGPORT/PGUSER` + `TEST_DATABASE_URL` (ví dụ trong `.env.example`).
Script chỉ chạy với database có tên chứa `test` và dùng lớp giả lập `supabase/local/00_supabase_stub.sql` — **không bao giờ trỏ vào Supabase thật**.

## Cấu trúc

```
supabase/migrations/   Schema, RLS, RPC, Storage — áp theo thứ tự tên file
supabase/bootstrap/    Tạo admin đầu tiên (chạy 1 lần)
supabase/seed/         Dữ liệu demo — CHỈ cho project thử nghiệm, có khóa an toàn
supabase/local/        Giả lập auth/storage để test trên Postgres thường
src/lib/               Nghiệp vụ thuần (money, phone, matching, profit-split, demands/*) — có unit test
src/app/(app)/         Các màn hình sau đăng nhập; quyền vào trang lấy từ src/lib/modules.ts
tests/unit, tests/db   Unit test và test database thật
docs/                  Yêu cầu, kiến trúc, quy tắc nghiệp vụ, phân quyền, tiến độ, quyết định, triển khai
```

## Nguyên tắc bảo mật chính

Quyền được thực thi ở database (RLS + hàm kiểm tra vai trò từ bảng `user_roles`), không dựa vào việc ẩn nút trên giao diện,
không dựa vào `user_metadata`. Giá vốn/giá sàn nằm ở bảng riêng mà sales không đọc được. Tệp đính kèm nằm trong bucket riêng tư,
chỉ mở qua đường dẫn có hạn 10 phút. Chi tiết: [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md).
