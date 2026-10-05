"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canUse, isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseDemandForm } from "@/lib/demands/form";
import { fromLocalInput } from "@/lib/dates";
import { NEEDS_NEXT_ACTION } from "@/lib/labels";
import { buildAttachmentPath, validateAttachment } from "@/lib/attachments";

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> } | null;

async function guard() {
  const user = await getCurrentUser();
  if (!user || !user.active || !canUse(user.roles, "demands")) throw new Error("Anh/chị không có quyền thực hiện thao tác này.");
  return user;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Kiểm tra trùng SĐT trước khi tạo khách mới. */
export async function checkPhone(phone: string) {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_customers_by_phone", { p_phone: phone });
  if (error) return [];
  return (data ?? []) as { customer_id: string; code: string; display_name: string; owner_name: string | null; can_open: boolean }[];
}

/** Tạo nhu cầu. request_id do form giữ nguyên qua các lần bấm/thử lại -> không tạo trùng. */
export async function createDemand(fd: FormData): Promise<ActionState> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const parsed = parseDemandForm(fd, "create");
  if (!parsed.ok) return { ok: false, message: parsed.error, fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_demand", { p: parsed.payload });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath("/nhu-cau");
  revalidatePath("/viec-hom-nay");
  redirect(`/nhu-cau/${data as string}?da-tao=1`);
}

export async function updateDemand(fd: FormData): Promise<ActionState> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const id = str(fd, "id");
  const version = Number(str(fd, "version"));
  const kind = str(fd, "kind") as "buy" | "sell";
  if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin nhu cầu." };
  const parsed = parseDemandForm(fd, "update", kind);
  if (!parsed.ok) return { ok: false, message: parsed.error, fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_demand", { p_id: id, p_version: version, p: parsed.payload });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/nhu-cau/${id}`);
  redirect(`/nhu-cau/${id}?da-luu=1`);
}

/** Ghi nhật ký liên hệ, kèm (tùy chọn) chuyển trạng thái và hẹn việc tiếp theo — một giao dịch ở database. */
export async function logActivity(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const id = str(fd, "demand_id");
  const requestId = str(fd, "request_id");
  const content = str(fd, "content");
  const newStatus = str(fd, "new_status");
  const currentStatus = str(fd, "current_status");
  const reason = str(fd, "reason");
  const nextAction = str(fd, "next_action");
  let nextDue: string | null = null;
  const errs: Record<string, string> = {};
  try {
    nextDue = fromLocalInput(str(fd, "next_due"));
  } catch {
    errs.next_due = "Thời gian không hợp lệ";
  }
  if (!UUID.test(id) || !UUID.test(requestId)) return { ok: false, message: "Phiên nhập không hợp lệ, tải lại trang." };
  if (!content) errs.content = "Ghi nội dung đã trao đổi";
  if (!!nextAction !== !!nextDue) errs.next_due = "Việc tiếp theo và hạn thực hiện phải đi cùng nhau";
  const target = newStatus || currentStatus;
  if (NEEDS_NEXT_ACTION(target) && !nextAction && str(fd, "has_next") !== "1") {
    errs.next_action = "Nhu cầu đang xử lý phải có việc tiếp theo và hạn";
  }
  if ((newStatus === "closed" || newStatus === "paused") && !reason) errs.reason = "Ghi lý do";
  if (Object.keys(errs).length) return { ok: false, message: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_demand_activity", {
    p_demand_id: id, p_request_id: requestId, p_channel: str(fd, "channel") || "call", p_content: content,
    p_result: str(fd, "result") || null, p_next_action: nextAction || null, p_next_due: nextDue,
    p_new_status: newStatus || null, p_reason: reason || null,
    p_expected_version: newStatus ? Number(str(fd, "version")) : null,
  });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/nhu-cau/${id}`);
  revalidatePath("/viec-hom-nay");
  return { ok: true, message: "Đã ghi nhật ký." };
}

export async function reassignDemand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được đổi người phụ trách." };
  const id = str(fd, "demand_id");
  const owner = str(fd, "owner_id");
  if (!UUID.test(id) || !UUID.test(owner)) return { ok: false, message: "Chọn người phụ trách." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reassign_demand", {
    p_id: id, p_version: Number(str(fd, "version")), p_owner: owner, p_note: str(fd, "note") || null,
  });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/nhu-cau/${id}`);
  return { ok: true, message: "Đã đổi người phụ trách." };
}

