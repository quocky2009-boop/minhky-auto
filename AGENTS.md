<!-- Đoạn này dán vào cuối AGENTS.md (Codex) và CLAUDE.md (Claude Code) của DỰ ÁN, để mọi phiên AI làm theo cùng một cách và văn phòng ảo hiện đúng. -->
## Văn phòng ảo và sổ điều phối của đội

Đội làm việc trong một văn phòng ảo; chủ văn phòng xem ở http://localhost:7788. Mọi sổ của đội nằm ở `$HOME/van-phong-ao-3d/data` và chỉ ghi bằng công cụ:

```
node "$HOME/van-phong-ao-3d/tools/vp.js" <lệnh>        (xem đủ lệnh: node "$HOME/van-phong-ao-3d/tools/vp.js" giup)
```

- **Đọc trước khi làm:** nội quy `$HOME/van-phong-ao-3d/data/NOI-QUY.md`, đội ngũ `$HOME/van-phong-ao-3d/data/DOI-NGU.md`, việc ưu tiên `node "$HOME/van-phong-ao-3d/tools/vp.js" viec ds`.
- **Tên phiên = tên vai** trong DOI-NGU.md (Claude Code: `/rename <vai>`; Codex: đặt tên thread). Văn phòng và hòm thư nhận người theo tên này.
- **Cuối mỗi lượt:** `node "$HOME/van-phong-ao-3d/tools/vp.js" tiep --toi "<vai của mình>"`. Còn tin thì làm, xong chạy `node "$HOME/van-phong-ao-3d/tools/vp.js" xong <mã> --ghi-chu "<kết quả 1 dòng>"` rồi `tiep` lại; hết tin mới dừng. Tin trùng hay hết hiệu lực cũng đóng bằng `xong`.
- **Giao việc cho người khác:** `node "$HOME/van-phong-ao-3d/tools/vp.js" gui --toi "<vai>" --tu "<vai mình>" "[VIỆC] …"`. Không gửi tin chỉ để báo.
- **Cần chủ văn phòng quyết** (production, tiền, khóa mới, xóa dữ liệu, đổi luật): `node "$HOME/van-phong-ao-3d/tools/vp.js" cananh hoi --tu "<vai mình>" "…" --lua-chon "a / b"`. Việc khác trong quyền thì tự quyết.
- **Lên DEV:** `node "$HOME/van-phong-ao-3d/tools/vp.js" luot cho|lay|nha …`. Mỗi lúc một người giữ lượt, xong phải nhả kèm kết quả (`--ket-qua dat|hong`, có tiền AI thì `--usd`).
- **Gói việc và tiến độ:** `node "$HOME/van-phong-ao-3d/tools/vp.js" goi dat|sua|ghichu …`, `node "$HOME/van-phong-ao-3d/tools/vp.js" tiendo <gói> "…"`. Trước khi nghỉ hoặc bị nén ngữ cảnh: `node "$HOME/van-phong-ao-3d/tools/vp.js" tiendo <gói> "…" --dang-do --vai "<vai>"`.
- **Bị chặn:** ghi `[CHẶN]` ở câu trả lời (văn phòng tô đỏ) và giao người gỡ được.
- **Bài học:** lỗi mới mất ≥ 20 phút thì `node "$HOME/van-phong-ao-3d/tools/vp.js" baihoc --the "<thẻ>" "…" --chan "cái chặn tự động"`.
