import { formatVnd, toVnd } from "@/lib/money";

/** Kỳ báo cáo theo ngày ký hợp đồng (giờ Asia/Ho_Chi_Minh), bao gồm hai đầu. */
export type Period = { from: string; to: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const vnDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function defaultPeriod(now = new Date()): Period {
  const today = vnDate(now);
  return { from: today.slice(0, 8) + "01", to: today };
}

/** Ngày không hợp lệ hoặc đảo đầu cuối → quay về kỳ mặc định (tháng hiện tại), không im lặng nhận giá trị lạ. */
export function parsePeriod(from: string | undefined, to: string | undefined, now = new Date()): Period & { adjusted: boolean } {
  const def = defaultPeriod(now);
  if (!from && !to) return { ...def, adjusted: false };
  const valid = (s: string | undefined): s is string => !!s && ISO.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
  if (!valid(from) || !valid(to) || from > to) return { ...def, adjusted: true };
  return { from, to, adjusted: false };
}

export type Totals = {
  lines: number; owned_lines: number; consignment_lines: number; sale_total_owned: string; gross_profit: string; gross_unknown: number;
  result_after_costs: string; open_cost_lines: number; distributable: string; company_operating: string; owned_unsettled: number;
  consignment_fee: string; consignment_unsettled: number; general_expense: string; other_expense: string; other_income: string; aftersales_cost: string;
  commission_approved: string; commission_pending: number; commission_no_rule: number; showroom_result: string;
};

/** Các chỉ tiêu cần cảnh báo dữ liệu chưa đủ: không để số trông như đầy đủ khi còn dòng thiếu. */
export function totalsWarnings(t: Totals): string[] {
  const w: string[] = [];
  if (t.gross_unknown > 0) w.push(`${t.gross_unknown} xe sở hữu chưa có giá mua nên chưa tính vào lãi gộp (không coi là 0).`);
  if (t.open_cost_lines > 0) w.push(`Còn ${t.open_cost_lines} khoản chi phí dự kiến chưa xác nhận: kết quả sau chi phí có thể thay đổi.`);
  if (t.owned_unsettled > 0) w.push(`${t.owned_unsettled} xe sở hữu chưa có quyết toán đã duyệt nên chưa có lợi nhuận phân chia.`);
  if (t.consignment_unsettled > 0) w.push(`${t.consignment_unsettled} xe ký gửi chưa có quyết toán đã duyệt nên chưa tính phí ký gửi showroom hưởng.`);
  if (t.commission_pending > 0) w.push(`${t.commission_pending} khoản hoa hồng đã tính nhưng chưa được quản lý duyệt nên chưa trừ vào kết quả toàn showroom.`);
  if (t.commission_no_rule > 0) w.push(`${t.commission_no_rule} khoản hoa hồng chưa có quy tắc nên chưa tính (không coi là 0).`);
  return w;
}

export type ResultRow = {
  line_id: string; order_id: string; order_code: string; sold_on: string; vehicle_id: string; vehicle_code: string; vehicle_label: string;
  business_type: "owned" | "consignment"; sale_price: unknown; purchase_price: unknown; gross_profit: unknown; costs_confirmed: unknown;
  open_cost_lines: number; result_after_costs: unknown; settlement_id: string | null; settlement_code: string | null; settlement_status: string | null;
  distributable: unknown; company_operating: unknown; fee_amount: unknown;
};

export const RESULT_COLUMNS = "line_id, order_id, order_code, sold_on, vehicle_id, vehicle_code, vehicle_label, business_type, sale_price, purchase_price, gross_profit, costs_confirmed, open_cost_lines, result_after_costs, settlement_id, settlement_code, settlement_status, distributable, company_operating, fee_amount";

export const BUSINESS_LABEL: Record<string, string> = { owned: "Sở hữu", consignment: "Ký gửi" };

/** Ô CSV: chống chèn công thức khi mở bằng Excel (ô chữ bắt đầu bằng = + - @ hoặc tab); bọc nháy khi có dấu phẩy, nháy, xuống dòng. */
export function csvCell(v: string | number | bigint | null | undefined, text = true): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (text && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (v: unknown) => { const n = toVnd(v); return n === null ? "" : n.toString(); };
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** CSV kết quả xe: ô trống = chưa có dữ liệu (không phải 0). Có BOM để Excel đọc đúng tiếng Việt. */
export function resultsToCsv(rows: ResultRow[]): string {
  const head = ["Mã đơn", "Ngày ký", "Mã xe", "Xe", "Loại", "Giá bán", "Giá mua", "Lãi gộp", "Chi phí đã xác nhận", "Kết quả sau chi phí", "Mã quyết toán", "Trạng thái quyết toán", "Lợi nhuận phân chia (P)", "Phần công ty vận hành (C)", "Phí ký gửi showroom hưởng"];
  const lines = [head.map((h) => csvCell(h)).join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.order_code), csvCell(dmy(r.sold_on)), csvCell(r.vehicle_code), csvCell(r.vehicle_label), csvCell(BUSINESS_LABEL[r.business_type] ?? r.business_type),
      num(r.sale_price), num(r.purchase_price), num(r.gross_profit), num(r.costs_confirmed), num(r.result_after_costs),
      csvCell(r.settlement_code), csvCell(r.settlement_status), num(r.distributable), num(r.company_operating), num(r.fee_amount),
    ].join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export type InventoryRow = {
  vehicle_id: string; code: string; business_type: "owned" | "consignment"; sale_status: string; label: string; age_days: number | null;
  purchase_price: unknown; costs_confirmed_showroom: unknown; open_cost_lines: number; capital_tied: unknown; external_capital: unknown; loan_outstanding: unknown;
};
export const INVENTORY_COLUMNS = "vehicle_id, code, business_type, sale_status, label, age_days, purchase_price, costs_confirmed_showroom, open_cost_lines, capital_tied, external_capital, loan_outstanding";

export function inventoryToCsv(rows: InventoryRow[]): string {
  const head = ["Mã xe", "Xe", "Loại", "Trạng thái bán", "Tuổi tồn (ngày)", "Giá mua", "Chi phí đã xác nhận", "Vốn hàng tồn sở hữu", "Vốn góp ngoài (ròng)", "Dư nợ vay", "Chi phí chưa xác nhận (dòng)"];
  const lines = [head.map((h) => csvCell(h)).join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.code), csvCell(r.label), csvCell(BUSINESS_LABEL[r.business_type] ?? r.business_type), csvCell(r.sale_status), r.age_days ?? "",
      r.business_type === "owned" ? num(r.purchase_price) : "", r.business_type === "owned" ? num(r.costs_confirmed_showroom) : "",
      r.business_type === "owned" ? num(r.capital_tied) : "", r.business_type === "owned" ? num(r.external_capital) : "", r.business_type === "owned" ? num(r.loan_outstanding) : "",
      r.open_cost_lines,
    ].join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export const money = (v: unknown) => (toVnd(v) === null ? "—" : formatVnd(v));
