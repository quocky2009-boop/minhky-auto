import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sumSalePrices } from "@/lib/sales-orders";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type OrderLine = {
  id: string; sale_price: unknown; needs_approval: boolean; line_status: "active" | "removed" | "cancelled"; quote_version_id: string | null; note: string | null;
  vehicle_id: string; vehicle_label: string;
};
export type OrderRow = {
  id: string; code: string; status: "draft" | "confirmed" | "cancelled"; version: number; owner_id: string; contract_ref: string | null; contract_date: string | null;
  note: string | null; approval_reason: string | null; end_reason: string | null; created_at: string; confirmed_at: string | null;
  demand: { id: string; code: string } | null; customer: { full_name: string; phone: string | null } | null; owner: { full_name: string } | null;
  lines: OrderLine[]; total: bigint | null;
};

const SELECT = "id, code, status, version, owner_id, contract_ref, contract_date, note, approval_reason, end_reason, created_at, confirmed_at, demand:demands(id, code), customer:customers(full_name, phone), owner:profiles!sales_orders_owner_id_fkey(full_name), lines:sales_order_lines(id, vehicle_id, vehicle_label, sale_price, needs_approval, line_status, quote_version_id, note)";

type Raw = Omit<OrderRow, "demand" | "customer" | "owner" | "lines" | "total"> & { demand: unknown; customer: unknown; owner: unknown; lines: OrderLine[] };

function shape(r: Raw): OrderRow {
  const lines = r.lines;
  const active = lines.filter((l) => l.line_status === "active");
  return {
    ...r, demand: one(r.demand as { id: string; code: string } | null), customer: one(r.customer as { full_name: string; phone: string | null } | null),
    owner: one(r.owner as { full_name: string } | null), lines, total: sumSalePrices(active.map((l) => l.sale_price as string)),
  } as OrderRow;
}

/** Danh sách đơn bán. RLS: sales chỉ nhận đơn của mình; quản lý/kế toán nhận tất cả. Phân trang phía server. */
export async function listOrders(supabase: SupabaseClient, page: number, pageSize: number, status: string) {
  let q = supabase.from("sales_orders").select(SELECT, { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (["draft", "confirmed", "cancelled"].includes(status)) q = q.eq("status", status);
  const { data, count, error } = await q;
  return { orders: ((data ?? []) as unknown as Raw[]).map(shape), total: count ?? 0, error: error?.message ?? null };
}

export async function getOrder(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("sales_orders").select(SELECT).eq("id", id).maybeSingle();
  return data ? shape(data as unknown as Raw) : null;
}

export type VehicleOption = { id: string; code: string; label: string; sale_status: string };
export type DemandOption = { id: string; code: string; customer_name: string };
export type QuoteOption = { id: string; vehicle_id: string; demand_id: string; label: string; price: string };

/** Lựa chọn cho form: xe đang bán, nhu cầu mua đang mở, phiên bản báo giá khách đã chấp nhận (chưa gắn vào đơn nào). RLS lọc theo người dùng. */
export async function loadOrderOptions(supabase: SupabaseClient, ownOrderId?: string) {
  const [veh, dem, qv, used] = await Promise.all([
    supabase.from("vehicles").select("id, code, sale_status, year_made, make:vehicle_makes(name), model:vehicle_models(name)").in("sale_status", ["available", "held", "deposited"]).is("archived_at", null).order("code").limit(300),
    supabase.from("demands").select("id, code, customer:customers(full_name)").eq("kind", "buy").not("status", "in", "(closed,paused)").order("updated_at", { ascending: false }).limit(100),
    supabase.from("quote_versions").select("id, version_no, offered_price, quote:quotes(code, vehicle_id, demand_id)").eq("status", "accepted").limit(200),
    (ownOrderId
      ? supabase.from("sales_order_lines").select("quote_version_id").eq("line_status", "active").not("quote_version_id", "is", null).neq("order_id", ownOrderId)
      : supabase.from("sales_order_lines").select("quote_version_id").eq("line_status", "active").not("quote_version_id", "is", null)),
  ]);
  const usedIds = new Set(((used.data ?? []) as { quote_version_id: string }[]).map((x) => x.quote_version_id));
  const vehicles = ((veh.data ?? []) as unknown as { id: string; code: string; sale_status: string; year_made: number | null; make: unknown; model: unknown }[]).map((v) => ({
    id: v.id, code: v.code, sale_status: v.sale_status,
    label: [v.code, one(v.make as { name: string } | null)?.name, one(v.model as { name: string } | null)?.name, v.year_made].filter(Boolean).join(" "),
  })) as VehicleOption[];
  const demands = ((dem.data ?? []) as unknown as { id: string; code: string; customer: unknown }[]).map((d) => ({
    id: d.id, code: d.code, customer_name: one(d.customer as { full_name: string } | null)?.full_name ?? "",
  })) as DemandOption[];
  const quotes = ((qv.data ?? []) as unknown as { id: string; version_no: number; offered_price: unknown; quote: unknown }[]).filter((x) => !usedIds.has(x.id)).flatMap((x) => {
    const q = one(x.quote as { code: string; vehicle_id: string; demand_id: string } | null);
    return q ? [{ id: x.id, vehicle_id: q.vehicle_id, demand_id: q.demand_id, label: `${q.code} bản ${x.version_no}`, price: String(x.offered_price).split(".")[0] }] : [];
  }) as QuoteOption[];
  return { vehicles, demands, quotes };
}
