import { describe, expect, it } from "vitest";
import { formatScaledPercent, parseEntryForm, parseLoanForm, parseLoanPaymentForm, parsePartyForm, parseTermsForm, previewProfitSplit, settlementBlockers, sumPercent } from "@/lib/capital";

const RID = "11111111-1111-4111-8111-111111111111", VID = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type Obj = Record<string, string | string[]>;
const fd = (o: Obj) => ({
  get: (k: string) => { const v = o[k]; return Array.isArray(v) ? (v[0] ?? null) : (v ?? null); },
  getAll: (k: string) => { const v = o[k]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; },
});
const baseTerms: Obj = { request_id: RID, vehicle_id: VID, company_rate: "20", share_party: [A, B], share_ratio: ["60", "40"] };

describe("Điều khoản chia lợi nhuận — đọc form", () => {
  it("tỷ lệ công ty bắt buộc, không có mặc định; 0 nhập rõ là số thật", () => {
    const none = parseTermsForm(fd({ ...baseTerms, company_rate: "" }));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.fieldErrors.company_rate).toMatch(/không có mặc định/);
    const zero = parseTermsForm(fd({ ...baseTerms, company_rate: "0" }));
    expect(zero.ok && zero.payload.company_rate).toBe("0");
    expect(parseTermsForm(fd({ ...baseTerms, company_rate: "101" })).ok).toBe(false);
    expect(parseTermsForm(fd({ ...baseTerms, company_rate: "2,5%" })).ok).toBe(true);
  });
  it("danh sách bên góp: đọc tỷ lệ, bỏ dòng trống, chặn trùng bên, tỷ lệ ≤ 0 hoặc không hiểu", () => {
    const ok = parseTermsForm(fd({ ...baseTerms, share_party: [A, B, ""], share_ratio: ["60%", "40,0", ""] }));
    expect(ok.ok && ok.payload.shares).toEqual([{ party_id: A, ratio_percent: "60" }, { party_id: B, ratio_percent: "40.0" }]);
    expect(parseTermsForm(fd({ ...baseTerms, share_party: [A, A] })).ok).toBe(false);
    expect(parseTermsForm(fd({ ...baseTerms, share_ratio: ["0", "100"] })).ok).toBe(false);
    expect(parseTermsForm(fd({ ...baseTerms, share_ratio: ["abc", "40"] })).ok).toBe(false);
    expect(parseTermsForm(fd({ ...baseTerms, share_party: [], share_ratio: [] })).ok).toBe(false);
    expect(parseTermsForm(fd({ ...baseTerms, share_party: ["khong-phai-uuid"], share_ratio: ["100"] })).ok).toBe(false);
  });
  it("căn cứ chi phí để trống = chờ xác nhận (chuỗi rỗng); giá trị lạ bị chặn", () => {
    const r = parseTermsForm(fd(baseTerms));
    expect(r.ok && r.payload.cost_basis).toBe("");
    expect(parseTermsForm(fd({ ...baseTerms, cost_basis: "tuy-thich" })).ok).toBe(false);
    expect(parseTermsForm(fd({ ...baseTerms, cost_basis: "all_confirmed_costs" })).ok).toBe(true);
  });
  it("cộng tỷ lệ chính xác bằng số nguyên: 33,3334 + 33,3333 + 33,3333 = 100; thiếu 0,0001 thì không", () => {
    expect(sumPercent(["33.3334", "33.3333", "33.3333"])).toBe(1_000_000n);
    expect(sumPercent(["60", "39.9999"])).toBe(999_999n);
    expect(formatScaledPercent(sumPercent(["60", "39.9999"]))).toBe("99,9999");
    expect(formatScaledPercent(1_000_000n)).toBe("100");
  });
});

