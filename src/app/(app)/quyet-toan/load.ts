import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type SettlementRow = {
  id: string; code: string; kind: "owned" | "consignment"; status: "provisional" | "checked" | "approved" | "cancelled" | "superseded"; version: number; version_no: number;
  vehicle_id: string; order_id: string; order_line_id: string; supersedes_id: string | null; adjust_reason: string | null; result: "profit" | "no_profit" | "consignment";
  sale_price: unknown; purchase_price: unknown; costs_deducted: unknown; distributable: unknown; company_rate: unknown; company_operating: unknown; remainder: unknown; fee_amount: unknown;
  loss_decision: string | null; note: string | null; end_reason: string | null; created_at: string; checked_at: string | null; approved_at: string | null;
  inputs: { shares?: { party_id: string; name: string; kind: string; ratio: string; net_received: string }[]; cost_basis?: string | null } | null;
  vehicle: { code: string; make: string | null; model: string | null; year_made: number | null } | null; order: { code: string } | null;
  creator: { full_name: string } | null; checker: { full_name: string } | null; approver: { full_name: string } | null;
};
export type LineRow = { id: string; line_no: number; kind: string; party_id: string | null; label: string; amount: unknown; direction: "out" | "in" | "none"; note: string | null; paid: unknown; remaining: unknown };

const SELECT = "id, code, kind, status, version, version_no, vehicle_id, order_id, order_line_id, supersedes_id, adjust_reason, result, sale_price, purchase_price, costs_deducted, distributable, company_rate, company_operating, remainder, fee_amount, loss_decision, note, end_reason, created_at, checked_at, approved_at, inputs, vehicle:vehicles(code, year_made, make:vehicle_makes(name), model:vehicle_models(name)), order:sales_orders(code), creator:profiles!settlements_created_by_fkey(full_name), checker:profiles!settlements_checked_by_fkey(full_name), approver:profiles!settlements_approved_by_fkey(full_name)";

function shape(r: Record<string, unknown>): SettlementRow {
  const v = one(r.vehicle as { code: string; year_made: number | null; make: unknown; model: unknown } | null);
  return {
    ...(r as object), vehicle: v ? { ...v, make: one(v.make as { name: string } | null)?.name ?? null, model: one(v.model as { name: string } | null)?.name ?? null } : null,
    order: one(r.order as { code: string } | null), creator: one(r.creator as { full_name: string } | null), checker: one(r.checker as { full_name: string } | null), approver: one(r.approver as { full_name: string } | null),
  } as unknown as SettlementRow;
}

export async function listSettlements(supabase: SupabaseClient, page: number, pageSize: number, status: string) {
  let q = supabase.from("settlements").select(SELECT, { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (["provisional", "checked", "approved", "cancelled", "superseded"].includes(status)) q = q.eq("status", status);
  const { data, count, error } = await q;
  return { rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(shape), total: count ?? 0, error: error?.message ?? null };
}

export async function getSettlement(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("settlements").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const s = shape(data as unknown as Record<string, unknown>);
  const [lines, bal, blockers, stale] = await Promise.all([
    supabase.from("settlement_lines").select("id, line_no, kind, party_id, label, amount, direction, note").eq("settlement_id", id).order("line_no"),
    supabase.from("settlement_balances").select("line_id, paid, remaining").eq("settlement_id", id),
    ["provisional", "checked"].includes(s.status) ? supabase.rpc("settlement_blockers", { p_id: id, p_for_approval: true }) : Promise.resolve({ data: [] as string[] }),
    s.status === "approved" ? supabase.rpc("settlement_is_stale", { p_id: id }) : Promise.resolve({ data: false }),
  ]);
  const b = new Map(((bal.data ?? []) as { line_id: string; paid: unknown; remaining: unknown }[]).map((x) => [x.line_id, x]));
  const rows = ((lines.data ?? []) as Omit<LineRow, "paid" | "remaining">[]).map((l) => ({ ...l, paid: b.get(l.id)?.paid ?? null, remaining: b.get(l.id)?.remaining ?? null })) as LineRow[];
  return { settlement: s, lines: rows, blockers: (blockers.data ?? []) as string[], stale: !!stale.data };
}

/** Dòng xe của một đơn bán đã ký + quyết toán hiện có (nếu có) để tạm tính từ chi tiết đơn. */
export async function loadOrderSettlements(supabase: SupabaseClient, orderId: string) {
  const [lines, ss] = await Promise.all([
    supabase.from("sales_order_lines").select("id, vehicle_label").eq("order_id", orderId).eq("line_status", "active").order("created_at"),
    supabase.from("settlements").select("id, code, status, order_line_id").eq("order_id", orderId).not("status", "in", "(cancelled,superseded)"),
  ]);
  const byLine = new Map(((ss.data ?? []) as { id: string; code: string; status: string; order_line_id: string }[]).map((x) => [x.order_line_id, x]));
  return ((lines.data ?? []) as { id: string; vehicle_label: string }[]).map((l) => ({ line_id: l.id, label: l.vehicle_label, settlement: byLine.get(l.id) ?? null }));
}
