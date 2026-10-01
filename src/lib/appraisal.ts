/** Đọc form thẩm định thành payload cho RPC save_appraisal. Thuần TypeScript, kiểm thử được. */
import { parseVndInput } from "@/lib/money";

export type FormInput = { get(name: string): unknown; getAll(name: string): unknown[] };
export const RESULTS = ["unchecked", "pass", "fail", "na"] as const;
export const RESULT_LABEL: Record<string, string> = { unchecked: "Chưa kiểm tra", pass: "Đạt", fail: "Không đạt", na: "Không áp dụng" };

export type AppraisalParse =
  | { ok: true; payload: Record<string, unknown>; approvedMax: string }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

export function parseAppraisalForm(fd: FormInput): AppraisalParse {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const money = (k: string) => {
    try {
      const v = parseVndInput(s(k));
      return v === null ? "" : v.toString();
    } catch {
      errs[k] = "Không hiểu số tiền. Ví dụ: 650tr, 1,2 tỷ";
      return "";
    }
  };
  const items: Record<string, { result: string; note: string }> = {};
  for (const key of fd.getAll("item_keys").map(String)) {
    if (!/^[a-z0-9_]+$/.test(key)) continue;
    const result = s(`item_${key}`);
    items[key] = { result: (RESULTS as readonly string[]).includes(result) ? result : "unchecked", note: s(`note_${key}`) };
  }
  const payload: Record<string, unknown> = { items, is_ev: s("is_ev") === "on", summary: s("summary") };
  if (fd.get("proposed_price") !== null) payload.proposed_price = money("proposed_price");
  const approvedMax = fd.get("approved_max_price") !== null ? money("approved_max_price") : "";
  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload, approvedMax };
}
