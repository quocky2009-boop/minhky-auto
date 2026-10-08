import { describe, expect, it } from "vitest";
import { normalizeVin, parseCommissionPaymentForm, parseRuleForm } from "@/lib/commissions";

const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] === undefined ? [] : [o[k]]) });
const RID = "5f0d1c64-8d3a-4a43-9a6e-2c2f1a9b7e10", MAKE = "6a1e2d75-9e4b-4b54-8b7f-3d3a2b8c8f21", MODEL = "7b2f3e86-0f5c-4c65-9c80-4e4b3c9d9032", ACC = "8c304f97-1a6d-4d76-8d91-5f5c4dae0143";
const NOW = new Date("2026-10-08T05:00:00Z");

describe("VIN", () => {
  it("chuẩn hóa: bỏ khoảng trắng, chữ hoa", () => expect(normalizeVin("  rl4 abc\t123 ")).toBe("RL4ABC123"));
});

describe("Quy tắc hoa hồng", () => {
  const model = { request_id: RID, scope: "model", make_id: MAKE, amount: "5tr", effective_from: "2026-10-08" };
  it("xe mới: bắt buộc hãng, model tùy chọn (trống = cả hãng); số tiền đọc 'tr'", () => {
    const r = parseRuleForm(fd(model));
    expect(r.ok && r.payload).toMatchObject({ scope: "model", make_id: MAKE, model_id: "", vin: "", amount: "5000000" });
    expect(parseRuleForm(fd({ ...model, model_id: MODEL })).ok).toBe(true);
    expect(parseRuleForm(fd({ ...model, make_id: "" })).ok).toBe(false);
    expect(parseRuleForm(fd({ ...model, model_id: "abc" })).ok).toBe(false);
  });
  it("xe cũ: bắt buộc số VIN hợp lệ, chuẩn hóa chữ hoa; không mang hãng/model", () => {
    const base = { request_id: RID, scope: "vin", amount: "3tr", effective_from: "2026-10-08", make_id: MAKE };
    const r = parseRuleForm(fd({ ...base, vin: " rl4 abc12345 " }));
    expect(r.ok && r.payload).toMatchObject({ vin: "RL4ABC12345", make_id: "", model_id: "" });
    expect(parseRuleForm(fd({ ...base, vin: "" })).ok).toBe(false);
    expect(parseRuleForm(fd({ ...base, vin: "AB" })).ok).toBe(false);
    expect(parseRuleForm(fd({ ...base, vin: "RL4-ABC-1234" })).ok).toBe(false);
  });
  it("số tiền bắt buộc, không âm (cho phép 0 nếu chủ ý không có hoa hồng); ngày hiệu lực bắt buộc; loại hợp lệ", () => {
    expect(parseRuleForm(fd({ ...model, amount: "" })).ok).toBe(false);
    expect(parseRuleForm(fd({ ...model, amount: "abc" })).ok).toBe(false);
    expect(parseRuleForm(fd({ ...model, amount: "0" })).ok).toBe(true);
    expect(parseRuleForm(fd({ ...model, effective_from: "" })).ok).toBe(false);
    expect(parseRuleForm(fd({ ...model, scope: "all" })).ok).toBe(false);
  });
});

describe("Chi hoa hồng", () => {
  const base = { request_id: RID, entry_id: MAKE, amount: "2tr", account_id: ACC, paid_on: "2026-10-08" };
  it("bắt buộc tài khoản tiền và số tiền > 0; ngày chi không ở tương lai", () => {
    expect(parseCommissionPaymentForm(fd(base), NOW).ok).toBe(true);
    expect(parseCommissionPaymentForm(fd({ ...base, account_id: "" }), NOW).ok).toBe(false);
    expect(parseCommissionPaymentForm(fd({ ...base, amount: "0" }), NOW).ok).toBe(false);
    expect(parseCommissionPaymentForm(fd({ ...base, paid_on: "2026-10-09" }), NOW).ok).toBe(false);
  });
});
