import { describe, expect, it } from "vitest";
import { outstanding, parseConfirm, parseCostCreate, parseCostUpdate, parsePayment } from "@/lib/costs";

const RID = "11111111-1111-4111-8111-111111111111", VID = "22222222-2222-4222-8222-222222222222";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });

describe("Form chi phí — tạo", () => {
  it("đọc tiền 'tr'; để trống dự toán = chưa rõ (chuỗi rỗng), không thành 0", () => {
    const a = parseCostCreate(fd({ request_id: RID, vehicle_id: VID, category: "repair", description: "Sơn cản", estimated_amount: "5tr" }), "owned");
    const b = parseCostCreate(fd({ request_id: RID, vehicle_id: VID, category: "other", description: "Phí", estimated_amount: "" }), "owned");
    expect(a.ok && a.payload.estimated_amount).toBe("5000000");
    expect(b.ok && b.payload.estimated_amount).toBe("");
  });
  it("xe ký gửi bắt buộc chọn bên chịu chi phí; xe sở hữu không được là 'chủ xe chịu'", () => {
    const base = { request_id: RID, vehicle_id: VID, category: "repair", description: "x" };
    expect(parseCostCreate(fd(base), "consignment").ok).toBe(false);
    expect(parseCostCreate(fd({ ...base, borne_by: "owner" }), "consignment").ok).toBe(true);
    expect(parseCostCreate(fd({ ...base, borne_by: "owner" }), "owned").ok).toBe(false);
    const own = parseCostCreate(fd(base), "owned");
    expect(own.ok && "borne_by" in own.payload).toBe(false);
  });
  it("bắt buộc loại và mô tả; số tiền sai bị báo", () => {
    const r = parseCostCreate(fd({ request_id: RID, vehicle_id: VID, category: "?", description: "", estimated_amount: "abc" }), "owned");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["category", "description", "estimated_amount"]);
  });
});

describe("Form chi phí — sửa, xác nhận, thanh toán", () => {
  it("sửa: bắt buộc mô tả", () => expect(parseCostUpdate(fd({ description: "" }), "owned").ok).toBe(false));
  it("xác nhận: để trống bị chặn (chưa rõ ≠ 0); nhập 0 hợp lệ", () => {
    expect(parseConfirm(fd({ confirmed_amount: "" })).ok).toBe(false);
    const z = parseConfirm(fd({ confirmed_amount: "0" }));
    expect(z.ok && z.payload.confirmed_amount).toBe("0");
    expect(parseConfirm(fd({ confirmed_amount: "4,5tr", accepted_note: "ok" })).ok).toBe(true);
  });
  it("thanh toán: số tiền > 0, hình thức hợp lệ, ngày đúng định dạng", () => {
    const base = { request_id: RID, cost_id: VID, method: "cash" };
    expect(parsePayment(fd({ ...base, amount: "" })).ok).toBe(false);
    expect(parsePayment(fd({ ...base, amount: "0" })).ok).toBe(false);
    expect(parsePayment(fd({ ...base, amount: "1tr", method: "bitcoin" })).ok).toBe(false);
    expect(parsePayment(fd({ ...base, amount: "1tr", paid_at: "01/10/2026" })).ok).toBe(false);
    const ok = parsePayment(fd({ ...base, amount: "1tr", paid_at: "2026-10-01" }));
    expect(ok.ok && ok.payload).toMatchObject({ amount: "1000000", paid_at: "2026-10-01" });
  });
  it("còn phải trả: chưa có số xác nhận thì 'chưa rõ', không phải 0", () => {
    expect(outstanding(null, BigInt(5))).toBeNull();
    expect(outstanding(BigInt(4500000), BigInt(2000000))).toBe(BigInt(2500000));
    expect(outstanding(BigInt(100), null)).toBe(BigInt(100));
  });
});
