import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Location = { id: string; name: string };
export const getLocations = cache(async (): Promise<Location[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("id, name").eq("is_active", true).order("name");
  return data ?? [];
});

export type VehicleRow = {
  id: string; code: string; vin: string | null; plate: string | null; condition: string; business_type: string; source_type: string | null;
  sale_status: string; prep_status: string; paperwork_status: string; year_made: number | null; color: string | null; odo: number | null;
  intake_date: string | null; spec_name: string; asking_price: unknown; location_name: string | null; age_days: number | null; previous_vehicle_id: string | null;
};

export async function searchVehicles(rpc: Record<string, string>, limit: number, offset: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_vehicles", { f: rpc, p_limit: limit, p_offset: offset });
  if (error) return { total: 0, rows: [] as VehicleRow[], error: error.message };
  const res = data as { total: number; rows: VehicleRow[] };
  return { total: Number(res.total), rows: res.rows, error: null as string | null };
}
