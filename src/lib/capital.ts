/**
 * Vốn góp và điều khoản chia lợi nhuận theo xe: nhãn hiển thị, đọc form, điều kiện quyết toán, ước tính chia. Thuần TypeScript.
 * Công thức chia nằm ở src/lib/profit-split.ts (một nguồn); ở đây chỉ chuẩn bị đầu vào và giải thích vì sao chưa tính được.
 * Ước tính KHÔNG phải quyết toán: quyết toán cần giao dịch bán thật (chặng 5) và đi qua tạm tính → kiểm tra → phê duyệt → thanh toán.
 */
import { parseVndInput, type Vnd } from "@/lib/money";
import { parsePercent } from "@/lib/consignment";
import { computeProfitSplit, type SplitResult } from "@/lib/profit-split";
import type { FormInput, ParseResult } from "@/lib/costs";

export const PARTY_KIND_LABEL: Record<string, string> = { company: "Công ty / showroom", individual: "Cá nhân", organization: "Tổ chức" };
export const COST_BASIS_LABEL: Record<string, string> = {
  all_confirmed_costs: "Mọi chi phí đã xác nhận của xe", selected_costs: "Chỉ các khoản chi phí được chọn", no_costs: "Không trừ chi phí",
};
export const ENTRY_TYPE_LABEL: Record<string, string> = { commitment: "Vốn cam kết", receipt: "Tiền thực nhận", withdrawal: "Rút vốn" };
export const TERMS_STATUS_LABEL: Record<string, string> = { draft: "Bản nháp", approved: "Đang hiệu lực", superseded: "Đã thay thế", void: "Đã hủy" };
export const LOAN_KIND_LABEL: Record<string, string> = { principal: "Trả gốc", interest: "Trả lãi" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const badSession: ParseResult = { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };

function reader(fd: FormInput, errs: Record<string, string>) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    s,
    money: (k: string) => {
      try { const v = parseVndInput(s(k)); return v === null ? "" : v.toString(); }
      catch { errs[k] = "Không hiểu số tiền. Ví dụ: 650tr, 1,2 tỷ, 650.000"; return ""; }
    },
    pct: (k: string) => {
      try { return parsePercent(s(k)); }
      catch (e) { errs[k] = e instanceof Error ? e.message : "Tỷ lệ không hợp lệ"; return ""; }
    },
    date: (k: string) => { const v = s(k); if (v && !DATE.test(v)) errs[k] = "Ngày không hợp lệ"; return v; },
  };
}

/** Cộng chính xác các tỷ lệ % (tối đa 4 số lẻ) bằng số nguyên ×10.000 — không dùng số thực. */
export function sumPercent(values: string[]): bigint {
  return values.reduce((acc, v) => {
    const [i, f = ""] = v.split(".");
    return acc + BigInt(i) * 10_000n + BigInt(f.padEnd(4, "0"));
  }, 0n);
}
export const formatScaledPercent = (scaled: bigint): string => {
  const i = scaled / 10_000n, f = (scaled % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return f ? `${i},${f}` : `${i}`;
};

export function parsePartyForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  if (!r.s("name")) errs.name = "Nhập tên bên góp vốn";
  const kind = r.s("kind");
  if (!(kind in PARTY_KIND_LABEL)) errs.kind = "Chọn loại bên góp vốn";
  const requestId = r.s("request_id");
  if (!UUID.test(requestId)) return badSession;
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, name: r.s("name"), kind, phone: r.s("phone"), note: r.s("note") } };
}

/**
 * Điều khoản chia lợi nhuận của một xe. Tỷ lệ công ty bắt buộc nhập (không mặc định; 0 là số thật nếu nhập rõ).
 * Danh sách bên góp: share_party / share_ratio lặp lại; mỗi bên một dòng, tỷ lệ > 0, không trùng; tổng phải đúng 100% mới duyệt được
 * (cho phép lưu nháp khi tổng chưa đủ, nhưng cảnh báo).
 */
