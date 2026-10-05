"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseContractForm, parseReturnForm, parseSignForm, parseTermsForm } from "@/lib/consignment";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  create: "Đã lập hợp đồng ký gửi (đang soạn).", update: "Đã lưu hợp đồng.", add_terms: "Đã thêm phiên bản thỏa thuận.", sign_terms: "Đã ghi ngày chủ xe ký.",
  activate: "Đã kích hoạt hợp đồng. Xe có thể chào bán.", cancel: "Đã hủy hợp đồng nháp.", return: "Đã lập biên bản trả xe cho chủ xe.",
};

/** Một action cho mọi thao tác hợp đồng ký gửi. Chỉ quản lý/admin ghi; quyền thật do database thực thi (RLS + trigger). */
export async function consignmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || !isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được thao tác hợp đồng ký gửi." };
  const intent = String(fd.get("intent") ?? "");
  const vehicleId = String(fd.get("vehicle_id") ?? "");
  if (!UUID.test(vehicleId)) return { ok: false, message: "Thiếu thông tin xe." };
  const contractId = String(fd.get("contract_id") ?? "");
  const version = Number(fd.get("version"));
  const needContract = () => UUID.test(contractId) && Number.isInteger(version);
  const supabase = await createClient();
  let error: unknown = null;

  switch (intent) {
    case "create": {
      const p = parseContractForm(fd, "create");
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_consignment_contract", { p: p.payload }));
      break;
    }
    case "update": {
      if (!needContract()) return { ok: false, message: "Thiếu thông tin hợp đồng." };
      const p = parseContractForm(fd, "update");
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("update_consignment_contract", { p_id: contractId, p_version: version, p: p.payload }));
      break;
    }
    case "add_terms": {
      if (!UUID.test(contractId)) return { ok: false, message: "Thiếu thông tin hợp đồng." };
      const p = parseTermsForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("add_consignment_terms", { p_contract_id: contractId, p: p.payload }));
      break;
    }
    case "sign_terms": {
      const termsId = String(fd.get("terms_id") ?? "");
      if (!UUID.test(termsId)) return { ok: false, message: "Thiếu thông tin thỏa thuận." };
      const p = parseSignForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("confirm_consignment_terms", { p_terms_id: termsId, p_signed_on: p.payload.signed_on, p_agreement_ref: p.payload.agreement_ref || null }));
      break;
    }
    case "activate":
      if (!needContract()) return { ok: false, message: "Thiếu thông tin hợp đồng." };
      ({ error } = await supabase.rpc("activate_consignment_contract", { p_id: contractId, p_version: version }));
      break;
    case "cancel": {
      if (!needContract()) return { ok: false, message: "Thiếu thông tin hợp đồng." };
      const reason = String(fd.get("reason") ?? "").trim();
      if (!reason) return { ok: false, message: "Ghi lý do hủy hợp đồng.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("cancel_consignment_contract", { p_id: contractId, p_version: version, p_reason: reason }));
      break;
    }
    case "return": {
      if (!needContract()) return { ok: false, message: "Thiếu thông tin hợp đồng." };
      const p = parseReturnForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("return_consignment_vehicle", { p_id: contractId, p_version: version, p: p.payload }));
      break;
    }
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${vehicleId}`);
  return { ok: true, message: DONE[intent] };
}
