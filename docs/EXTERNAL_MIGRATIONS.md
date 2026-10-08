# Migration xuất từ Supabase vào repository (09/10/2026)

Supabase `minhky-auto` có **14 migration do công cụ/phiên ngoài repository tạo** (hệ thống "AI định giá thu mua"). Theo yêu cầu của Chủ tịch (09/10/2026) SQL đã được xuất
nguyên văn từ `supabase_migrations.schema_migrations` vào `supabase/migrations/` để lịch sử migration trong git đầy đủ và dựng lại được database giống production
(CLAUDE.md §10: không để mã nguồn lệch database).

> **KHÔNG áp lại các file này lên Supabase `minhky-auto`** — production đã có. Chúng chỉ để dựng database cục bộ/staging và làm lịch sử.

## Đối chiếu

| File trong repo | Phiên bản trên Supabase | Nội dung |
|---|---|---|
| `…002700_appraisal_ai_valuation_tables_v1` | 20261005075753 | 4 bảng: lần chạy (`appraisal_ai_runs`), tin rao so sánh, bằng chứng giá xe mới, quyết định đề xuất |
| `…002800_appraisal_ai_valuation_security_v1` | 20261005075803 | RLS (đọc theo quyền xem nhu cầu), chỉ SELECT cho người đăng nhập, audit |
| `…002900_appraisal_ai_valuation_views_v1` | 20261005075811 | view `appraisal_ai_latest`, `appraisal_ai_input_context` (security invoker) |
| `…003000_valuation_agent_rpc_comparables_v1` | 20261005154325 | RPC ghi tin rao so sánh (xác thực bằng token) |
| `…003100_valuation_agent_rpc_write_v1` | 20261005154351 | RPC ghi bằng chứng giá xe mới, quyết định, đánh dấu lỗi |
| `…003200_appraisal_ai_runs_demand_fk_hardening_v1` | 20261005155537 | bỏ `on delete cascade` của khóa ngoại lần chạy |
| `…003300_appraisal_ai_evidence_fk_hardening_v1` | 20261005155543 | bỏ `on delete cascade` ở bảng bằng chứng/quyết định |
| `…003400_appraisal_ai_append_only_privileges_v1` | 20261005155553 | `service_role` không xóa/sửa bằng chứng (chỉ thêm) |
| `…003500_valuation_agent_token_auth_v1` | 20261005155633 | hàm xác thực token agent (**băm đã được che**, xem dưới) |
| `…003600_valuation_agent_rpc_case_run_v1` | 20261005155640 | RPC đọc hồ sơ xe cần định giá, tạo lần chạy |
| `…003700_appraisal_ai_decision_guardrails_v1` | 20261005155935 | ràng buộc: đề xuất giá cần kinh tế đủ; khoảng giá đúng thứ tự |
| `…003800_valuation_agent_disable_public_rpc_v1` | 20261005160047 | **thu hồi quyền gọi của `anon` trên 6 RPC** |
| `…003900_mk_auto_acquisition_policy_v1_governance` | 20261006060259 | 3 cấu hình trong `app_settings`: lãi gộp mục tiêu 8–10%, giữ xe thường 30 ngày, không tự trừ % rủi ro (ghi "Owner approved 2026-10-06") |
| `…004000_appraisal_ai_map_policy_arithmetic_guards_v1` | 20261008085735 | ràng buộc số học của giá thu mua đề xuất (MAP): lãi mục tiêu 8–10% giá bán lẻ kỳ vọng, MAP = bán lẻ − chi phí − lãi (±1 đồng), chào ≤ mục tiêu ≤ MAP |

Hai migration làm cứng quyền của đợt nghiệm thu được đổi số cho đúng thứ tự trên production: `…002500_views_readonly` → `…004100_views_readonly`, `…002600_no_delete_truncate` → `…004200_no_delete_truncate` (trên Supabase chúng đã chạy SAU các migration trên).

## Đã kiểm chứng

- Cả 14 file **khớp từng ký tự** (bỏ khoảng trắng) với SQL đang lưu trên Supabase; ngoại lệ duy nhất là chuỗi băm token (dưới đây). Kiểm bằng so sánh md5 trực tiếp trong database.
- Dựng lại toàn bộ database cục bộ từ repository (1 → 4200) và `npm run test:db` đạt **171/171**; `tests/db/security-baseline.test.ts` kiểm thêm: không ai ngoài chủ hàm/`service_role` gọi được các hàm `valuation_agent_*`, bảng `appraisal_ai_*` chỉ SELECT cho người đăng nhập, bản dựng từ repo từ chối mọi token.

## Lưu ý bảo mật

1. **Chuỗi băm token agent đã bị che** trong `…003500`: bản trên Supabase lưu SHA-256 của token ngay trong thân hàm. Repository công khai nên không đưa vật liệu xác thực vào git. Hệ quả: database dựng từ repo từ chối mọi token (an toàn); production giữ nguyên giá trị thật. **Đề nghị**: khi bật lại agent, chuyển sang lưu băm trong bảng/secret (không nằm trong mã hàm) và **đổi token** vì băm từng nằm trong lịch sử migration của Supabase.
2. **Hiện không có đường gọi nào cho agent**: `…003800` đã thu hồi quyền `anon`, các RPC không còn gọi được từ Data API bằng khóa công khai (đã kiểm: `anon` và `authenticated` không có quyền thực thi trên mọi hàm `valuation_agent_*`). Agent chỉ chạy được qua khóa dịch vụ phía máy chủ.
3. **Ứng dụng chưa dùng các bảng này**: không có màn hình hay mã `src/` nào đọc `appraisal_ai_*` hoặc `valuation_*`. Đề xuất giá của AI "không bao giờ tự ghi" vào giá thu mua đã duyệt (ghi chú trong cột `recommended_map_vnd`), phù hợp CLAUDE.md §5 (AI trích xuất/định giá chỉ là phần mở rộng có bước xác nhận).
4. Các cấu hình `valuation_*` trong `app_settings` là chính sách do Chủ tịch duyệt (06/10/2026), nằm ngoài các quyết định D1–D97 của ứng dụng — nên được ghi vào `docs/DECISIONS.md` khi Chủ tịch xác nhận phạm vi dùng.

## Quy tắc từ nay

Mọi thay đổi database đi qua file trong `supabase/migrations/` rồi mới áp; không chỉnh trực tiếp trên Supabase bằng công cụ khác. Nếu công cụ/phiên ngoài vẫn tạo migration,
chạy lại truy vấn đối chiếu (`select version, name from supabase_migrations.schema_migrations`) sau mỗi đợt và xuất bổ sung theo cách trên.
