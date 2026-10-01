/**
 * Đọc & kiểm tra form nhu cầu (dùng cho cả tạo mới và sửa). Thuần TypeScript, chạy được ở server action và test.
 * Nguyên tắc: ô bỏ trống = "Chưa rõ" (null), không tự điền 0 hay giá trị giả.
 */
import { parseVndInput } from "@/lib/money";
import { isPlausibleVnPhone } from "@/lib/phone";
import { fromLocalInput } from "@/lib/dates";

export type FormInput = { get(name: string): unknown; getAll(name: string): unknown[] };
export type ParseResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

const FUELS = ["gasoline", "diesel", "hybrid", "phev", "ev", "other"];
const CRITERIA = ["model", "year", "budget", "color", "odo", "fuel", "seats", "condition"];
const SALE_MODES = ["outright", "consignment", "trade_in", "undecided"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDemandForm(fd: FormInput, mode: "create" | "update", kindForUpdate?: "buy" | "sell"): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const all = (k: string) => fd.getAll(k).map((x) => String(x).trim());
  const tri = (k: string) => (s(k) === "true" ? true : s(k) === "false" ? false : null);
  const money = (k: string) => {
    try {
      const v = parseVndInput(s(k));
      return v === null ? "" : v.toString();
    } catch {
      errs[k] = "Không hiểu số tiền. Ví dụ: 650tr, 1,2 tỷ, 650.000.000";
      return "";
    }
  };
  const year = (k: string) => {
    const v = s(k);
    if (!v) return "";
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1950 || n > 2100) errs[k] = "Năm không hợp lệ";
    return v;
  };
  const int = (k: string, max = 2_000_000_000) => {
    const v = s(k).replace(/[.,\s]/g, "");
    if (!v) return "";
    if (!/^\d+$/.test(v) || Number(v) > max) errs[k] = "Số không hợp lệ";
    return v;
  };
  const when = (k: string) => {
    try {
      return fromLocalInput(s(k)) ?? "";
    } catch {
      errs[k] = "Thời gian không hợp lệ";
      return "";
    }
  };

  const kind = mode === "update" ? kindForUpdate : s("kind");
  if (kind !== "buy" && kind !== "sell") return { ok: false, error: "Chọn Cần mua hoặc Cần bán.", fieldErrors: { kind: "Bắt buộc" } };

  const payload: Record<string, unknown> = {
    kind,
    priority: ["high", "normal", "low"].includes(s("priority")) ? s("priority") : "normal",
    source_id: UUID.test(s("source_id")) ? s("source_id") : "",
    raw_message: s("raw_message"),
    notes: s("notes"),
  };

  if (mode === "create") {
    const requestId = s("request_id");
    if (!UUID.test(requestId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
    payload.request_id = requestId;
    if (UUID.test(s("owner_id"))) payload.owner_id = s("owner_id");
    if (UUID.test(s("customer_id"))) {
      payload.customer_id = s("customer_id");
    } else {
      if (!s("c_name")) errs.c_name = "Nhập tên khách (có thể ghi tạm: Anh Tuấn Zalo)";
      if (s("c_phone") && !isPlausibleVnPhone(s("c_phone"))) errs.c_phone = "Số điện thoại chưa đúng định dạng Việt Nam";
      payload.customer = { full_name: s("c_name"), phone: s("c_phone"), area: s("c_area"), address: s("c_address") };
    }
    const next = s("next_action");
    const due = when("next_action_due");
    if (!!next !== !!due) errs.next_action_due = "Việc tiếp theo và hạn thực hiện phải đi cùng nhau";
    payload.next_action = next;
    payload.next_action_due = due;
  }

  if (kind === "buy") {
    const makes = all("opt_make"), models = all("opt_model"), variants = all("opt_variant");
    const options = makes.map((make, i) => ({ make, model: models[i] ?? "", variant: variants[i] ?? "" }))
      .filter((o) => o.make || o.model || o.variant);
    options.forEach((o, i) => { if (!o.make) errs[`opt_make_${i}`] = "Nhập hãng cho phương án này"; });
    payload.options = options;
    payload.year_min = year("year_min");
    payload.year_max = year("year_max");
    if (payload.year_min && payload.year_max && Number(payload.year_min) > Number(payload.year_max)) errs.year_max = "Năm đến phải ≥ năm từ";
    payload.budget_min = money("budget_min");
    payload.budget_max = money("budget_max");
    if (payload.budget_min && payload.budget_max && BigInt(payload.budget_min as string) > BigInt(payload.budget_max as string)) {
      errs.budget_max = "Ngân sách tối đa phải ≥ tối thiểu";
    }
    payload.odo_max = int("odo_max");
    payload.fuel_types = all("fuel_types").filter((x) => FUELS.includes(x));
    payload.seats = all("seats").filter((x) => /^\d{1,2}$/.test(x));
    payload.condition_pref = ["new", "used", "any"].includes(s("condition_pref")) ? s("condition_pref") : "";
    const colors = (k: string) => s(k).split(/[,;\/]/).map((x) => x.trim()).filter(Boolean);
    payload.colors_accepted = colors("colors_accepted");
    payload.colors_rejected = colors("colors_rejected");
    payload.needs_loan = tri("needs_loan");
    payload.wants_trade_in = tri("wants_trade_in");
    payload.expected_timeframe = s("expected_timeframe");
    payload.expected_by = /^\d{4}-\d{2}-\d{2}$/.test(s("expected_by")) ? s("expected_by") : "";
    payload.strict_criteria = all("strict_criteria").filter((x) => CRITERIA.includes(x));
    payload.must_have_note = s("must_have_note");
    payload.flexible_note = s("flexible_note");
  } else {
    const fuel = s("s_fuel");
    const offer = {
      make: s("s_make"), model: s("s_model"), variant: s("s_variant"),
      year_made: year("s_year_made"), year_registered: year("s_year_registered"),
      color: s("s_color"), fuel_type: FUELS.includes(fuel) ? fuel : "", seats: int("s_seats", 60), odo: int("s_odo"),
      plate: s("s_plate"), vin: s("s_vin"), asking_price: money("s_price"), negotiable: tri("s_negotiable"),
      condition_note: s("s_condition_note"), repair_history_note: s("s_repair_note"), papers_note: s("s_papers_note"),
      has_loan: tri("s_has_loan"), loan_remaining: money("s_loan_remaining"),
      vehicle_location: s("s_location"), desired_sell_time: s("s_sell_time"),
      sale_mode: SALE_MODES.includes(s("s_sale_mode")) ? s("s_sale_mode") : "undecided",
      inspection_at: when("s_inspection_at"),
    };
    if (!offer.make && (offer.model || offer.variant)) errs.s_make = "Nhập hãng xe";
    if (offer.has_loan === false && offer.loan_remaining) errs.s_loan_remaining = "Khách nói không còn vay nhưng có nhập dư nợ";
    payload.sell_offer = offer;
  }

  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload };
}
