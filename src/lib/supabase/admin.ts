import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client quyền máy chủ (secret key) — CHỈ dùng phía server cho việc mời/tạo tài khoản.
 * Không bao giờ import từ client component. Không log khóa.
 */
export function hasAdminKey() {
  return !!process.env.SUPABASE_SECRET_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Chưa cấu hình SUPABASE_SECRET_KEY trên máy chủ.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
