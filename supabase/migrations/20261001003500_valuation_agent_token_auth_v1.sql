-- =====================================================================
-- MIGRATION XUẤT TỪ SUPABASE VÀO REPOSITORY (09/10/2026) — KHÔNG ÁP LẠI LÊN SUPABASE `minhky-auto`
-- Đã được áp trên Supabase với phiên bản 20261005155633 (tên "valuation_agent_token_auth_v1") bởi công cụ/phiên ngoài repository.
-- Nội dung SQL dưới đây là bản sao nguyên văn từ supabase_migrations.schema_migrations, chỉ để (1) lịch sử migration đầy đủ trong git và
-- (2) dựng được database cục bộ/staging giống production. Xem docs/EXTERNAL_MIGRATIONS.md.
-- =====================================================================

-- LƯU Ý KHI XUẤT: bản trên Supabase chứa chuỗi băm SHA-256 của token agent. Để không đưa vật liệu xác thực vào repository (công khai),
-- chuỗi băm ở đây được thay bằng chỗ giữ chỗ. Hàm trong database dựng từ repository sẽ KHÔNG xác thực token nào (an toàn: từ chối tất cả);
-- production giữ nguyên bản có giá trị thật. Đặt lại giá trị bằng migration riêng khi dựng môi trường dùng agent.
create or replace function private.valuation_agent_authorized(p_token text)
returns boolean language sql immutable security definer set search_path='' as $$
 select pg_catalog.encode(extensions.digest(coalesce(p_token,''::text),'sha256'::text),'hex'::text)
 = '__REDACTED_SHA256_OF_AGENT_TOKEN__'
$$;
revoke all on function private.valuation_agent_authorized(text) from public, anon, authenticated;
