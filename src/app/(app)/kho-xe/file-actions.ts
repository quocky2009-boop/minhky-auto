"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { allowedCategories, buildStoragePath, validateUpload } from "@/lib/vehicle-files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "vehicle-files";

export type PrepareResult = { ok: true; path: string; token: string; requestId: string } | { ok: false; message: string };
export type SimpleResult = { ok: boolean; message?: string };

/**
 * Bước 1 của tải lên: kiểm tra rồi cấp URL ký có thời hạn để trình duyệt tải THẲNG lên Storage
 * (không đi qua máy chủ ứng dụng nên không vướng giới hạn thân yêu cầu của Vercel). Quyền thật do Storage RLS kiểm tra khi cấp URL.
 */
export async function prepareVehicleUpload(input: { vehicleId: string; category: string; fileName: string; mimeType: string; size: number }): Promise<PrepareResult> {
  const user = await getCurrentUser();
  if (!user || !user.active) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  if (!UUID.test(input.vehicleId)) return { ok: false, message: "Thiếu thông tin xe." };
  if (!(allowedCategories(user.roles) as string[]).includes(input.category)) return { ok: false, message: "Anh/chị không có quyền thêm loại tệp này." };
  const invalid = validateUpload(input.category, input.mimeType, input.size);
  if (invalid) return { ok: false, message: invalid };
  const supabase = await createClient();
  const path = buildStoragePath(input.vehicleId, input.category, randomUUID(), input.fileName);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: friendlyError(error) };
  return { ok: true, path, token: data.token, requestId: randomUUID() };
}

/** Bước 2: ghi tệp đã tải lên vào hồ sơ xe. Hàm database kiểm tra tệp thật sự có trong Storage; gửi lặp cùng requestId không sinh trùng. */
export async function registerVehicleFile(input: {
  requestId: string; vehicleId: string; category: string; path: string; fileName: string; mimeType: string; size: number; caption?: string;
}): Promise<SimpleResult> {
  const user = await getCurrentUser();
  if (!user || !user.active) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  if (!UUID.test(input.requestId) || !UUID.test(input.vehicleId)) return { ok: false, message: "Phiên nhập không hợp lệ, tải lại trang." };
  const invalid = validateUpload(input.category, input.mimeType, input.size);
  if (invalid) return { ok: false, message: invalid };
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_vehicle_file", {
    p: { request_id: input.requestId, vehicle_id: input.vehicleId, category: input.category, storage_path: input.path,
      file_name: input.fileName, mime_type: input.mimeType, size_bytes: input.size, caption: input.caption ?? "" },
  });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${input.vehicleId}`);
  return { ok: true, message: "Đã tải tệp lên." };
}

/** Lưu trữ tệp (không xóa): chỉ quản lý, bắt buộc lý do. Tệp gốc vẫn được giữ trong Storage. */
export async function archiveVehicleFile(fd: FormData): Promise<SimpleResult> {
  const user = await getCurrentUser();
  if (!user || !user.active || !isManager(user.roles)) return { ok: false, message: "Chỉ quản lý được lưu trữ tệp." };
  const id = String(fd.get("file_id") ?? ""), vehicleId = String(fd.get("vehicle_id") ?? ""), reason = String(fd.get("reason") ?? "").trim();
  if (!UUID.test(id) || !UUID.test(vehicleId)) return { ok: false, message: "Thiếu thông tin tệp." };
  if (!reason) return { ok: false, message: "Ghi lý do lưu trữ tệp." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_vehicle_file", { p_id: id, p_reason: reason });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${vehicleId}`);
  return { ok: true, message: "Đã lưu trữ tệp." };
}
