import { describe, expect, it } from "vitest";
import { isAcceptable, isExpiredVersion, parseQuoteForm } from "@/lib/quotes";

const RID = "11111111-1111-4111-8111-111111111111", VRID = "44444444-4444-4444-8444-444444444444", VID = "22222222-2222-4222-8222-222222222222", DID = "33333333-3333-4333-8333-333333333333";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });
const NOW = new Date("2026-10-06T03:00:00Z");   // 10:00 giờ VN
const create = { request_id: RID, version_request_id: VRID, vehicle_id: VID, demand_id: DID };

describe("Báo giá — đọc form", () => {
  it("bắt buộc giá và hạn hiệu lực (không có hạn mặc định); đọc 'tr'; hạn giờ VN → ISO UTC", () => {
    const none = parseQuoteForm(fd({ ...create }), "create", NOW);
    expect(none.ok).toBe(false);
    if (!none.ok) { expect(none.fieldErrors.offered_price).toBeTruthy(); expect(none.fieldErrors.valid_until).toMatch(/không có hạn mặc định/); }
    const ok = parseQuoteForm(fd({ ...create, offered_price: "650tr", valid_until: "2026-10-09T17:00", benefits: "Tặng phim cách nhiệt" }), "create", NOW);
    expect(ok.ok && ok.payload).toMatchObject({ offered_price: "650000000", valid_until: "2026-10-09T10:00:00.000Z", benefits: "Tặng phim cách nhiệt", vehicle_id: VID, demand_id: DID });
  });
  it("giá phải > 0, hạn phải ở tương lai, thiếu nhu cầu bị báo; phiên nhập hỏng bị từ chối", () => {
    expect(parseQuoteForm(fd({ ...create, offered_price: "0", valid_until: "2026-10-09T17:00" }), "create", NOW).ok).toBe(false);
    expect(parseQuoteForm(fd({ ...create, offered_price: "abc", valid_until: "2026-10-09T17:00" }), "create", NOW).ok).toBe(false);
    expect(parseQuoteForm(fd({ ...create, offered_price: "650tr", valid_until: "2026-10-06T09:00" }), "create", NOW).ok).toBe(false);   // 09:00 VN đã qua
    const noDemand = parseQuoteForm(fd({ ...create, demand_id: "", offered_price: "650tr", valid_until: "2026-10-09T17:00" }), "create", NOW);
    expect(!noDemand.ok && noDemand.fieldErrors.demand_id).toBeTruthy();
    expect(parseQuoteForm(fd({ offered_price: "650tr", valid_until: "2026-10-09T17:00" }), "create", NOW).ok).toBe(false);
  });
  it("phiên bản mới (revise) không cần xe/nhu cầu; không gửi trường duyệt", () => {
    const ok = parseQuoteForm(fd({ request_id: RID, offered_price: "640.000.000", valid_until: "2026-10-09T17:00" }), "revise", NOW);
    expect(ok.ok && ok.payload).toMatchObject({ offered_price: "640000000" });
    expect(ok.ok && "needs_approval" in ok.payload).toBe(false);
    expect(ok.ok && "demand_id" in ok.payload).toBe(false);
  });
  it("chấp nhận được = đã phát hành VÀ còn hạn; chờ duyệt/quá hạn thì không", () => {
    const f = "2026-10-09T10:00:00.000Z", p = "2026-10-05T10:00:00.000Z";
    expect(isAcceptable({ status: "issued", valid_until: f }, NOW)).toBe(true);
    expect(isAcceptable({ status: "pending_approval", valid_until: f }, NOW)).toBe(false);
    expect(isAcceptable({ status: "issued", valid_until: p }, NOW)).toBe(false);
    expect(isExpiredVersion({ status: "issued", valid_until: p }, NOW)).toBe(true);
    expect(isExpiredVersion({ status: "accepted", valid_until: p }, NOW)).toBe(false);
  });
});
