"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager, canSeeFinance } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseAccountForm, parseVoucherForm } from "@/lib/cashbook";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  post: "Đã ghi phiếu. Phiếu không sửa được; sai thì hủy (quản lý) rồi ghi lại.",
  void: "Đã hủy phiếu. Phiếu vẫn được lưu để tra cứu.",
  create_account: "Đã lập tài khoản tiền.", toggle_account: "Đã cập nhật tài khoản tiền.",
};

/** Một action cho mọi thao tác thu chi. Quyền và mọi luật tiền do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function cashAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || !canSeeFinance(user.roles)) return { ok: false, message: "Anh/chị không có quyền thao tác thu chi." };
  const intent = String(fd.get("intent") ?? "");
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  const supabase = await createClient();
  let error: unknown = null;

  switch (intent) {
    case "post": {
      const p = parseVoucherForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("post_voucher", { p: p.payload }));
      break;
    }
    case "void": {
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được hủy phiếu thu/chi." };
      const reason = String(fd.get("reason") ?? "").trim();
      if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin phiếu." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy phiếu.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("void_voucher", { p_id: id, p_version: version, p_reason: reason }));
      break;
    }
    case "create_account": {
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được lập tài khoản tiền." };
      const p = parseAccountForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_money_account", { p: p.payload }));
      break;
    }
    case "toggle_account": {
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được sửa tài khoản tiền." };
      if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin tài khoản." };
      ({ error } = await supabase.rpc("update_money_account", { p_id: id, p_version: version, p: { is_active: String(fd.get("is_active")) === "true" } }));
      break;
    }
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath("/thu-chi");
  revalidatePath("/don-ban");
  return { ok: true, message: DONE[intent] };
}
