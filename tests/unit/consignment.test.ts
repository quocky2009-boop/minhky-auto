import { describe, expect, it } from "vitest";
import { activationGaps, computeConsignmentFee, effectiveTerms, parseContractForm, parsePercent, parseReturnForm, parseSignForm, parseTermsForm } from "@/lib/consignment";

const RID = "11111111-1111-4111-8111-111111111111", VID = "22222222-2222-4222-8222-222222222222";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });
const T = (o: Record<string, string> = {}) => ({
  request_id: RID, owner_expected_amount: "600tr", list_price: "650tr", discount_limit_type: "percent", discount_limit_percent: "1",
  fee_type: "percent_of_sale_price", fee_percent: "3", buyer_contract_party: "showroom", payment_collector: "showroom", ...o });

describe("Phí ký gửi — cố định hoặc phần trăm trên giá bán", () => {
  it("phần trăm tính trên giá bán: 2–4% của 650 triệu", () => {
    const f = (pct: string) => computeConsignmentFee({ fee_type: "percent_of_sale_price", fee_fixed_amount: null, fee_percent: pct }, 650_000_000n);
    expect(f("2")).toBe(13_000_000n);
    expect(f("3")).toBe(19_500_000n);
    expect(f("4")).toBe(26_000_000n);
  });
  it("phí cố định không phụ thuộc giá bán", () => {
    const t = { fee_type: "fixed", fee_fixed_amount: "20000000", fee_percent: null };
    expect(computeConsignmentFee(t, 500_000_000n)).toBe(20_000_000n);
    expect(computeConsignmentFee(t, 900_000_000n)).toBe(20_000_000n);
  });
  it("làm tròn nửa lên đến 1 đồng — khớp hàm database (0,5% của 5.100 = 25,5 → 26)", () => {
    const f = (pct: string, price: bigint) => computeConsignmentFee({ fee_type: "percent_of_sale_price", fee_fixed_amount: null, fee_percent: pct }, price);
    expect(f("0.5", 5_100n)).toBe(26n);
    expect(f("2.5", 1_000_001n)).toBe(25_000n);   // 25.000,025 → 25.000
    expect(f("2.5001", 1_000_000n)).toBe(25_001n); // 4 chữ số thập phân
  });
  it("thiếu số liệu = không tính được (null), không phải 0", () => {
    expect(computeConsignmentFee({ fee_type: "percent_of_sale_price", fee_fixed_amount: null, fee_percent: null }, 650_000_000n)).toBeNull();
    expect(computeConsignmentFee({ fee_type: "fixed", fee_fixed_amount: null, fee_percent: null }, 650_000_000n)).toBeNull();
    expect(computeConsignmentFee({ fee_type: "khac", fee_fixed_amount: "1", fee_percent: "1" }, 650_000_000n)).toBeNull();
  });
  it("đọc tỷ lệ: 3, 3%, 2,5 %; ngoài 0–100 hoặc quá 4 số lẻ bị chặn", () => {
    expect(parsePercent("3")).toBe("3");
    expect(parsePercent("3%")).toBe("3");
    expect(parsePercent("2,5 %")).toBe("2.5");
    expect(parsePercent("")).toBe("");
    expect(parsePercent("100")).toBe("100");
    expect(() => parsePercent("100,01")).toThrow();
    expect(() => parsePercent("101")).toThrow();
    expect(() => parsePercent("1,23456")).toThrow();
    expect(() => parsePercent("abc")).toThrow();
    expect(() => parsePercent("-1")).toThrow();
  });
});

