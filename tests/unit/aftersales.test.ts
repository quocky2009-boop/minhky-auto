import { describe, expect, it } from "vitest";
import { dueState, parseCaseForm, parseCommitmentForm, parseEventForm, parseNextForm } from "@/lib/aftersales";

const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] === undefined ? [] : [o[k]]) });
const RID = "5f0d1c64-8d3a-4a43-9a6e-2c2f1a9b7e10", LINE = "6a1e2d75-9e4b-4b54-8b7f-3d3a2b8c8f21";
const NOW = new Date("2026-10-08T05:00:00Z");   // 08/10/2026 giờ Việt Nam

describe("Hạn xử lý hậu mãi", () => {
  it("quá hạn / hôm nay / sắp tới / không có hạn; phiếu đã đóng không có trạng thái hạn", () => {
    expect(dueState("open", "2026-10-07", NOW)).toBe("overdue");
    expect(dueState("in_progress", "2026-10-08", NOW)).toBe("today");
    expect(dueState("open", "2026-10-09", NOW)).toBe("upcoming");
    expect(dueState("open", null, NOW)).toBe("none");
    expect(dueState("resolved", "2026-10-01", NOW)).toBe("none");
    expect(dueState("cancelled", "2026-10-01", NOW)).toBe("none");
  });
});

describe("Cam kết / bảo hành", () => {
  const base = { request_id: RID, order_line_id: LINE, kind: "warranty", title: "Bảo hành thân vỏ", starts_on: "2026-10-08" };
  it("bảo hành phải có hạn ngày và/hoặc giới hạn km; cam kết khác được để mô tả", () => {
    expect(parseCommitmentForm(fd(base)).ok).toBe(false);
    expect(parseCommitmentForm(fd({ ...base, ends_on: "2027-10-08" })).ok).toBe(true);
    expect(parseCommitmentForm(fd({ ...base, odo_limit: "100000" })).ok).toBe(true);
    expect(parseCommitmentForm(fd({ ...base, kind: "commitment" })).ok).toBe(true);
  });
  it("hết hạn không trước ngày bắt đầu; km là số nguyên dương", () => {
    expect(parseCommitmentForm(fd({ ...base, ends_on: "2026-10-01" })).ok).toBe(false);
    expect(parseCommitmentForm(fd({ ...base, ends_on: "2027-10-08", odo_limit: "0" })).ok).toBe(false);
    expect(parseCommitmentForm(fd({ ...base, ends_on: "2027-10-08", odo_limit: "abc" })).ok).toBe(false);
    expect(parseCommitmentForm(fd({ ...base, ends_on: "2027-10-08", title: "" })).ok).toBe(false);
  });
});

describe("Phiếu hậu mãi", () => {
  const base = { request_id: RID, order_line_id: LINE, kind: "complaint", title: "Tiếng ồn gầm", next_action: "Gọi khách", next_due: "2026-10-09" };
  it("bắt buộc việc tiếp theo + hạn không ở quá khứ; ngày tiếp nhận không ở tương lai", () => {
    expect(parseCaseForm(fd(base), NOW).ok).toBe(true);
    expect(parseCaseForm(fd({ ...base, next_action: "" }), NOW).ok).toBe(false);
    expect(parseCaseForm(fd({ ...base, next_due: "" }), NOW).ok).toBe(false);
    expect(parseCaseForm(fd({ ...base, next_due: "2026-10-07" }), NOW).ok).toBe(false);
    expect(parseCaseForm(fd({ ...base, received_on: "2026-10-09" }), NOW).ok).toBe(false);
    expect(parseCaseForm(fd({ ...base, kind: "other" }), NOW).ok).toBe(false);
    expect(parseCaseForm(fd({ ...base, odo_at_case: "12ab" }), NOW).ok).toBe(false);
  });
  it("km để trống là chưa biết (chuỗi rỗng), không phải 0", () => {
    const r = parseCaseForm(fd(base), NOW);
    expect(r.ok && r.payload).toMatchObject({ odo_at_case: "", commitment_id: "", assigned_to: "" });
  });
  it("việc tiếp theo và nhật ký", () => {
    expect(parseNextForm(fd({ next_action: "Kiểm tra", next_due: "2026-10-10" }), NOW).ok).toBe(true);
    expect(parseNextForm(fd({ next_action: "", next_due: "2026-10-10" }), NOW).ok).toBe(false);
    expect(parseEventForm(fd({ case_id: LINE, event_kind: "contact", content: "Đã gọi" })).ok).toBe(true);
    expect(parseEventForm(fd({ case_id: LINE, event_kind: "status", content: "x" })).ok).toBe(false);
    expect(parseEventForm(fd({ case_id: LINE, event_kind: "note", content: " " })).ok).toBe(false);
  });
});
