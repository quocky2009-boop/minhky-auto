import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CostPayment = { id: string; amount: unknown; paid_at: string; method: string; reference: string | null; note: string | null; status: string; void_reason: string | null };
export type CostLine = {
  id: string; code: string; category: string; description: string; vendor: string | null; borne_by: string; status: "estimated" | "confirmed" | "void";
  estimated_amount: unknown; approved_at: string | null; confirmed_amount: unknown; accepted_note: string | null; void_reason: string | null;
  replaces_cost_id: string | null; version: number; payments: CostPayment[];
};
export type CostSummary = {
  line_count: number; open_lines: number; open_lines_no_estimate: number; estimated_showroom: unknown; estimated_owner: unknown;
  confirmed_showroom: unknown; confirmed_owner: unknown; paid_showroom: unknown; paid_owner: unknown;
} | null;

export async function loadCosts(supabase: SupabaseClient, vehicleId: string) {
  const [{ data: lines }, { data: sum }] = await Promise.all([
    supabase.from("vehicle_costs")
      .select("id, code, category, description, vendor, borne_by, status, estimated_amount, approved_at, confirmed_amount, accepted_note, void_reason, replaces_cost_id, version, payments:vehicle_cost_payments(id, amount, paid_at, method, reference, note, status, void_reason)")
      .eq("vehicle_id", vehicleId).order("created_at", { ascending: true }),
    supabase.from("vehicle_cost_summary").select("*").eq("vehicle_id", vehicleId).maybeSingle(),
  ]);
  const costs = ((lines ?? []) as unknown as CostLine[]).map((l) => ({ ...l, payments: [...(l.payments ?? [])].sort((a, b) => a.paid_at.localeCompare(b.paid_at)) }));
  return { costs, summary: (sum ?? null) as CostSummary };
}
