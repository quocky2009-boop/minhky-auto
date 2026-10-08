import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type EntryRow = {
  id: string; code: string; status: "no_rule" | "accrued" | "approved" | "cancelled"; version: number; amount: unknown; sold_on: string; employee_id: string;
  rule_snapshot: { code?: string; scope?: string; amount?: string; effective_from?: string } | null; end_reason: string | null; approved_at: string | null;
  order_id: string; vehicle_id: string; created_at: string;
  vehicle: { code: string; condition: string; vin: string | null; year_made: number | null; make: string | null; model: string | null } | null;
  employee: { full_name: string } | null; order: { code: string } | null; paid: unknown; remaining: unknown;
};
export type PaymentRow = { id: string; amount: unknown; paid_on: string; status: string; reference: string | null; note: string | null; void_reason: string | null; account: { code: string; name: string } | null };
export type RuleRow = {
  id: string; code: string; scope: "model" | "vin"; amount: unknown; effective_from: string; note: string | null; status: "active" | "void"; void_reason: string | null; version: number; vin: string | null;
  make: { name: string } | null; model: { name: string } | null;
};

const ENTRY_SELECT = "id, code, status, version, amount, sold_on, employee_id, rule_snapshot, end_reason, approved_at, order_id, vehicle_id, created_at, vehicle:vehicles(code, condition, vin, year_made, make:vehicle_makes(name), model:vehicle_models(name)), employee:profiles!commission_entries_employee_id_fkey(full_name), order:sales_orders(code)";

function shape(r: Record<string, unknown>): EntryRow {
  const v = one(r.vehicle as { code: string; make: unknown; model: unknown } | null);
  return {
    ...(r as object), vehicle: v ? { ...v, make: one(v.make as { name: string } | null)?.name ?? null, model: one(v.model as { name: string } | null)?.name ?? null } : null,
    employee: one(r.employee as { full_name: string } | null), order: one(r.order as { code: string } | null), paid: 0, remaining: null,
  } as unknown as EntryRow;
}

/** RLS: quản lý/tài chính thấy tất cả, sales chỉ thấy của mình. Phân trang phía server. */
export async function listEntries(supabase: SupabaseClient, tab: string, page: number, pageSize: number) {
  let q = supabase.from("commission_entries").select(ENTRY_SELECT, { count: "exact" });
  if (["no_rule", "accrued", "approved", "cancelled"].includes(tab)) q = q.eq("status", tab);
  const { data, count, error } = await q.order("sold_on", { ascending: false }).order("code", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(shape);
  if (rows.length) {
    const { data: bal } = await supabase.from("commission_balances").select("entry_id, paid, remaining").in("entry_id", rows.map((r) => r.id));
    const m = new Map(((bal ?? []) as { entry_id: string; paid: unknown; remaining: unknown }[]).map((b) => [b.entry_id, b]));
    for (const r of rows) { r.paid = m.get(r.id)?.paid ?? 0; r.remaining = m.get(r.id)?.remaining ?? null; }
  }
  return { rows, total: count ?? 0, error: error?.message ?? null };
}

export async function getEntry(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("commission_entries").select(ENTRY_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const e = shape(data as unknown as Record<string, unknown>);
  const [bal, pays] = await Promise.all([
    supabase.from("commission_balances").select("paid, remaining").eq("entry_id", id).maybeSingle(),
    supabase.from("commission_payments").select("id, amount, paid_on, status, reference, note, void_reason, account:money_accounts(code, name)").eq("entry_id", id).order("created_at"),
  ]);
  e.paid = (bal.data as { paid: unknown } | null)?.paid ?? 0;
  e.remaining = (bal.data as { remaining: unknown } | null)?.remaining ?? null;
  const payments = ((pays.data ?? []) as unknown as (Omit<PaymentRow, "account"> & { account: unknown })[]).map((p) => ({ ...p, account: one(p.account as { code: string; name: string } | null) })) as PaymentRow[];
  return { entry: e, payments };
}

export async function loadRules(supabase: SupabaseClient) {
  const [rules, makes, models] = await Promise.all([
    supabase.from("commission_rules").select("id, code, scope, amount, effective_from, note, status, void_reason, version, vin, make:vehicle_makes(name), model:vehicle_models(name)")
      .order("status").order("effective_from", { ascending: false }).limit(300),
    supabase.from("vehicle_makes").select("id, name").order("name"),
    supabase.from("vehicle_models").select("id, make_id, name").order("name"),
  ]);
  const list = ((rules.data ?? []) as unknown as (Omit<RuleRow, "make" | "model"> & { make: unknown; model: unknown })[])
    .map((r) => ({ ...r, make: one(r.make as { name: string } | null), model: one(r.model as { name: string } | null) })) as RuleRow[];
  return { rules: list, makes: (makes.data ?? []) as { id: string; name: string }[], models: (models.data ?? []) as { id: string; make_id: string; name: string }[] };
}
