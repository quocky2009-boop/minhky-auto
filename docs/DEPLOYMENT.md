# Triển khai, cấu hình và sao lưu

> Trạng thái 01/10/2026: **chưa triển khai lên Supabase/Vercel thật.** Chưa có project Supabase riêng cho showroom
> (hai project hiện có `minhky-ev`, `minhky-parts-ai` thuộc hệ thống khác — không dùng). Chờ anh Kỳ duyệt tạo project.

## 1. Môi trường

Nên có hai project Supabase: **staging** (thử nghiệm, được nạp dữ liệu demo) và **production** (dữ liệu thật, không bao giờ chạy seed demo).
Vùng đề xuất: Southeast Asia (Singapore) cho độ trễ thấp từ Việt Nam.

Biến môi trường (mẫu trong `.env.example`):

| Biến | Nơi dùng | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | trình duyệt + máy chủ | URL project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | trình duyệt + máy chủ | Khóa công khai; mọi truy cập vẫn bị RLS chặn theo người dùng |
| `SUPABASE_SECRET_KEY` | **chỉ máy chủ** | Chỉ để mời nhân viên. Không đặt tiền tố `NEXT_PUBLIC_`. Không dán vào chat/tài liệu |
| `NEXT_PUBLIC_SITE_URL` | máy chủ | Địa chỉ app, dùng trong email mời |

## 2. Thiết lập project Supabase (làm lần lượt)

1. **Áp migrations** theo thứ tự tên file trong `supabase/migrations/` (Supabase CLI `supabase db push`, hoặc dán từng file vào SQL Editor).
   Áp ở staging trước, kiểm tra, rồi mới áp production.
2. **Auth → Providers → Email:** bật Email; tắt "Allow new users to sign up" (tài khoản do admin mời, không tự đăng ký).
3. **Auth → URL Configuration:** Site URL = địa chỉ app; thêm Redirect URL `https://<địa-chỉ-app>/auth/confirm`.
4. **Auth → Email Templates** — app xác thực bằng `token_hash`, nên sửa liên kết trong hai mẫu:
   - *Invite user:* `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/doi-mat-khau`
   - *Reset password:* `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/doi-mat-khau`
5. **Admin đầu tiên:** Authentication → Users → Add user (email + mật khẩu tạm), rồi sửa email trong
   `supabase/bootstrap/first_admin.sql` và chạy trong SQL Editor. Đăng nhập app → đổi mật khẩu.
6. **Nhân viên:** admin vào *Cài đặt → Người dùng & vai trò* để mời (cần `SUPABASE_SECRET_KEY` trên máy chủ), gán vai trò, khóa khi nghỉ việc.
7. **Storage:** bucket `demand-files` được migration tạo ở chế độ riêng tư, giới hạn 20 MB/tệp. Không đổi sang public.
8. **(Chỉ staging) dữ liệu demo:** trong SQL Editor chạy `set minhky.allow_demo = 'yes';` rồi dán `supabase/seed/demo_staging.sql`
   trong cùng một lần chạy. Script tự chặn nếu thiếu dòng `set`, và không nạp lại lần hai. Dữ liệu demo có tiền tố `[DEMO]`, SĐT giả `0900 000 xxx`.

## 3. Vercel

1. Import repository GitHub; framework Next.js, lệnh build mặc định.
2. Khai báo biến môi trường riêng cho Preview (trỏ staging) và Production (trỏ production).
3. Deploy Preview → kiểm tra theo danh sách mục 5 → mới promote Production.

## 4. Sao lưu và khôi phục

- **Database:** gói Supabase trả phí có sao lưu hằng ngày (Pro: 7 ngày; PITR là tùy chọn trả thêm). Gói Free **không** có sao lưu
  tự động phù hợp cho dữ liệu kinh doanh → production nên dùng gói trả phí. Ngoài ra nên xuất định kỳ ra nơi khác:
  `supabase db dump --linked -f backup_$(date +%F).sql` (schema + dữ liệu) và lưu ngoài Supabase (ổ công ty/Google Drive có mã hóa).
- **Storage:** sao lưu của Supabase **không gồm tệp trong Storage**. Cần định kỳ tải bucket `demand-files` ra nơi khác
  (Supabase CLI `supabase storage cp -r ss:///demand-files ./backup-files --experimental` hoặc script dùng secret key chạy trên máy chủ công ty).
- **Diễn tập khôi phục** (ít nhất mỗi quý): khôi phục bản dump vào project staging, kiểm tra số khách/nhu cầu/tệp khớp, ghi kết quả vào `docs/PROGRESS.md`.
- Lệnh và đường dẫn trên cần kiểm tra lại với phiên bản Supabase CLI và gói dịch vụ thực tế khi thiết lập — chưa được chạy thử trên hạ tầng thật.

## 5. Kiểm tra sau mỗi lần triển khai

- Đăng nhập bằng một tài khoản mỗi vai trò; menu đúng quyền.
- Sales A không mở được nhu cầu của sales B bằng cách dán đường dẫn trực tiếp (phải ra trang "không tìm thấy").
- Tạo nhu cầu từ điện thoại; bấm Lưu hai lần không sinh trùng.
- Tải tệp lên một nhu cầu; đường dẫn tệp hết hạn sau 10 phút; người ngoài quyền không mở được.
- Supabase Dashboard → Advisors (Security, Performance) không có cảnh báo mức ERROR.
