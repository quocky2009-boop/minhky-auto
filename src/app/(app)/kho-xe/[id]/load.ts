import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const nm = (x: unknown) => one(x as { name: string } | { name: string }[] | null)?.name ?? "";

export type VehicleFull = {
  id: string; code: string; vin: string | null; plate: string | null; condition: string; business_type: string; source_type: string | null;
  sale_status: string; prep_status: string; paperwork_status: string; year_made: number | null; year_registered: number | null; color: string | null;
  fuel_type: string | null; seats: number | null; odo: number | null; intake_date: string | null; notes: string | null; version: number;
  location_id: string | null; previous_vehicle_id: string | null; source_demand_id: string | null; created_at: string;
  make: string; model: string; variant: string; location_name: string;
  asking_price: unknown; hasListing: boolean; purchase_price: unknown; floor_price: unknown; hasFinance: boolean;
};

export async function loadVehicle(supabase: SupabaseClient, id: string): Promise<VehicleFull | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: v } = await supabase.from("vehicles")
    .select(`*, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name), location:locations(name),
      listing:vehicle_listings(asking_price), fin:vehicle_financials(purchase_price, floor_price)`)
    .eq("id", id).maybeSingle();
  if (!v) return null;
  const listing = one(v.listing as { asking_price: unknown } | { asking_price: unknown }[] | null);
  const fin = one(v.fin as { purchase_price: unknown; floor_price: unknown } | { purchase_price: unknown; floor_price: unknown }[] | null);
  return {
    ...v, make: nm(v.make), model: nm(v.model), variant: nm(v.variant), location_name: nm(v.location),
    asking_price: listing?.asking_price ?? null, hasListing: !!listing,
    purchase_price: fin?.purchase_price ?? null, floor_price: fin?.floor_price ?? null, hasFinance: !!fin,
  } as VehicleFull;
}
