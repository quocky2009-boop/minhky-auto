"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseConfirm, parseCostCreate, parseCostUpdate, parsePayment } from "@/lib/costs";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGER_ONLY = new Set(["update", "approve", "unapprove", "void"]);
const DONE: Record<string, string> = {
  add: "Đã thêm khoản chi phí (dự kiến).", update: "Đã lưu thay đổi (nếu đổi dự toán, cần duyệt lại).", approve: "Đã duyệt dự toán.", unapprove: "Đã bỏ duyệt dự toán.",
  confirm: "Đã xác nhận chi phí thực tế.", void: "Đã hủy khoản chi phí.", pay: "Đã ghi thanh toán.", void_payment: "Đã hủy thanh toán.",
};

/** Một action cho mọi thao tác chi phí; `intent` quyết định thao tác. Quyền thật do database thực thi — kiểm tra ở đây chỉ để báo lỗi sớm. */
export async function costAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || !canSeeFinance(user.roles)) return { ok: false, message: "Anh/chị không có quyền ghi chi phí xe." };
  const intent = String(fd.get("intent") ?? "");
  if (MANAGER_ONLY.has(intent) && !isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được thực hiện thao tác này." };
  const vehicleId = String(fd.get("vehicle_id") ?? "");
  if (!UUID.test(vehicleId)) return { ok: false, message: "Thiếu thông tin xe." };
  const supabase = await createClient();
  const { data: veh } = await supabase.from("vehicles").select("business_type").eq("id", vehicleId).maybeSingle();
  if (!veh) return { ok: false, message: "Không tìm thấy xe hoặc anh/chị không có quyền xem xe này." };
  const costId = String(fd.get("cost_id") ?? "");
  const version = Number(fd.get("version"));
  const reason = String(fd.get("reason") ?? "").trim();
  const needCost = () => UUID.test(costId) && Number.isInteger(version);
  let error: unknown = null;

  switch (intent) {
    case "add": {
      const p = parseCostCreate(fd, veh.business_type);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_vehicle_cost", { p: p.payload }));
      break;
    }
    case "update": {
      if (!needCost()) return { ok: false, message: "Thiếu thông tin khoản chi phí." };
      const p = parseCostUpdate(fd, veh.business_type);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("update_vehicle_cost", { p_id: costId, p_version: version, p: p.payload }));
      break;
    }
    case "approve":
    case "unapprove":
      if (!needCost()) return { ok: false, message: "Thiếu thông tin khoản chi phí." };
      ({ error } = await supabase.rpc("approve_vehicle_cost", { p_id: costId, p_version: version, p_approve: intent === "approve" }));
      break;
    case "confirm": {
      if (!needCost()) return { ok: false, message: "Thiếu thông tin khoản chi phí." };
      const p = parseConfirm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("confirm_vehicle_cost", { p_id: costId, p_version: version, p: p.payload }));
      break;
    }
    case "void":
      if (!needCost()) return { ok: false, message: "Thiếu thông tin khoản chi phí." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy khoản chi phí.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("void_vehicle_cost", { p_id: costId, p_version: version, p_reason: reason }));
      break;
    case "pay": {
      const p = parsePayment(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("record_cost_payment", { p: p.payload }));
      break;
    }
    case "void_payment": {
      const pid = String(fd.get("payment_id") ?? "");
      if (!UUID.test(pid)) return { ok: false, message: "Thiếu thông tin thanh toán." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy thanh toán.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("void_cost_payment", { p_id: pid, p_reason: reason }));
      break;
    }
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${vehicleId}`);
  return { ok: true, message: DONE[intent] };
}
