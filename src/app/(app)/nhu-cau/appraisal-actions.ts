"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseAppraisalForm } from "@/lib/appraisal";
import type { ActionState } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** intent: save | approve | reject | reopen. Duyệt = lưu nội dung đang nhập rồi duyệt, để quyết định áp dụng đúng điều đang thấy trên màn hình. */
export async function appraisalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || !isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được ghi thẩm định và duyệt mua." };
  const demandId = String(fd.get("demand_id") ?? "");
  const intent = String(fd.get("intent") ?? "save");
  if (!UUID.test(demandId)) return { ok: false, message: "Thiếu nhu cầu." };
  const supabase = await createClient();
  const decide = async (decision: string, p: Record<string, unknown> = {}) =>
    supabase.rpc("decide_appraisal", { p_demand_id: demandId, p_decision: decision, p });

  if (intent === "reopen") {
    const { error } = await decide("reopen");
    if (error) return { ok: false, message: friendlyError(error) };
  } else if (intent === "reject") {
    const reason = String(fd.get("reason") ?? "").trim();
    if (!reason) return { ok: false, message: "Ghi lý do không duyệt mua.", fieldErrors: { reason: "Bắt buộc" } };
    const { error } = await decide("reject", { reason });
    if (error) return { ok: false, message: friendlyError(error) };
  } else {
    const parsed = parseAppraisalForm(fd);
    if (!parsed.ok) return { ok: false, message: parsed.error, fieldErrors: parsed.fieldErrors };
    const version = Number(fd.get("version"));
    const save = await supabase.rpc("save_appraisal", { p_demand_id: demandId, p: parsed.payload, p_version: Number.isInteger(version) && version > 0 ? version : null });
    if (save.error) return { ok: false, message: friendlyError(save.error) };
    if (intent === "approve") {
      const { error } = await decide("approve", { approved_max_price: parsed.approvedMax });
      if (error) return { ok: false, message: friendlyError(error) };
    }
  }
  revalidatePath(`/nhu-cau/${demandId}`);
  return { ok: true, message: intent === "approve" ? "Đã duyệt mua." : intent === "reject" ? "Đã ghi không duyệt mua." : intent === "reopen" ? "Đã mở lại thẩm định." : "Đã lưu thẩm định (nháp)." };
}
