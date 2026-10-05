import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VehicleFileRow = {
  id: string; category: string; file_name: string; mime_type: string; size_bytes: number; caption: string | null; created_at: string; url: string | null;
};

/** Tệp đang dùng của xe (RLS tự lọc theo quyền: sales/kỹ thuật không nhận được giấy tờ). Đường dẫn xem là URL ký, hiệu lực 10 phút. */
export async function loadVehicleFiles(supabase: SupabaseClient, vehicleId: string): Promise<VehicleFileRow[]> {
  const { data } = await supabase.from("vehicle_files")
    .select("id, category, storage_path, file_name, mime_type, size_bytes, caption, created_at")
    .eq("vehicle_id", vehicleId).is("archived_at", null).order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; category: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; caption: string | null; created_at: string }[];
  if (!rows.length) return [];
  const { data: signed } = await supabase.storage.from("vehicle-files").createSignedUrls(rows.map((r) => r.storage_path), 600);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map(({ storage_path, ...r }) => ({ ...r, url: byPath.get(storage_path) ?? null }));
}
