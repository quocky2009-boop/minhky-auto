/**
 * Đọc & kiểm tra form xe (nhập mới / sửa) và form nhập kho từ nhu cầu bán.
 * Ô bỏ trống = "Chưa rõ" (chuỗi rỗng gửi xuống database -> null), không bao giờ tự điền 0.
 */
import { parseVndInput } from "@/lib/money";

export type FormInput = { get(name: string): unknown; getAll(name: string): unknown[] };
export type ParseResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

const FUELS = ["gasoline", "diesel", "hybrid", "phev", "ev", "other"];
const SOURCES = ["manufacturer", "distributor", "individual", "other_dealer", "trade_in"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIN = /^[A-Za-z0-9]{5,25}$/;

function reader(fd: FormInput, errs: Record<string, string>) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    s,
    money: (k: string) => {
      try {
        const v = parseVndInput(s(k));
        return v === null ? "" : v.toString();
      } catch {
        errs[k] = "Không hiểu số tiền. Ví dụ: 650tr, 1,2 tỷ, 650.000.000";
        return "";
      }
    },
    year: (k: string) => {
      const v = s(k);
      if (!v) return "";
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1950 || n > 2100) errs[k] = "Năm không hợp lệ";
      return v;
    },
    int: (k: string, max = 2_000_000_000) => {
      const v = s(k).replace(/[.,\s]/g, "");
      if (!v) return "";
      if (!/^\d+$/.test(v) || Number(v) > max) errs[k] = "Số không hợp lệ";
      return v;
    },
    date: (k: string) => {
      const v = s(k);
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errs[k] = "Ngày không hợp lệ";
      return v;
    },
  };
}

export function parseVehicleForm(fd: FormInput, mode: "create" | "update"): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const payload: Record<string, unknown> = {};

  if (!r.s("make")) errs.make = "Nhập hãng xe";
  const condition = r.s("condition");
  if (mode === "create" && !["new", "used"].includes(condition)) errs.condition = "Chọn xe mới hoặc đã qua sử dụng";
  const business = mode === "create" ? r.s("business_type") || "owned" : r.s("business_type_locked");
  if (mode === "create" && !["owned", "consignment"].includes(business)) errs.business_type = "Chọn hình thức";

  Object.assign(payload, {
    make: r.s("make"), model: r.s("model"), variant: r.s("variant"),
    vin: r.s("vin").toUpperCase(), plate: r.s("plate").toUpperCase(),
    year_made: r.year("year_made"), year_registered: r.year("year_registered"),
    color: r.s("color"), fuel_type: FUELS.includes(r.s("fuel_type")) ? r.s("fuel_type") : "",
    seats: r.int("seats", 60), odo: r.int("odo"),
    source_type: SOURCES.includes(r.s("source_type")) ? r.s("source_type") : "",
    location_id: UUID.test(r.s("location_id")) ? r.s("location_id") : "",
    prep_status: ["pending", "in_progress", "ready"].includes(r.s("prep_status")) ? r.s("prep_status") : "pending",
    paperwork_status: ["incomplete", "complete"].includes(r.s("paperwork_status")) ? r.s("paperwork_status") : "incomplete",
    intake_date: r.date("intake_date"), notes: r.s("notes"),
    asking_price: r.money("asking_price"),
  });
  if (condition) payload.condition = condition;
  if (payload.vin && !VIN.test(payload.vin as string)) errs.vin = "Số VIN/số khung chỉ gồm chữ và số (5–25 ký tự), không có khoảng trắng";
  const sale = r.s("sale_status");
  if (mode === "update" && ["not_listed", "available"].includes(sale)) payload.sale_status = sale;

  // Tài chính: giá mua/giá sàn chỉ gửi khi form có ô tương ứng (quản lý). Ký gửi không có giá mua của showroom.
  if (fd.get("purchase_price") !== null) {
    payload.purchase_price = r.money("purchase_price");
    if (business === "consignment" && payload.purchase_price) errs.purchase_price = "Xe ký gửi không có giá mua của showroom";
  }
  if (fd.get("floor_price") !== null) payload.floor_price = r.money("floor_price");
  const ask = payload.asking_price as string, floor = payload.floor_price as string | undefined;
  if (ask && floor && BigInt(floor) > BigInt(ask)) errs.floor_price = "Giá sàn không được cao hơn giá chào";

  if (mode === "create") {
    const requestId = r.s("request_id");
    if (!UUID.test(requestId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
    payload.request_id = requestId;
    payload.business_type = business;
  }
  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload };
}

/** Form "Nhập kho từ nhu cầu bán": giá trị showroom đã kiểm tra, ghi đè thông tin khách khai. Ô trống = giữ thông tin khách khai. */
export function parseAcquireForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const business = r.s("business_type");
  const payload: Record<string, unknown> = {
    make: r.s("make"), model: r.s("model"), variant: r.s("variant"), vin: r.s("vin").toUpperCase(), plate: r.s("plate").toUpperCase(),
    year_made: r.year("year_made"), color: r.s("color"), odo: r.int("odo"),
    fuel_type: FUELS.includes(r.s("fuel_type")) ? r.s("fuel_type") : "",
    location_id: UUID.test(r.s("location_id")) ? r.s("location_id") : "",
    intake_date: r.date("intake_date"), notes: r.s("notes"),
    purchase_price: r.money("purchase_price"), asking_price: r.money("asking_price"),
  };
  if (["owned", "consignment"].includes(business)) payload.business_type = business;
  if (payload.vin && !VIN.test(payload.vin as string)) errs.vin = "Số VIN/số khung chỉ gồm chữ và số (5–25 ký tự)";
  if (business === "consignment" && payload.purchase_price) errs.purchase_price = "Xe ký gửi không có giá mua của showroom";
  if (business === "owned" && !payload.purchase_price) errs.purchase_price = "Nhập giá mua thực tế";
  const requestId = r.s("request_id");
  if (!UUID.test(requestId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  payload.request_id = requestId;
  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload };
}
