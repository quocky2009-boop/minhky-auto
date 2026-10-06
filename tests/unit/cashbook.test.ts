import { describe, expect, it } from "vitest";
import { parseAccountForm, parseVoucherForm, todayVn } from "@/lib/cashbook";

const RID = "11111111-1111-4111-8111-111111111111", AID = "22222222-2222-4222-8222-222222222222", OID = "33333333-3333-4333-8333-333333333333";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });
const NOW = new Date("2026-10-06T03:00:00Z");   // 10:00 giờ VN, 06/10/2026
const base = { request_id: RID, account_id: AID, method: "cash", occurred_on: "2026-10-06", amount: "30tr" };

describe("Thu chi — đọc form phiếu", () => {
  it("hôm nay theo giờ Việt Nam, kể cả sau 17:00 UTC", () => {
    expect(todayVn(NOW)).toBe("2026-10-06");
    expect(todayVn(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-07");
  });
  it("thu thanh toán đơn bán: hướng 'thu' suy ra từ loại phiếu; bắt buộc chọn đơn; số tiền đọc 'tr' đúng BigInt", () => {
    const r = parseVoucherForm(fd({ ...base, purpose: "sale_payment", order_id: OID, payer_kind: "bank" }), NOW);
    expect(r.ok && r.payload).toMatchObject({ direction: "in", purpose: "sale_payment", amount: "30000000", order_id: OID, payer_kind: "bank", method: "cash" });
    const none = parseVoucherForm(fd({ ...base, purpose: "sale_payment" }), NOW);
    expect(!none.ok && none.fieldErrors.order_id).toBeTruthy();
  });
  it("phiếu chi không mang bên trả; thu cọc/hoàn cọc bắt buộc chọn đặt cọc; không gửi liên kết thừa", () => {
    const out = parseVoucherForm(fd({ ...base, purpose: "sale_refund", order_id: OID, payer_kind: "bank", reservation_id: AID }), NOW);
    expect(out.ok && out.payload).toMatchObject({ direction: "out", payer_kind: "" });
    expect(out.ok && "reservation_id" in out.payload).toBe(false);
    expect(parseVoucherForm(fd({ ...base, purpose: "deposit_refund" }), NOW).ok).toBe(false);
    expect(parseVoucherForm(fd({ ...base, purpose: "sale_deposit", reservation_id: AID }), NOW).ok).toBe(true);
  });
  it("thu/chi khác bắt buộc ghi người nộp/nhận; ngày không ở tương lai; tiền > 0; phiên nhập hỏng bị từ chối", () => {
    const noName = parseVoucherForm(fd({ ...base, purpose: "general_expense" }), NOW);
    expect(!noName.ok && noName.fieldErrors.counterparty).toMatch(/người nhận/);
    expect(parseVoucherForm(fd({ ...base, purpose: "general_expense", counterparty: "Điện lực" }), NOW).ok).toBe(true);
    const future = parseVoucherForm(fd({ ...base, purpose: "other_income", counterparty: "A", occurred_on: "2026-10-07" }), NOW);
    expect(!future.ok && future.fieldErrors.occurred_on).toMatch(/tương lai/);
    expect(parseVoucherForm(fd({ ...base, purpose: "other_income", counterparty: "A", amount: "0" }), NOW).ok).toBe(false);
    expect(parseVoucherForm(fd({ ...base, purpose: "other_income", counterparty: "A", amount: "" }), NOW).ok).toBe(false);
    expect(parseVoucherForm(fd({ ...base, purpose: "khac", counterparty: "A" }), NOW).ok).toBe(false);
    expect(parseVoucherForm(fd({ account_id: AID, purpose: "other_income", counterparty: "A", method: "cash", occurred_on: "2026-10-06", amount: "1tr" }), NOW).ok).toBe(false);
  });
});

describe("Thu chi — đọc form tài khoản", () => {
  it("tên + loại bắt buộc; số dư đầu kỳ để trống = 0 (nhập một lần), không âm", () => {
    expect(parseAccountForm(fd({ request_id: RID, name: "Quỹ tiền mặt", kind: "cash" })).ok).toBe(true);
    const r = parseAccountForm(fd({ request_id: RID, name: "Vietcombank", kind: "bank", opening_balance: "1,2 tỷ" }));
    expect(r.ok && r.payload).toMatchObject({ opening_balance: "1200000000", kind: "bank" });
    expect(parseAccountForm(fd({ request_id: RID, name: "", kind: "cash" })).ok).toBe(false);
    expect(parseAccountForm(fd({ request_id: RID, name: "A", kind: "xx" })).ok).toBe(false);
    expect(parseAccountForm(fd({ request_id: RID, name: "A", kind: "cash", opening_balance: "-5tr" })).ok).toBe(false);
  });
});
