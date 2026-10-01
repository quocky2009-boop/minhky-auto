/**
 * Chuyển tham số URL (bộ lọc dạng GET, lưu/chia sẻ được) <-> tham số RPC search_demands.
 * Thuần TypeScript để kiểm thử được.
 */
import { parseVndInput } from "@/lib/money";

export const FILTER_KEYS = [
  "kind", "state", "make", "model", "variant", "yf", "yt", "color", "pf", "pt",
  "area", "owner", "source", "prio", "fu", "since", "q", "sort",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const intOrEmpty = (v: string) => (/^\d{4}$/.test(v) ? v : "");

export function readFilters(sp: RawParams): Record<FilterKey, string> {
  const out = {} as Record<FilterKey, string>;
  for (const k of FILTER_KEYS) out[k] = first(sp[k]);
  return out;
}

/** Tham số gửi lên database. Giá nhập tự do "650tr", "1,2 tỷ" -> số VND; không hiểu được -> bỏ qua (không thành 0). */
function safeVnd(raw: string, label: string, warnings: string[]) {
  try {
    return parseVndInput(raw);
  } catch {
    warnings.push(`Không hiểu ${label} "${raw}" — bộ lọc giá này được bỏ qua. Ví dụ hợp lệ: 600tr, 1,2 tỷ.`);
    return null;
  }
}

export function toRpcFilter(f: Record<FilterKey, string>): { rpc: Record<string, string>; warnings: string[] } {
  const warnings: string[] = [];
  const pf = safeVnd(f.pf, "giá từ", warnings);
  const pt = safeVnd(f.pt, "giá đến", warnings);
  const rpc: Record<string, string> = {
    kind: f.kind,
    state: f.state || "open",
    make_id: f.make,
    model_id: f.model,
    variant_id: f.variant,
    year_from: intOrEmpty(f.yf),
    year_to: intOrEmpty(f.yt),
    color: f.color,
    price_from: pf === null ? "" : pf.toString(),
    price_to: pt === null ? "" : pt.toString(),
    area: f.area,
    owner_id: f.owner,
    source_id: f.source,
    priority: f.prio,
    followup: f.fu,
    updated_since: /^\d{4}-\d{2}-\d{2}$/.test(f.since) ? f.since : "",
    q: f.q,
    sort: f.sort,
  };
  for (const k of Object.keys(rpc)) if (!rpc[k]) delete rpc[k];
  return { rpc, warnings };
}

/** Chuỗi query giữ lại bộ lọc (dùng cho phân trang, lưu bộ lọc). */
export function toQueryString(f: Partial<Record<FilterKey, string>>, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) p.set(k, f[k] as string);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
}

export const hasActiveFilter = (f: Record<FilterKey, string>) =>
  FILTER_KEYS.some((k) => k !== "sort" && k !== "state" && !!f[k]) || (!!f.state && f.state !== "open");
