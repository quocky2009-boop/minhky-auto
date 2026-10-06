import { describe, expect, it } from "vitest";
import { parseOrderForm, sumSalePrices } from "@/lib/sales-orders";

const RID = "11111111-1111-4111-8111-111111111111", DID = "33333333-3333-4333-8333-333333333333";
const V1 = "22222222-2222-4222-8222-222222222222", V2 = "55555555-5555-4555-8555-555555555555", Q1 = "66666666-6666-4666-8666-666666666666";
const fd = (o: Record<string, string | string[]>) => ({
  get: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[])[0] : (o[k] as string)) ?? null,
  getAll: (k: string) => (o[k] === undefined ? [] : Array.isArray(o[k]) ? (o[k] as string[]) : [o[k] as string]),
});

describe("Đơn bán — đọc form", () => {
  it("nhiều xe: đọc giá 'tr', bỏ dòng trống, giữ liên kết báo giá nếu có", () => {
    const r = parseOrderForm(fd({ request_id: RID, demand_id: DID, contract_ref: "HĐB-01", contract_date: "2026-10-06",
      line_vehicle: [V1, V2, ""], line_price: ["680tr", "690.000.000", ""], line_quote: [Q1, "", ""] }), "create");
    expect(r.ok && r.payload).toMatchObject({ demand_id: DID, contract_ref: "HĐB-01", contract_date: "2026-10-06",
      lines: [{ vehicle_id: V1, sale_price: "680000000", quote_version_id: Q1 }, { vehicle_id: V2, sale_price: "690000000" }] });
    expect(r.ok && "quote_version_id" in (r.payload.lines as object[])[1]).toBe(false);
  });
  it("bắt buộc ít nhất một xe, giá > 0, chọn nhu cầu; không trùng xe; không tự điền giá 0", () => {
    const none = parseOrderForm(fd({ request_id: RID, demand_id: DID }), "create");
    expect(!none.ok && none.fieldErrors.line_vehicle_0).toBeTruthy();
    expect(parseOrderForm(fd({ request_id: RID, demand_id: DID, line_vehicle: [V1], line_price: ["0"] }), "create").ok).toBe(false);
    expect(parseOrderForm(fd({ request_id: RID, demand_id: DID, line_vehicle: [V1], line_price: [""] }), "create").ok).toBe(false);
    expect(parseOrderForm(fd({ request_id: RID, demand_id: DID, line_vehicle: [V1], line_price: ["abc"] }), "create").ok).toBe(false);
    const dup = parseOrderForm(fd({ request_id: RID, demand_id: DID, line_vehicle: [V1, V1], line_price: ["1tr", "2tr"] }), "create");
    expect(!dup.ok && dup.fieldErrors.line_vehicle_1).toMatch(/đã có trong đơn/);
    const noDemand = parseOrderForm(fd({ request_id: RID, line_vehicle: [V1], line_price: ["1tr"] }), "create");
    expect(!noDemand.ok && noDemand.fieldErrors.demand_id).toBeTruthy();
    expect(parseOrderForm(fd({ demand_id: DID, line_vehicle: [V1], line_price: ["1tr"] }), "create").ok).toBe(false);   // thiếu mã phiên nhập
  });
  it("sửa đơn nháp không cần mã yêu cầu/nhu cầu", () => {
    const r = parseOrderForm(fd({ line_vehicle: [V1], line_price: ["650tr"] }), "update");
    expect(r.ok && r.payload).toMatchObject({ lines: [{ vehicle_id: V1, sale_price: "650000000" }] });
    expect(r.ok && "demand_id" in r.payload).toBe(false);
  });
});

describe("Tổng giá bán", () => {
  it("cộng chính xác bằng BigInt, kể cả số rất lớn; thiếu giá không bị coi là 0", () => {
    expect(sumSalePrices(["680000000", "690000000"])).toBe(1370000000n);
    expect(sumSalePrices(["9007199254740993", "1"])).toBe(9007199254740994n);
    expect(sumSalePrices(["680000000", null])).toBeNull();
    expect(sumSalePrices([])).toBe(0n);
  });
});
