import { describe, expect, it } from "vitest";
import { LINE_PURPOSE, parseCreateForm, parseLossForm, parseReviseForm, settlementCash } from "@/lib/settlements";

const RID = "11111111-1111-4111-8111-111111111111", LID = "22222222-2222-4222-8222-222222222222", PA = "33333333-3333-4333-8333-333333333333", PB = "44444444-4444-4444-8444-444444444444";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });

describe("Quyết toán — đọc form", () => {
  it("tạm tính cần mã phiên + dòng xe", () => {
    expect(parseCreateForm(fd({ request_id: RID, order_line_id: LID })).ok).toBe(true);
    expect(parseCreateForm(fd({ request_id: RID })).ok).toBe(false);
  });
  it("điều chỉnh bắt buộc lý do", () => {
    expect(parseReviseForm(fd({ request_id: RID, id: LID, reason: "Chi phí sơn phát sinh muộn" })).ok).toBe(true);
    const bad = parseReviseForm(fd({ request_id: RID, id: LID, reason: " " }));
    expect(!bad.ok && bad.fieldErrors.reason).toBeTruthy();
  });
  it("hòa vốn/lỗ: bắt buộc cách xử lý và số hoàn vốn từng bên (0 được, trống thì không); đọc 'tr'", () => {
    const ok = parseLossForm(fd({ decision: "Hoàn vốn trừ lỗ theo 60/40", [`returns_${PA}`]: "91tr", [`returns_${PB}`]: "0" }), [PA, PB]);
    expect(ok.ok && ok.payload).toMatchObject({ decision: "Hoàn vốn trừ lỗ theo 60/40", returns: [{ party_id: PA, amount: "91000000" }, { party_id: PB, amount: "0" }] });
    expect(parseLossForm(fd({ decision: "", [`returns_${PA}`]: "1tr" }), [PA]).ok).toBe(false);
    expect(parseLossForm(fd({ decision: "x" }), [PA]).ok).toBe(false);                      // trống không bị coi là 0
    expect(parseLossForm(fd({ decision: "x", [`returns_${PA}`]: "-1tr" }), [PA]).ok).toBe(false);
  });
});

describe("Quyết toán — tổng tiền thật", () => {
  it("chỉ tính dòng chi/thu; dòng nội bộ không có tiền thật; BigInt chính xác", () => {
    const c = settlementCash([
      { kind: "company_operating", amount: "8000000", direction: "none" },
      { kind: "profit_share", amount: "19200000", direction: "out" },
      { kind: "capital_return", amount: "100000000", direction: "out" },
      { kind: "owner_receivable", amount: "9007199254740993", direction: "in" },
    ]);
    expect(c).toEqual({ out: 119_200_000n, in: 9_007_199_254_740_993n, net: 9_007_199_254_740_993n - 119_200_000n });
  });
  it("mỗi loại dòng có loại phiếu tương ứng; dòng thông tin không có", () => {
    expect(LINE_PURPOSE.capital_return).toBe("settle_capital_return");
    expect(LINE_PURPOSE.owner_receivable).toBe("settle_owner_receipt");
    expect(LINE_PURPOSE.fee).toBeUndefined();
    expect(LINE_PURPOSE.company_operating).toBeUndefined();
  });
});
