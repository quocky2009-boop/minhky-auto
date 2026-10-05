"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseConvertForm, parseExtendForm, parseReserveForm } from "@/lib/reservations";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  reserve_hold: "Đã giữ xe.", reserve_deposit: "Đã ghi đặt cọc. Số tiền cọc là số thỏa thuận; tiền thực nhận ghi ở phần thu chi.",
  release: "Đã nhả giữ xe. Xe trở lại trạng thái đang bán.", cancel_deposit: "Đã hủy cọc. Xe trở lại trạng thái đang bán.",
  extend: "Đã gia hạn giữ xe.", convert: "Đã chuyển giữ xe thành đặt cọc.", release_expired: "Đã nhả các giữ xe hết hạn.",
};

/** Một action cho mọi thao tác giữ xe/đặt cọc. Quyền và luật độc quyền do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function reservationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const canSell = !!user && user.active && user.roles.some((r) => r === "admin" || r === "manager" || r === "sales");
  if (!user || !user.active || !canSell) return { ok: false, message: "Anh/chị không có quyền giữ xe hoặc đặt cọc." };
  const intent = String(fd.get("intent") ?? "");
  const vehicleId = String(fd.get("vehicle_id") ?? "");
  if (!UUID.test(vehicleId)) return { ok: false, message: "Thiếu thông tin xe." };
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  const reason = String(fd.get("reason") ?? "").trim();
  const supabase = await createClient();
  let error: unknown = null;
  const needRow = () => UUID.test(id) && Number.isInteger(version);

  let key = intent;
  switch (intent) {
    case "reserve": {
      const p = parseReserveForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      key = `reserve_${p.payload.kind}`;
      ({ error } = await supabase.rpc("reserve_vehicle", { p: p.payload }));
      break;
    }
    case "release":
      if (!needRow()) return { ok: false, message: "Thiếu thông tin giữ xe." };
      if (!reason) return { ok: false, message: "Ghi lý do nhả giữ xe.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("release_reservation", { p_id: id, p_version: version, p_reason: reason }));
      break;
    case "cancel_deposit":
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được hủy cọc." };
      if (!needRow()) return { ok: false, message: "Thiếu thông tin đặt cọc." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy cọc.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("cancel_deposit", { p_id: id, p_version: version, p_reason: reason }));
      break;
    case "extend": {
      if (!needRow()) return { ok: false, message: "Thiếu thông tin giữ xe." };
      const p = parseExtendForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("extend_hold", { p_id: id, p_version: version, p_valid_until: p.payload.valid_until }));
      break;
    }
    case "convert": {
      if (!needRow()) return { ok: false, message: "Thiếu thông tin giữ xe." };
      const p = parseConvertForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("convert_hold_to_deposit", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    case "release_expired":
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được nhả giữ xe hết hạn hàng loạt." };
      ({ error } = await supabase.rpc("release_expired_holds"));
      break;
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${vehicleId}`);
  return { ok: true, message: DONE[key] };
}
