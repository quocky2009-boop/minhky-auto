# Làm việc với Claude Code (bàn giao từ phiên trò chuyện claude.ai)

Tài liệu này dành cho **người dùng** (cách cài đặt) và cho **Claude Code** (bối cảnh, quy tắc an toàn khi làm việc tự chủ).
Nguồn thông tin cài đặt: tài liệu chính thức https://code.claude.com/docs/en/quickstart (kiểm tra ngày 01/10/2026; lệnh cài đặt có thể thay đổi, luôn đối chiếu trang đó).

## 1. Mục tiêu

Claude Code chạy trực tiếp trên máy của anh Kỳ, trong thư mục dự án: đọc/sửa mã, chạy test, commit, **tự `git push` lên GitHub**. Vercel thấy commit mới thì tự deploy. Không còn chuyển file zip bằng tay.

## 2. Ba cách dùng (chọn một)

| Cách | Hợp với | Ghi chú |
|---|---|---|
| **Ứng dụng máy tính Claude Code (Desktop)** | Người không quen dòng lệnh | Không cần terminal. Xem https://code.claude.com/docs/en/desktop |
| **Terminal (CLI)** | Làm việc nhiều, linh hoạt nhất | Bản cài chính thức, tự cập nhật |
| **Web (claude.ai/code)** | Không muốn cài gì | Chạy trên máy chủ của Anthropic, đẩy code qua GitHub. Đang ở dạng research preview; chưa kiểm chứng việc chạy test database và Supabase từ môi trường này |

Khuyến nghị cho dự án này: **Desktop hoặc CLI trên máy anh**, vì cần chạy test database (PostgreSQL) và kết nối Supabase.
Cần có gói Claude Pro, Max, Team hoặc Enterprise (hoặc tài khoản Claude Console có trả tiền theo mức dùng).

## 3. Cài đặt (CLI)

