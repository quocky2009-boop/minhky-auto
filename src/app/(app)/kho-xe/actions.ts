"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { friendlyError } from "@/lib/errors";
import { parseAcquireForm, parseVehicleForm } from "@/lib/vehicles/form";
import type { ActionState } from "../nhu-cau/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guardManager() {
  const user = await getCurrentUser();
  if (!user || !user.active || !isManager(user.roles)) throw new Error("Chỉ quản lý được thực hiện thao tác này.");
  return user;
}

export async function createVehicleAction(fd: FormData): Promise<ActionState> {
  try { await guardManager(); } catch (e) { return { ok: false, message: (e as Error).message }; }
  const parsed = parseVehicleForm(fd, "create");
  if (!parsed.ok) return { ok: false, message: parsed.error, fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_vehicle", { p: parsed.payload });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath("/kho-xe");
  redirect(`/kho-xe/${data as string}?da-tao=1`);
}

export async function updateVehicleAction(fd: FormData): Promise<ActionState> {
  try { await guardManager(); } catch (e) { return { ok: false, message: (e as Error).message }; }
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  if (!UUID.test(id) || !Number.isInteger(version)) return { ok: false, message: "Thiếu thông tin xe." };
  const parsed = parseVehicleForm(fd, "update");
  if (!parsed.ok) return { ok: false, message: parsed.error, fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_vehicle", { p_id: id, p_version: version, p: parsed.payload });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/kho-xe/${id}`);
  revalidatePath("/kho-xe");
  redirect(`/kho-xe/${id}?da-luu=1`);
}

/** Nhập kho từ nhu cầu bán. request_id do form giữ qua các lần thử lại; database cũng chặn tạo trùng theo nhu cầu nguồn. */
export async function acquireFromDemandAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try { await guardManager(); } catch (e) { return { ok: false, message: (e as Error).message }; }
  const demandId = String(fd.get("demand_id") ?? "");
  if (!UUID.test(demandId)) return { ok: false, message: "Thiếu nhu cầu nguồn." };
  const parsed = parseAcquireForm(fd);
  if (!parsed.ok) return { ok: false, message: parsed.error, fieldErrors: parsed.fieldErrors };
  const requestId = parsed.payload.request_id as string;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("acquire_from_demand", { p_demand_id: demandId, p_request_id: requestId, p: parsed.payload });
  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/nhu-cau/${demandId}`);
  revalidatePath("/kho-xe");
  redirect(`/kho-xe/${data as string}?da-nhap-kho=1`);
}
