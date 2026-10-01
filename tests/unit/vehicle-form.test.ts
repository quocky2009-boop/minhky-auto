import { describe, expect, it } from "vitest";
import { parseAcquireForm, parseVehicleForm } from "@/lib/vehicles/form";
import { readVehicleFilters, toVehicleQuery, toVehicleRpcFilter } from "@/lib/vehicles/filters";

const RID = "11111111-1111-4111-8111-111111111111";
const fd = (o: Record<string, string | string[]>) => ({
  get: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[])[0] : o[k]) ?? null,
  getAll: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[]) : o[k] !== undefined ? [o[k] as string] : []),
});

describe("Form xe — nhập mới", () => {
  it("đọc tiền kiểu 'tr', ô trống thành chuỗi rỗng (Chưa rõ), không thành 0", () => {
    const r = parseVehicleForm(fd({ request_id: RID, make: "VinFast", condition: "used", business_type: "owned", asking_price: "650tr", odo: "", purchase_price: "1,2 tỷ" }), "create");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toMatchObject({ asking_price: "650000000", purchase_price: "1200000000", odo: "", year_made: "", condition: "used" });
  });
  it("bắt buộc hãng và mới/cũ; VIN sai bị chặn; giá sàn không vượt giá chào", () => {
    const r = parseVehicleForm(fd({ request_id: RID, make: "", vin: "AB C", asking_price: "500tr", floor_price: "600tr", purchase_price: "" }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["condition", "floor_price", "make", "vin"]);
  });
  it("xe ký gửi không được có giá mua của showroom", () => {
    const r = parseVehicleForm(fd({ request_id: RID, make: "Honda", condition: "used", business_type: "consignment", purchase_price: "300tr" }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.purchase_price).toMatch(/ký gửi/);
  });
  it("không gửi khóa giá mua khi form không có ô đó (tài khoản không xem tài chính)", () => {
    const r = parseVehicleForm(fd({ request_id: RID, make: "Kia", condition: "new", business_type: "owned" }), "create");
    expect(r.ok && "purchase_price" in r.payload).toBe(false);
  });
  it("sửa: chỉ cho đặt tay 'chưa chào bán' / 'đang bán'", () => {
    const ok = parseVehicleForm(fd({ make: "Kia", sale_status: "available", business_type_locked: "owned" }), "update");
    const bad = parseVehicleForm(fd({ make: "Kia", sale_status: "sold", business_type_locked: "owned" }), "update");
    expect(ok.ok && ok.payload.sale_status).toBe("available");
    expect(bad.ok && "sale_status" in bad.payload).toBe(false);
  });
});

describe("Form nhập kho từ nhu cầu bán", () => {
  it("mua đứt bắt buộc giá mua; ký gửi cấm giá mua", () => {
    const a = parseAcquireForm(fd({ request_id: RID, business_type: "owned", purchase_price: "" }));
    const b = parseAcquireForm(fd({ request_id: RID, business_type: "consignment", purchase_price: "300tr" }));
    const c = parseAcquireForm(fd({ request_id: RID, business_type: "owned", purchase_price: "650tr", odo: "45.500" }));
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(c.ok && c.payload).toMatchObject({ purchase_price: "650000000", odo: "45500" });
  });
});

describe("Bộ lọc kho xe", () => {
  it("giá không hiểu được thì bỏ qua và báo, không thành 0", () => {
    const { rpc, warnings } = toVehicleRpcFilter(readVehicleFilters({ pf: "abc", pt: "700tr", state: "" }));
    expect(rpc).toEqual({ state: "stock", price_to: "700000000" });
    expect(warnings).toHaveLength(1);
  });
  it("giữ bộ lọc khi phân trang", () => {
    expect(toVehicleQuery({ q: "vios", cond: "used" }, { page: "2" })).toBe("q=vios&cond=used&page=2");
  });
});
