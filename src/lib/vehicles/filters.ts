/** Bộ lọc kho xe: tham số URL <-> tham số RPC search_vehicles. Thuần TypeScript, kiểm thử được. */
import { parseVndInput } from "@/lib/money";

export const VFILTER_KEYS = ["q", "cond", "bt", "state", "prep", "make", "model", "yf", "yt", "color", "pf", "pt", "loc", "age", "sort"] as const;
export type VFilterKey = (typeof VFILTER_KEYS)[number];
export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export function readVehicleFilters(sp: RawParams): Record<VFilterKey, string> {
  const out = {} as Record<VFilterKey, string>;
  for (const k of VFILTER_KEYS) out[k] = first(sp[k]);
  return out;
}

export function toVehicleRpcFilter(f: Record<VFilterKey, string>): { rpc: Record<string, string>; warnings: string[] } {
  const warnings: string[] = [];
  const money = (raw: string, label: string) => {
    try {
      const v = parseVndInput(raw);
      return v === null ? "" : v.toString();
    } catch {
      warnings.push(`Không hiểu ${label} "${raw}" — bộ lọc giá này được bỏ qua. Ví dụ hợp lệ: 600tr, 1,2 tỷ.`);
      return "";
    }
  };
  const year = (v: string) => (/^\d{4}$/.test(v) ? v : "");
  const rpc: Record<string, string> = {
    q: f.q, condition: f.cond, business_type: f.bt, state: f.state || "stock", prep_status: f.prep,
    make_id: f.make, model_id: f.model, year_from: year(f.yf), year_to: year(f.yt), color: f.color,
    price_from: money(f.pf, "giá từ"), price_to: money(f.pt, "giá đến"), location_id: f.loc,
    age_min: /^\d{1,4}$/.test(f.age) ? f.age : "", sort: f.sort,
  };
  for (const k of Object.keys(rpc)) if (!rpc[k]) delete rpc[k];
  return { rpc, warnings };
}

export function toVehicleQuery(f: Partial<Record<VFilterKey, string>>, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const k of VFILTER_KEYS) if (f[k]) p.set(k, f[k] as string);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
}
