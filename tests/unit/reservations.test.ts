import { describe, expect, it } from "vitest";
import { isExpiredHold, parseConvertForm, parseExtendForm, parseReserveForm } from "@/lib/reservations";

const RID = "11111111-1111-4111-8111-111111111111", VID = "22222222-2222-4222-8222-222222222222", DID = "33333333-3333-4333-8333-333333333333";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });
const NOW = new Date("2026-10-05T03:00:00Z");   // 10:00 giờ VN
const base = { request_id: RID, vehicle_id: VID, demand_id: DID };

describe("Giữ xe / đặt cọc — đọc form", () => {
  it("giữ xe: BẮT BUỘC nhập hạn (không có hạn mặc định); hạn đọc theo giờ VN → ISO UTC", () => {
    const none = parseReserveForm(fd({ ...base, kind: "hold" }), NOW);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.fieldErrors.valid_until).toMatch(/không có hạn mặc định/);
    const ok = parseReserveForm(fd({ ...base, kind: "hold", valid_until: "2026-10-07T17:00" }), NOW);
    expect(ok.ok && ok.payload.valid_until).toBe("2026-10-07T10:00:00.000Z");
    expect(ok.ok && "deposit_amount" in ok.payload).toBe(false);
  });
  it("hạn phải ở tương lai; ngày giờ sai định dạng bị báo", () => {
    expect(parseReserveForm(fd({ ...base, kind: "hold", valid_until: "2026-10-05T09:00" }), NOW).ok).toBe(false);   // 09:00 VN đã qua
    expect(parseReserveForm(fd({ ...base, kind: "hold", valid_until: "05/10/2026" }), NOW).ok).toBe(false);
  });
  it("đặt cọc: số tiền cọc thỏa thuận > 0; đọc 'tr'; hạn là tùy chọn; không gửi giá chốt trống thành 0", () => {
    expect(parseReserveForm(fd({ ...base, kind: "deposit" }), NOW).ok).toBe(false);
    expect(parseReserveForm(fd({ ...base, kind: "deposit", deposit_amount: "0" }), NOW).ok).toBe(false);
    const ok = parseReserveForm(fd({ ...base, kind: "deposit", deposit_amount: "30tr", agreed_price: "" }), NOW);
    expect(ok.ok && ok.payload).toMatchObject({ kind: "deposit", deposit_amount: "30000000", agreed_price: "" });
    expect(ok.ok && "valid_until" in ok.payload).toBe(false);
    expect(parseReserveForm(fd({ ...base, kind: "deposit", deposit_amount: "30tr", valid_until: "2026-10-09T10:00" }), NOW).ok).toBe(true);
  });
  it("bắt buộc chọn nhu cầu mua và loại; số tiền sai bị báo; giá chốt 0 bị chặn", () => {
    const r = parseReserveForm(fd({ request_id: RID, vehicle_id: VID, demand_id: "", kind: "x" }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["demand_id", "kind"]);
    expect(parseReserveForm(fd({ ...base, kind: "deposit", deposit_amount: "abc" }), NOW).ok).toBe(false);
    expect(parseReserveForm(fd({ ...base, kind: "hold", valid_until: "2026-10-07T10:00", agreed_price: "0" }), NOW).ok).toBe(false);
    expect(parseReserveForm(fd({ request_id: "x", vehicle_id: VID }), NOW)).toMatchObject({ ok: false, fieldErrors: {} });
  });
  it("chuyển giữ → cọc: bắt buộc số tiền cọc; gia hạn: bắt buộc hạn mới ở tương lai", () => {
    expect(parseConvertForm(fd({ request_id: RID }), NOW).ok).toBe(false);
    const ok = parseConvertForm(fd({ request_id: RID, deposit_amount: "50tr" }), NOW);
    expect(ok.ok && ok.payload).toMatchObject({ deposit_amount: "50000000", valid_until: "" });
    expect(parseExtendForm(fd({}), NOW).ok).toBe(false);
    expect(parseExtendForm(fd({ valid_until: "2026-10-04T10:00" }), NOW).ok).toBe(false);
    expect(parseExtendForm(fd({ valid_until: "2026-10-10T10:00" }), NOW).ok).toBe(true);
  });
});

describe("Giữ xe hết hạn", () => {
  it("chỉ giữ xe đang hiệu lực quá hạn mới là hết hạn; cọc và bản đã kết thúc thì không", () => {
    const past = "2026-10-05T02:00:00Z", future = "2026-10-06T00:00:00Z";
    expect(isExpiredHold({ kind: "hold", status: "active", valid_until: past }, NOW)).toBe(true);
    expect(isExpiredHold({ kind: "hold", status: "active", valid_until: future }, NOW)).toBe(false);
    expect(isExpiredHold({ kind: "deposit", status: "active", valid_until: past }, NOW)).toBe(false);
    expect(isExpiredHold({ kind: "hold", status: "released", valid_until: past }, NOW)).toBe(false);
    expect(isExpiredHold({ kind: "hold", status: "active", valid_until: null }, NOW)).toBe(false);
  });
});
