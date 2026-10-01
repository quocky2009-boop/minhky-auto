import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Named = { name: string } | null;
const nm = (x: unknown) => ((Array.isArray(x) ? x[0] : x) as Named)?.name ?? null;

/** Đọc một nhu cầu đầy đủ (theo quyền của người đang đăng nhập — RLS lọc). */
export async function loadDemand(supabase: SupabaseClient, id: string): Promise<DemandFull | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: d } = await supabase
    .from("demands")
    .select(`*, customer:customers(id, code, full_name, phone, area, address),
      owner:profiles!demands_owner_id_fkey(full_name), source:customer_sources(name),
      options:demand_vehicle_options(make_id, model_id, variant_id, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name)),
      offer:sell_offers(*, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name))`)
    .eq("id", id)
    .maybeSingle();
  if (!d) return null;
  const offerRaw = Array.isArray(d.offer) ? d.offer[0] : d.offer;
  const customer = (Array.isArray(d.customer) ? d.customer[0] : d.customer) as {
    id: string; code: string; full_name: string; phone: string | null; area: string | null; address: string | null;
  } | null;
  return {
    ...d,
    customer: customer ?? { id: d.customer_id, code: "", full_name: "(không có quyền xem khách)", phone: null, area: null, address: null },
    owner_name: ((Array.isArray(d.owner) ? d.owner[0] : d.owner) as { full_name: string } | null)?.full_name ?? null,
    source_name: nm(d.source),
    options: ((d.options ?? []) as Record<string, unknown>[]).map((o) => ({
      make_id: o.make_id as string, model_id: (o.model_id as string) ?? null, variant_id: (o.variant_id as string) ?? null,
      make: nm(o.make) ?? "", model: nm(o.model), variant: nm(o.variant),
    })),
    offer: offerRaw ? { ...offerRaw, make_name: nm(offerRaw.make), model_name: nm(offerRaw.model), variant_name: nm(offerRaw.variant) } : null,
  } as DemandFull;
}

export type DemandFull = {
  id: string; code: string; kind: "buy" | "sell"; status: string; priority: string; owner_id: string | null; created_by: string;
  source_id: string | null; next_action: string | null; next_action_due: string | null; last_contact_at: string | null;
  last_activity_at: string; verified_at: string | null; paused_reason: string | null; closed_reason: string | null; closed_at: string | null;
  raw_message: string | null; notes: string | null; budget_min: unknown; budget_max: unknown; year_min: number | null; year_max: number | null;
  odo_max: number | null; fuel_types: string[]; seats: number[]; condition_pref: string | null; colors_accepted: string[]; colors_rejected: string[];
  needs_loan: boolean | null; wants_trade_in: boolean | null; expected_timeframe: string | null; expected_by: string | null;
  strict_criteria: string[]; must_have_note: string | null; flexible_note: string | null; created_at: string; updated_at: string; version: number;
  customer_id: string;
  customer: { id: string; code: string; full_name: string; phone: string | null; area: string | null; address: string | null };
  owner_name: string | null; source_name: string | null;
  options: { make_id: string; model_id: string | null; variant_id: string | null; make: string; model: string | null; variant: string | null }[];
  offer: null | {
    make_id: string | null; model_id: string | null; variant_id: string | null; make_name: string | null; model_name: string | null; variant_name: string | null;
    year_made: number | null; year_registered: number | null; color: string | null; fuel_type: string | null; seats: number | null; odo: number | null;
    plate: string | null; vin: string | null; asking_price: unknown; negotiable: boolean | null; condition_note: string | null;
    repair_history_note: string | null; papers_note: string | null; has_loan: boolean | null; loan_remaining: unknown;
    vehicle_location: string | null; desired_sell_time: string | null; sale_mode: string; inspection_at: string | null; converted_vehicle_id: string | null;
  };
};
