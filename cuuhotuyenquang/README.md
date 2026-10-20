# Website cứu hộ ô tô Gara Minh Kỳ – Tuyên Quang (PHP)

Landing page + Dashboard nội bộ cho `cuuhotuyenquang.vn` / `.com`. PHP 8.1+ thuần, không cần Composer, chạy trên hosting PHP + MySQL (hoặc SQLite để thử).

## Tính năng
- **Landing page**: Hero kêu gọi gọi hotline, nút Gọi/Zalo lớn, thanh liên lạc cố định dưới màn hình điện thoại (Gọi / Zalo / Gọi lại), nút nổi trên máy tính, dịch vụ, quy trình, khu vực, nhật ký cứu hộ, tin tức, FAQ, form "Gọi lại cho tôi" (chống spam: ô bẫy, token ký, giới hạn 5 lần/giờ/IP). SEO: meta, Open Graph, JSON-LD, sitemap.xml, robots.txt.
- **Dashboard** `/admin/`:
  | Vai trò | Quyền |
  |---|---|
  | Admin | Sửa toàn bộ nội dung landing page, quản lý tài khoản, đăng/xóa mọi bài |
  | Marketing | Sửa/duyệt/đăng/xóa mọi bài, xem khách xin gọi lại |
  | Nhân viên | Viết nhật ký/tin của mình (nháp hoặc gửi chờ duyệt), không tự đăng, không sửa bài đã đăng |
- Bài viết có 2 loại: **Nhật ký cứu hộ** (kèm ngày, địa điểm, loại xe, dịch vụ) và **Tin tức**; tải ảnh lên (JPG/PNG/WebP ≤ 5MB, kiểm tra nội dung thật).

## Cài lên hosting
1. Tạo database MySQL trong cPanel/DirectAdmin (ghi lại tên DB, user, mật khẩu).
2. Upload **toàn bộ nội dung thư mục `cuuhotuyenquang/`** vào `public_html` của tên miền chính (`.vn`). Đảm bảo `includes/` và `uploads/` ghi được (chmod 755/775).
3. Mở `https://cuuhotuyenquang.vn/install.php`, nhập thông tin DB và tài khoản Admin (mật khẩu ≥ 10 ký tự). **Làm ngay sau khi upload, rồi xóa `install.php`.**
4. Đăng nhập `/admin/login.php` → **Nội dung landing page**: nhập hotline, Zalo, địa chỉ thật.
5. Tên miền `.com`: trỏ cùng thư mục (addon/parked domain). `.htaccess` đã tự chuyển 301 `.com`/`www` về `https://cuuhotuyenquang.vn`. Cần cài SSL cho cả hai tên miền; `.htaccess` ép HTTPS.
6. Cần Apache có `mod_rewrite` (hầu hết hosting có). Nếu hosting dùng Nginx/LiteSpeed không đọc `.htaccess`, cần cấu hình rewrite tương đương (xem `.htaccess`).

## Chạy thử cục bộ
```bash
php -S 127.0.0.1:8080 -t cuuhotuyenquang cuuhotuyenquang/tests/dev-router.php
php cuuhotuyenquang/tests/run.php     # test hàm thuần
```
Mở `/install.php`, chọn SQLite.

## Lưu ý
- Số hotline mặc định là **số mẫu 0900 000 000** – Dashboard cảnh báo cho tới khi đổi.
- Toàn bộ nội dung mặc định (cam kết 24/7, khu vực, câu hỏi thường gặp...) là **nội dung mẫu**, cần chủ gara xác nhận đúng thực tế.
- Sao lưu: database (export phpMyAdmin) và thư mục `uploads/`; tệp `includes/config.php` chứa mật khẩu DB, không đưa lên git.
- Bảo mật đã có: prepared statements, CSRF, `password_hash`, khóa đăng nhập sau 8 lần sai/15 phút, phân quyền kiểm tra phía server (đọc lại vai trò mỗi request), escape đầu ra, chặn thực thi PHP trong `uploads/`, chặn truy cập `includes/`.
