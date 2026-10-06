/**
 * Đơn bán nhiều xe: nhãn, đọc form, tổng giá bán. Thuần TypeScript, kiểm thử được.
 * Việc dòng có CẦN DUYỆT (thấp hơn mức cho phép) do DATABASE quyết định; màn hình không biết giá sàn.
 * Giá bán trên đơn là giá ghi trong hợp đồng — KHÔNG phải tiền đã thu (thu chi làm ở lát sau). Tổng dùng BigInt, không dùng số thực.
 */
import { parseVndInput } from "@/lib/money";
import type { FormInput, ParseResult } from "@/lib/costs";

export const ORDER_STATUS_LABEL: Record<string, string> = { draft: "Đang soạn", confirmed: "Đã ký hợp đồng bán", cancelled: "Đã hủy" };
export const LINE_STATUS_LABEL: Record<string, string> = { active: "Hiệu lực", removed: "Đã bỏ khỏi đơn", cancelled: "Đã hủy" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const badSession: ParseResult = { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };

/** Dòng xe từ các ô song song line_vehicle[] / line_price[] / line_quote[]; dòng trống hoàn toàn bị bỏ qua; một xe không xuất hiện hai lần. */
export function parseOrderForm(fd: FormInput, mode: "create" | "update"): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const requestId = s("request_id");
  if (mode === "create" && !UUID.test(requestId)) return badSession;
  const payload: Record<string, unknown> = { contract_ref: s("contract_ref"), note: s("note") };
  if (mode === "create") {
    payload.request_id = requestId;
    const demandId = s("demand_id");
    if (!UUID.test(demandId)) errs.demand_id = "Chọn nhu cầu mua của khách";
    payload.demand_id = demandId;
  }
  const date = s("contract_date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.contract_date = "Ngày không hợp lệ";
  payload.contract_date = date;

  const vs = fd.getAll("line_vehicle").map((x) => String(x ?? "").trim());
  const ps = fd.getAll("line_price").map((x) => String(x ?? "").trim());
  const qs = fd.getAll("line_quote").map((x) => String(x ?? "").trim());
  const lines: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  vs.forEach((v, i) => {
    const price = ps[i] ?? "", quote = qs[i] ?? "";
    if (!v && !price) return;
    if (!UUID.test(v)) { errs[`line_vehicle_${i}`] = "Chọn xe"; return; }
    if (seen.has(v)) { errs[`line_vehicle_${i}`] = "Xe này đã có trong đơn"; return; }
    seen.add(v);
    try {
      const p = parseVndInput(price);
      if (p === null || p <= 0n) errs[`line_price_${i}`] = "Nhập giá bán (lớn hơn 0)";
      else lines.push({ vehicle_id: v, sale_price: p.toString(), ...(UUID.test(quote) ? { quote_version_id: quote } : {}) });
    } catch { errs[`line_price_${i}`] = "Không hiểu số tiền. Ví dụ: 650tr, 650.000.000"; }
  });
  if (lines.length === 0 && Object.keys(errs).length === 0) errs.line_vehicle_0 = "Đơn bán cần ít nhất một xe";
  if (Object.keys(errs).length) return fail(errs);
  payload.lines = lines;
  return { ok: true, payload };
}

/** Tổng giá bán các dòng (BigInt, VND nguyên). Giá thiếu/không hợp lệ không được coi là 0: trả null. */
export function sumSalePrices(prices: (string | number | bigint | null | undefined)[]): bigint | null {
  let total = 0n;
  for (const p of prices) {
    if (p === null || p === undefined || p === "") return null;
    try { total += BigInt(String(p).split(".")[0]); } catch { return null; }
  }
  return total;
}
