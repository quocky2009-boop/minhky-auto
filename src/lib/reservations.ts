/**
 * Giữ xe và đặt cọc: nhãn, đọc form, trạng thái hết hạn. Thuần TypeScript, kiểm thử được.
 * Luật độc quyền (một xe một giữ/cọc hiệu lực) và quyền nằm ở database; kiểm tra ở đây để báo lỗi sớm và dễ hiểu.
 * Hạn giữ xe do người giữ nhập — KHÔNG có hạn mặc định. Số tiền cọc là số THỎA THUẬN, chưa phải đã thu (thu chi làm ở lát sau).
 */
import { parseVndInput } from "@/lib/money";
import { fromLocalInput } from "@/lib/dates";
import type { FormInput, ParseResult } from "@/lib/costs";

export const RESERVATION_KIND_LABEL: Record<string, string> = { hold: "Giữ xe", deposit: "Đặt cọc" };
export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  active: "Đang hiệu lực", converted: "Đã chuyển thành đặt cọc", released: "Đã nhả", cancelled: "Đã hủy cọc", fulfilled: "Đã thành đơn bán",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const badSession: ParseResult = { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };

function reader(fd: FormInput, errs: Record<string, string>) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    s,
    money: (k: string) => {
      try { const v = parseVndInput(s(k)); return v === null ? "" : v.toString(); }
      catch { errs[k] = "Không hiểu số tiền. Ví dụ: 30tr, 650.000.000"; return ""; }
    },
    /** datetime-local (giờ VN) -> ISO UTC; rỗng -> "". Phải ở tương lai. */
    future: (k: string, now: Date) => {
      const v = s(k);
      if (!v) return "";
      try {
        const iso = fromLocalInput(v);
        if (iso && new Date(iso).getTime() <= now.getTime()) { errs[k] = "Thời điểm phải ở tương lai"; return ""; }
        return iso ?? "";
      } catch { errs[k] = "Thời gian không hợp lệ"; return ""; }
    },
  };
}

/** Giữ xe: bắt buộc nhập hạn (không có mặc định). Đặt cọc: bắt buộc số tiền cọc thỏa thuận > 0. */
export function parseReserveForm(fd: FormInput, now = new Date()): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const requestId = r.s("request_id"), vehicleId = r.s("vehicle_id"), demandId = r.s("demand_id");
  if (!UUID.test(requestId) || !UUID.test(vehicleId)) return badSession;
  if (!UUID.test(demandId)) errs.demand_id = "Chọn nhu cầu mua của khách";
  const kind = r.s("kind");
  if (!(kind in RESERVATION_KIND_LABEL)) errs.kind = "Chọn giữ xe hoặc đặt cọc";
  const until = r.future("valid_until", now);
  const amount = r.money("deposit_amount");
  const price = r.money("agreed_price");
  if (kind === "hold" && !errs.valid_until && until === "") errs.valid_until = "Nhập hạn giữ xe (không có hạn mặc định)";
  if (kind === "deposit" && !errs.deposit_amount && (amount === "" || BigInt(amount) <= 0n)) errs.deposit_amount = "Nhập số tiền cọc thỏa thuận (lớn hơn 0)";
  if (!errs.agreed_price && price !== "" && BigInt(price) <= 0n) errs.agreed_price = "Giá chốt phải lớn hơn 0";
  if (Object.keys(errs).length) return fail(errs);
  const payload: Record<string, unknown> = { request_id: requestId, vehicle_id: vehicleId, demand_id: demandId, kind, agreed_price: price, note: r.s("note") };
  if (kind === "hold") payload.valid_until = until;
  else { payload.deposit_amount = amount; if (until) payload.valid_until = until; }
  return { ok: true, payload };
}

export function parseConvertForm(fd: FormInput, now = new Date()): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const requestId = r.s("request_id");
  if (!UUID.test(requestId)) return badSession;
  const amount = r.money("deposit_amount");
  if (!errs.deposit_amount && (amount === "" || BigInt(amount) <= 0n)) errs.deposit_amount = "Nhập số tiền cọc thỏa thuận (lớn hơn 0)";
  const price = r.money("agreed_price");
  if (!errs.agreed_price && price !== "" && BigInt(price) <= 0n) errs.agreed_price = "Giá chốt phải lớn hơn 0";
  const until = r.future("valid_until", now);
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, deposit_amount: amount, agreed_price: price, valid_until: until, note: r.s("note") } };
}

export function parseExtendForm(fd: FormInput, now = new Date()): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const until = r.future("valid_until", now);
  if (!errs.valid_until && until === "") errs.valid_until = "Nhập hạn mới";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { valid_until: until } };
}

/** Giữ xe đã quá hạn nhưng chưa được nhả (nhả lười khi có người giữ/cọc hoặc quản lý bấm nhả). */
export function isExpiredHold(r: { kind: string; status: string; valid_until: string | null }, now = new Date()): boolean {
  return r.kind === "hold" && r.status === "active" && !!r.valid_until && new Date(r.valid_until).getTime() <= now.getTime();
}
