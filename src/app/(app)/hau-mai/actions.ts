"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { parseCaseForm, parseCommitmentForm, parseEventForm, parseNextForm } from "@/lib/aftersales";
import { parseCostCreate } from "@/lib/costs";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  commitment: "Đã ghi cam kết/bảo hành.", commitment_void: "Đã hủy cam kết/bảo hành.", next: "Đã cập nhật việc tiếp theo.", event: "Đã ghi nhật ký.",
  resolve: "Đã đóng phiếu: xử lý xong.", reopen: "Đã mở lại phiếu.", cancel: "Đã hủy phiếu.", cost: "Đã ghi chi phí sau bán (dự kiến). Kế toán xác nhận số thực tế ở trang xe.",
};

/** Một action cho mọi thao tác hậu mãi. Quyền, chuyển trạng thái, gợi ý bảo hành và liên kết chi phí do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function aftersalesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || user.roles.length === 0) return { ok: false, message: "Anh/chị không có quyền thao tác hậu mãi." };
  const intent = String(fd.get("intent") ?? "");
  const supabase = await createClient();

  if (intent === "case_create") {
    const p = parseCaseForm(fd);
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    const { data, error } = await supabase.rpc("create_aftersales_case", { p: p.payload });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/hau-mai");
    redirect(`/hau-mai/${data as string}?da-tao=1`);
  }
  if (intent === "commitment") {
    const p = parseCommitmentForm(fd);
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    const { error } = await supabase.rpc("create_aftersales_commitment", { p: p.payload });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/don-ban");
    return { ok: true, message: DONE.commitment };
  }
  if (intent === "commitment_void") {
    const id = String(fd.get("id") ?? ""), version = Number(fd.get("version"));
    if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin cam kết." };
    const { error } = await supabase.rpc("void_aftersales_commitment", { p_id: id, p_version: version, p_reason: String(fd.get("reason") ?? "").trim() });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/don-ban");
    return { ok: true, message: DONE.commitment_void };
  }
  if (intent === "event") {
    const p = parseEventForm(fd);
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    const { error } = await supabase.rpc("add_aftersales_event", { p: p.payload });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath(`/hau-mai/${(p.payload as { case_id: string }).case_id}`);
    return { ok: true, message: DONE.event };
  }
  if (intent === "cost") {
    // chi phí sau bán: loại cố định, gắn phiếu và xe của phiếu (database kiểm đúng xe)
    const caseId = String(fd.get("case_id") ?? ""), vehicleId = String(fd.get("vehicle_id") ?? "");
    if (!UUID.test(caseId) || !UUID.test(vehicleId)) return { ok: false, message: "Thiếu thông tin phiếu." };
    const copy = new FormData();
    for (const [k, v] of fd.entries()) copy.set(k, v);
    copy.set("category", "after_sales");
    const p = parseCostCreate(copy, String(fd.get("business_type") ?? "") === "consignment" ? "consignment" : "owned");
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    const { error } = await supabase.rpc("create_vehicle_cost", { p: { ...p.payload, vehicle_id: vehicleId, aftersales_case_id: caseId } });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath(`/hau-mai/${caseId}`);
    return { ok: true, message: DONE.cost };
  }

  const id = String(fd.get("id") ?? ""), version = Number(fd.get("version"));
  if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin phiếu." };
  let error: unknown = null;
  switch (intent) {
    case "next": {
      const p = parseNextForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("update_aftersales_case", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    case "resolve": {
      const text = String(fd.get("resolution") ?? "").trim();
      if (!text) return { ok: false, message: "Ghi kết quả xử lý trước khi đóng phiếu.", fieldErrors: { resolution: "Ghi kết quả xử lý" } };
      ({ error } = await supabase.rpc("resolve_aftersales_case", { p_id: id, p_version: version, p_resolution: text }));
      break;
    }
    case "reopen": {
      const p = parseNextForm(fd);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("reopen_aftersales_case", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    case "cancel": {
      const reason = String(fd.get("reason") ?? "").trim();
      if (!reason) return { ok: false, message: "Ghi lý do hủy phiếu.", fieldErrors: { reason: "Ghi lý do hủy" } };
      ({ error } = await supabase.rpc("cancel_aftersales_case", { p_id: id, p_version: version, p_reason: reason }));
      break;
    }
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/hau-mai/${id}`);
  revalidatePath("/hau-mai");
  return { ok: true, message: DONE[intent] ?? "Đã lưu." };
}
