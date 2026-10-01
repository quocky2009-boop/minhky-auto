-- =====================================================================
-- MINH KỲ AUTO — 0700 Siết quyền thực thi hàm trong schema private
-- Phát hiện khi kiểm tra trên Supabase thật: hàm tạo SAU câu REVOKE ở migration 0100 vẫn mang quyền EXECUTE mặc định của PUBLIC.
-- Schema private đã thu hồi USAGE của PUBLIC nên anon chưa gọi được; migration này bỏ nốt quyền thừa (phòng thủ nhiều lớp).
-- =====================================================================
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public, anon;
