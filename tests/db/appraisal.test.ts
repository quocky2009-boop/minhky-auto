/**
 * Chặng 3 (lát 2): thẩm định có checklist + duyệt mua. Chạy SQL dưới vai trò `authenticated` của từng người.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Thẩm định và duyệt mua — chặng 3 lát 2 (database thật)", () => {
  let sys: Client, c: Client;
  let manager: string, salesA: string, salesB: string, tech: string, accountant: string;

  beforeAll(async () => {
    sys = await connect(); c = await connect();
    manager = await createUser(sys, "QL Thẩm định", ["manager"]);
    salesA = await createUser(sys, "Sales TĐ A", ["sales"]);
    salesB = await createUser(sys, "Sales TĐ B", ["sales"]);
    tech = await createUser(sys, "KTV TĐ", ["technician"]);
    accountant = await createUser(sys, "KT TĐ", ["accountant"]);
  });
  afterAll(async () => { await sys.end(); await c.end(); });

  const sellDemand = (offer: Record<string, unknown> = { make: "Toyota", model: "Fortuner", year_made: "2019", sale_mode: "outright" }) =>
    as(c, salesA, async (db) => (await db.query("select public.create_demand($1::jsonb) id", [JSON.stringify({
      request_id: uuid(), kind: "sell", customer: { full_name: "Khách TĐ " + uuid().slice(0, 4) }, sell_offer: offer })])).rows[0].id as string);
  const save = (user: string, dem: string, p: Record<string, unknown>, version: number | null = null) =>
    as(c, user, async (db) => (await db.query("select public.save_appraisal($1, $2::jsonb, $3) v", [dem, JSON.stringify(p), version])).rows[0].v as number);
  const decide = (user: string, dem: string, decision: string, p: Record<string, unknown> = {}) =>
    as(c, user, (db) => db.query("select public.decide_appraisal($1, $2, $3::jsonb)", [dem, decision, JSON.stringify(p)]));
  const allPass = async (ev = false) => {
    const tpl = (await sys.query("select key, requires_note_on_pass from public.appraisal_templates where is_active and ($1 or not ev_only)", [ev])).rows;
    return Object.fromEntries(tpl.map((t) => [t.key, { result: "pass", note: t.requires_note_on_pass ? "SoH 92% (màn hình xe + ảnh)" : "" }]));
  };
  const status = async (dem: string) => (await sys.query("select status from public.appraisals where demand_id = $1", [dem])).rows[0]?.status as string | undefined;

  it("Địa điểm showroom đã có trong hệ thống (dữ liệu anh Kỳ cung cấp)", async () => {
    const r = (await sys.query("select name, address, kind from public.locations where address like '212 Trường Chinh%'")).rows;
    expect(r).toEqual([{ name: "Showroom Minh Kỳ Auto", address: "212 Trường Chinh, P. Minh Xuân, tỉnh Tuyên Quang", kind: "showroom" }]);
  });

  it("Chỉ quản lý ghi/duyệt thẩm định; sales, kỹ thuật, kế toán bị chặn", async () => {
    const dem = await sellDemand();
    for (const u of [salesA, tech, accountant]) {
      await expect(save(u, dem, { summary: "x" })).rejects.toThrow(/Chỉ quản lý/);
    }
    await save(manager, dem, { summary: "Xe đẹp" });
    for (const u of [salesA, tech, accountant]) await expect(decide(u, dem, "approve")).rejects.toThrow(/Chỉ quản lý/);
  });

  it("Mục chưa kiểm tra KHÔNG được coi là đạt: không duyệt được khi còn mục bắt buộc chưa kiểm tra", async () => {
    const dem = await sellDemand();
    await save(manager, dem, { items: { vin_match: { result: "pass" } }, proposed_price: "600000000" });
    await expect(decide(manager, dem, "approve", { approved_max_price: "600000000" })).rejects.toThrow(/Còn mục bắt buộc chưa kiểm tra: .*Giấy đăng ký xe/);
    expect(await status(dem)).toBe("draft");
  });

  it("Mục không đạt phải ghi tình trạng; ODO phải ghi số đọc; giá tối đa bắt buộc (trừ ký gửi)", async () => {
    const dem = await sellDemand();
    const items = (await allPass()) as Record<string, { result: string; note: string }>;
    items.exterior = { result: "fail", note: "" };
    items.odo_check = { result: "pass", note: "" };
    await save(manager, dem, { items });
    await expect(decide(manager, dem, "approve", { approved_max_price: "600000000" })).rejects.toThrow(/Mục không đạt phải ghi rõ tình trạng: Ngoại thất/);
    items.exterior.note = "Trầy cản trước, cần sơn";
    await save(manager, dem, { items });
    await expect(decide(manager, dem, "approve", { approved_max_price: "600000000" })).rejects.toThrow(/cần ghi số đo \/ bằng chứng: ODO/);
    items.odo_check.note = "52.300 km";
    await save(manager, dem, { items });
    await expect(decide(manager, dem, "approve")).rejects.toThrow(/Nhập giá mua tối đa/);
    await decide(manager, dem, "approve", { approved_max_price: "600000000" });
    expect(await status(dem)).toBe("approved");
    const row = (await sys.query("select decided_by from public.appraisals where demand_id = $1", [dem])).rows[0];
    expect(row.decided_by).toBe(manager);

    // ký gửi: không cần giá tối đa
    const cons = await sellDemand({ make: "Honda", model: "CR-V", sale_mode: "consignment" });
    await save(manager, cons, { items: await allPass() });
    await decide(manager, cons, "approve");
    expect(await status(cons)).toBe("approved");
  });

  it("Xe điện: thêm mục pin/sạc bắt buộc; bỏ đánh dấu xe điện thì mục xe điện biến mất", async () => {
    const dem = await sellDemand({ make: "VinFast", model: "VF 8", year_made: "2023", fuel_type: "ev", sale_mode: "outright" });
    const base = await allPass(false);
    await save(manager, dem, { is_ev: true, items: base });
    await expect(decide(manager, dem, "approve", { approved_max_price: "700000000" })).rejects.toThrow(/Còn mục bắt buộc chưa kiểm tra: .*pin.*sạc/i);
    await save(manager, dem, { items: await allPass(true) });
    await decide(manager, dem, "approve", { approved_max_price: "700000000" });
    const ev = (await sys.query("select count(*)::int n from public.appraisal_items where demand_id = $1 and template_key like 'ev_%'", [dem])).rows[0].n;
    expect(ev).toBe(2);
    await decide(manager, dem, "reopen");
    await save(manager, dem, { is_ev: false });
    expect((await sys.query("select count(*)::int n from public.appraisal_items where demand_id = $1 and template_key like 'ev_%'", [dem])).rows[0].n).toBe(0);
  });

  it("Phân quyền đọc: sales phụ trách thấy tình trạng thẩm định nhưng KHÔNG thấy giá; sales khác và kỹ thuật không thấy gì; kế toán thấy giá", async () => {
    const dem = await sellDemand();
    await save(manager, dem, { items: await allPass(), proposed_price: "555000000", summary: "ok" });
    await decide(manager, dem, "approve", { approved_max_price: "560000000" });
    const owner = await as(c, salesA, async (db) => ({
      a: (await db.query("select status from public.appraisals where demand_id = $1", [dem])).rowCount,
      items: (await db.query("select count(*)::int n from public.appraisal_items where demand_id = $1", [dem])).rows[0].n,
      fin: (await db.query("select count(*)::int n from public.appraisal_financials where demand_id = $1", [dem])).rows[0].n,
    }));
    expect(owner.a).toBe(1); expect(owner.items).toBeGreaterThan(10); expect(owner.fin).toBe(0);
    for (const u of [salesB, tech]) {
      expect(await as(c, u, async (db) => (await db.query("select count(*)::int n from public.appraisals where demand_id = $1", [dem])).rows[0].n)).toBe(0);
    }
    expect(await as(c, accountant, async (db) => (await db.query("select approved_max_price::text m from public.appraisal_financials where demand_id = $1", [dem])).rows[0].m)).toBe("560000000");
    // nhật ký nhu cầu (sales đọc được) KHÔNG chứa số tiền
    const logs = await as(c, salesA, async (db) => (await db.query("select content from public.demand_activities where demand_id = $1 and channel = 'system'", [dem])).rows);
    expect(logs.some((l) => /Đã duyệt mua sau thẩm định/.test(l.content))).toBe(true);
    expect(logs.every((l) => !/\d{6,}/.test(l.content))).toBe(true);
  });

  it("Đã chốt thì không sửa; mở lại có ghi nhật ký và buộc duyệt lại giá; từ chối cần lý do", async () => {
    const dem = await sellDemand();
    await save(manager, dem, { items: await allPass() });
    await decide(manager, dem, "approve", { approved_max_price: "500000000" });
    await expect(save(manager, dem, { summary: "đổi" })).rejects.toThrow(/Thẩm định đã được duyệt/);
    await expect(sys.query("update public.appraisal_items set result = 'fail' where demand_id = $1", [dem])).rejects.toThrow(/đã được chốt/);
    await expect(decide(manager, dem, "approve", { approved_max_price: "900000000" })).rejects.toThrow(/dạng nháp/);
    await decide(manager, dem, "reopen");
    expect(await status(dem)).toBe("draft");
    expect((await sys.query("select approved_max_price from public.appraisal_financials where demand_id = $1", [dem])).rows[0].approved_max_price).toBeNull();
    await expect(decide(manager, dem, "reject")).rejects.toThrow(/Ghi lý do/);
    await decide(manager, dem, "reject", { reason: "Xe có dấu hiệu ngập nước" });
    expect(await status(dem)).toBe("rejected");
    const log = (await sys.query("select content from public.demand_activities where demand_id = $1 and channel = 'system' order by created_at", [dem])).rows.map((r) => r.content);
    expect(log).toEqual(expect.arrayContaining(["Mở lại thẩm định để chỉnh sửa", "Không duyệt mua: Xe có dấu hiệu ngập nước"]));
  });

  it("Chống ghi đè đồng thời khi lưu thẩm định", async () => {
    const dem = await sellDemand();
    const v1 = await save(manager, dem, { summary: "a" });
    const v2 = await save(manager, dem, { summary: "b" }, v1);
    expect(v2).toBeGreaterThan(v1);
    await expect(save(manager, dem, { summary: "c" }, v1)).rejects.toThrow(/vừa được người khác cập nhật/);
  });

  it("Nhập kho cần thẩm định đã duyệt; từ chối/mở lại thì chặn; sau nhập kho không đổi quyết định", async () => {
    const dem = await sellDemand();
    await as(c, salesA, (db) => db.query("select public.log_demand_activity($1, $2, 'call', 'x', null, 'Việc', now() + interval '1 day', 'appraised', null, null)", [dem, uuid()]));
    const acquire = (p: Record<string, unknown>) => as(c, manager, async (db) => (await db.query("select public.acquire_from_demand($1, $2, $3::jsonb) id", [dem, uuid(), JSON.stringify(p)])).rows[0].id as string);
    await expect(acquire({ purchase_price: "400000000" })).rejects.toThrow(/Cần thẩm định và duyệt mua/);
    await save(manager, dem, { items: await allPass() });
    await expect(acquire({ purchase_price: "400000000" })).rejects.toThrow(/Cần thẩm định và duyệt mua/);   // còn nháp
    await decide(manager, dem, "approve", { approved_max_price: "400000000" });
    const v = await acquire({ purchase_price: "400000000" });
    expect(v).toBeTruthy();
    await expect(decide(manager, dem, "reopen")).rejects.toThrow(/đã nhập kho/);
    await expect(save(manager, dem, { summary: "sửa sau" })).rejects.toThrow(/đã nhập kho/);
  });
});
