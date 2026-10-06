import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type QuoteVersionRow = {
  id: string; version_no: number; list_price: unknown; offered_price: unknown; benefits: string | null; valid_until: string; note: string | null;
  needs_approval: boolean; status: "pending_approval" | "issued" | "rejected" | "superseded" | "accepted" | "cancelled";
  decision_reason: string | null; decided_at: string | null; created_at: string; decider: { full_name: string } | null;
};
export type QuoteRow = {
  id: string; code: string; status: "open" | "accepted" | "cancelled"; version: number; end_reason: string | null; created_at: string; owner_id: string;
  demand: { id: string; code: string } | null; customer: { full_name: string; phone: string | null } | null; owner: { full_name: string } | null;
  versions: QuoteVersionRow[];
};
export type QuoteDemandOption = { id: string; code: string; customer_name: string };

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

/**
 * Báo giá của một xe. RLS: sales chỉ nhận báo giá của mình; quản lý/kế toán nhận tất cả.
 * Không đọc giá sàn — chỉ cờ needs_approval do database tính.
 */
export async function loadQuotes(supabase: SupabaseClient, vehicleId: string, wantDemands: boolean) {
  const [rows, demands] = await Promise.all([
    supabase.from("quotes")
      .select("id, code, status, version, end_reason, created_at, owner_id, demand:demands(id, code), customer:customers(full_name, phone), owner:profiles!quotes_owner_id_fkey(full_name), versions:quote_versions(id, version_no, list_price, offered_price, benefits, valid_until, note, needs_approval, status, decision_reason, decided_at, created_at, decider:profiles!quote_versions_decided_by_fkey(full_name))")
      .eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
    wantDemands
      ? supabase.from("demands").select("id, code, customer:customers(full_name)").eq("kind", "buy").not("status", "in", "(closed,won,paused)").order("updated_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const quotes = ((rows.data ?? []) as unknown as (Omit<QuoteRow, "demand" | "customer" | "owner" | "versions"> & { demand: unknown; customer: unknown; owner: unknown; versions: (Omit<QuoteVersionRow, "decider"> & { decider: unknown })[] })[]).map((q) => ({
    ...q,
    demand: one(q.demand as { id: string; code: string } | null),
    customer: one(q.customer as { full_name: string; phone: string | null } | null),
    owner: one(q.owner as { full_name: string } | null),
    versions: [...q.versions].sort((a, b) => b.version_no - a.version_no).map((v) => ({ ...v, decider: one(v.decider as { full_name: string } | null) })),
  })) as QuoteRow[];
  const options = ((demands.data ?? []) as unknown as { id: string; code: string; customer: unknown }[]).map((d) => ({
    id: d.id, code: d.code, customer_name: one(d.customer as { full_name: string } | null)?.full_name ?? "",
  })) as QuoteDemandOption[];
  return { quotes, demandOptions: options };
}
