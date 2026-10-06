import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Readiness } from "@/lib/handover";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type HandoverRow = {
  id: string; code: string; status: "preparing" | "delivered" | "cancelled"; version: number; owner_id: string; planned_on: string | null; note: string | null;
  delivered_on: string | null; received_by_name: string | null; received_relation: string | null; odo_at_handover: number | null; keys_given: number | null;
  delivered_at: string | null; end_reason: string | null; created_at: string; vehicle_id: string; order_id: string;
  vehicle: { code: string; year_made: number | null; vin: string | null; plate: string | null; make: string | null; model: string | null } | null;
  customer: { full_name: string; phone: string | null } | null; order: { code: string; contract_ref: string | null; contract_date: string | null } | null;
  owner: { full_name: string } | null; deliverer: { full_name: string } | null;
};
export type ItemRow = { template_key: string; label: string; grp: string; sort_order: number; is_required: boolean; state: "pending" | "ok" | "na" | "missing"; has_original: boolean; has_scan: boolean; holder: string | null; note: string | null; version: number; checked_at: string | null };
export type ExceptionRow = { id: string; kind: string; reason: string; status: "active" | "revoked"; approved_at: string; revoke_reason: string | null; approver: { full_name: string } | null };

const SELECT = "id, code, status, version, owner_id, planned_on, note, delivered_on, received_by_name, received_relation, odo_at_handover, keys_given, delivered_at, end_reason, created_at, vehicle_id, order_id, vehicle:vehicles(code, year_made, vin, plate, make:vehicle_makes(name), model:vehicle_models(name)), customer:customers(full_name, phone), order:sales_orders(code, contract_ref, contract_date), owner:profiles!handovers_owner_id_fkey(full_name), deliverer:profiles!handovers_delivered_by_fkey(full_name)";

function shape(r: Record<string, unknown>): HandoverRow {
  const v = one(r.vehicle as { code: string; year_made: number | null; vin: string | null; plate: string | null; make: unknown; model: unknown } | null);
  return {
    ...(r as object), vehicle: v ? { ...v, make: one(v.make as { name: string } | null)?.name ?? null, model: one(v.model as { name: string } | null)?.name ?? null } : null,
    customer: one(r.customer as { full_name: string; phone: string | null } | null), order: one(r.order as { code: string; contract_ref: string | null; contract_date: string | null } | null),
    owner: one(r.owner as { full_name: string } | null), deliverer: one(r.deliverer as { full_name: string } | null),
  } as unknown as HandoverRow;
}

/** Danh sách bàn giao (RLS: sales chỉ thấy của mình). Phân trang phía server. */
export async function listHandovers(supabase: SupabaseClient, page: number, pageSize: number, status: string) {
  let q = supabase.from("handovers").select(SELECT, { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (["preparing", "delivered", "cancelled"].includes(status)) q = q.eq("status", status);
  const { data, count, error } = await q;
  return { rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(shape), total: count ?? 0, error: error?.message ?? null };
}

export async function getHandover(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("handovers").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const [items, exceptions, ready] = await Promise.all([
    supabase.from("handover_items").select("template_key, label, grp, sort_order, is_required, state, has_original, has_scan, holder, note, version, checked_at").eq("handover_id", id).order("sort_order"),
    supabase.from("handover_exceptions").select("id, kind, reason, status, approved_at, revoke_reason, approver:profiles!handover_exceptions_approved_by_fkey(full_name)").eq("handover_id", id).order("approved_at"),
    supabase.rpc("handover_readiness", { p_id: id }),
  ]);
  return {
    handover: shape(data as unknown as Record<string, unknown>),
    items: (items.data ?? []) as ItemRow[],
    exceptions: ((exceptions.data ?? []) as unknown as (Omit<ExceptionRow, "approver"> & { approver: unknown })[]).map((e) => ({ ...e, approver: one(e.approver as { full_name: string } | null) })) as ExceptionRow[],
    readiness: (((ready.data ?? []) as Readiness[])[0] ?? null) as Readiness | null,
  };
}

/** Dòng xe của một đơn bán đã ký + bàn giao tương ứng (nếu có), để lập bàn giao từ chi tiết đơn. */
export async function loadOrderHandovers(supabase: SupabaseClient, orderId: string) {
  const [lines, hs] = await Promise.all([
    supabase.from("sales_order_lines").select("id, vehicle_label").eq("order_id", orderId).eq("line_status", "active").order("created_at"),
    supabase.from("handovers").select("id, code, status, order_line_id").eq("order_id", orderId),
  ]);
  const byLine = new Map(((hs.data ?? []) as { id: string; code: string; status: string; order_line_id: string }[]).map((h) => [h.order_line_id, h]));
  return ((lines.data ?? []) as { id: string; vehicle_label: string }[]).map((l) => ({ line_id: l.id, label: l.vehicle_label, handover: byLine.get(l.id) ?? null }));
}
