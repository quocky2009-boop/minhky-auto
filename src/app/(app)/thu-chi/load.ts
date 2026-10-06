import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type AccountBalance = { id: string; code: string; name: string; kind: "cash" | "bank"; is_active: boolean; opening_balance: unknown; total_in: unknown; total_out: unknown; balance: unknown; version: number };
export type VoucherRow = {
  id: string; code: string; direction: "in" | "out"; purpose: string; amount: unknown; occurred_on: string; method: string; payer_kind: string | null;
  counterparty: string; reference: string | null; note: string | null; status: "posted" | "voided"; void_reason: string | null; version: number; created_at: string;
  account: { code: string; name: string } | null; order: { id: string; code: string } | null; reservation: { code: string } | null; creator: { full_name: string } | null;
};
export type OrderOption = { id: string; code: string; customer: string; status: string; total: string; paid: string; outstanding: string | null };
export type DepositOption = { id: string; code: string; status: string; deposit_amount: string; net_deposit: string; customer: string };

export async function loadAccounts(supabase: SupabaseClient) {
  // số dư lấy từ view (một nguồn tính); version lấy từ bảng để khóa phiên bản khi ngừng/mở lại tài khoản
  const [bal, ver] = await Promise.all([
    supabase.from("money_account_balances").select("id, code, name, kind, is_active, opening_balance, total_in, total_out, balance").order("code"),
    supabase.from("money_accounts").select("id, version"),
  ]);
  const v = new Map(((ver.data ?? []) as { id: string; version: number }[]).map((x) => [x.id, x.version]));
  return ((bal.data ?? []) as Omit<AccountBalance, "version">[]).map((a) => ({ ...a, version: v.get(a.id) ?? 1 })) as AccountBalance[];
}

export async function listVouchers(supabase: SupabaseClient, page: number, pageSize: number, f: { direction?: string; account?: string; from?: string; to?: string; status?: string }) {
  let q = supabase.from("cash_vouchers")
    .select("id, code, direction, purpose, amount, occurred_on, method, payer_kind, counterparty, reference, note, status, void_reason, version, created_at, account:money_accounts(code, name), order:sales_orders(id, code), reservation:vehicle_reservations(code), creator:profiles!cash_vouchers_created_by_fkey(full_name)", { count: "exact" })
    .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (f.direction === "in" || f.direction === "out") q = q.eq("direction", f.direction);
  if (f.account && /^[0-9a-f-]{36}$/i.test(f.account)) q = q.eq("account_id", f.account);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) q = q.gte("occurred_on", f.from);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) q = q.lte("occurred_on", f.to);
  if (f.status === "voided" || f.status === "posted") q = q.eq("status", f.status);
  const { data, count, error } = await q;
  const rows = ((data ?? []) as unknown as (Omit<VoucherRow, "account" | "order" | "reservation" | "creator"> & { account: unknown; order: unknown; reservation: unknown; creator: unknown })[]).map((r) => ({
    ...r, account: one(r.account as { code: string; name: string } | null), order: one(r.order as { id: string; code: string } | null),
    reservation: one(r.reservation as { code: string } | null), creator: one(r.creator as { full_name: string } | null),
  })) as VoucherRow[];
  return { rows, total: count ?? 0, error: error?.message ?? null };
}

/** Đơn bán đã ký (còn nợ hoặc đã có thanh toán) và đặt cọc có tiền cọc — để chọn khi lập phiếu. */
export async function loadVoucherTargets(supabase: SupabaseClient) {
  const [orders, deps] = await Promise.all([
    supabase.from("sales_order_balances").select("order_id, code, status, total, paid_direct, outstanding").eq("status", "confirmed").order("code", { ascending: false }).limit(200),
    supabase.from("reservation_deposit_balances").select("reservation_id, code, status, deposit_amount, net_deposit").order("code", { ascending: false }).limit(200),
  ]);
  const orderIds = ((orders.data ?? []) as { order_id: string }[]).map((o) => o.order_id);
  const names = orderIds.length ? await supabase.from("sales_orders").select("id, customer:customers(full_name)").in("id", orderIds) : { data: [] };
  const nameOf = new Map(((names.data ?? []) as unknown as { id: string; customer: unknown }[]).map((x) => [x.id, one(x.customer as { full_name: string } | null)?.full_name ?? ""]));
  const orderOptions = ((orders.data ?? []) as { order_id: string; code: string; status: string; total: unknown; paid_direct: unknown; outstanding: unknown }[]).map((o) => ({
    id: o.order_id, code: o.code, status: o.status, customer: nameOf.get(o.order_id) ?? "", total: String(o.total), paid: String(o.paid_direct), outstanding: o.outstanding === null ? null : String(o.outstanding),
  })) as OrderOption[];
  const depositOptions = ((deps.data ?? []) as { reservation_id: string; code: string; status: string; deposit_amount: unknown; net_deposit: unknown }[]).map((r) => ({
    id: r.reservation_id, code: r.code, status: r.status, deposit_amount: String(r.deposit_amount), net_deposit: String(r.net_deposit), customer: "",
  })) as DepositOption[];
  return { orderOptions, depositOptions };
}