describe("Form thỏa thuận ký gửi", () => {
  it("phí phần trăm: chỉ gửi tỷ lệ, không gửi số tiền cố định; không có mặc định cho cách tính phí", () => {
    const ok = parseTermsForm(fd(T({ fee_fixed_amount: "20tr" })));
    expect(ok.ok && ok.payload).toMatchObject({ fee_type: "percent_of_sale_price", fee_percent: "3", owner_expected_amount: "600000000", list_price: "650000000" });
    expect(ok.ok && "fee_fixed_amount" in ok.payload).toBe(false);
    const none = parseTermsForm(fd(T({ fee_type: "" })));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.fieldErrors.fee_type).toBeTruthy();
  });
  it("phí cố định: bắt buộc số tiền", () => {
    const bad = parseTermsForm(fd(T({ fee_type: "fixed", fee_percent: "", fee_fixed_amount: "" })));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors)).toEqual(["fee_fixed_amount"]);
    const ok = parseTermsForm(fd(T({ fee_type: "fixed", fee_fixed_amount: "20tr" })));
    expect(ok.ok && ok.payload).toMatchObject({ fee_type: "fixed", fee_fixed_amount: "20000000" });
    expect(ok.ok && "fee_percent" in ok.payload).toBe(false);
  });
  it("giá chủ muốn nhận và giá chào bắt buộc; thiếu không thành 0", () => {
    const r = parseTermsForm(fd(T({ owner_expected_amount: "", list_price: "0" })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["list_price", "owner_expected_amount"]);
    const zero = parseTermsForm(fd(T({ owner_expected_amount: "0" })));
    expect(zero.ok).toBe(true);   // 0 nhập rõ ràng là số thật (khác để trống)
  });
  it("quyền giảm giá: chọn loại nào thì bắt buộc nhập giá trị loại đó", () => {
    expect(parseTermsForm(fd(T({ discount_limit_type: "none" }))).ok).toBe(true);
    const none = parseTermsForm(fd(T({ discount_limit_type: "none" })));
    expect(none.ok && "discount_limit_percent" in none.payload).toBe(false);
    expect(parseTermsForm(fd(T({ discount_limit_type: "amount", discount_limit_percent: "" }))).ok).toBe(false);
    expect(parseTermsForm(fd(T({ discount_limit_type: "amount", discount_limit_amount: "5tr" }))).ok).toBe(true);
    expect(parseTermsForm(fd(T({ discount_limit_type: "percent", discount_limit_percent: "" }))).ok).toBe(false);
    expect(parseTermsForm(fd(T({ discount_limit_type: "?" }))).ok).toBe(false);
  });
  it("bên ký hợp đồng mua bán và bên thu tiền phải chọn", () => {
    const r = parseTermsForm(fd(T({ buyer_contract_party: "", payment_collector: "ai-do" })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["buyer_contract_party", "payment_collector"]);
  });
  it("ký xác nhận: bắt buộc ngày, đúng định dạng", () => {
    expect(parseSignForm(fd({ signed_on: "" })).ok).toBe(false);
    expect(parseSignForm(fd({ signed_on: "15/01/2026" })).ok).toBe(false);
    expect(parseSignForm(fd({ signed_on: "2026-01-15", agreement_ref: " HĐKG-01 " })).ok).toBe(true);
  });
});

