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

const MAX_FILE = 20 * 1024 * 1024;
const ALLOWED = /^(image\/|video\/|application\/pdf$)/;

export async function uploadAttachment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const id = str(fd, "demand_id");
  const file = fd.get("file");
  if (!UUID.test(id)) return { ok: false, message: "Thiếu nhu cầu." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Chọn tệp cần tải lên." };
  if (file.size > MAX_FILE) return { ok: false, message: "Tệp lớn hơn 20 MB." };
  if (!ALLOWED.test(file.type)) return { ok: false, message: "Chỉ nhận ảnh, video hoặc PDF." };
  const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "tep";
  const path = `${id}/${randomUUID()}-${safe}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("demand-files").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, message: friendlyError(up.error) };
  const { error } = await supabase.from("demand_attachments").insert({
    demand_id: id, storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("demand-files").remove([path]);
    return { ok: false, message: friendlyError(error) };
  }
  revalidatePath(`/nhu-cau/${id}`);
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
