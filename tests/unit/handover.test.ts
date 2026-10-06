import { describe, expect, it } from "vitest";
import { parseDeliverForm, parseExceptionForm, parseItemForm, readinessSummary } from "@/lib/handover";

const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null, getAll: (k: string) => (o[k] !== undefined ? [o[k]] : []) });
const NOW = new Date("2026-10-06T03:00:00Z");
const HID = "11111111-1111-4111-8111-111111111111", RID = "22222222-2222-4222-8222-222222222222";

describe("Bàn giao — đọc form", () => {
  it("mục checklist: bản gốc phải có người giữ; mục thiếu phải ghi chú; chưa kiểm không có cờ; không áp dụng không có bản gốc", () => {
    expect(parseItemForm(fd({ state: "ok", has_original: "on", holder: "showroom" })).ok).toBe(true);
    const noHolder = parseItemForm(fd({ state: "ok", has_original: "on" }));
    expect(!noHolder.ok && noHolder.fieldErrors.holder).toBeTruthy();
    expect(parseItemForm(fd({ state: "missing" })).ok).toBe(false);
    expect(parseItemForm(fd({ state: "missing", note: "Chờ hóa đơn" })).ok).toBe(true);
    expect(parseItemForm(fd({ state: "pending", has_scan: "on" })).ok).toBe(false);
    expect(parseItemForm(fd({ state: "na", has_original: "on", holder: "customer" })).ok).toBe(false);
    expect(parseItemForm(fd({ state: "xx" })).ok).toBe(false);
    const scan = parseItemForm(fd({ state: "ok", has_scan: "on", holder: "customer" }));
    expect(scan.ok && scan.payload).toMatchObject({ has_original: false, has_scan: true, holder: "customer" });
  });
  it("giao xe: bắt buộc ngày (không tương lai), người nhận + quan hệ, ODO và số chìa khóa — không có giá trị mặc định", () => {
    const base = { delivered_on: "2026-10-06", received_by_name: "Nguyễn Văn A", received_relation: "customer", odo: "12500", keys_given: "2" };
    expect(parseDeliverForm(fd(base), NOW).ok).toBe(true);
    for (const bad of [{ delivered_on: "2026-10-08" }, { delivered_on: "" }, { received_by_name: "" }, { received_relation: "" }, { odo: "" }, { odo: "-1" }, { odo: "12.5" }, { keys_given: "" }]) {
      expect(parseDeliverForm(fd({ ...base, ...bad }), NOW).ok).toBe(false);
    }
    expect(parseDeliverForm(fd({ ...base, delivered_on: "2026-10-06" }), new Date("2026-10-05T20:00:00Z")).ok).toBe(true);   // đã sang 06/10 giờ VN
  });
  it("ngoại lệ: bắt buộc loại + lý do", () => {
    expect(parseExceptionForm(fd({ request_id: RID, handover_id: HID, kind: "payment", reason: "Chờ giải ngân" })).ok).toBe(true);
    expect(parseExceptionForm(fd({ request_id: RID, handover_id: HID, kind: "payment", reason: " " })).ok).toBe(false);
    expect(parseExceptionForm(fd({ request_id: RID, handover_id: HID, kind: "contract", reason: "x" })).ok).toBe(false);
  });
});

describe("Bàn giao — tóm tắt điều kiện giao xe", () => {
  const ok = { contract_ok: true, payment_ok: true, prep_ok: true, paperwork_ok: true, checklist_ok: true, pending_required: 0, waived: [] as string[] };
  it("đủ điều kiện → giao được", () => expect(readinessSummary(ok).canDeliver).toBe(true));
  it("thiếu điều kiện chưa miễn → chặn; có ngoại lệ đúng loại → qua; ngoại lệ sai loại không giúp", () => {
    const miss = { ...ok, payment_ok: false, checklist_ok: false, pending_required: 3 };
    expect(readinessSummary(miss).canDeliver).toBe(false);
    expect(readinessSummary(miss).blocking.map((x) => x.kind)).toEqual(["payment", "checklist"]);
    expect(readinessSummary({ ...miss, waived: ["payment"] }).blocking.map((x) => x.kind)).toEqual(["checklist"]);
    expect(readinessSummary({ ...miss, waived: ["payment", "checklist"] }).canDeliver).toBe(true);
    expect(readinessSummary({ ...miss, waived: ["prep"] }).canDeliver).toBe(false);
  });
  it("hợp đồng chưa ký thì không giao được dù có ngoại lệ", () => {
    expect(readinessSummary({ ...ok, contract_ok: false, waived: ["payment", "prep", "paperwork", "checklist"] }).canDeliver).toBe(false);
  });
});
