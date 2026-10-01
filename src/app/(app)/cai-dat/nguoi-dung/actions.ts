"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { ActionState } from "../../nhu-cau/actions";

const ROLES = ["admin", "manager", "accountant", "sales", "technician"];

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.roles.includes("admin")) throw new Error("Chỉ quản trị viên được quản lý người dùng.");
  return u;
}

/** Mời nhân viên qua email. Khóa bí mật chỉ dùng ở máy chủ; vai trò ghi vào user_roles (không dùng user_metadata). */
export async function inviteUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (!hasAdminKey()) return { ok: false, message: "Máy chủ chưa cấu hình SUPABASE_SECRET_KEY nên chưa mời được. Xem README mục cấu hình." };
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("full_name") ?? "").trim();
  const roles = fd.getAll("roles").map(String).filter((r) => ROLES.includes(r));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return { ok: false, message: "Nhập họ tên và email hợp lệ." };
  if (!roles.length) return { ok: false, message: "Chọn ít nhất một vai trò." };
  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, origin ? { redirectTo: `${origin}/doi-mat-khau` } : undefined);
  if (error || !data.user) return { ok: false, message: error?.message?.includes("already") ? "Email này đã có tài khoản." : "Không gửi được lời mời. Kiểm tra cấu hình email của Supabase." };
  const p = await admin.from("profiles").upsert({ id: data.user.id, full_name: name, is_active: true });
  if (p.error) return { ok: false, message: friendlyError(p.error) };
  const r = await admin.from("user_roles").upsert(roles.map((role) => ({ user_id: data.user!.id, role })), { ignoreDuplicates: true });
  if (r.error) return { ok: false, message: friendlyError(r.error) };
  revalidatePath("/cai-dat/nguoi-dung");
  return { ok: true, message: `Đã gửi lời mời tới ${email}.` };
}

/** Bật/tắt vai trò — dùng phiên của admin (RLS user_roles_admin_write), có audit ở database. */
export async function toggleRole(fd: FormData) {
  const me = await requireAdmin();
  const userId = String(fd.get("user_id"));
  const role = String(fd.get("role"));
  const on = fd.get("on") === "1";
  if (!ROLES.includes(role)) return;
  if (userId === me.id && role === "admin" && !on) return; // không tự gỡ quyền admin của chính mình
  const supabase = await createClient();
  if (on) await supabase.from("user_roles").upsert({ user_id: userId, role, granted_by: me.id }, { ignoreDuplicates: true });
  else await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
  revalidatePath("/cai-dat/nguoi-dung");
}

export async function setActive(fd: FormData) {
  const me = await requireAdmin();
  const userId = String(fd.get("user_id"));
  if (userId === me.id) return;
  const supabase = await createClient();
  await supabase.from("profiles").update({ is_active: fd.get("active") === "1" }).eq("id", userId);
  revalidatePath("/cai-dat/nguoi-dung");
}