export function parseTermsForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const requestId = r.s("request_id"), vehicleId = r.s("vehicle_id");
  if (!UUID.test(requestId) || !UUID.test(vehicleId)) return badSession;
  const rate = r.pct("company_rate");
  if (!errs.company_rate && rate === "") errs.company_rate = "Nhập tỷ lệ dành cho công ty theo thỏa thuận riêng của xe (không có mặc định)";
  const basis = r.s("cost_basis");
  if (basis && !(basis in COST_BASIS_LABEL)) errs.cost_basis = "Căn cứ chi phí không hợp lệ";

  const parties = fd.getAll("share_party").map((v) => String(v ?? "").trim());
  const ratios = fd.getAll("share_ratio").map((v) => String(v ?? "").trim());
  const shares: { party_id: string; ratio_percent: string }[] = [];
  const seen = new Set<string>();
  parties.forEach((party, i) => {
    const raw = ratios[i] ?? "";
    if (!party && !raw) return;   // dòng trống bỏ qua
    if (!UUID.test(party)) { errs.shares = "Mỗi dòng phải chọn bên góp vốn"; return; }
    if (seen.has(party)) { errs.shares = "Một bên góp vốn bị chọn trùng"; return; }
    seen.add(party);
    let pct = "";
    try { pct = parsePercent(raw); } catch { /* báo lỗi bên dưới */ }
    if (pct === "" || sumPercent([pct]) <= 0n) { errs.shares = "Tỷ lệ của mỗi bên phải lớn hơn 0% và tối đa 100%"; return; }
    shares.push({ party_id: party, ratio_percent: pct });
  });
  if (!errs.shares && shares.length === 0) errs.shares = "Thêm ít nhất một bên góp vốn";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: {
    request_id: requestId, vehicle_id: vehicleId, company_rate: rate, cost_basis: basis, loss_policy: r.s("loss_policy"),
    basis_note: r.s("basis_note"), agreement_ref: r.s("agreement_ref"), shares } };
}

export function parseEntryForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const requestId = r.s("request_id"), vehicleId = r.s("vehicle_id"), partyId = r.s("party_id");
  if (!UUID.test(requestId) || !UUID.test(vehicleId)) return badSession;
  if (!UUID.test(partyId)) errs.party_id = "Chọn bên góp vốn";
  const type = r.s("entry_type");
  if (!(type in ENTRY_TYPE_LABEL)) errs.entry_type = "Chọn loại ghi sổ";
  const amount = r.money("amount");
  if (!errs.amount && (amount === "" || BigInt(amount) <= 0n)) errs.amount = "Số tiền phải lớn hơn 0";
  const date = r.date("entry_date");
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, vehicle_id: vehicleId, party_id: partyId, entry_type: type, amount, entry_date: date, reference: r.s("reference"), note: r.s("note") } };
}

export function parseLoanForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const requestId = r.s("request_id"), vehicleId = r.s("vehicle_id"), partyId = r.s("party_id");
  if (!UUID.test(requestId) || !UUID.test(vehicleId)) return badSession;
  if (!UUID.test(partyId)) errs.party_id = "Chọn bên cho vay";
  const principal = r.money("principal");
  if (!errs.principal && (principal === "" || BigInt(principal) <= 0n)) errs.principal = "Số tiền vay phải lớn hơn 0";
  const drawn = r.date("drawn_date"), due = r.date("due_date");
  if (!drawn) errs.drawn_date = "Nhập ngày nhận tiền vay";
  if (drawn && due && !errs.drawn_date && !errs.due_date && due < drawn) errs.due_date = "Hạn trả không được trước ngày nhận";
  if (!r.s("interest_terms")) errs.interest_terms = "Ghi lãi thỏa thuận (nguyên văn, ví dụ: 1,2%/tháng, trả lãi cuối kỳ)";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, vehicle_id: vehicleId, party_id: partyId, principal, drawn_date: drawn, due_date: due, interest_terms: r.s("interest_terms"), reference: r.s("reference") } };
}