export async function shareDemand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const id = str(fd, "demand_id");
  const userId = str(fd, "user_id");
  if (!UUID.test(id) || !UUID.test(userId)) return { ok: false, message: "Chọn người được chia sẻ." };
  const supabase = await createClient();
  const { error } = await supabase.from("demand_shares").upsert({ demand_id: id, user_id: userId }, { onConflict: "demand_id,user_id", ignoreDuplicates: true });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/nhu-cau/${id}`);
  return { ok: true, message: "Đã chia sẻ." };
}

export async function unshareDemand(fd: FormData) {
  await guard();
  const id = str(fd, "demand_id");
  const supabase = await createClient();
  await supabase.from("demand_shares").delete().eq("demand_id", id).eq("user_id", str(fd, "user_id"));
  revalidatePath(`/nhu-cau/${id}`);
}

const BUCKET = "demand-files";

export type PrepareResult = { ok: true; path: string; token: string } | { ok: false; message: string };

/**
 * Bước 1 tải tệp đính kèm: kiểm tra rồi cấp URL ký để trình duyệt tải THẲNG lên Storage
 * (không đi qua máy chủ ứng dụng nên không vướng giới hạn thân yêu cầu của Vercel). Quyền thật do Storage RLS kiểm tra khi cấp URL.
 */
export async function prepareAttachmentUpload(input: { demandId: string; fileName: string; mimeType: string; size: number }): Promise<PrepareResult> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (!UUID.test(input.demandId)) return { ok: false, message: "Thiếu nhu cầu." };
  const invalid = validateAttachment(input.mimeType, input.size);
  if (invalid) return { ok: false, message: invalid };
  const supabase = await createClient();
  const path = buildAttachmentPath(input.demandId, randomUUID(), input.fileName);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: friendlyError(error) };
  return { ok: true, path, token: data.token };
}

/** Bước 2: ghi tệp đã tải lên vào hồ sơ nhu cầu. Chỉ ghi khi tệp thật sự có trong Storage; tệp ghi dở được dọn. */
export async function registerAttachment(input: { demandId: string; path: string; fileName: string; mimeType: string; size: number }): Promise<ActionState> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (!UUID.test(input.demandId) || !input.path.startsWith(`${input.demandId}/`) || input.path.split("/").length !== 2) {
    return { ok: false, message: "Đường dẫn tệp không hợp lệ." };
  }
  const invalid = validateAttachment(input.mimeType, input.size);
  if (invalid) return { ok: false, message: invalid };
  const supabase = await createClient();
  const exists = await supabase.storage.from(BUCKET).createSignedUrl(input.path, 60);   // lỗi nếu chưa có tệp hoặc không có quyền
  if (exists.error) return { ok: false, message: "Chưa thấy tệp trong kho lưu trữ. Hãy tải lại tệp." };
  const { error } = await supabase.from("demand_attachments").insert({
    demand_id: input.demandId, storage_path: input.path, file_name: input.fileName.slice(0, 200), mime_type: input.mimeType, size_bytes: input.size,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([input.path]);
    return { ok: false, message: friendlyError(error) };
  }
  revalidatePath(`/nhu-cau/${input.demandId}`);
  return { ok: true, message: "Đã tải tệp lên." };
}

export async function saveFilter(fd: FormData) {
  await guard();
  const name = str(fd, "name").slice(0, 60);
  const query = str(fd, "query").slice(0, 1000);
  if (!name) redirect(`/nhu-cau?${query}`);
  const supabase = await createClient();
  await supabase.from("saved_filters").upsert({ scope: "demands", name, query }, { onConflict: "user_id,scope,name" });
  revalidatePath("/nhu-cau");
  redirect(`/nhu-cau?${query}`);
}

export async function deleteFilter(fd: FormData) {
  await guard();
  const supabase = await createClient();
  await supabase.from("saved_filters").delete().eq("id", str(fd, "id"));
  revalidatePath("/nhu-cau");
}
