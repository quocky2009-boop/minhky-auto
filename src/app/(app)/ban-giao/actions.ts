"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseDeliverForm, parseExceptionForm, parseItemForm } from "@/lib/handover";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  item: "Đã lưu mục checklist.", plan: "Đã lưu ngày hẹn/ghi chú.", deliver: "Đã ghi giao xe. Xe chuyển sang “đã giao”, kết thúc vòng sở hữu.",
  cancel: "Đã hủy bàn giao.", grant: "Đã ghi phê duyệt ngoại lệ.", revoke: "Đã thu hồi phê duyệt ngoại lệ.",
};

/** Một action cho mọi thao tác bàn giao. Quyền, điều kiện giao xe và phê duyệt ngoại lệ do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function handoverAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const canSell = !!user && user.active && user.roles.some((r) => r === "admin" || r === "manager" || r === "sales");
  if (!user || !user.active || !canSell) return { ok: false, message: "Anh/chị không có quyền thao tác bàn giao." };
  const intent = String(fd.get("intent") ?? "");
  const supabase = await createClient();

  if (intent === "create") {
    const requestId = String(fd.get("request_id") ?? ""), line = String(fd.get("order_line_id") ?? "");
    if (!UUID.test(requestId) || !UUID.test(line)) return { ok: false, message: "Phiên nhập không hợp lệ, tải lại trang." };
    const planned = String(fd.get("planned_on") ?? "").trim();
    const { data, error } = await supabase.rpc("create_handover", { p: { request_id: requestId, order_line_id: line, planned_on: planned, note: String(fd.get("note") ?? "").trim() } });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/ban-giao");
    redirect(`/ban-giao/${data as string}?da-tao=1`);
  }

  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  if (!UUID.test(id)) return { ok: false, message: "Thiếu thông tin bàn giao." };
  let error: unknown = null;
  switch (intent) {
    case "item": {
      const key = String(fd.get("template_key") ?? "");
      const itemVersion = Number(fd.get("item_version"));
      if (!/^[a-z0-9_]{2,40}$/.test(key) || !Number.isInteger(itemVersion)) return { ok: false, message: "Thiếu thông tin mục checklist." };
      const p = parseItemForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("update_handover_item", { p_handover: id, p_key: key, p_version: itemVersion, p: p.payload }));
      break;
    }
    case "plan":
      if (!Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin bàn giao." };
      ({ error } = await supabase.rpc("update_handover_plan", { p_id: id, p_version: version, p: { planned_on: String(fd.get("planned_on") ?? "").trim(), note: String(fd.get("note") ?? "").trim() } }));
      break;
    case "deliver": {
      if (!Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin bàn giao." };
      const p = parseDeliverForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("deliver_handover", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    case "cancel": {
      const reason = String(fd.get("reason") ?? "").trim();
      if (!Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin bàn giao." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy bàn giao.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("cancel_handover", { p_id: id, p_version: version, p_reason: reason }));
      break;
    }
    case "grant": {
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý/admin được phê duyệt ngoại lệ giao xe." };
      const p = parseExceptionForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("grant_handover_exception", { p: p.payload }));
      break;
    }
    case "revoke": {
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý/admin được thu hồi phê duyệt ngoại lệ." };
      const ex = String(fd.get("exception_id") ?? ""), reason = String(fd.get("reason") ?? "").trim();
      if (!UUID.test(ex)) return { ok: false, message: "Thiếu thông tin phê duyệt." };
      if (!reason) return { ok: false, message: "Ghi lý do thu hồi.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("revoke_handover_exception", { p_id: ex, p_reason: reason }));
      break;
    }
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/ban-giao/${id}`);
  revalidatePath("/ban-giao");
  return { ok: true, message: DONE[intent] };
}
