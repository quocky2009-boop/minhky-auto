"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseCreateForm, parseLossForm, parseReviseForm } from "@/lib/settlements";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  check: "Đã kiểm tra quyết toán.", approve: "Đã phê duyệt quyết toán. Có thể lập phiếu chi/thu theo từng nghĩa vụ ở phần Thu chi.",
  cancel: "Đã hủy quyết toán.", loss: "Đã ghi cách xử lý hòa vốn/lỗ và số hoàn vốn.",
};

/** Một action cho mọi thao tác quyết toán. Số tiền, điều kiện và quyền do database thực thi; kiểm tra ở đây để báo lỗi sớm. */
export async function settlementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.active || !canSeeFinance(user.roles)) return { ok: false, message: "Anh/chị không có quyền thao tác quyết toán." };
  const intent = String(fd.get("intent") ?? "");
  const supabase = await createClient();

  if (intent === "create") {
    const p = parseCreateForm(fd);
    if (!p.ok) return { ok: false, message: p.error };
    const { data, error } = await supabase.rpc("create_settlement", { p: p.payload });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/quyet-toan");
    redirect(`/quyet-toan/${data as string}?da-tao=1`);
  }
  if (intent === "revise") {
    if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được lập điều chỉnh quyết toán." };
    const p = parseReviseForm(fd);
    if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
    const { data, error } = await supabase.rpc("revise_settlement", { p: p.payload });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/quyet-toan");
    redirect(`/quyet-toan/${data as string}?da-tao=1`);
  }

  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin quyết toán." };
  let error: unknown = null;
  switch (intent) {
    case "check":
      ({ error } = await supabase.rpc("check_settlement", { p_id: id, p_version: version }));
      break;
    case "approve":
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý/admin được phê duyệt quyết toán." };
      ({ error } = await supabase.rpc("approve_settlement", { p_id: id, p_version: version }));
      break;
    case "cancel": {
      const reason = String(fd.get("reason") ?? "").trim();
      if (!reason) return { ok: false, message: "Ghi lý do hủy quyết toán.", fieldErrors: { reason: "Bắt buộc" } };
      ({ error } = await supabase.rpc("cancel_settlement", { p_id: id, p_version: version, p_reason: reason }));
      break;
    }
    case "loss": {
      if (!isManager(user.roles)) return { ok: false, message: "Chỉ quản lý ghi cách xử lý hòa vốn/lỗ." };
      const partyIds = fd.getAll("party_id").map(String).filter((x) => UUID.test(x));
      const p = parseLossForm(fd, partyIds);
      if (!p.ok) return { ok: false, message: p.error, fieldErrors: p.fieldErrors };
      ({ error } = await supabase.rpc("set_settlement_loss", { p_id: id, p_version: version, p: p.payload }));
      break;
    }
    default:
      return { ok: false, message: "Thao tác không hợp lệ." };
  }
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/quyet-toan/${id}`);
  revalidatePath("/quyet-toan");
  return { ok: true, message: DONE[intent] };
}
