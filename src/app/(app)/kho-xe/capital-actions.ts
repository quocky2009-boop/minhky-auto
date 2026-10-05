"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseEntryForm, parseLoanForm, parseLoanPaymentForm, parsePartyForm, parseTermsForm } from "@/lib/capital";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Thao tác chỉ quản lý; kế toán chỉ ghi tiền thực nhận/rút vốn/trả nợ (database kiểm tra lại từng loại). */
const MANAGER_ONLY = new Set(["party_create", "terms_create", "terms_approve", "terms_discard", "reconfirm", "entry_void", "loan_add", "loan_void", "loan_pay_void"]);
const DONE: Record<string, string> = {
  party_create: "Đã thêm bên góp vốn.", terms_create: "Đã lưu bản nháp điều khoản (chưa có hiệu lực cho đến khi duyệt).", terms_approve: "Đã duyệt điều khoản; bản cũ (nếu có) chuyển thành đã thay thế.",
  terms_discard: "Đã hủy bản nháp.", reconfirm: "Đã xác nhận lại căn cứ phân chia.", entry_add: "Đã ghi sổ vốn góp.", entry_void: "Đã hủy dòng sổ vốn góp (vẫn giữ lại để đối chiếu).",
  loan_add: "Đã ghi khoản cho vay.", loan_void: "Đã hủy khoản vay.", loan_pay: "Đã ghi thanh toán khoản vay.", loan_pay_void: "Đã hủy thanh toán.",
};

/** Một action cho mọi thao tác vốn góp/cho vay của xe. Quyền thật do database thực thi (RLS + trigger); kiểm tra ở đây để báo lỗi sớm. */
export async function capitalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || !canSeeFinance(user.roles)) return { ok: false, message: "Anh/chị không có quyền xem hoặc ghi vốn góp." };
  const intent = String(fd.get("intent") ?? "");
  if (MANAGER_ONLY.has(intent) && !isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được thực hiện thao tác này." };
  const vehicleId = String(fd.get("vehicle_id") ?? "");
  if (!UUID.test(vehicleId)) return { ok: false, message: "Thiếu thông tin xe." };
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  const reason = String(fd.get("reason") ?? "").trim();
  const supabase = await createClient();
  let error: unknown = null;
  const need = (cond: boolean) => (cond ? null : ({ ok: false, message: "Thiếu thông tin thao tác." } as ActionState));
  let bad: ActionState | null = null;

  switch (intent) {
    case "party_create": {
      const p = parsePartyForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_capital_party", { p: p.payload }));
      break;
    }
    case "terms_create": {
      const p = parseTermsForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_capital_terms", { p: p.payload }));
      break;
    }
    case "terms_approve":
      bad = need(UUID.test(id) && Number.isInteger(version)); if (bad) return bad;
      ({ error } = await supabase.rpc("approve_capital_terms", { p_id: id, p_version: version }));
      break;
    case "terms_discard":
      bad = need(UUID.test(id) && Number.isInteger(version)); if (bad) return bad;
      if (!reason) return { ok: false, message: "Ghi lý do hủy bản nháp.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("discard_capital_terms", { p_id: id, p_version: version, p_reason: reason }));
      break;
    case "reconfirm": {
      bad = need(UUID.test(id) && Number.isInteger(version)); if (bad) return bad;
      const note = String(fd.get("note") ?? "").trim();
      if (!note) return { ok: false, message: "Ghi vì sao tỷ lệ chia vẫn đúng sau khi vốn thay đổi.", fieldErrors: { note: "Bắt buộc" } };
      ({ error } = await supabase.rpc("reconfirm_capital_basis", { p_id: id, p_version: version, p_note: note }));
      break;
    }
    case "entry_add": {
      const p = parseEntryForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("record_capital_entry", { p: p.payload }));
      break;
    }
    case "entry_void":
      bad = need(UUID.test(id)); if (bad) return bad;
      if (!reason) return { ok: false, message: "Ghi lý do hủy.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("void_capital_entry", { p_id: id, p_reason: reason }));
      break;
    case "loan_add": {
      const p = parseLoanForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_vehicle_loan", { p: p.payload }));
      break;
    }
    case "loan_void":
      bad = need(UUID.test(id)); if (bad) return bad;
      if (!reason) return { ok: false, message: "Ghi lý do hủy khoản vay.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("void_vehicle_loan", { p_id: id, p_reason: reason }));
      break;
    case "loan_pay": {
      const p = parseLoanPaymentForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("record_loan_payment", { p: p.payload }));
      break;
    }
    case "loan_pay_void":
      bad = need(UUID.test(id)); if (bad) return bad;
      if (!reason) return { ok: false, message: "Ghi lý do hủy thanh toán.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("void_loan_payment", { p_id: id, p_reason: reason }));
      break;
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${vehicleId}`);
  return { ok: true, message: DONE[intent] };
}
