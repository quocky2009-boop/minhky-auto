import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type CaseRow = {
  id: string; code: string; kind: string; title: string; description: string | null; status: "open" | "in_progress" | "resolved" | "cancelled"; version: number;
  received_on: string; odo_at_case: number | null; coverage: string | null; commitment_id: string | null; assigned_to: string; owner_id: string; created_by: string;
  next_action: string | null; next_due: string | null; resolution: string | null; resolved_at: string | null; end_reason: string | null; created_at: string;
  vehicle_id: string; order_id: string; order_line_id: string;
  vehicle: { code: string; business_type: string; year_made: number | null; plate: string | null; make: string | null; model: string | null } | null;
  customer: { full_name: string; phone: string | null } | null;
  order: { code: string } | null; assignee: { full_name: string } | null;
};
export type EventRow = { id: string; kind: string; content: string; created_at: string; author: { full_name: string } | null };
export type CommitmentRow = {
  id: string; code: string; kind: string; title: string; details: string | null; starts_on: string; ends_on: string | null; odo_limit: number | null;
  status: "active" | "void"; void_reason: string | null; version: number; order_line_id: string;
};
export type CaseCost = { id: string; code: string; description: string; status: string; estimated_amount: unknown; confirmed_amount: unknown; version: number };

const SELECT = "id, code, kind, title, description, status, version, received_on, odo_at_case, coverage, commitment_id, assigned_to, owner_id, created_by, next_action, next_due, resolution, resolved_at, end_reason, created_at, vehicle_id, order_id, order_line_id, vehicle:vehicles(code, business_type, year_made, plate, make:vehicle_makes(name), model:vehicle_models(name)), customer:customers(full_name, phone), order:sales_orders(code), assignee:profiles!aftersales_cases_assigned_to_fkey(full_name)";

function shape(r: Record<string, unknown>): CaseRow {
  const v = one(r.vehicle as { code: string; business_type: string; year_made: number | null; plate: string | null; make: unknown; model: unknown } | null);
  return {
    ...(r as object), vehicle: v ? { ...v, make: one(v.make as { name: string } | null)?.name ?? null, model: one(v.model as { name: string } | null)?.name ?? null } : null,
    customer: one(r.customer as { full_name: string; phone: string | null } | null), order: one(r.order as { code: string } | null), assignee: one(r.assignee as { full_name: string } | null),
  } as unknown as CaseRow;
}

/** Lọc: tab trạng thái/hạn và "của tôi". RLS quyết định phiếu nào thấy được; phân trang phía server; quá hạn xếp trước. */
export async function listCases(supabase: SupabaseClient, f: { tab: string; mine: boolean; userId: string; today: string }, page: number, pageSize: number) {
  let q = supabase.from("aftersales_cases").select(SELECT, { count: "exact" });
  if (f.tab === "overdue") q = q.in("status", ["open", "in_progress"]).lt("next_due", f.today);
  else if (f.tab === "today") q = q.in("status", ["open", "in_progress"]).eq("next_due", f.today);
  else if (f.tab === "resolved") q = q.eq("status", "resolved");
  else if (f.tab === "cancelled") q = q.eq("status", "cancelled");
  else if (f.tab !== "all") q = q.in("status", ["open", "in_progress"]);
  if (f.mine) q = q.eq("assigned_to", f.userId);
  const { data, count, error } = await q.order("next_due", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  return { rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(shape), total: count ?? 0, error: error?.message ?? null };
}

export async function getCase(supabase: SupabaseClient, id: string, finance: boolean) {
  const { data } = await supabase.from("aftersales_cases").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const c = shape(data as unknown as Record<string, unknown>);
  const [events, commitment, costs, staff] = await Promise.all([
    supabase.from("aftersales_events").select("id, kind, content, created_at, author:profiles!aftersales_events_created_by_fkey(full_name)").eq("case_id", id).order("created_at", { ascending: false }),
    c.commitment_id ? supabase.from("aftersales_commitments").select("id, code, kind, title, details, starts_on, ends_on, odo_limit, status, void_reason, version, order_line_id").eq("id", c.commitment_id).maybeSingle() : Promise.resolve({ data: null }),
    finance ? supabase.from("vehicle_costs").select("id, code, description, status, estimated_amount, confirmed_amount, version").eq("aftersales_case_id", id).order("created_at") : Promise.resolve({ data: [] }),
    supabase.rpc("list_staff"),
  ]);
  return {
    c,
    events: ((events.data ?? []) as unknown as (Omit<EventRow, "author"> & { author: unknown })[]).map((e) => ({ ...e, author: one(e.author as { full_name: string } | null) })) as EventRow[],
    commitment: (commitment.data ?? null) as CommitmentRow | null,
    costs: (costs.data ?? []) as CaseCost[],
    staff: ((staff.data ?? []) as { id: string; full_name: string }[]),
  };
}

/** Cam kết/bảo hành và phiếu của các dòng xe trong một đơn bán (trang chi tiết đơn). */
export async function loadOrderAftersales(supabase: SupabaseClient, lineIds: string[]) {
  if (lineIds.length === 0) return { commitments: [] as CommitmentRow[], cases: [] as { id: string; code: string; title: string; status: string; order_line_id: string; next_due: string | null }[] };
  const [cm, cs] = await Promise.all([
    supabase.from("aftersales_commitments").select("id, code, kind, title, details, starts_on, ends_on, odo_limit, status, void_reason, version, order_line_id").in("order_line_id", lineIds).order("created_at"),
    supabase.from("aftersales_cases").select("id, code, title, status, order_line_id, next_due").in("order_line_id", lineIds).order("created_at", { ascending: false }),
  ]);
  return { commitments: (cm.data ?? []) as CommitmentRow[], cases: (cs.data ?? []) as { id: string; code: string; title: string; status: string; order_line_id: string; next_due: string | null }[] };
}
