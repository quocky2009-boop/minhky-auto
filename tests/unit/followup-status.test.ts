import { describe, expect, it } from "vitest";
import { followupState } from "@/lib/followup";
import { nextStatuses } from "@/lib/labels";

const now = new Date("2026-10-01T03:00:00Z"); // 10:00 giờ VN
describe("Đèn báo chăm sóc", () => {
  it("quá hạn / hôm nay / lâu chưa cập nhật / đúng hạn", () => {
    expect(followupState({ status: "verified", next_action_due: "2026-09-30T10:00:00Z", last_activity_at: now.toISOString() }, 14, now)).toBe("overdue");
    expect(followupState({ status: "verified", next_action_due: "2026-10-01T15:00:00Z", last_activity_at: now.toISOString() }, 14, now)).toBe("today");
    expect(followupState({ status: "verified", next_action_due: "2026-10-05T03:00:00Z", last_activity_at: "2026-09-01T00:00:00Z" }, 14, now)).toBe("stale");
    expect(followupState({ status: "verified", next_action_due: "2026-10-05T03:00:00Z", last_activity_at: now.toISOString() }, 14, now)).toBe("ok");
    expect(followupState({ status: "closed", next_action_due: "2026-09-01T00:00:00Z", last_activity_at: null }, 14, now)).toBe("none");
  });
  it("23:30 giờ VN hôm trước là quá hạn, không phải hôm nay", () => {
    expect(followupState({ status: "searching", next_action_due: "2026-09-30T16:30:00Z", last_activity_at: now.toISOString() }, 14, now)).toBe("overdue");
  });
});

describe("Bước chuyển trạng thái trên giao diện khớp luật database", () => {
  it("nhu cầu mua mới không nhảy thẳng sang đã cọc", () => {
    expect(nextStatuses("buy", "new", false)).not.toContain("won");
    expect(nextStatuses("buy", "negotiating", false)).toContain("won");
  });
  it("sales không mở lại nhu cầu đã đóng; quản lý mở lại về Mới", () => {
    expect(nextStatuses("buy", "closed", false)).toEqual([]);
    expect(nextStatuses("sell", "closed", true)).toEqual(["new"]);
  });
});
