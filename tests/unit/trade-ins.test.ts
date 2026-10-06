import { describe, expect, it } from "vitest";
import { parseOffsetForm, parseTradeInForm, tradeInFigures } from "@/lib/trade-ins";

const RID = "11111111-1111-4111-8111-111111111111", OID = "33333333-3333-4333-8333-333333333333", VID = "22222222-2222-4222-8222-222222222222", TID = "44444444-4444-4444-8444-444444444444";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });

describe("Thu cũ đổi mới — đọc form", () => {
  it("lập hồ sơ: không có ô giá trị mua (lấy từ giá mua của xe); xe không vay thì khoản vay = 0 và bỏ ngân hàng", () => {
    const r = parseTradeInForm(fd({ request_id: RID, order_id: OID, old_vehicle_id: VID, loan_bank: "VCB", loan_payoff_amount: "" }), "create");
    expect(r.ok && r.payload).toMatchObject({ loan_payoff_amount: "0", loan_bank: "", old_vehicle_id: VID, order_id: OID });
    expect(r.ok && "purchase_value" in r.payload).toBe(false);
  });
  it("xe còn vay: bắt buộc ghi ngân hàng; khoản vay đọc 'tr'; không âm; phải chọn xe cũ", () => {
    const noBank = parseTradeInForm(fd({ request_id: RID, order_id: OID, old_vehicle_id: VID, loan_payoff_amount: "50tr" }), "create");
    expect(!noBank.ok && noBank.fieldErrors.loan_bank).toBeTruthy();
    const ok = parseTradeInForm(fd({ request_id: RID, order_id: OID, old_vehicle_id: VID, loan_payoff_amount: "50tr", loan_bank: "Vietcombank" }), "create");
    expect(ok.ok && ok.payload).toMatchObject({ loan_payoff_amount: "50000000", loan_bank: "Vietcombank" });
    expect(parseTradeInForm(fd({ request_id: RID, order_id: OID, loan_payoff_amount: "0" }), "create").ok).toBe(false);
    expect(parseTradeInForm(fd({ request_id: RID, order_id: OID, old_vehicle_id: VID, loan_payoff_amount: "-5tr", loan_bank: "A" }), "create").ok).toBe(false);
    expect(parseTradeInForm(fd({ order_id: OID, old_vehicle_id: VID }), "create").ok).toBe(false);          // thiếu mã phiên nhập
    expect(parseTradeInForm(fd({ loan_payoff_amount: "10tr", loan_bank: "ACB" }), "update").ok).toBe(true);
  });
  it("đối trừ: số tiền > 0 bắt buộc; không có giá trị mặc định", () => {
    expect(parseOffsetForm(fd({ request_id: RID, trade_in_id: TID, amount: "100tr" })).ok).toBe(true);
    expect(parseOffsetForm(fd({ request_id: RID, trade_in_id: TID, amount: "" })).ok).toBe(false);
    expect(parseOffsetForm(fd({ request_id: RID, trade_in_id: TID, amount: "0" })).ok).toBe(false);
    expect(parseOffsetForm(fd({ request_id: RID, amount: "1tr" })).ok).toBe(false);
  });
});

describe("Thu cũ đổi mới — số xem trước (BigInt)", () => {
  it("giá mua 200 tr, vay 50 tr: phần khách 150 tr; đối trừ không lấy từ phần ngân hàng", () => {
    const f = tradeInFigures({ purchaseValue: 200_000_000n, loanPayoff: 50_000_000n, offsets: 100_000_000n, paidCustomer: 30_000_000n, paidBank: 0n });
    expect(f).toEqual({ customerPortion: 150_000_000n, payableTotal: 70_000_000n, customerRemaining: 20_000_000n, bankRemaining: 50_000_000n });
  });
  it("trả hết thì còn phải trả = 0; số lớn không mất độ chính xác", () => {
    expect(tradeInFigures({ purchaseValue: 200_000_000n, loanPayoff: 50_000_000n, offsets: 100_000_000n, paidCustomer: 50_000_000n, paidBank: 50_000_000n }))
      .toMatchObject({ payableTotal: 0n, customerRemaining: 0n, bankRemaining: 0n });
    expect(tradeInFigures({ purchaseValue: 9_007_199_254_740_993n, loanPayoff: 0n, offsets: 1n, paidCustomer: 0n, paidBank: 0n }).payableTotal).toBe(9_007_199_254_740_992n);
  });
});
