"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseOffsetForm, parseTradeInForm } from "@/lib/trade-ins";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  create: "Đã lập hồ sơ thu cũ đổi mới (nháp). Xác nhận để bắt đầu đối trừ/chi tiền.", update: "Đã lưu hồ sơ nháp.", confirm: "Đã xác nhận hồ sơ thu cũ đổi mới.",
  cancel: "Đã hủy hồ sơ thu cũ đổi mới.", offset: "Đã xác nhận khoản đối trừ. Đây không phải tiền thật: số dư tài khoản không đổi.", void_offset: "Đã hủy khoản đối trừ.",
};

/** Một action cho mọi thao tác thu cũ đổi mới (chỉ quản lý). Các luật tiền do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function tradeInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || !isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được lập, xác nhận hoặc hủy hồ sơ thu cũ đổi mới và khoản đối trừ." };
  const intent = String(fd.get("intent") ?? "");
  const orderId = String(fd.get("order_id") ?? fd.get("return_order_id") ?? "");
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  const reason = String(fd.get("reason") ?? "").trim();
  const supabase = await createClient();
  let error: unknown = null;
  const needRow = () => UUID.test(id) && Number.isInteger(version);

  switch (intent) {
    case "create": {
      const p = parseTradeInForm(fd, "create");
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_trade_in", { p: p.payload }));
      break;
    }
    case "update": {
      if (!needRow()) return { ok: false, message: "Thiếu thông tin hồ sơ." };
      const p = parseTradeInForm(fd, "update");
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("update_trade_in_draft", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    case "confirm":
      if (!needRow()) return { ok: false, message: "Thiếu thông tin hồ sơ." };
      ({ error } = await supabase.rpc("confirm_trade_in", { p_id: id, p_version: version }));
      break;
    case "cancel":
      if (!needRow()) return { ok: false, message: "Thiếu thông tin hồ sơ." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy hồ sơ thu cũ đổi mới.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("cancel_trade_in", { p_id: id, p_version: version, p_reason: reason }));
      break;
    case "offset": {
      const p = parseOffsetForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("post_trade_in_offset", { p: p.payload }));
      break;
    }
    case "void_offset":
      if (!needRow()) return { ok: false, message: "Thiếu thông tin khoản đối trừ." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy khoản đối trừ.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("void_trade_in_offset", { p_id: id, p_version: version, p_reason: reason }));
      break;
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  if (UUID.test(orderId)) revalidatePath(`/don-ban/${orderId}`);
  revalidatePath("/thu-chi");
  return { ok: true, message: DONE[intent] };
}