export function parseLoanPaymentForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const requestId = r.s("request_id"), loanId = r.s("loan_id");
  if (!UUID.test(requestId) || !UUID.test(loanId)) return badSession;
  const kind = r.s("kind");
  if (!(kind in LOAN_KIND_LABEL)) errs.kind = "Chọn trả gốc hoặc trả lãi";
  const amount = r.money("amount");
  if (!errs.amount && (amount === "" || BigInt(amount) <= 0n)) errs.amount = "Số tiền phải lớn hơn 0";
  const date = r.date("paid_on");
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, loan_id: loanId, kind, amount, paid_on: date, reference: r.s("reference"), note: r.s("note") } };
}

export type TermsLike = { status: string; cost_basis: string | null; loss_policy: string | null };

/**
 * Những gì còn chờ xác nhận trước khi quyết toán được (nhập/duyệt điều khoản vẫn làm được). Rỗng = đủ điều kiện về phía điều khoản.
 * `lossCase`: xe hòa vốn/lỗ thì bắt buộc có cách xử lý đã thống nhất.
 */
export function settlementBlockers(terms: TermsLike | null, needsReconfirm: boolean, lossCase = false): string[] {
  if (!terms || terms.status !== "approved") return ["Chưa có điều khoản góp vốn được duyệt"];
  const out: string[] = [];
  if (!terms.cost_basis) out.push("Chưa chốt căn cứ chi phí được trừ trước khi chia");
  if (terms.cost_basis === "selected_costs") out.push("Căn cứ “chỉ các khoản được chọn” cần danh sách khoản chi phí được chọn (chưa hỗ trợ ở bản này)");
  if (needsReconfirm) out.push("Vốn góp thay đổi sau khi duyệt: cần xác nhận lại căn cứ phân chia hoặc duyệt phiên bản mới");
  if (lossCase && !(terms.loss_policy ?? "").trim()) out.push("Xe hòa vốn/lỗ: chưa có cách xử lý được thống nhất");
  return out;
}

export type PreviewInput = {
  salePrice: Vnd;
  purchasePrice: Vnd | null;
  /** Chi phí đã xác nhận showroom chịu (đã nghiệm thu; không gồm dự kiến). null = chưa biết. */
  confirmedCosts: Vnd | null;
  openCostLines: number;
  terms: { cost_basis: string | null; company_rate: string };
  shares: { party_id: string; name: string; kind: string; ratio_percent: string }[];
};
export type PreviewResult =
  | { ok: true; distributable: Vnd; deducted: Vnd; split: Extract<SplitResult, { ok: true }>; warnings: string[] }
  | { ok: false; message: string };

/** Ước tính chia lợi nhuận nếu bán với giá `salePrice`. Từ chối (không đoán) khi thiếu giá mua, căn cứ chi phí, hoặc không có lãi. */
export function previewProfitSplit(i: PreviewInput): PreviewResult {
  if (!i.terms.cost_basis) return { ok: false, message: "Chưa chốt căn cứ chi phí được trừ trước khi chia — chưa ước tính được." };
  if (i.terms.cost_basis === "selected_costs") return { ok: false, message: "Căn cứ “chỉ các khoản được chọn” chưa hỗ trợ ước tính." };
  if (i.purchasePrice === null) return { ok: false, message: "Xe chưa có giá mua — chưa ước tính được (không coi thiếu là 0)." };
  let deducted = 0n;
  const warnings: string[] = [];
  if (i.terms.cost_basis === "all_confirmed_costs") {
    if (i.confirmedCosts === null) return { ok: false, message: "Chưa có chi phí đã xác nhận của xe — chưa ước tính được. Nếu xe không phát sinh chi phí, ghi một khoản chi phí xác nhận 0 đồng." };
    deducted = i.confirmedCosts;
    if (i.openCostLines > 0) warnings.push(`Còn ${i.openCostLines} khoản chi phí dự kiến chưa xác nhận — chưa tính vào ước tính.`);
  }
  const distributable = i.salePrice - i.purchasePrice - deducted;
  const split = computeProfitSplit({
    distributable, companyRate: `${i.terms.company_rate}%`, termsApproved: true,
    participants: i.shares.map((s) => ({ id: s.party_id, label: s.name, ratio: `${s.ratio_percent}%`, isCompany: s.kind === "company" })),
  });
  if (!split.ok) return { ok: false, message: split.message };
  return { ok: true, distributable, deducted, split, warnings };
}
