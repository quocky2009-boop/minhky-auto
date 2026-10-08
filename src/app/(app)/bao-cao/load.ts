import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INVENTORY_COLUMNS, RESULT_COLUMNS, type InventoryRow, type Period, type ResultRow, type Totals } from "@/lib/reports";

export type Dashboard = {
  inventory: {
    owned: { count: number; capital_tied: string; cost_unknown: number; open_cost_lines: number; age_0_30: number; age_31_60: number; age_61_90: number; age_91_plus: number; max_age: number | null };
    consignment: { count: number; age_0_30: number; age_31_60: number; age_61_90: number; age_91_plus: number; max_age: number | null };
    not_yet_in_stock: number;
  };
  capital_sources: { external_capital: string; loan_outstanding: string; capital_tied: string };
  money: { balance: string; accounts: number };
  receivables: { orders_outstanding: string; orders_count: number; owner_receivable: string };
  payables: { settlement_out: string; tradein_payable: string };
  settlements: { unsettled_sold: number; pending_approval: number };
};

/** Trả null khi không phải vai trò tài chính (database trả '{}') hoặc lỗi. */
export async function loadDashboard(supabase: SupabaseClient): Promise<Dashboard | null> {
  const { data, error } = await supabase.rpc("report_dashboard");
  if (error || !data || !("inventory" in (data as object))) return null;
  return data as Dashboard;
}

export async function loadTotals(supabase: SupabaseClient, p: Period): Promise<Totals | null> {
  const { data, error } = await supabase.rpc("report_results_totals", { p_from: p.from, p_to: p.to });
  if (error || !data || !("lines" in (data as object))) return null;
  return data as Totals;
}

export async function listResults(supabase: SupabaseClient, p: Period, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const { data, count, error } = await supabase.from("report_vehicle_results").select(RESULT_COLUMNS, { count: "exact" })
    .gte("sold_on", p.from).lte("sold_on", p.to).order("sold_on", { ascending: false }).order("order_code", { ascending: false }).range(from, from + pageSize - 1);
  return { rows: (data ?? []) as unknown as ResultRow[], total: count ?? 0, error };
}

export async function listInventory(supabase: SupabaseClient, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const { data, count, error } = await supabase.from("report_inventory").select(INVENTORY_COLUMNS, { count: "exact" })
    .order("age_days", { ascending: false }).order("code").range(from, from + pageSize - 1);
  return { rows: (data ?? []) as unknown as InventoryRow[], total: count ?? 0, error };
}
