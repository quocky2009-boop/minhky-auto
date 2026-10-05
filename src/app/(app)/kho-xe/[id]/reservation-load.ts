import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReservationRow = {
  id: string; code: string; kind: "hold" | "deposit"; status: "active" | "converted" | "released" | "cancelled" | "fulfilled"; version: number;
  valid_until: string | null; deposit_amount: unknown; agreed_price: unknown; note: string | null; end_reason: string | null; created_at: string; ended_at: string | null;
  owner_id: string; demand: { id: string; code: string } | null; customer: { full_name: string; phone: string | null } | null; owner: { full_name: string } | null;
};
export type PublicInfo = { kind: "hold" | "deposit"; owner_name: string; valid_until: string | null; is_mine: boolean };
export type DemandOption = { id: string; code: string; customer_name: string; status: string };

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

/**
 * Giữ/cọc của một xe. RLS: sales chỉ nhận về bản ghi của mình; quản lý/kế toán nhận tất cả.
 * Sales khác chỉ biết xe đang bị giữ/cọc qua hàm hẹp public_reservation_info (không lộ khách, số tiền).
 */
export async function loadReservations(supabase: SupabaseClient, vehicleId: string, wantDemands: boolean) {
  const [rows, info, demands] = await Promise.all([
    supabase.from("vehicle_reservations")
      .select("id, code, kind, status, version, valid_until, deposit_amount, agreed_price, note, end_reason, created_at, ended_at, owner_id, demand:demands(id, code), customer:customers(full_name, phone), owner:profiles!vehicle_reservations_owner_id_fkey(full_name)")
      .eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
    supabase.rpc("public_reservation_info", { p_vehicle: vehicleId }),
    wantDemands
      ? supabase.from("demands").select("id, code, status, customer:customers(full_name)").eq("kind", "buy").not("status", "in", "(closed,won,paused)").order("updated_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const list = ((rows.data ?? []) as unknown as (Omit<ReservationRow, "demand" | "customer" | "owner"> & { demand: unknown; customer: unknown; owner: unknown })[]).map((r) => ({
    ...r, demand: one(r.demand as { id: string; code: string } | null), customer: one(r.customer as { full_name: string; phone: string | null } | null), owner: one(r.owner as { full_name: string } | null),
  })) as ReservationRow[];
  const options = ((demands.data ?? []) as unknown as { id: string; code: string; status: string; customer: unknown }[]).map((d) => ({
    id: d.id, code: d.code, status: d.status, customer_name: one(d.customer as { full_name: string } | null)?.full_name ?? "",
  })) as DemandOption[];
  return { reservations: list, publicInfo: ((info.data ?? []) as PublicInfo[])[0] ?? null, demandOptions: options };
}
