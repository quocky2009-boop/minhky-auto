# Văn phòng ảo 3D — cài trên MK AI Server (Ubuntu)

Mã nguồn: https://github.com/vinaichatbot-rgb/van-phong-ao-3d (đã đọc HUONG-DAN-CHO-AGENT.md).
Văn phòng chỉ đọc nhật ký `~/.claude` (và `~/.codex`) của CHÍNH máy nó chạy; không cần khóa API.
Vì vậy Claude Code phải chạy trên cùng máy chủ, cùng tài khoản Linux với văn phòng.

## 1. Cài đặt (một lần)

```bash
node -v   # cần >= 18; nếu thiếu, cài Node.js LTS trước
git clone https://github.com/vinaichatbot-rgb/van-phong-ao-3d.git ~/van-phong-ao-3d
cd ~/van-phong-ao-3d
node setup.js --yes --project "<thư mục minhky-auto trên máy chủ>" \
  --title "Văn phòng Minh Kỳ Auto" --owner "Chủ tịch"
```

Đoạn luật đội đã nằm sẵn trong CLAUDE.md/AGENTS.md của repo (dùng `$HOME/van-phong-ao-3d`,
nên thư mục cài phải là `~/van-phong-ao-3d` của tài khoản chạy Claude Code).

## 2. Tự chạy khi khởi động (systemd)

`/etc/systemd/system/van-phong-ao.service` (thay `USER`):

```ini
[Unit]
Description=Van phong ao 3D
After=network.target

[Service]
User=USER
WorkingDirectory=/home/USER/van-phong-ao-3d
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now van-phong-ao
curl -s http://127.0.0.1:7788/state | head -c 200
```

## 3. Xem từ điện thoại qua Tailscale (không mở ra Internet)

Mở `http://<tên-máy-tailscale>:7788` trên điện thoại đã đăng nhập Tailscale.
Không cần cloudflared. Nếu đặt `accessKey` thì không in vào git/log/chat.

## 4. Dùng hằng ngày

- Chạy Claude Code trong thư mục dự án, trong `tmux` để phiên không mất khi tắt SSH.
- Đặt tên phiên trùng tên vai trong `data/DOI-NGU.md` (`/rename Quản lý`).
- Xem lệnh sổ điều phối: `node ~/van-phong-ao-3d/tools/vp.js giup`.
- Sao lưu: thư mục `~/van-phong-ao-3d/data` (sổ điều phối) — không nằm trong git của dự án.

Trạng thái: chưa chạy trên máy chủ thật; mới thử trong container tạm của phiên cloud.