describe("Form bên góp vốn, sổ vốn, cho vay", () => {
  it("bên góp vốn: bắt buộc tên và loại", () => {
    expect(parsePartyForm(fd({ request_id: RID, name: "", kind: "x" })).ok).toBe(false);
    expect(parsePartyForm(fd({ request_id: RID, name: "Anh Nam", kind: "individual" })).ok).toBe(true);
  });
  it("sổ vốn: số tiền > 0, loại hợp lệ, đọc 'tr'", () => {
    const base = { request_id: RID, vehicle_id: VID, party_id: A, entry_type: "receipt" };
    const ok = parseEntryForm(fd({ ...base, amount: "50tr", entry_date: "2026-10-03" }));
    expect(ok.ok && ok.payload).toMatchObject({ amount: "50000000", entry_type: "receipt" });
    expect(parseEntryForm(fd({ ...base, amount: "" })).ok).toBe(false);
    expect(parseEntryForm(fd({ ...base, amount: "0" })).ok).toBe(false);
    expect(parseEntryForm(fd({ ...base, amount: "1tr", entry_type: "bonus" })).ok).toBe(false);
    expect(parseEntryForm(fd({ ...base, amount: "1tr", entry_date: "03/10/2026" })).ok).toBe(false);
  });
  it("tài khoản tiền (D87): chuyển đúng vào payload, sai định dạng bị từ chối, bỏ trống cho phép (vốn cam kết / bên là công ty)", () => {
    const ACC = "5f0d1c64-8d3a-4a43-9a6e-2c2f1a9b7e10";
    const base = { request_id: RID, vehicle_id: VID, party_id: A, entry_type: "receipt", amount: "5tr" };
    const withAcc = parseEntryForm(fd({ ...base, account_id: ACC }));
    expect(withAcc.ok && withAcc.payload).toMatchObject({ account_id: ACC });
    const none = parseEntryForm(fd(base));
    expect(none.ok && none.payload).toMatchObject({ account_id: "" });
    expect(parseEntryForm(fd({ ...base, account_id: "abc" })).ok).toBe(false);
    const loan = { request_id: RID, vehicle_id: VID, party_id: A, principal: "200tr", drawn_date: "2026-10-01", interest_terms: "1%" };
    expect(parseLoanForm(fd({ ...loan, account_id: "abc" })).ok).toBe(false);
    expect(parseLoanForm(fd({ ...loan, account_id: ACC })).ok).toBe(true);
    expect(parseLoanPaymentForm(fd({ request_id: RID, loan_id: VID, kind: "interest", amount: "1tr", account_id: "abc" })).ok).toBe(false);
  });
  it("cho vay: bắt buộc ngày nhận, lãi thỏa thuận (nguyên văn), hạn trả không trước ngày nhận", () => {
    const base = { request_id: RID, vehicle_id: VID, party_id: A, principal: "200tr", drawn_date: "2026-10-01", interest_terms: "1,2%/tháng" };
    expect(parseLoanForm(fd(base)).ok).toBe(true);
    expect(parseLoanForm(fd({ ...base, interest_terms: "" })).ok).toBe(false);
    expect(parseLoanForm(fd({ ...base, due_date: "2026-09-01" })).ok).toBe(false);
    expect(parseLoanForm(fd({ ...base, principal: "0" })).ok).toBe(false);
  });
  it("thanh toán khoản vay: trả gốc hoặc lãi, số tiền > 0", () => {
    const base = { request_id: RID, loan_id: VID, kind: "interest", amount: "2,4tr" };
    expect(parseLoanPaymentForm(fd(base)).ok).toBe(true);
    expect(parseLoanPaymentForm(fd({ ...base, kind: "khac" })).ok).toBe(false);
  });
});

