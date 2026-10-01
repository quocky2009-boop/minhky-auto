"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canUse } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { isPlausibleVnPhone } from "@/lib/phone";
import type { ActionState } from "../nhu-cau/actions";

/** Sửa thông tin khách có kiểm tra phiên bản: không ghi đè âm thầm khi hai người sửa cùng lúc. */
export async function updateCustomer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !canUse(user.roles, "customers")) return { ok: false, message: "Anh/chị không có quyền thực hiện thao tác này." };
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const id = s("id");
  const version = Number(s("version"));
  const errs: Record<string, string> = {};
  if (!s("full_name")) errs.full_name = "Nhập tên khách";
  if (s("phone") && !isPlausibleVnPhone(s("phone"))) errs.phone = "Số điện thoại chưa đúng định dạng";
  if (Object.keys(errs).length) return { ok: false, message: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers")
    .update({
      full_name: s("full_name"), phone: s("phone") || null, area: s("area") || null, address: s("address") || null,
      source_id: s("source_id") || null, notes: s("notes") || null,
    })
    .eq("id", id).eq("version", version).select("id");
  if (error) return { ok: false, message: friendlyError(error) };
  if (!data?.length) return { ok: false, message: "Khách vừa được người khác cập nhật (hoặc anh/chị không có quyền sửa). Tải lại trang để xem bản mới nhất." };
  revalidatePath(`/khach-hang/${id}`);
  return { ok: true, message: "Đã lưu." };
}
