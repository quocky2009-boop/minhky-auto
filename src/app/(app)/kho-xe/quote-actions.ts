"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseQuoteForm } from "@/lib/quotes";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  create: "Đã lập báo giá. Nếu giá thấp hơn mức cho phép, phiên bản chờ quản lý duyệt trước khi báo cho khách.",
  revise: "Đã lập phiên bản báo giá mới. Bản trước được thay thế.",
  approve: "Đã duyệt phiên bản báo giá.", reject: "Đã từ chối phiên bản báo giá.",
  accept: "Đã ghi khách chấp nhận báo giá. Đây chưa phải đơn bán hay thu tiền.", cancel: "Đã hủy báo giá.",
};

/** Một action cho mọi thao tác báo giá. Quyền, giá sàn và duyệt giảm giá do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function quoteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const canSell = !!user && user.active && user.roles.some((r) => r === "admin" || r === "manager" || r === "sales");
  if (!user || !user.active || !canSell) return { ok: false, message: "Anh/chị không có quyền lập hoặc xử lý báo giá." };
  const intent = String(fd.get("intent") ?? "");
  const vehicleId = String(fd.get("vehicle_id") ?? "");
  if (!UUID.test(vehicleId)) return { ok: false, message: "Thiếu thông tin xe." };
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  const versionId = String(fd.get("version_id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  const supabase = await createClient();
  let error: unknown = null;
  const needQuote = () => UUID.test(id) && Number.isInteger(version);

  const key = intent;
  switch (intent) {
    case "create": {
      const p = parseQuoteForm(fd, "create");
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("create_quote", { p: p.payload }));
      break;
    }
    case "revise": {
      if (!needQuote()) return { ok: false, message: "Thiếu thông tin báo giá." };
      const p = parseQuoteForm(fd, "revise");
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("revise_quote", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    case "approve":
    case "reject":
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý/admin được duyệt hoặc từ chối giá báo thấp hơn mức cho phép." };
      if (!UUID.test(versionId)) return { ok: false, message: "Thiếu phiên bản báo giá." };
      if (!reason) return { ok: false, message: "Ghi lý do duyệt hoặc từ chối.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("decide_quote_version", { p_id: versionId, p_approve: intent === "approve", p_reason: reason }));
      break;
    case "accept":
      if (!needQuote() || !UUID.test(versionId)) return { ok: false, message: "Thiếu thông tin báo giá." };
      ({ error } = await supabase.rpc("accept_quote", { p_id: id, p_version: version, p_version_id: versionId }));
      break;
    case "cancel":
      if (!needQuote()) return { ok: false, message: "Thiếu thông tin báo giá." };
      if (!reason) return { ok: false, message: "Ghi lý do hủy báo giá.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("cancel_quote", { p_id: id, p_version: version, p_reason: reason }));
      break;
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${vehicleId}`);
  return { ok: true, message: DONE[key] };
}
