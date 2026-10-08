"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { parseCommissionPaymentForm, parseRuleForm } from "@/lib/commissions";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  rule: "Đã ghi quy tắc hoa hồng.", rule_void: "Đã hủy quy tắc.", recalc: "Đã tính lại theo quy tắc hiện hành.", approve: "Đã duyệt hoa hồng.",
  cancel: "Đã hủy khoản hoa hồng.", pay: "Đã ghi chi hoa hồng.", pay_void: "Đã hủy khoản chi.",
};

/** Một action cho mọi thao tác hoa hồng. Quyền, quy tắc áp dụng và chi trả do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function commissionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || user.roles.length === 0) return { ok: false, message: "Anh/chị không có quyền thao tác hoa hồng." };
  const intent = String(fd.get("intent") ?? "");
  const supabase = await createClient();
  let error: unknown = null;

  if (intent === "rule") {
    const p = parseRuleForm(fd);
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    ({ error } = await supabase.rpc("create_commission_rule", { p: p.payload }));
  } else if (intent === "pay") {
    const p = parseCommissionPaymentForm(fd);
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    ({ error } = await supabase.rpc("record_commission_payment", { p: p.payload }));
  } else if (intent === "pay_void") {
    const id = String(fd.get("id") ?? ""), reason = String(fd.get("reason") ?? "").trim();
    if (!UUID.test(id)) return { ok: false, message: "Thiếu thông tin khoản chi." };
    if (!reason) return { ok: false, message: "Ghi lý do hủy khoản chi.", fieldErrors: { reason: "Ghi lý do hủy" } };
    ({ error } = await supabase.rpc("void_commission_payment", { p_id: id, p_reason: reason }));
  } else {
    const id = String(fd.get("id") ?? ""), version = Number(fd.get("version"));
    if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin." };
    const reason = String(fd.get("reason") ?? "").trim();
    switch (intent) {
      case "recalc": ({ error } = await supabase.rpc("recalc_commission", { p_id: id, p_version: version })); break;
      case "approve": ({ error } = await supabase.rpc("approve_commission", { p_id: id, p_version: version })); break;
      case "cancel":
        if (!reason) return { ok: false, message: "Ghi lý do hủy khoản hoa hồng.", fieldErrors: { reason: "Ghi lý do hủy" } };
        ({ error } = await supabase.rpc("cancel_commission", { p_id: id, p_version: version, p_reason: reason }));
        break;
      case "rule_void":
        if (!reason) return { ok: false, message: "Ghi lý do hủy quy tắc.", fieldErrors: { reason: "Ghi lý do hủy" } };
        ({ error } = await supabase.rpc("void_commission_rule", { p_id: id, p_version: version, p_reason: reason }));
        break;
      default: return { ok: false, message: "Thao tác không hợp lệ." };
    }
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath("/hoa-hong");
  revalidatePath("/hoa-hong/quy-tac");
  return { ok: true, message: DONE[intent] ?? "Đã lưu." };
}
