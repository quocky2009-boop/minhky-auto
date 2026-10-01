import { describe, expect, it } from "vitest";
import { parseAppraisalForm } from "@/lib/appraisal";

const fd = (o: Record<string, string | string[]>) => ({
  get: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[])[0] : o[k]) ?? null,
  getAll: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[]) : o[k] !== undefined ? [o[k] as string] : []),
});

describe("Form thẩm định", () => {
  it("đọc kết quả từng mục; giá trị lạ thành 'chưa kiểm tra' (không bao giờ thành đạt)", () => {
    const r = parseAppraisalForm(fd({ item_keys: ["vin_match", "tires"], item_vin_match: "pass", note_vin_match: " khớp ", item_tires: "hack", is_ev: "on", proposed_price: "600tr" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.items).toEqual({ vin_match: { result: "pass", note: "khớp" }, tires: { result: "unchecked", note: "" } });
      expect(r.payload).toMatchObject({ is_ev: true, proposed_price: "600000000" });
    }
  });
  it("mục không có trong form thì không gửi (không tự điền 'đạt')", () => {
    const r = parseAppraisalForm(fd({ item_keys: [] }));
    expect(r.ok && r.payload.items).toEqual({});
  });
  it("giá sai bị báo lỗi; không gửi khóa giá khi form không có ô giá (vai trò không xem tài chính)", () => {
    expect(parseAppraisalForm(fd({ item_keys: [], proposed_price: "abc" })).ok).toBe(false);
    const r = parseAppraisalForm(fd({ item_keys: [] }));
    expect(r.ok && "proposed_price" in r.payload).toBe(false);
  });
  it("bỏ khóa không an toàn trong tên mục", () => {
    const r = parseAppraisalForm(fd({ item_keys: ["ok_key", "bad key;drop"], item_ok_key: "pass" }));
    expect(r.ok && Object.keys(r.payload.items as object)).toEqual(["ok_key"]);
  });
});