- **Windows (PowerShell):** `irm https://claude.ai/install.ps1 | iex` — hoặc `winget install Anthropic.ClaudeCode`. Nên cài thêm **Git for Windows** (https://git-scm.com/downloads/win).
- **macOS / Linux / WSL:** `curl -fsSL https://claude.ai/install.sh | bash` — hoặc `brew install --cask claude-code`.
- Mở cửa sổ terminal mới, chạy `claude --version` (phải in ra số phiên bản). Báo `claude` không tìm thấy → xem https://code.claude.com/docs/en/troubleshoot-install
- Chạy `claude` trong thư mục dự án; lần đầu sẽ mở trình duyệt để đăng nhập tài khoản Claude.

## 4. Chuẩn bị máy để chạy được dự án

1. **Git** (đã nêu ở trên) và tài khoản GitHub đăng nhập được (xem mục 5).
2. **Node.js 22** (`node -v` phải ra v22.x). Sau đó `npm install` trong thư mục dự án.
3. **PostgreSQL 16** (chỉ để chạy `npm run test:db`): cài bản chính thức, đảm bảo có lệnh `psql`. Tạo biến môi trường rồi chạy:
   ```
   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=<mật khẩu>   # tùy máy
   TEST_DATABASE_URL=postgresql://postgres:<mật khẩu>@localhost:5432/minhky_test
   npm run test:db        # tự tạo lại database tên có chữ "test" rồi chạy test
   ```
   Script chỉ chạy với database có tên chứa `test` và dùng lớp giả lập `supabase/local/00_supabase_stub.sql`. **Không bao giờ trỏ vào Supabase thật.**
   Script là bash: trên Windows dùng Git Bash hoặc WSL. Chưa kiểm chứng trên Windows; Claude Code sẽ tự xử lý khi gặp lỗi.
4. Tạo `.env.local` từ `.env.example` (mục 7). File này đã được `.gitignore` chặn.

## 5. Đẩy code lên GitHub (làm một lần)

- **Windows:** Git for Windows có sẵn Git Credential Manager — lần `git push` đầu tiên sẽ mở trình duyệt để đăng nhập GitHub.
- **macOS / Linux:** cài GitHub CLI (`brew install gh` hoặc theo https://cli.github.com) rồi chạy `gh auth login`.
- **Lần đẩy bù đầu tiên:** repo trên GitHub hiện thiếu các commit của chặng 3. Giải nén file zip bàn giao vào một thư mục (ví dụ `C:\minhky-auto`), mở Claude Code trong thư mục đó và nhờ: *"Kiểm tra git status, rồi git push origin main lên GitHub."* (zip đã có sẵn đủ lịch sử commit; nếu `origin` chưa có thì thêm `https://github.com/quocky2009-boop/minhky-auto.git`).
- Từ đó về sau chỉ làm việc trong thư mục này; không cần zip nữa.

## 6. Kết nối Supabase cho Claude Code

Cách khuyến nghị — **Supabase MCP, giới hạn đúng một project** (nếu không giới hạn, MCP truy cập được mọi tổ chức/project trong tài khoản Supabase, kể cả hai project cũ không liên quan):

```
claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=fawbojbquxfjxbmhwlxm"
```
Rồi chạy `claude`, gõ `/mcp` và hoàn tất đăng nhập OAuth trên trình duyệt. Thêm `&read_only=true` vào URL nếu chỉ muốn cho phép đọc.
Tham số `project_ref` là mã của project `minhky-auto` (ap-southeast-1). Nguồn: https://supabase.com/docs/guides/ai-tools/mcp

Lưu ý về migration: các migration 0100–1000 đã được áp lên Supabase bằng công cụ MCP nên **mã phiên bản trong lịch sử migration của Supabase khác tên file** trong `supabase/migrations/` (quyết định D18). Nếu dùng `supabase db push`/`supabase link`, phải chạy `supabase migration repair` trước. Cách đơn giản nhất: tiếp tục áp migration bằng MCP (`apply_migration`).

## 7. Biến môi trường

Xem `.env.example`. Giá trị công khai (an toàn để biết): `NEXT_PUBLIC_SUPABASE_URL=https://fawbojbquxfjxbmhwlxm.supabase.co` và khóa `sb_publishable_…` lấy ở Supabase → Project Settings → API.
`SUPABASE_SECRET_KEY` chỉ khai trong Vercel/`.env.local`, **không dán vào chat, không commit**.

## 8. Quy tắc an toàn khi để Claude Code làm việc tự chủ

1. **Vercel đang deploy production từ nhánh `main`.** Push thẳng lên `main` = đưa lên bản đang chạy. Khuyến nghị: Claude Code làm việc trên nhánh riêng (`git switch -c <tên>`), push nhánh đó (Vercel tạo bản xem thử Preview), anh xem rồi mới gộp vào `main`. Tạm thời nếu anh cho phép push thẳng `main` thì ghi rõ trong yêu cầu.
2. **Chỉ có một database Supabase (production, chưa có dữ liệu thật tại thời điểm 01/10/2026).** Trước khi anh nhập khách thật: chạy test cục bộ trước, áp migration lên Supabase **chỉ sau khi test đạt**, và không bao giờ viết migration xóa/đổi kiểu dữ liệu đang có dữ liệu thật mà chưa hỏi anh. Khi có dữ liệu thật nên tạo thêm project staging.
3. **Không bao giờ thao tác trên project Supabase khác** `fawbojbquxfjxbmhwlxm` (hai project `minhky-ev`, `minhky-parts-ai` thuộc hệ thống khác).
4. **Không commit bí mật:** `.env*` (trừ `.env.example`), khóa bí mật, bản dump, dữ liệu khách. Rà `git diff --staged` trước khi commit.
5. **Chi phí:** không tạo project/branch Supabase hay dịch vụ tính phí khi chưa hỏi anh.
6. Làm đúng `CLAUDE.md`: cập nhật `docs/PROGRESS.md` và `docs/DECISIONS.md` sau mỗi chặng; không tuyên bố hoàn tất khi chưa chạy kiểm tra thật; mục "chờ xác nhận" là việc của anh Kỳ, không tự quyết.
7. Mặc định Claude Code có thể tự chạy lệnh mà không hỏi từng bước. Những ngày đầu nên dùng chế độ hỏi trước khi chạy lệnh (nhấn `Shift+Tab` để đổi chế độ) và xem lại các lệnh `git push`, áp migration.

## 9. Trạng thái bàn giao (01/10/2026)

- **Đã xong:** chặng 1–2 (nền tảng, khách, nhu cầu mua/bán, lọc, nhắc việc, ghép xe); chặng 3 lát 1 (kho xe, vòng sở hữu theo VIN, nhập kho từ nhu cầu bán), lát 2 (thẩm định có checklist + duyệt mua, không ngưỡng giá), lát 3 (chi phí chuẩn bị xe: dự kiến / đã xác nhận / đã thanh toán); lát 4 (hợp đồng ký gửi — có mã + test ngày 05/10/2026, **chưa áp migration 1100 lên Supabase**).
- **Đã triển khai:** Supabase `minhky-auto` (đã áp migrations 0100–1000), Vercel `minhky-auto.vercel.app`, admin: tài khoản chủ.
- **Kiểm tra gần nhất (05/10/2026):** `npm test` 77/77, typecheck/lint/build sạch; `npm run test:db` 73/75 (2 test cũ cần chạy bằng vai trò `postgres` — xem PROGRESS "Chưa xác minh"); lần 01/10 là 61/61.
- **Việc tiếp theo:** (1) anh Kỳ xem lát 4 rồi quyết định áp migration `1100` lên Supabase; (2) chặng 3 còn: ảnh/tệp gắn với xe, giao diện quản lý danh mục; (3) chặng 4 (vốn góp/vay, công thức chia lợi nhuận — thư viện `src/lib/profit-split.ts` đã có, chưa có bảng điều khoản).
  Đã chốt 05/10/2026: phí ký gửi = số tiền cố định hoặc % trên giá bán (D30); chi phí phát sinh xe ký gửi không cần chủ xe duyệt (D31). **Chờ anh Kỳ:** định nghĩa "giá bán" để tính % phí (đã/chưa trừ giảm giá, thuế, lệ phí).
- **Quyết định tạm chờ xác nhận:** xem `docs/DECISIONS.md` các mục ghi "Tạm" (D7, D8, D9, D11, D12, D20 phần người duyệt, D22, D24, D26, D27, D32 phần điều kiện kích hoạt, D33, D35).
- **Ghi chú vận hành:** Vercel Hobby (miễn phí) không dùng cho mục đích thương mại; khi nhập khách thật cần Vercel Pro và Supabase Pro (sao lưu). Repo đang công khai (đã rà không lộ bí mật).

## 10. Câu mở đầu mẫu cho phiên Claude Code đầu tiên

> Đọc CLAUDE.md, README và docs/CLAUDE_CODE.md, docs/PROGRESS.md. Kiểm tra git status và nhánh hiện tại. Chạy `npm install`, `npm run typecheck`, `npm test` để xác nhận môi trường. Sau đó push các commit chưa có trên GitHub (origin/main) và cho tôi biết kết quả. Chưa làm tính năng mới cho đến khi tôi xác nhận.

## 11. Lỗi thường gặp

- `claude` không nhận lệnh sau khi cài → mở terminal mới; xem mục PATH trong trang troubleshoot-install ở trên.
- `git push` bị từ chối/đòi mật khẩu → chưa đăng nhập GitHub (mục 5); GitHub không nhận mật khẩu thường khi đẩy bằng HTTPS, dùng Git Credential Manager hoặc `gh auth login`.
- `npm run test:db` báo không kết nối được → PostgreSQL chưa chạy hoặc biến `PG*` / `TEST_DATABASE_URL` chưa đặt.
- Vercel deploy lỗi → xem Deployments → bấm bản lỗi → đọc dòng lỗi; thiếu biến môi trường là nguyên nhân phổ biến.