describe("Form hợp đồng và biên bản", () => {
  const base = { request_id: RID, vehicle_id: VID, owner_name: "Nguyễn Văn Chủ" };
  it("lập nháp chỉ cần tên chủ xe; ô trống giữ là 'chưa rõ' (chuỗi rỗng), không thành 0", () => {
    const r = parseContractForm(fd(base), "create");
    expect(r.ok && r.payload).toMatchObject({ owner_name: "Nguyễn Văn Chủ", keys_count: "", start_date: "", acts_by_proxy: false });
    expect(parseContractForm(fd({ ...base, owner_name: " " }), "create").ok).toBe(false);
  });
  it("0 chìa khóa là số thật; số chìa sai bị báo", () => {
    const z = parseContractForm(fd({ ...base, keys_count: "0" }), "create");
    expect(z.ok && z.payload.keys_count).toBe("0");
    expect(parseContractForm(fd({ ...base, keys_count: "-1" }), "create").ok).toBe(false);
  });
  it("ủy quyền: khai ủy quyền thì bắt buộc thông tin ủy quyền", () => {
    expect(parseContractForm(fd({ ...base, acts_by_proxy: "on" }), "create").ok).toBe(false);
    const ok = parseContractForm(fd({ ...base, acts_by_proxy: "on", proxy_note: "Giấy ủy quyền số 45" }), "create");
    expect(ok.ok && ok.payload).toMatchObject({ acts_by_proxy: true, proxy_note: "Giấy ủy quyền số 45" });
    const no = parseContractForm(fd({ ...base, proxy_note: "bỏ qua" }), "create");
    expect(no.ok && no.payload.proxy_note).toBe("");   // không ủy quyền thì không giữ ghi chú ủy quyền
  });
  it("thời hạn: ngày kết thúc không trước ngày bắt đầu; ngày sai định dạng bị báo", () => {
    expect(parseContractForm(fd({ ...base, start_date: "2026-12-31", end_date: "2026-10-01" }), "create").ok).toBe(false);
    expect(parseContractForm(fd({ ...base, start_date: "01/10/2026" }), "create").ok).toBe(false);
    expect(parseContractForm(fd({ ...base, start_date: "2026-10-01", end_date: "2026-12-31" }), "create").ok).toBe(true);
  });
  it("sửa không đòi mã yêu cầu/xe; lập mới thì đòi", () => {
    expect(parseContractForm(fd({ owner_name: "A" }), "update").ok).toBe(true);
    expect(parseContractForm(fd({ owner_name: "A" }), "create").ok).toBe(false);
  });
  it("sửa: ô bị khóa (không có trong form) không được gửi lên để khỏi xóa nhầm biên bản đã chốt; ô có mặt mà trống thì xóa về 'chưa ghi'", () => {
    const locked = parseContractForm(fd({ owner_name: "A", end_date: "2027-03-31", owner_phone: "" }), "update");
    expect(locked.ok && Object.keys(locked.payload).sort()).toEqual(["acts_by_proxy", "end_date", "owner_name", "owner_phone", "proxy_note"]);
    expect(locked.ok && locked.payload.owner_phone).toBe("");
  });
  it("biên bản trả xe: bắt buộc ngày, lý do, tình trạng, chìa khóa, giấy tờ", () => {
    const r = parseReturnForm(fd({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["return_condition", "return_date", "return_documents", "return_keys_count", "return_reason"]);
    const ok = parseReturnForm(fd({ return_date: "2026-11-20", return_reason: "Chủ xe bán nơi khác", return_condition: "Như lúc nhận", return_keys_count: "0", return_documents: "Không có" }));
    expect(ok.ok && ok.payload).toMatchObject({ return_keys_count: "0", return_cost_note: "" });
  });
});

describe("Điều kiện kích hoạt và thỏa thuận hiệu lực", () => {
  const full = { owner_phone: "0912345678", start_date: "2026-10-01", end_date: "2026-12-31", received_at: "2026-10-01", keys_count: 0, documents_received: "Cà vẹt", condition_at_receipt: "Tốt" };
  it("đủ thông tin và có thỏa thuận đã ký → không còn thiếu", () => {
    expect(activationGaps(full, [{ signed_on: "2026-01-15" }])).toEqual([]);
  });
  it("thỏa thuận chưa ký không đủ; 0 chìa khóa không bị coi là thiếu; chưa ghi thì thiếu", () => {
    expect(activationGaps(full, [{ signed_on: null }])).toHaveLength(1);
    expect(activationGaps({ ...full, keys_count: null }, [{ signed_on: "2026-01-15" }])).toEqual(["Số chìa khóa nhận (nhập 0 nếu không có)"]);
    expect(activationGaps({ owner_phone: null, start_date: null, end_date: null, received_at: null, keys_count: null, documents_received: " ", condition_at_receipt: null }, []).length).toBe(7);
  });
  it("hiệu lực = phiên bản đã ký mới nhất; bản chưa ký mới hơn chỉ là đề xuất", () => {
    const all = [{ version_no: 1, signed_on: "2026-01-15" }, { version_no: 2, signed_on: "2026-03-01" }, { version_no: 3, signed_on: null }];
    expect(effectiveTerms(all)?.version_no).toBe(2);
    expect(effectiveTerms([{ version_no: 1, signed_on: null }])).toBeNull();
    expect(effectiveTerms([])).toBeNull();
  });
});
