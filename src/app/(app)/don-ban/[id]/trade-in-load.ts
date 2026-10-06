import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type TradeInView = {
  id: string; code: string; status: "draft" | "confirmed" | "cancelled"; version: number; note: string | null; loan_bank: string | null; end_reason: string | null;
  old_vehicle_id: string; old_vehicle_label: string;
  purchase_value: unknown; loan_payoff_amount: unknown; customer_portion: unknown; offsets: unknown; paid_customer: unknown; paid_bank: unknown;
  payable_total: unknown; customer_remaining: unknown; bank_remaining: unknown;
  offset_rows: { id: string; code: string; amount: unknown; status: "posted" | "voided"; version: number; note: string | null; void_reason: string | null; created_at: string }[];
};
export type OldVehicleOption = { id: string; label: string; purchase_price: string };

/** Hồ sơ thu cũ của một đơn bán + số liệu (view tài chính). Chỉ kế toán/quản lý đọc được (RLS). */
export async function loadTradeIns(supabase: SupabaseClient, orderId: string, wantOptions: boolean) {
  const [tis, bals, offs] = await Promise.all([
    supabase.from("trade_ins").select("id, code, status, version, note, loan_bank, end_reason, old_vehicle_id, old_vehicle:vehicles(code, year_made, make:vehicle_makes(name), model:vehicle_models(name))").eq("order_id", orderId).order("created_at"),
    supabase.from("trade_in_balances").select("trade_in_id, purchase_value, loan_payoff_amount, customer_portion, offsets, paid_customer, paid_bank, payable_total, customer_remaining, bank_remaining").eq("order_id", orderId),
    supabase.from("trade_in_offsets").select("id, trade_in_id, code, amount, status, version, note, void_reason, created_at").eq("order_id", orderId).order("created_at"),
  ]);
  const b = new Map(((bals.data ?? []) as { trade_in_id: string }[]).map((x) => [x.trade_in_id, x as unknown as Record<string, unknown>]));
  const list = ((tis.data ?? []) as unknown as { id: string; old_vehicle: unknown }[]).map((t) => {
    const v = one(t.old_vehicle as { code: string; year_made: number | null; make: unknown; model: unknown } | null);
    const label = v ? [v.code, one(v.make as { name: string } | null)?.name, one(v.model as { name: string } | null)?.name, v.year_made].filter(Boolean).join(" ") : "Xe cũ";
    return { ...(t as object), ...(b.get(t.id) ?? {}), old_vehicle_label: label, offset_rows: ((offs.data ?? []) as { trade_in_id: string }[]).filter((o) => o.trade_in_id === t.id) } as unknown as TradeInView;
  });
  let options: OldVehicleOption[] = [];
  if (wantOptions) {
    const taken = new Set(list.filter((t) => t.status !== "cancelled").map((t) => t.old_vehicle_id));
    const { data } = await supabase.from("vehicles").select("id, code, year_made, make:vehicle_makes(name), model:vehicle_models(name), fin:vehicle_financials(purchase_price)")
      .eq("source_type", "trade_in").eq("business_type", "owned").is("archived_at", null).order("created_at", { ascending: false }).limit(100);
    options = ((data ?? []) as unknown as { id: string; code: string; year_made: number | null; make: unknown; model: unknown; fin: unknown }[]).filter((v) => !taken.has(v.id)).map((v) => ({
      id: v.id, label: [v.code, one(v.make as { name: string } | null)?.name, one(v.model as { name: string } | null)?.name, v.year_made].filter(Boolean).join(" "),
      purchase_price: String(one(v.fin as { purchase_price: unknown } | null)?.purchase_price ?? ""),
    }));
  }
  return { list, options };
}
