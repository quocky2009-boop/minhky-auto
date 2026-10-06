"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { parseOrderForm } from "@/lib/sales-orders";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  update: "Đã lưu đơn bán nháp.",
  confirm: "Đã xác nhận đơn bán (đã ký hợp đồng). Xe chuyển sang trạng thái “đã bán”. Tiền thu ở phần thu chi (chưa làm).",
  cancel: "Đã hủy đơn bán.",
};

/** Một action cho mọi thao tác đơn bán. Quyền, độc quyền xe và duyệt giá thấp do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function orderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const canSell = !!user && user.active && user.roles.some((r) => r === "admin" || r === "manager" || r === "sales");
  if (!user || !user.active || !canSell) return { ok: false, message: "Anh/chị không có quyền lập hoặc xử lý đơn bán." };
  const intent = String(fd.get("intent") ?? "");
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  const reason = String(fd.get("reason") ?? "").trim();
  const supabase = await createClient();
  const needOrder = () => UUID.test(id) && Number.isInteger(version);

  if (intent === "create") {
    const p = parseOrderForm(fd, "create");
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    const { data, error } = await supabase.rpc("create_sales_order", { p: p.payload });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/don-ban");
    redirect(`/don-ban/${data as string}?da-tao=1`);
  }
  if (!needOrder()) return { ok: false, message: "Thiếu thông tin đơn bán." };
  let error: unknown = null;
  switch (intent) {
    case "update": {
      const p = parseOrderForm(fd, "update");
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("update_sales_order_draft", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    case "confirm": {
      const contractRef = String(fd.get("contract_ref") ?? "").trim(), contractDate = String(fd.get("contract_date") ?? "").trim();
      const approval = String(fd.get("approval_reason") ?? "").trim();
      const errs: Record<string, string> = {};
      if (!contractRef) errs.contract_ref = "Nhập số hợp đồng bán";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(contractDate)) errs.contract_date = "Nhập ngày ký hợp đồng";
      if (Object.keys(errs).length) return { ok: false, message: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
      ({ error } = await supabase.rpc("confirm_sales_order", { p_id: id, p_version: version, p: { contract_ref: contractRef, contract_date: contractDate, approval_reason: approval } }));
      break;
    }
    case "cancel":
      if (!reason) return { ok: false, message: "Ghi lý do hủy đơn bán.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("cancel_sales_order", { p_id: id, p_version: version, p_reason: reason }));
      break;
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/don-ban/${id}`);
  revalidatePath("/don-ban");
  return { ok: true, message: DONE[intent] };
}