describe("Điều kiện quyết toán (chặn quyết toán, không chặn nhập/duyệt điều khoản)", () => {
  const approved = { status: "approved", cost_basis: "all_confirmed_costs", loss_policy: null };
  it("không có điều khoản đã duyệt → chặn", () => expect(settlementBlockers(null, false)).toHaveLength(1));
  it("thiếu căn cứ chi phí → chặn; đủ → thông", () => {
    expect(settlementBlockers({ ...approved, cost_basis: null }, false)).toEqual(["Chưa chốt căn cứ chi phí được trừ trước khi chia"]);
    expect(settlementBlockers(approved, false)).toEqual([]);
  });
  it("vốn thay đổi sau khi duyệt → chặn đến khi xác nhận lại", () => expect(settlementBlockers(approved, true)).toHaveLength(1));
  it("lỗ/hòa vốn cần cách xử lý đã thống nhất", () => {
    expect(settlementBlockers(approved, false, true)).toHaveLength(1);
    expect(settlementBlockers({ ...approved, loss_policy: "Chia lỗ theo vốn góp" }, false, true)).toEqual([]);
  });
});

describe("Ước tính chia lợi nhuận (dùng công thức đã chốt; không phải quyết toán)", () => {
  const shares = [{ party_id: A, name: "Bên A", kind: "individual", ratio_percent: "60" }, { party_id: B, name: "Bên B", kind: "individual", ratio_percent: "40" }];
  const base = { salePrice: 700_000_000n, purchasePrice: 650_000_000n, confirmedCosts: 10_000_000n, openCostLines: 0,
    terms: { cost_basis: "all_confirmed_costs", company_rate: "20" }, shares };
  it("dữ liệu test của đặc tả: P = 40 triệu, c = 20%, 60/40 → công ty 8tr; hai bên 19,2tr và 12,8tr", () => {
    const r = previewProfitSplit(base);
    if (!r.ok) throw new Error(r.message);
    expect(r.distributable).toBe(40_000_000n);
    expect(r.split.companyOperatingShare).toBe(8_000_000n);
    expect(r.split.shares.map((s) => s.amount)).toEqual([19_200_000n, 12_800_000n]);
  });
  it("không trừ chi phí khi căn cứ là 'không trừ chi phí'; cảnh báo khi còn khoản dự kiến chưa xác nhận", () => {
    const r = previewProfitSplit({ ...base, terms: { cost_basis: "no_costs", company_rate: "20" } });
    expect(r.ok && r.distributable).toBe(50_000_000n);
    const w = previewProfitSplit({ ...base, openCostLines: 2 });
    expect(w.ok && w.warnings[0]).toMatch(/2 khoản chi phí dự kiến/);
  });
  it("từ chối khi thiếu căn cứ chi phí, thiếu giá mua, chi phí chưa biết, hoặc căn cứ chưa hỗ trợ — không coi thiếu là 0", () => {
    expect(previewProfitSplit({ ...base, terms: { cost_basis: null, company_rate: "20" } })).toMatchObject({ ok: false });
    expect(previewProfitSplit({ ...base, purchasePrice: null })).toMatchObject({ ok: false, message: expect.stringMatching(/giá mua/) });
    expect(previewProfitSplit({ ...base, confirmedCosts: null })).toMatchObject({ ok: false });
    expect(previewProfitSplit({ ...base, terms: { cost_basis: "selected_costs", company_rate: "20" } })).toMatchObject({ ok: false });
  });
  it("hòa vốn hoặc lỗ → không áp công thức chia lãi; tổng tỷ lệ khác 100% → từ chối", () => {
    expect(previewProfitSplit({ ...base, salePrice: 660_000_000n })).toMatchObject({ ok: false, message: expect.stringMatching(/hòa vốn hoặc lỗ/) });
    expect(previewProfitSplit({ ...base, shares: [{ ...shares[0], ratio_percent: "60" }, { ...shares[1], ratio_percent: "39.9999" }] })).toMatchObject({ ok: false });
  });
  it("công ty vừa góp vốn vừa vận hành: không đếm trùng", () => {
    const r = previewProfitSplit({ ...base, shares: [{ party_id: A, name: "Công ty", kind: "company", ratio_percent: "50" }, { ...shares[1], ratio_percent: "50" }] });
    if (!r.ok) throw new Error(r.message);
    expect(r.split.companyTotal).toBe(8_000_000n + 16_000_000n);
  });
});
